'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient, ApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useMe } from '@/hooks/use-me';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (me) router.replace('/');
  }, [me, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiClient('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '로그인에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-center text-2xl font-black">로그인</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {/* w-full: 로딩 중 텍스트("로그인" → "로그인 중...")가 길어져도
              버튼 폭이 컨테이너 폭(max-w-sm)에 고정돼 있어 레이아웃이 흔들리지 않는다. */}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? '로그인 중...' : '로그인'}
          </Button>
        </form>

        {/* 카카오/구글은 서버가 OAuth 제공자로 302 리다이렉트하므로 next/link가
            아니라 실제 <a> 전체 페이지 이동이어야 한다 — fetch로 부르면 안 됨.
            컨테이너 색상/radius/레이블 색상은 각 사 공식 가이드 수치를 그대로
            따른다(docs/designs/DESIGN.md가 아니라 각 사 브랜드 규정이 우선).
            심볼/로고 자체는 Step 2에서 받은 원본 그대로, 비율만 유지한다. */}
        <div className="space-y-2">
          <a
            href={`${API_BASE_URL}/auth/kakao`}
            className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#FEE500] py-3 text-sm font-medium text-black/85"
          >
            {/* 고정 18px 아이콘이라 next/image 최적화 파이프라인이 필요 없다 —
                그걸 쓰면 next.config에 dangerouslyAllowSVG를 추가해야 해서
                평범한 <img>가 더 적은 변경으로 끝난다. */}
            <img src="/icons/kakao-symbol.svg" alt="" width={18} height={18} />
            카카오로 로그인
          </a>
          <a
            href={`${API_BASE_URL}/auth/google`}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#747775] bg-white py-3 text-sm font-medium text-[#1F1F1F] dark:border-[#8E918F] dark:bg-[#131314] dark:text-[#E3E3E3]"
          >
            <img src="/icons/google-g-logo.svg" alt="" width={18} height={18} />
            구글로 로그인
          </a>
        </div>

        <p className="text-center text-sm">
          계정이 없으신가요?{' '}
          <Link href="/register" className="underline">
            회원가입
          </Link>
        </p>
      </div>
    </main>
  );
}
