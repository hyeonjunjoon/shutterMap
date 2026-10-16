import type { Metadata } from 'next';
import { IBM_Plex_Mono } from 'next/font/google';
import 'pretendard/dist/web/variable/pretendardvariable.css';
import './globals.css';
import { Providers } from './providers';

const ibmPlexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-ibm-plex-mono' });

export const metadata: Metadata = {
  // title.template: 하위 페이지가 title만 짧게 주면("로그인") 탭에는
  // "로그인 | ShutterMap"으로 뜬다 — 그동안 /login, /register 둘 다 탭
  // 제목이 "ShutterMap"으로 똑같았던 걸 여기서 고친다.
  title: { default: 'ShutterMap', template: '%s | ShutterMap' },
  description: '카메라 작례 지도 서비스',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning className={ibmPlexMono.variable}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
