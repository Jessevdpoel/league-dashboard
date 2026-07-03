'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PLATFORM_REGIONS, type PlatformRegion } from '@/lib/riot/regions';

const REGION_LABELS: Record<PlatformRegion, string> = {
  na1: 'North America',
  euw1: 'EU West',
  eun1: 'EU Nordic & East',
  kr: 'Korea',
  jp1: 'Japan',
  br1: 'Brazil',
};

function encodeRiotIdPart(part: string): string {
  return encodeURIComponent(part).replace(/-/g, '%2D');
}

export interface SearchFormProps {
  variant?: 'hero' | 'compact';
}

export function SearchForm({ variant = 'hero' }: SearchFormProps) {
  const router = useRouter();
  const [region, setRegion] = useState<PlatformRegion>('na1');
  const [riotId, setRiotId] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parts = riotId.split('#');
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
      setError('Enter a Riot ID in the form GameName#Tag');
      return;
    }
    setError(null);
    const [gameName, tagLine] = parts;
    router.push(`/${region}/${encodeRiotIdPart(gameName.trim())}-${encodeRiotIdPart(tagLine.trim())}`);
  }

  const isHero = variant === 'hero';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div
        className={`flex items-center gap-1 rounded-xl border border-line-strong bg-ink-900 p-1.5 ${
          isHero ? 'shadow-[0_0_24px_rgba(56,232,255,0.25)]' : ''
        }`}
      >
        <select
          value={region}
          onChange={(event) => setRegion(event.target.value as PlatformRegion)}
          aria-label="Region"
          className={`bg-transparent text-frost-500 font-semibold border-r border-line-subtle px-3 ${
            isHero ? 'py-2.5 text-sm' : 'py-1.5 text-xs'
          }`}
        >
          {PLATFORM_REGIONS.map((platform) => (
            <option key={platform} value={platform} className="bg-ink-900">
              {REGION_LABELS[platform]}
            </option>
          ))}
        </select>
        <input
          value={riotId}
          onChange={(event) => setRiotId(event.target.value)}
          placeholder="GameName#Tag"
          aria-label="Riot ID"
          className={`flex-1 bg-transparent text-frost-100 placeholder:text-frost-500/60 outline-none px-3 ${
            isHero ? 'py-2.5 text-sm' : 'py-1.5 text-xs w-40'
          }`}
        />
        <button
          type="submit"
          className={`uppercase rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-500 font-bold text-ink-950 tracking-wide ${
            isHero ? 'px-6 py-2.5 text-sm' : 'px-4 py-1.5 text-xs'
          }`}
        >
          Search
        </button>
      </div>
      {error && (
        <p role="alert" className="text-loss text-sm font-semibold">
          {error}
        </p>
      )}
    </form>
  );
}
