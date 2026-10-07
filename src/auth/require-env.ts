// JWT_SECRET, KAKAO_*, GOOGLE_* 전부 같은 패턴이 필요하다: 없으면 기동 시
// 명확히 실패한다 — process.env.X를 그대로 넘기면 string | undefined라서
// 타입체크(tsc)도 깨지고, 런타임에선 undefined가 조용히 전달된다.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);
  }
  return value;
}
