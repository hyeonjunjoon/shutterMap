import { NextRequest, NextResponse } from 'next/server';

const PROTECTED_PATHS = ['/upload', '/me'];

// 쿠키 "존재"만 확인한다 — 위조/만료 여부는 모른다. 그건 이 proxy가 할 일이
// 아니라, 통과한 뒤 페이지가 GET /auth/me를 호출해서 NestJS에 다시 확인한다
// (spec §4: "인증 검증은 전부 NestJS"). /upload, /me 페이지 본체는 아직 없고
// 다음 플랜에서 추가된다 — 그 플랜에서 반드시 "me가 null이면 /login으로"
// 페이지 레벨 재확인을 같이 구현해야 한다.
//
// 파일명이 middleware.ts가 아니라 proxy.ts인 이유, 함수 이름이 middleware가
// 아니라 proxy인 이유: Next.js 16부터 "middleware" 파일 규칙은 deprecated다
// (2026-10-12 확인).
export function proxy(request: NextRequest) {
  const isProtected = PROTECTED_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));
  if (isProtected && !request.cookies.get('session')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/upload/:path*', '/me/:path*'],
};
