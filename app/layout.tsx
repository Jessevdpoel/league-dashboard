import './globals.css';
import type { ReactNode } from 'react';
import { Rajdhani } from 'next/font/google';
import { TopNav } from '@/components/TopNav';

const rajdhani = Rajdhani({ subsets: ['latin'], variable: '--font-rajdhani', weight: ['500', '600', '700'] });

export const metadata = {
  title: 'League Dashboard',
  description: 'Look up summoners, ranks, and match history.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={rajdhani.variable}>
      <body className="min-h-screen flex flex-col">
        <TopNav />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
