import Link from 'next/link';
import { SearchForm } from './SearchForm';

export function TopNav() {
  return (
    <header className="h-14 bg-ink-900 border-b border-line-subtle flex items-center px-7 gap-6">
      <Link href="/" className="font-bold text-lg tracking-wide text-frost-100 whitespace-nowrap">
        LEAGUE<span className="text-cyan-400 drop-shadow-[0_0_8px_rgba(56,232,255,0.8)]">DASH</span>
      </Link>
      <div className="flex-1" />
      <SearchForm variant="compact" />
    </header>
  );
}
