import type { Metadata } from 'next';
import { IBM_Plex_Mono } from 'next/font/google';
import 'pretendard/dist/web/variable/pretendardvariable.css';
import './globals.css';

const ibmPlexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-ibm-plex-mono' });

export const metadata: Metadata = {
  title: 'ShutterMap',
  description: '카메라 작례 지도 서비스',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning className={ibmPlexMono.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
