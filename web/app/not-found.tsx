import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-xl font-bold">찾을 수 없습니다</h1>
      <p className="text-sm text-muted-foreground">요청하신 페이지가 존재하지 않거나 삭제됐습니다.</p>
      <Link href="/" className={buttonVariants({})}>
        홈으로
      </Link>
    </main>
  );
}
