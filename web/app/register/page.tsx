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

export default function RegisterPage() {
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
    // src/auth/dto/register.dto.ts의 @MinLength(8)과 맞춘 선검증 — 네이티브
    // minlength 속성(아래)이 실제 브라우저에서는 먼저 막아주지만, 혹시
    // 그걸 지나쳐도 백엔드의 영문 에러 메시지가 그대로 노출되지 않게 한다.
    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    setSubmitting(true);
    try {
      // 백엔드가 가입과 동시에 로그인 세션 쿠키를 심어준다(docs/api.md) —
      // 별도로 /auth/login을 또 호출하지 않는다.
      await apiClient('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '가입에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-center text-2xl font-black">회원가입</h1>
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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              // src/auth/dto/register.dto.ts의 @MinLength(8)/@MaxLength(72)와
              // 맞춘다 — 네이티브 검증으로 먼저 막아서, 가장 흔한 실패(짧은
              // 비밀번호)에서 영문 서버 메시지가 그대로 노출되는 걸 피한다.
              minLength={8}
              maxLength={72}
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {/* w-full: 로딩 중 텍스트("가입하기" → "가입 중...")가 길어져도
              버튼 폭이 컨테이너 폭(max-w-sm)에 고정돼 있어 레이아웃이 흔들리지 않는다. */}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? '가입 중...' : '가입하기'}
          </Button>
        </form>
        <p className="text-center text-sm">
          이미 계정이 있으신가요?{' '}
          <Link href="/login" className="underline">
            로그인
          </Link>
        </p>
      </div>
    </main>
  );
}
