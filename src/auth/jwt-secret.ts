import { requireEnv } from './require-env';

// Single place both JwtModule and JwtStrategy read the secret from — fail
// loudly at startup instead of silently signing/verifying with a public
// fallback value if JWT_SECRET is ever left unset.
export function getJwtSecret(): string {
  return requireEnv('JWT_SECRET');
}
