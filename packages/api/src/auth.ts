import { CognitoJwtVerifier } from 'aws-jwt-verify';

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
}

export type Authenticate = (request: Request) => Promise<AuthUser | null>;

const MAX_NAME_LENGTH = 80;

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

export function userFromClaims(claims: Record<string, unknown>): AuthUser {
  const id = str(claims.sub);
  if (!id) throw new Error('Token has no subject');
  const email = str(claims.email);
  const name = str(claims.name) ?? str(claims.given_name) ?? email?.split('@')[0] ?? 'مستخدم';
  const picture = str(claims.picture);
  return {
    id,
    email,
    name: name.slice(0, MAX_NAME_LENGTH),
    image: picture?.startsWith('https://') ? picture : null,
  };
}

const bearer = (request: Request): string | null => {
  const header = request.headers.get('authorization');
  return header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() || null : null;
};

/** Verifies Cognito ID tokens. Requests without a token are anonymous; invalid tokens are rejected. */
export function cognitoAuthenticator(userPoolId: string, clientId: string): Authenticate {
  const verifier = CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: 'id' });
  return async (request) => {
    const token = bearer(request);
    if (!token) return null;
    const claims = await verifier.verify(token);
    return userFromClaims(claims as Record<string, unknown>);
  };
}

/**
 * Local development only: trusts an `x-dev-user` header. Never wired up in the Lambda handler.
 */
export const devAuthenticator: Authenticate = async (request) => {
  const name = str(request.headers.get('x-dev-user'));
  if (!name) return null;
  const id = `dev-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
  return { id, name: name.slice(0, MAX_NAME_LENGTH), email: null, image: null };
};

export function authenticatorFromEnv(env: NodeJS.ProcessEnv = process.env): Authenticate {
  const { USER_POOL_ID, USER_POOL_CLIENT_ID } = env;
  if (!USER_POOL_ID || !USER_POOL_CLIENT_ID) {
    throw new Error('USER_POOL_ID and USER_POOL_CLIENT_ID must be set');
  }
  return cognitoAuthenticator(USER_POOL_ID, USER_POOL_CLIENT_ID);
}
