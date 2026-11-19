import { createDataApiDb } from '@muqtataf/db/data-api';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { authenticatorFromEnv } from './auth';
import { createApi } from './yoga';

// Built once per Lambda container and reused across invocations.
const api = createApi({ db: createDataApiDb(), authenticate: authenticatorFromEnv() });

export function toRequest(event: APIGatewayProxyEventV2): Request {
  const host = event.headers.host ?? event.requestContext.domainName;
  const query = event.rawQueryString ? `?${event.rawQueryString}` : '';
  const method = event.requestContext.http.method;
  const hasBody = method !== 'GET' && method !== 'HEAD' && event.body !== undefined;
  const headers = new Headers();
  for (const [key, value] of Object.entries(event.headers)) {
    if (value !== undefined) headers.set(key, value);
  }
  return new Request(`https://${host}${event.rawPath}${query}`, {
    method,
    headers,
    body: hasBody ? (event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64') : event.body) : undefined,
  });
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
  const response = await api.fetch(toRequest(event));
  return {
    statusCode: response.status,
    headers: { ...Object.fromEntries(response.headers), 'cache-control': 'no-store' },
    body: await response.text(),
  };
};
