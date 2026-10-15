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

// 이메일 형식의 대략적인 검증 — 백엔드 @IsEmail()과 정확히 같을 필요는 없고,
// 네이티브 브라우저 검증(영문 팝업)에 맡기지 않고 우리 쪽에서 먼저 잡기만
// 하면 된다. 통과한 값은 어차피 백엔드가 한 번 더 검증한다.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    // 폼에 noValidate를 줘서 네이티브 브라우저 검증 팝업(영문)이 뜨지 않게
    // 하고, 그 자리를 여기 한국어 검증으로 대신한다 — 2026-10-15 /qa에서
    // 실제 브라우저로 직접 확인: noValidate 없이 minlength/type=email만
    // 쓰면 한국어 화면에 "Please lengthen this text to 8 characters or
    // more" 같은 영문 팝업이 뜨고, 이 아래 한국어 에러 처리는 아예 실행도
    // 안 된다(네이티브 검증이 submit 자체를 막아버림).
    if (!EMAIL_PATTERN.test(email)) {
      setError('올바른 이메일 형식이 아닙니다.');
      return;
    }
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
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
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
              // 맞춘 참고용 속성 — 실제 검증/에러 메시지는 noValidate 때문에
              // 위 handleSubmit의 한국어 체크가 담당한다. maxLength는
              // noValidate와 무관하게 입력 자체를 못 하게 막아주므로 그대로 둔다.
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
