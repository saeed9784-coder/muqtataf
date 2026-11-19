import { Duration } from 'aws-cdk-lib';
import type * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as lambda from 'aws-cdk-lib/aws-lambda';
import type * as rds from 'aws-cdk-lib/aws-rds';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

/** Must match METRICS_NAMESPACE in packages/ingest/src/metrics.ts. */
const NAMESPACE = 'Muqtataf';
const FIVE_MIN = Duration.minutes(5);
const NO_POSTS_WINDOW = Duration.hours(6);

export interface MonitoringProps {
  apiFunction: lambda.IFunction;
  ingestFunction: lambda.IFunction;
  httpApi: apigw.HttpApi;
  cluster: rds.DatabaseCluster;
  dbMaxAcu: number;
  alertEmail?: string;
  /** Shown on the dashboard; WAF metrics for CloudFront live in us-east-1. */
  webAclName: string;
}

export class Monitoring extends Construct {
  readonly topic: sns.Topic;

  constructor(scope: Construct, id: string, props: MonitoringProps) {
    super(scope, id);

    this.topic = new sns.Topic(this, 'Alerts', { displayName: 'Muqtataf alerts' });
    if (props.alertEmail) this.topic.addSubscription(new subs.EmailSubscription(props.alertEmail));
    const action = new cwActions.SnsAction(this.topic);

    // The ingest Lambda publishes its own run metrics; scope its permission to our namespace.
    props.ingestFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: { StringEquals: { 'cloudwatch:namespace': NAMESPACE } },
      }),
    );

    const ingestMetric = (metricName: string, period: Duration = FIVE_MIN) =>
      new cloudwatch.Metric({ namespace: NAMESPACE, metricName, statistic: 'Sum', period });

    const alarm = (name: string, description: string, opts: Omit<cloudwatch.AlarmProps, 'alarmDescription'>) =>
      new cloudwatch.Alarm(this, name, { alarmDescription: description, ...opts }).addAlarmAction(action);

    const notBreaching = cloudwatch.TreatMissingData.NOT_BREACHING;
    const gte = cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD;

    // --- API ---
    const apiErrors = props.apiFunction.metricErrors({ period: FIVE_MIN });
    const apiThrottles = props.apiFunction.metricThrottles({ period: FIVE_MIN });
    const apiP95 = props.apiFunction.metricDuration({ period: FIVE_MIN, statistic: 'p95' });
    const api5xx = props.httpApi.metricServerError({ period: FIVE_MIN });
    const apiRequests = props.httpApi.metricCount({ period: FIVE_MIN });
    const apiLatency = props.httpApi.metricLatency({ period: FIVE_MIN, statistic: 'p95' });

    alarm('ApiErrors', 'GraphQL Lambda is throwing errors.', {
      metric: apiErrors, threshold: 5, evaluationPeriods: 1, comparisonOperator: gte, treatMissingData: notBreaching,
    });
    alarm('ApiThrottles', 'GraphQL Lambda is being throttled (account concurrency limit).', {
      metric: apiThrottles, threshold: 1, evaluationPeriods: 1, comparisonOperator: gte, treatMissingData: notBreaching,
    });
    alarm('Api5xx', 'API Gateway is returning 5xx responses.', {
      metric: api5xx, threshold: 10, evaluationPeriods: 1, comparisonOperator: gte, treatMissingData: notBreaching,
    });
    // Three periods so a single database resume (~15 s) after auto-pause does not page anyone.
    alarm('ApiSlow', 'GraphQL Lambda p95 duration is above 5 s.', {
      metric: apiP95, threshold: 5_000, evaluationPeriods: 3, comparisonOperator: gte, treatMissingData: notBreaching,
    });

    // --- Ingestion ---
    const ingestErrors = props.ingestFunction.metricErrors({ period: Duration.hours(1) });
    alarm('IngestCrashed', 'Ingest Lambda failed outright (not just individual feeds).', {
      metric: ingestErrors, threshold: 2, evaluationPeriods: 1, comparisonOperator: gte, treatMissingData: notBreaching,
    });
    alarm('FeedsFailing', 'Five or more feeds failed in consecutive ingest runs.', {
      metric: new cloudwatch.Metric({ namespace: NAMESPACE, metricName: 'FeedsFailed', statistic: 'Maximum', period: Duration.hours(1) }),
      threshold: 5, evaluationPeriods: 2, comparisonOperator: gte, treatMissingData: notBreaching,
    });
    // Missing data is breaching: if ingest stops reporting at all, that is also "no new posts".
    alarm('NoNewPosts', 'No new posts ingested in 6 hours.', {
      metric: ingestMetric('PostsInserted', NO_POSTS_WINDOW),
      threshold: 1, evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });

    // --- Database ---
    const acu = props.cluster.metric('ServerlessDatabaseCapacity', { statistic: 'Maximum', period: FIVE_MIN });
    alarm('DbAtMaxCapacity', 'Aurora has been at max capacity for 15 minutes; consider raising dbMaxAcu.', {
      metric: acu, threshold: props.dbMaxAcu, evaluationPeriods: 3, comparisonOperator: gte, treatMissingData: notBreaching,
    });

    // --- Dashboard ---
    const waf = (metricName: string) =>
      new cloudwatch.Metric({
        namespace: 'AWS/WAFV2', metricName, statistic: 'Sum', period: FIVE_MIN, region: 'us-east-1',
        dimensionsMap: { WebACL: props.webAclName, Rule: 'ALL' },
      });

    new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: 'Muqtataf',
      defaultInterval: Duration.days(1),
      widgets: [
        [
          new cloudwatch.GraphWidget({ title: 'API requests / 5xx', left: [apiRequests], right: [api5xx], width: 8 }),
          new cloudwatch.GraphWidget({ title: 'API latency p95 (ms)', left: [apiLatency, apiP95], width: 8 }),
          new cloudwatch.GraphWidget({ title: 'API Lambda errors / throttles', left: [apiErrors, apiThrottles], width: 8 }),
        ],
        [
          new cloudwatch.GraphWidget({ title: 'Posts ingested per run', left: [ingestMetric('PostsInserted')], width: 8 }),
          new cloudwatch.GraphWidget({ title: 'Feeds failed / checked', left: [ingestMetric('FeedsFailed')], right: [ingestMetric('FeedsChecked')], width: 8 }),
          new cloudwatch.GraphWidget({ title: 'Aurora capacity (ACU)', left: [acu], leftYAxis: { min: 0, max: props.dbMaxAcu }, width: 8 }),
        ],
        [
          new cloudwatch.GraphWidget({ title: 'WAF allowed / blocked', left: [waf('AllowedRequests')], right: [waf('BlockedRequests')], width: 12 }),
          new cloudwatch.AlarmStatusWidget({
            title: 'Alarms',
            alarms: this.node.children.filter((c): c is cloudwatch.Alarm => c instanceof cloudwatch.Alarm),
            width: 12,
          }),
        ],
      ],
    });
  }
}
