'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PLATFORM_REGIONS, defaultTagForRegion, type PlatformRegion } from '@/lib/riot/regions';

const REGION_LABELS: Record<PlatformRegion, string> = {
  na1: 'North America',
  euw1: 'EU West',
  eun1: 'EU Nordic & East',
  kr: 'Korea',
  jp1: 'Japan',
  br1: 'Brazil',
};

const SUGGEST_DEBOUNCE_MS = 250;

interface RiotIdSuggestion {
  gameName: string;
  tagLine: string;
}

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
  const [suggestions, setSuggestions] = useState<RiotIdSuggestion[]>([]);
  // Discards responses that arrive after a newer request was issued.
  const requestSeq = useRef(0);

  useEffect(() => {
    const query = riotId.trim();
    if (query.length < 2 || query.includes('#')) {
      setSuggestions([]);
      return;
    }
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/riot-ids/suggest?q=${encodeURIComponent(query)}&region=${region}`
        );
        if (!response.ok) return;
        const body = (await response.json()) as { suggestions: RiotIdSuggestion[] };
        if (seq === requestSeq.current) setSuggestions(body.suggestions);
      } catch {
        // Best-effort autocomplete: stay silent on network failure.
      }
    }, SUGGEST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [riotId, region]);

  function navigateTo(gameName: string, tagLine: string) {
    setError(null);
    setSuggestions([]);
    router.push(`/${region}/${encodeRiotIdPart(gameName)}-${encodeRiotIdPart(tagLine)}`);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const raw = riotId.trim();
    const parts = raw.split('#');
    if (parts.length === 1 && parts[0].trim()) {
      // Bare game name: assume the region's default tag (e.g. "Faker" → "Faker#KR1").
      navigateTo(parts[0].trim(), defaultTagForRegion(region));
      return;
    }
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
      setError('Enter a Riot ID in the form GameName#Tag');
      return;
    }
    navigateTo(parts[0].trim(), parts[1].trim());
  }

  const isHero = variant === 'hero';

  return (
    <form onSubmit={handleSubmit} className="relative flex flex-col gap-2">
      <div
        className={`flex items-center gap-1 rounded-xl border border-border bg-card p-1.5 ${
          isHero ? 'shadow-[0_0_24px_rgba(56,232,255,0.25)]' : ''
        }`}
      >
        <select
          value={region}
          onChange={(event) => setRegion(event.target.value as PlatformRegion)}
          aria-label="Region"
          className={`bg-transparent text-muted-foreground font-semibold border-r border-border px-3 ${
            isHero ? 'py-2.5 text-sm' : 'py-1.5 text-xs'
          }`}
        >
          {PLATFORM_REGIONS.map((platform) => (
            <option key={platform} value={platform} className="bg-card">
              {REGION_LABELS[platform]}
            </option>
          ))}
        </select>
        <input
          value={riotId}
          onChange={(event) => setRiotId(event.target.value)}
          placeholder="GameName#Tag (tag optional)"
          aria-label="Riot ID"
          autoComplete="off"
          className={`flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/60 outline-none px-3 ${
            isHero ? 'py-2.5 text-sm' : 'py-1.5 text-xs w-40'
          }`}
        />
        <button
          type="submit"
          className={`uppercase rounded-lg bg-gradient-to-br from-accent-foreground to-primary font-bold text-background tracking-wide ${
            isHero ? 'px-6 py-2.5 text-sm' : 'px-4 py-1.5 text-xs'
          }`}
        >
          Search
        </button>
      </div>
      {suggestions.length > 0 && (
        <ul
          aria-label="Riot ID suggestions"
          className="absolute top-full left-0 right-0 z-20 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
        >
          {suggestions.map((suggestion) => (
            <li key={`${suggestion.gameName}#${suggestion.tagLine}`}>
              <button
                type="button"
                onClick={() => navigateTo(suggestion.gameName, suggestion.tagLine)}
                className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-background"
              >
                {`${suggestion.gameName}#${suggestion.tagLine}`}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-loss text-sm font-semibold">
          {error}
        </p>
      )}
    </form>
  );
}
