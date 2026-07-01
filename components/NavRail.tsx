import { SearchForm } from './SearchForm';

export function NavRail() {
  return (
    <nav className="w-64 shrink-0 bg-charcoal-900 text-gold-200 p-6 flex flex-col gap-6 min-h-screen">
      <h1 className="text-2xl font-display text-gold-400">League Dashboard</h1>
      <SearchForm />
    </nav>
  );
}
