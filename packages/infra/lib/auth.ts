import { RemovalPolicy, SecretValue, Duration } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface AuthProps {
  domainPrefix: string;
  /** Optional Google sign-in: OAuth client id plus the name of a Secrets Manager secret holding its client secret. */
  google?: { clientId: string; secretName: string };
  /** Also allow http://localhost:3000 as a redirect target, for testing the local web app against real auth. */
  allowLocalhost: boolean;
}

export class Auth extends Construct {
  readonly userPool: cognito.UserPool;
  readonly domain: cognito.UserPoolDomain;
  private readonly google?: cognito.UserPoolIdentityProviderGoogle;
  private readonly allowLocalhost: boolean;

  constructor(scope: Construct, id: string, props: AuthProps) {
    super(scope, id);
    this.allowLocalhost = props.allowLocalhost;

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { fullname: { required: false, mutable: true } },
      passwordPolicy: { minLength: 8, requireSymbols: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.domain = this.userPool.addDomain('Domain', { cognitoDomain: { domainPrefix: props.domainPrefix } });

    if (props.google) {
      this.google = new cognito.UserPoolIdentityProviderGoogle(this, 'Google', {
        userPool: this.userPool,
        clientId: props.google.clientId,
        clientSecretValue: SecretValue.secretsManager(props.google.secretName),
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          fullname: cognito.ProviderAttribute.GOOGLE_NAME,
          profilePicture: cognito.ProviderAttribute.GOOGLE_PICTURE,
        },
      });
    }
  }

  /** The web client needs the CloudFront domain for its redirect URLs, so it is added after the distribution exists. */
  addWebClient(siteDomain: string): cognito.UserPoolClient {
    const origins = [`https://${siteDomain}`, ...(this.allowLocalhost ? ['http://localhost:3000'] : [])];
    const client = this.userPool.addClient('WebClient', {
      generateSecret: false,
      preventUserExistenceErrors: true,
      authFlows: {},
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: origins.map((o) => `${o}/auth/callback/`),
        logoutUrls: origins.map((o) => `${o}/`),
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        ...(this.google ? [cognito.UserPoolClientIdentityProvider.GOOGLE] : []),
      ],
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    });
    if (this.google) client.node.addDependency(this.google);
    return client;
  }
}
