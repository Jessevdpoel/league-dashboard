import './globals.css';
import type { ReactNode } from 'react';
import { Cinzel, Inter } from 'next/font/google';
import { NavRail } from '@/components/NavRail';

const displayFont = Cinzel({ subsets: ['latin'], variable: '--font-display', weight: ['500', '700'] });
const bodyFont = Inter({ subsets: ['latin'], variable: '--font-body' });

export const metadata = {
  title: 'League Dashboard',
  description: 'Look up summoners, ranks, and match history.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body className="flex min-h-screen">
        <NavRail />
        <main className="flex-1 p-8">{children}</main>
      </body>
    </html>
  );
}
