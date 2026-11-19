import type { Db } from '@muqtataf/db';
import type { ASTVisitor, ValidationContext } from 'graphql';
// Use createGraphQLError (same graphql copy as Yoga); a GraphQLError from another copy gets masked as internal.
import { createGraphQLError, createSchema, createYoga, type Plugin, type YogaServerInstance } from 'graphql-yoga';
import type { Authenticate } from './auth';
import { resolvers, type Context } from './resolvers';
import { typeDefs } from './type-defs';

export interface ApiOptions {
  db: Db;
  authenticate: Authenticate;
  /** Local dev: enables GraphiQL and permissive CORS. Production is same-origin behind CloudFront. */
  isDev?: boolean;
}

const MAX_QUERY_LENGTH = 10_000;
/** Each root field can be a full feed/search query; aliases would otherwise multiply DB work per request. */
export const MAX_ROOT_FIELDS = 8;

const rootFieldLimitRule = (context: ValidationContext): ASTVisitor => ({
  OperationDefinition(node) {
    const count = node.selectionSet.selections.length;
    if (count > MAX_ROOT_FIELDS) {
      context.reportError(createGraphQLError(`Too many top-level fields (${count} > ${MAX_ROOT_FIELDS})`));
    }
  },
});

export function createApi({ db, authenticate, isDev = false }: ApiOptions): YogaServerInstance<object, Context> {
  return createYoga<object, Context>({
    schema: createSchema({ typeDefs, resolvers }),
    graphqlEndpoint: '/graphql',
    graphiql: isDev,
    landingPage: false,
    cors: isDev ? { origin: '*', allowedHeaders: ['content-type', 'authorization', 'x-dev-user'] } : false,
    maskedErrors: true,
    plugins: [
      <Plugin<Context>>{
        onValidate({ addValidationRule }) {
          addValidationRule(rootFieldLimitRule);
        },
        onParams({ params }) {
          if ((params.query?.length ?? 0) > MAX_QUERY_LENGTH) {
            throw createGraphQLError('Query too large', { extensions: { http: { status: 413 } } });
          }
        },
      },
    ],
    context: async ({ request }) => {
      try {
        return { db, user: await authenticate(request) };
      } catch {
        throw createGraphQLError('Invalid or expired token', {
          extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } },
        });
      }
    },
  });
}
