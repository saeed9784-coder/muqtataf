import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { Auth } from './auth';
import { Backend } from './backend';
import { Monitoring } from './monitoring';
import { Web } from './web';

export interface MuqtatafStackProps extends StackProps {
  authDomainPrefix: string;
  dbMinAcu: number;
  dbMaxAcu: number;
  ingestEveryMinutes: number;
  allowLocalhostAuth: boolean;
  google?: { clientId: string; secretName: string };
  webAcl?: { arn: string; name: string };
  alertEmail?: string;
}

export class MuqtatafStack extends Stack {
  constructor(scope: Construct, id: string, props: MuqtatafStackProps) {
    super(scope, id, props);

    const auth = new Auth(this, 'Auth', {
      domainPrefix: props.authDomainPrefix,
      google: props.google,
      allowLocalhost: props.allowLocalhostAuth,
    });
    const authDomain = `${props.authDomainPrefix}.auth.${this.region}.amazoncognito.com`;

    const backend = new Backend(this, 'Backend', {
      dbMinAcu: props.dbMinAcu,
      dbMaxAcu: props.dbMaxAcu,
      ingestEveryMinutes: props.ingestEveryMinutes,
    });

    const web = new Web(this, 'Web', {
      apiDomain: backend.apiDomain,
      authHosts: [authDomain, `cognito-idp.${this.region}.amazonaws.com`],
      webAclArn: props.webAcl?.arn,
    });

    const client = auth.addWebClient(web.distribution.distributionDomainName);
    const apiFunction = backend.addGraphqlFunction(auth.userPool.userPoolId, client.userPoolClientId);

    const monitoring = new Monitoring(this, 'Monitoring', {
      apiFunction,
      ingestFunction: backend.ingestFunction,
      httpApi: backend.httpApi,
      cluster: backend.cluster,
      dbMaxAcu: props.dbMaxAcu,
      alertEmail: props.alertEmail,
      webAclName: props.webAcl?.name ?? 'none',
    });

    web.deploySite({
      apiUrl: '/graphql',
      auth: { region: this.region, userPoolId: auth.userPool.userPoolId, clientId: client.userPoolClientId, domain: authDomain },
    });

    new CfnOutput(this, 'SiteUrl', { value: `https://${web.distribution.distributionDomainName}` });
    new CfnOutput(this, 'UserPoolId', { value: auth.userPool.userPoolId });
    new CfnOutput(this, 'IngestFunctionName', { value: backend.ingestFunction.functionName });
    new CfnOutput(this, 'AlertsTopicArn', { value: monitoring.topic.topicArn });
    new CfnOutput(this, 'DashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards/dashboard/Muqtataf`,
    });
  }
}
