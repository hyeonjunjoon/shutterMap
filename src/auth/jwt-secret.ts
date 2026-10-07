// Single place both JwtModule and JwtStrategy read the secret from — fail
// loudly at startup instead of silently signing/verifying with a public
// fallback value if JWT_SECRET is ever left unset.
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET 환경변수가 설정되지 않았습니다.');
  }
  return secret;
}
