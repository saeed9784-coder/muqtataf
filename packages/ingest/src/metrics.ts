import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import type { SourceResult } from './ingest';

/** Must match the namespace the CDK monitoring construct alarms on. */
export const METRICS_NAMESPACE = 'Muqtataf';

export interface IngestSummary {
  inserted: number;
  failed: number;
  sources: number;
}

export function summarize(results: readonly SourceResult[]): IngestSummary {
  return {
    inserted: results.reduce((sum, r) => sum + r.inserted, 0),
    failed: results.filter((r) => r.error).length,
    sources: results.length,
  };
}

type Send = (command: PutMetricDataCommand) => Promise<unknown>;

/** Publishes one data point per metric for this ingest run. */
export async function publishIngestMetrics(summary: IngestSummary, send: Send, now: Date = new Date()): Promise<void> {
  const point = (name: string, value: number) => ({ MetricName: name, Value: value, Unit: StandardUnit.Count, Timestamp: now });
  await send(
    new PutMetricDataCommand({
      Namespace: METRICS_NAMESPACE,
      MetricData: [
        point('PostsInserted', summary.inserted),
        point('FeedsFailed', summary.failed),
        point('FeedsChecked', summary.sources),
      ],
    }),
  );
}

export function cloudWatchSender(client: CloudWatchClient = new CloudWatchClient({})): Send {
  return (command) => client.send(command);
}
