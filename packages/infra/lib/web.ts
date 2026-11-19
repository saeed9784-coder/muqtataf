import { existsSync } from 'node:fs';
import path from 'node:path';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import { WEB_OUT_DIR } from './paths';

export interface WebProps {
  apiDomain: string;
  /** Hostnames the browser talks to for sign-in (Cognito), added to the CSP connect-src. */
  authHosts: string[];
  /** WAF web ACL (CLOUDFRONT scope, from the us-east-1 edge stack). */
  webAclArn?: string;
}

export interface RuntimeConfig {
  apiUrl: string;
  auth: { region: string; userPoolId: string; clientId: string; domain: string };
}

// Maps clean URLs (/post/, /post) to the exported index.html files.
const REWRITE_FUNCTION = `
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else if (uri.split('/').pop().indexOf('.') === -1) {
    request.uri = uri + '/index.html';
  }
  return request;
}`;

export class Web extends Construct {
  readonly distribution: cloudfront.Distribution;
  private readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: WebProps) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const csp = [
      "default-src 'self'",
      // Next.js static export inlines its bootstrap scripts.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' https: data:",
      "font-src 'self'",
      `connect-src 'self' ${props.authHosts.map((h) => `https://${h}`).join(' ')}`,
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');

    const headers = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      customHeadersBehavior: {
        customHeaders: [
          { header: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()', override: true },
          { header: 'Cross-Origin-Opener-Policy', value: 'same-origin', override: true },
        ],
      },
      securityHeadersBehavior: {
        contentSecurityPolicy: { contentSecurityPolicy: csp, override: true },
        strictTransportSecurity: { accessControlMaxAge: Duration.days(365), includeSubdomains: true, override: true },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true },
      },
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Muqtataf web',
      webAclId: props.webAclArn,
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: headers,
        compress: true,
        functionAssociations: [
          {
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            function: new cloudfront.Function(this, 'Rewrite', {
              code: cloudfront.FunctionCode.fromInline(REWRITE_FUNCTION),
              runtime: cloudfront.FunctionRuntime.JS_2_0,
            }),
          },
        ],
      },
      additionalBehaviors: {
        // Same-origin API: no CORS, and the browser never needs the execute-api URL.
        '/graphql': {
          origin: new origins.HttpOrigin(props.apiDomain, { protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: headers,
        },
      },
      // OAC returns 403 for missing keys because the distribution cannot list the bucket.
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 404,
        responsePagePath: '/404.html',
        ttl: Duration.minutes(1),
      })),
    });
  }

  /** Uploads the static export plus a runtime config.json. Hashed assets get a long cache, HTML none. */
  deploySite(config: RuntimeConfig): void {
    if (!existsSync(path.join(WEB_OUT_DIR, 'index.html'))) {
      throw new Error(`Web build not found at ${WEB_OUT_DIR}. Run "npm run build:web" first.`);
    }
    new s3deploy.BucketDeployment(this, 'StaticAssets', {
      destinationBucket: this.bucket,
      destinationKeyPrefix: '_next/static/',
      sources: [s3deploy.Source.asset(path.join(WEB_OUT_DIR, '_next/static'))],
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=31536000, immutable')],
      prune: false,
    });
    new s3deploy.BucketDeployment(this, 'Pages', {
      destinationBucket: this.bucket,
      sources: [
        s3deploy.Source.asset(WEB_OUT_DIR, { exclude: ['_next/static/**', 'config.json'] }),
        s3deploy.Source.jsonData('config.json', config),
      ],
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=0, must-revalidate')],
      prune: false,
      distribution: this.distribution,
      distributionPaths: ['/*'],
      memoryLimit: 512,
    });
  }
}
