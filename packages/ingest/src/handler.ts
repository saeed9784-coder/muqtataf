import { createDataApiDb } from '@muqtataf/db/data-api';
import { ingestAll } from './ingest';
import { cloudWatchSender, publishIngestMetrics, summarize, type IngestSummary } from './metrics';

const db = createDataApiDb();
const send = cloudWatchSender();

/** Invoked on a schedule by EventBridge. */
export const handler = async (): Promise<IngestSummary> => {
  const results = await ingestAll(db);
  const summary = summarize(results);
  const failures = results.filter((r) => r.error);
  // Structured line for CloudWatch Logs Insights.
  console.info(JSON.stringify({ msg: 'ingest.done', ...summary, failures }));
  try {
    await publishIngestMetrics(summary, send);
  } catch (error) {
    // Metrics are best effort; missing data points trip the "no new posts" alarm anyway.
    console.error(JSON.stringify({ msg: 'ingest.metrics_failed', error: error instanceof Error ? error.message : String(error) }));
  }
  return summary;
};
