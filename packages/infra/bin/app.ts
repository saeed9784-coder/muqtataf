import { App } from 'aws-cdk-lib';
import { EdgeStack } from '../lib/edge-stack';
import { MuqtatafStack } from '../lib/stack';

const app = new App();

const ctx = (key: string): unknown => app.node.tryGetContext(key);
const num = (key: string): number => {
  const value = Number(ctx(key));
  if (!Number.isFinite(value)) throw new Error(`Context "${key}" must be a number`);
  return value;
};
const str = (key: string): string | undefined => {
  const value = ctx(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const region = str('region') ?? 'me-central-1';
const googleClientId = str('googleClientId');
const googleSecretName = str('googleSecretName');
const alertEmail = str('alertEmail');
const account = process.env.CDK_DEFAULT_ACCOUNT;
const isWafEnabled = ctx('waf') !== false && ctx('waf') !== 'false';

// CloudFront-scoped WAF must be created in us-east-1.
const edge = isWafEnabled
  ? new EdgeStack(app, 'MuqtatafEdge', {
      env: { account, region: 'us-east-1' },
      crossRegionReferences: true,
      rateLimitPerIp: num('wafRateLimitPerIp'),
      graphqlRateLimitPerIp: num('wafGraphqlRateLimitPerIp'),
      blockedRequestsAlarm: num('wafBlockedAlarm'),
      alertEmail,
      description: 'Muqtataf edge: CloudFront WAF web ACL (must live in us-east-1)',
    })
  : undefined;

const main = new MuqtatafStack(app, 'Muqtataf', {
  env: { account, region },
  crossRegionReferences: true,
  webAcl: edge ? { arn: edge.webAclArn, name: 'muqtataf-web' } : undefined,
  alertEmail,
  authDomainPrefix: str('authDomainPrefix') ?? 'muqtataf-news',
  dbMinAcu: num('dbMinAcu'),
  dbMaxAcu: num('dbMaxAcu'),
  ingestEveryMinutes: num('ingestEveryMinutes'),
  allowLocalhostAuth: ctx('allowLocalhostAuth') === true || ctx('allowLocalhostAuth') === 'true',
  google: googleClientId && googleSecretName ? { clientId: googleClientId, secretName: googleSecretName } : undefined,
  description: 'Muqtataf: Arabic developer news aggregator (web, GraphQL API, Aurora, Cognito, ingestion)',
});
if (edge) main.addDependency(edge);
