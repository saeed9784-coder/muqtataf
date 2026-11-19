import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CustomResource, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat, type NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { REPO_ROOT } from './paths';

const DB_NAME = 'muqtataf';
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'packages/db/drizzle');
const SEED_FILE = path.join(REPO_ROOT, 'packages/db/src/seed.ts');
const API_THROTTLE_RATE = 50;
const API_THROTTLE_BURST = 100;

export interface BackendProps {
  dbMinAcu: number;
  dbMaxAcu: number;
  ingestEveryMinutes: number;
}

/** Hash of the migrations and seed list, so the migrate custom resource re-runs only when either changes. */
function hashMigrations(): string {
  const hash = createHash('sha256');
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else hash.update(entry.name).update(readFileSync(full));
    }
  };
  walk(MIGRATIONS_DIR);
  hash.update(readFileSync(SEED_FILE));
  return hash.digest('hex');
}

export class Backend extends Construct {
  readonly httpApi: apigw.HttpApi;
  readonly ingestFunction: NodejsFunction;
  readonly cluster: rds.DatabaseCluster;
  private readonly makeFunction: (name: string, entry: string, extra?: Partial<NodejsFunctionProps>) => NodejsFunction;

  constructor(scope: Construct, id: string, props: BackendProps) {
    super(scope, id);

    // The cluster needs a VPC, but Lambdas reach it through the Data API, so no NAT gateway is needed.
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{ name: 'db', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 }],
    });

    const cluster = (this.cluster = new rds.DatabaseCluster(this, 'Database', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_17_5 }),
      writer: rds.ClusterInstance.serverlessV2('writer'),
      serverlessV2MinCapacity: props.dbMinAcu,
      serverlessV2MaxCapacity: props.dbMaxAcu,
      enableDataApi: true,
      defaultDatabaseName: DB_NAME,
      credentials: rds.Credentials.fromGeneratedSecret('muqtataf_admin'),
      storageEncrypted: true,
      backup: { retention: Duration.days(7) },
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      removalPolicy: RemovalPolicy.SNAPSHOT,
    }));
    const secret = cluster.secret;
    if (!secret) throw new Error('Database secret was not created');

    const dbEnv = {
      DB_CLUSTER_ARN: cluster.clusterArn,
      DB_SECRET_ARN: secret.secretArn,
      DB_NAME,
      NODE_OPTIONS: '--enable-source-maps',
    };

    const fn = (name: string, entry: string, extra: Partial<NodejsFunctionProps> = {}) => {
      const f = new NodejsFunction(this, name, {
        entry: path.join(REPO_ROOT, entry),
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        projectRoot: REPO_ROOT,
        depsLockFilePath: path.join(REPO_ROOT, 'package-lock.json'),
        memorySize: 512,
        logGroup: new logs.LogGroup(this, `${name}Logs`, {
          retention: logs.RetentionDays.ONE_MONTH,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
        ...extra,
        environment: { ...dbEnv, ...extra.environment },
        bundling: {
          format: OutputFormat.CJS,
          target: 'node22',
          minify: true,
          sourceMap: true,
          externalModules: ['@aws-sdk/*'],
          ...extra.bundling,
        },
      });
      cluster.grantDataApiAccess(f);
      return f;
    };

    this.makeFunction = fn;
    this.httpApi = new apigw.HttpApi(this, 'HttpApi', { description: 'Muqtataf GraphQL API' });
    const stage = this.httpApi.defaultStage?.node.defaultChild as apigw.CfnStage | undefined;
    if (stage) {
      stage.defaultRouteSettings = { throttlingRateLimit: API_THROTTLE_RATE, throttlingBurstLimit: API_THROTTLE_BURST };
    }

    this.ingestFunction = fn('IngestFunction', 'packages/ingest/src/handler.ts', { timeout: Duration.minutes(5) });
    new events.Rule(this, 'IngestSchedule', {
      schedule: events.Schedule.rate(Duration.minutes(props.ingestEveryMinutes)),
      targets: [new targets.LambdaFunction(this.ingestFunction, { retryAttempts: 0 })],
    });

    const migrateFunction = fn('MigrateFunction', 'packages/api/src/migrate-handler.ts', {
      timeout: Duration.minutes(5),
      bundling: {
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (inputDir: string, outputDir: string) => [`cp -r "${inputDir}/packages/db/drizzle" "${outputDir}/drizzle"`],
        },
      },
    });
    const provider = new cr.Provider(this, 'MigrateProvider', { onEventHandler: migrateFunction });
    const migrations = new CustomResource(this, 'Migrations', {
      serviceToken: provider.serviceToken,
      properties: { migrationsHash: hashMigrations() },
    });
    migrations.node.addDependency(cluster);
  }

  /**
   * Added after the Cognito client exists. CloudFront only needs the HTTP API id, so creating the
   * function last avoids a cycle (function -> client -> distribution -> API).
   */
  addGraphqlFunction(userPoolId: string, userPoolClientId: string): NodejsFunction {
    const apiFunction = this.makeFunction('ApiFunction', 'packages/api/src/handler.ts', {
      memorySize: 1024,
      timeout: Duration.seconds(29),
      environment: { USER_POOL_ID: userPoolId, USER_POOL_CLIENT_ID: userPoolClientId },
    });
    this.httpApi.addRoutes({
      path: '/graphql',
      methods: [apigw.HttpMethod.GET, apigw.HttpMethod.POST],
      integration: new HttpLambdaIntegration('GraphqlIntegration', apiFunction),
    });
    return apiFunction;
  }

  /** Execute-API hostname, used as a CloudFront origin. */
  get apiDomain(): string {
    return `${this.httpApi.apiId}.execute-api.${Stack.of(this).region}.${Stack.of(this).urlSuffix}`;
  }
}
