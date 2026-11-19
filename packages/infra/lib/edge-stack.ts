import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import type { Construct } from 'constructs';

export interface EdgeStackProps extends StackProps {
  /** Max requests per client IP per 5 minutes, site-wide. */
  rateLimitPerIp: number;
  /** Max /graphql requests per client IP per 5 minutes. */
  graphqlRateLimitPerIp: number;
  /** Blocked requests per 5 minutes that count as an attack worth an alert. */
  blockedRequestsAlarm: number;
  alertEmail?: string;
}

const WEB_ACL_METRIC = 'MuqtatafWebAcl';

const visibility = (metricName: string): wafv2.CfnWebACL.VisibilityConfigProperty => ({
  cloudWatchMetricsEnabled: true,
  sampledRequestsEnabled: true,
  metricName,
});

interface ManagedGroup {
  name: string;
  priority: number;
  /** Rules switched to count-only (logged, not blocked). */
  countOnly?: string[];
}

const managedRule = ({ name, priority, countOnly = [] }: ManagedGroup): wafv2.CfnWebACL.RuleProperty => ({
  name,
  priority,
  overrideAction: { none: {} },
  statement: {
    managedRuleGroupStatement: {
      vendorName: 'AWS',
      name,
      ruleActionOverrides: countOnly.map((rule) => ({ name: rule, actionToUse: { count: {} } })),
    },
  },
  visibilityConfig: visibility(name),
});

const rateRule = (name: string, priority: number, limit: number, pathPrefix?: string): wafv2.CfnWebACL.RuleProperty => ({
  name,
  priority,
  action: { block: { customResponse: { responseCode: 429 } } },
  statement: {
    rateBasedStatement: {
      limit,
      evaluationWindowSec: 300,
      aggregateKeyType: 'IP',
      scopeDownStatement: pathPrefix
        ? {
            byteMatchStatement: {
              fieldToMatch: { uriPath: {} },
              positionalConstraint: 'STARTS_WITH',
              searchString: pathPrefix,
              textTransformations: [{ priority: 0, type: 'NONE' }],
            },
          }
        : undefined,
    },
  },
  visibilityConfig: visibility(name),
});

/**
 * CloudFront-scoped resources must live in us-east-1: the WAF web ACL and the alarm on its
 * blocked-request metric (WAF metrics for CloudFront are only published there).
 */
export class EdgeStack extends Stack {
  readonly webAclArn: string;

  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, props);

    const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: 'muqtataf-web',
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: visibility(WEB_ACL_METRIC),
      rules: [
        managedRule({ name: 'AWSManagedRulesAmazonIpReputationList', priority: 0 }),
        rateRule('RateLimitGraphql', 1, props.graphqlRateLimitPerIp, '/graphql'),
        rateRule('RateLimitAll', 2, props.rateLimitPerIp),
        managedRule({ name: 'AWSManagedRulesKnownBadInputsRuleSet', priority: 3 }),
        // Developers paste code in comments, so body XSS/RFI matches are logged instead of blocked.
        managedRule({
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 4,
          countOnly: ['CrossSiteScripting_BODY', 'GenericRFI_BODY', 'SizeRestrictions_BODY'],
        }),
      ],
    });
    this.webAclArn = webAcl.attrArn;

    const topic = new sns.Topic(this, 'EdgeAlerts', { displayName: 'Muqtataf edge alerts' });
    if (props.alertEmail) topic.addSubscription(new subs.EmailSubscription(props.alertEmail));

    const blocked = new cloudwatch.Metric({
      namespace: 'AWS/WAFV2',
      metricName: 'BlockedRequests',
      dimensionsMap: { WebACL: 'muqtataf-web', Rule: 'ALL' },
      statistic: 'Sum',
      period: Duration.minutes(5),
    });
    new cloudwatch.Alarm(this, 'BlockedRequestsSpike', {
      alarmDescription: 'WAF is blocking an unusual number of requests (possible attack or a rule blocking real users).',
      metric: blocked,
      threshold: props.blockedRequestsAlarm,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cwActions.SnsAction(topic));
  }
}
