'use client';

import { useRouter } from 'next/navigation';

export function RefreshButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.refresh()}
      className="rounded-lg bg-gradient-to-b from-gold-light to-gold px-4 py-2 text-xs font-extrabold text-black shadow-[0_3px_12px_rgba(201,168,106,0.35)]"
    >
      ⟳ Update
    </button>
  );
}
