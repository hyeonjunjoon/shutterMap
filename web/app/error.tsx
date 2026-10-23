'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-xl font-bold">문제가 생겼어요</h1>
      <p className="text-sm text-muted-foreground">페이지를 불러오는 중 오류가 발생했습니다.</p>
      <Button onClick={() => reset()}>다시 시도</Button>
    </main>
  );
}
