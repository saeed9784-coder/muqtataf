import { seedSources } from '@muqtataf/db';
import { createDataApiDb, migrateDataApiDb } from '@muqtataf/db/data-api';
import path from 'node:path';

/**
 * CloudFormation custom resource (via the CDK Provider framework): applies migrations
 * and seeds sources on every deploy whose migrations hash changed. Delete is a no-op.
 */
export const handler = async (event: { RequestType: 'Create' | 'Update' | 'Delete'; PhysicalResourceId?: string }) => {
  const physicalResourceId = event.PhysicalResourceId ?? 'muqtataf-db-migrations';
  if (event.RequestType === 'Delete') return { PhysicalResourceId: physicalResourceId };
  const db = createDataApiDb();
  await migrateDataApiDb(db, path.join(__dirname, 'drizzle'));
  await seedSources(db);
  return { PhysicalResourceId: physicalResourceId };
};
