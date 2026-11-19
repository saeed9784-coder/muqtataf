import { RDSDataClient } from '@aws-sdk/client-rds-data';
import { drizzle } from 'drizzle-orm/aws-data-api/pg';
import { migrate } from 'drizzle-orm/aws-data-api/pg/migrator';
import * as schema from './schema';
import type { Db } from './index';

const RESUME_RETRIES = 6;
const RESUME_DELAY_MS = 3_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isResuming = (error: unknown): boolean =>
  error instanceof Error && error.name === 'DatabaseResumingException';

/**
 * Aurora Serverless v2 can auto-pause at 0 ACU. The first call after a pause fails with
 * DatabaseResumingException while the cluster wakes, so retry those calls with a delay.
 */
class ResumingRdsDataClient extends RDSDataClient {
  override send: RDSDataClient['send'] = (async (...args: Parameters<RDSDataClient['send']>) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await (super.send as (...a: typeof args) => Promise<unknown>)(...args);
      } catch (error) {
        if (!isResuming(error) || attempt >= RESUME_RETRIES) throw error;
        await sleep(RESUME_DELAY_MS);
      }
    }
  }) as RDSDataClient['send'];
}

export interface DataApiConfig {
  resourceArn: string;
  secretArn: string;
  database: string;
}

export function readDataApiConfig(env: NodeJS.ProcessEnv = process.env): DataApiConfig {
  const { DB_CLUSTER_ARN, DB_SECRET_ARN, DB_NAME } = env;
  if (!DB_CLUSTER_ARN || !DB_SECRET_ARN || !DB_NAME) {
    throw new Error('DB_CLUSTER_ARN, DB_SECRET_ARN and DB_NAME must be set');
  }
  return { resourceArn: DB_CLUSTER_ARN, secretArn: DB_SECRET_ARN, database: DB_NAME };
}

export function createDataApiDb(config: DataApiConfig = readDataApiConfig()): Db {
  const client = new ResumingRdsDataClient({});
  return drizzle(client, { ...config, schema }) as unknown as Db;
}

export async function migrateDataApiDb(db: Db, migrationsFolder: string): Promise<void> {
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder });
}
