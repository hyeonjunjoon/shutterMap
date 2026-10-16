import type { Metadata } from 'next';
import { LoginForm } from './login-form';

// 'use client' 컴포넌트는 metadata를 못 내보내서(Next.js App Router 제약),
// 실제 폼은 login-form.tsx(클라이언트)로 빼고 이 파일은 서버 컴포넌트로
// 남겨 탭 제목만 책임진다 — 2026-10-16: /login, /register 탭 제목이 둘 다
// "ShutterMap"으로 같아서 구분이 안 되던 걸 고친다.
export const metadata: Metadata = {
  title: '로그인',
};

export default function LoginPage() {
  return <LoginForm />;
}
