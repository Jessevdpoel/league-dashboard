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

export function SearchForm() {
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
    router.push(`/${region}/${encodeURIComponent(gameName.trim())}-${encodeURIComponent(tagLine.trim())}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm text-gold-300">
        Region
        <select
          value={region}
          onChange={(event) => setRegion(event.target.value as PlatformRegion)}
          aria-label="Region"
          className="rounded bg-charcoal-800 text-gold-200 px-3 py-2"
        >
          {PLATFORM_REGIONS.map((platform) => (
            <option key={platform} value={platform}>
              {REGION_LABELS[platform]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-gold-300">
        Riot ID
        <input
          value={riotId}
          onChange={(event) => setRiotId(event.target.value)}
          placeholder="GameName#Tag"
          aria-label="Riot ID"
          className="rounded bg-charcoal-800 text-gold-200 px-3 py-2"
        />
      </label>
      <button type="submit" className="rounded bg-gold-500 text-charcoal-900 px-3 py-2 font-semibold">
        Search
      </button>
      {error && (
        <p role="alert" className="text-red-400 text-sm">
          {error}
        </p>
      )}
    </form>
  );
}
