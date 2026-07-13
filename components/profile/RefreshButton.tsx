'use client';

import { useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { refreshProfile } from '@/app/[region]/[riotId]/actions';

export function RefreshButton() {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          // Bust the page's Riot fetch cache first, then re-render with fresh data.
          await refreshProfile(pathname);
          router.refresh();
        })
      }
      className="rounded-lg bg-gradient-to-b from-gold-light to-gold px-4 py-2 text-xs font-extrabold text-black shadow-[0_3px_12px_rgba(201,168,106,0.35)] disabled:opacity-60"
    >
      {isPending ? '⟳ Updating…' : '⟳ Update'}
    </button>
  );
}
