import type { PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { describe, expect, it } from 'vitest';
import { METRICS_NAMESPACE, publishIngestMetrics, summarize } from './metrics';

describe('ingest metrics', () => {
  it('summarizes per-source results', () => {
    const summary = summarize([
      { sourceId: 'a', inserted: 3 },
      { sourceId: 'b', inserted: 0, error: 'timeout' },
      { sourceId: 'c', inserted: 2 },
    ]);
    expect(summary).toEqual({ inserted: 5, failed: 1, sources: 3 });
  });

  it('publishes one data point per metric in the Muqtataf namespace', async () => {
    const sent: PutMetricDataCommand[] = [];
    const now = new Date('2026-11-19T00:00:00Z');
    await publishIngestMetrics({ inserted: 5, failed: 1, sources: 3 }, async (c) => sent.push(c), now);
    expect(sent).toHaveLength(1);
    const input = sent[0]?.input;
    expect(input?.Namespace).toBe(METRICS_NAMESPACE);
    expect(input?.MetricData?.map((m) => [m.MetricName, m.Value])).toEqual([
      ['PostsInserted', 5],
      ['FeedsFailed', 1],
      ['FeedsChecked', 3],
    ]);
  });
});
