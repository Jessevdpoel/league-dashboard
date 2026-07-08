import './globals.css';
import type { ReactNode } from 'react';
import Script from 'next/script';
import { Rajdhani, Geist } from 'next/font/google';
import { TopNav } from '@/components/TopNav';
import { SiteFooter } from '@/components/SiteFooter';
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});


// Loaded only when a publisher id is configured. Enable Google's certified CMP in
// the AdSense dashboard before setting this for EU/UK traffic (see AdSlot.tsx).
const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

const rajdhani = Rajdhani({ subsets: ['latin'], variable: '--font-rajdhani', weight: ['500', '600', '700'] });

export const metadata = {
  title: 'League Dashboard',
  description: 'Look up summoners, ranks, and match history.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className="min-h-screen flex flex-col">
        {ADSENSE_CLIENT && (
          <Script
            async
            strategy="afterInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
          />
        )}
        <TopNav />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
