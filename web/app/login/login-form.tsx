'use client';

import { useEffect, useRef, useState } from 'react';
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

// 이메일 형식의 대략적인 검증 — 네이티브 브라우저 검증(영문 팝업)에 맡기지
// 않고 우리 쪽에서 먼저 잡는다. 통과한 값은 어차피 백엔드가 한 번 더 검증한다.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  // 'alert' 에러는 setError 시점엔 <p>가 아직 안 그려져 있어서 errorRef.current가
  // null이다(에러가 있을 때만 조건부 렌더링) — 그래서 .focus()를 그 자리에서
  // 바로 부르지 않고, 어디로 포커스를 옮길지만 기록해뒀다가 아래 useEffect가
  // 커밋 이후(= <p>가 실제로 DOM에 붙은 뒤)에 옮긴다.
  const focusTargetRef = useRef<'email' | 'alert' | null>(null);

  useEffect(() => {
    if (me) router.replace('/');
  }, [me, router]);

  useEffect(() => {
    if (!error) return;
    (focusTargetRef.current === 'email' ? emailRef.current : errorRef.current)?.focus();
  }, [error]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // 폼에 noValidate를 줘서 네이티브 브라우저 검증 팝업(영문)이 뜨지 않게
    // 하고, 그 자리를 여기 한국어 검증으로 대신한다 — 2026-10-15 /qa에서
    // 실제 브라우저로 직접 확인: noValidate 없이 type=email만 쓰면 한국어
    // 화면에 "Please include an '@' in the email address" 같은 영문
    // 팝업이 뜨고, submit 자체가 막혀서 아래 로직은 실행도 안 된다.
    if (!EMAIL_PATTERN.test(email)) {
      focusTargetRef.current = 'email';
      setError('올바른 이메일 형식이 아닙니다.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      router.replace('/');
    } catch (err) {
      // 이메일/비밀번호 중 어느 쪽이 틀렸는지 특정 안 되는 서버 에러라 특정
      // 필드가 아니라 에러 메시지 자체로 포커스를 옮긴다.
      focusTargetRef.current = 'alert';
      setError(err instanceof ApiError ? err.message : '로그인에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-black">로그인</h1>
          {/* 2026-10-16: 로그인/가입 화면이 색도 같고(흑백 통일) 레이아웃도
              거의 같아서, 제목 바로 아래 한 줄로 구분감을 준다 — 제목·버튼
              문구만으론 부족하다는 피드백. */}
          <p className="text-sm text-muted-foreground">저장해둔 출사지와 장비 기록을 다시 만나보세요</p>
        </div>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              ref={emailRef}
              type="email"
              autoComplete="email"
              spellCheck={false}
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
            // tabIndex={-1}: 프로그래밍적으로 focus()는 가능하되 Tab 키 순서에는
            // 안 끼게 한다 — 에러 발생 시에만 JS로 포커스를 옮기는 용도.
            <p ref={errorRef} tabIndex={-1} role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          {/* w-full: 로딩 중 텍스트("로그인" → "로그인 중…")가 길어져도
              버튼 폭이 컨테이너 폭(max-w-sm)에 고정돼 있어 레이아웃이 흔들리지 않는다. */}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? '로그인 중…' : '로그인'}
          </Button>
        </form>

        {/* 카카오/구글은 서버가 OAuth 제공자로 302 리다이렉트하므로 next/link가
            아니라 실제 <a> 전체 페이지 이동이어야 한다 — fetch로 부르면 안 됨.
            계정이 없으면 콜백이 자동으로 만들어주므로(docs/api.md: "계정 없으면
            생성") 이 버튼들이 로그인/가입을 겸한다 — "시작하기" 문구로 그 점을
            드러낸다(2026-10-16 피드백, /register에도 동일하게 추가됨).
            레이블 색상은 각 사 공식 가이드 수치를 따른다(심볼/배경색은 변경
            불가). radius는 앱 기본값(8px)으로 통일 — 카카오 가이드의 "컨테이너
            radius 12px"는 "표준 버튼 권장"일 뿐 심볼처럼 변경 금지 조항이
            아니라서, 서비스 UI 일관성을 우선했다. 심볼/로고 자체는 원본 그대로,
            비율만 유지한다. */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          또는
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="space-y-2">
          <a
            href={`${API_BASE_URL}/auth/kakao`}
            className="flex w-full touch-manipulation items-center justify-center gap-2 rounded-lg bg-[#FEE500] py-3 text-sm font-medium text-black/85 transition-opacity hover:opacity-90"
          >
            {/* 고정 18px 아이콘이라 next/image 최적화 파이프라인이 필요 없다 —
                그걸 쓰면 next.config에 dangerouslyAllowSVG를 추가해야 해서
                평범한 <img>가 더 적은 변경으로 끝난다. */}
            <img src="/icons/kakao-symbol.svg" alt="" width={18} height={18} />
            카카오로 시작하기
          </a>
          <a
            href={`${API_BASE_URL}/auth/google`}
            className="flex w-full touch-manipulation items-center justify-center gap-2 rounded-lg border border-[#747775] bg-white py-3 text-sm font-medium text-[#1F1F1F] transition-opacity hover:opacity-90 dark:border-[#8E918F] dark:bg-[#131314] dark:text-[#E3E3E3]"
          >
            <img src="/icons/google-g-logo.svg" alt="" width={18} height={18} />
            구글로 시작하기
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
