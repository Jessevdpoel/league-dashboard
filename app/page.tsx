import { Shield, History, Trophy } from 'lucide-react';
import { SearchForm } from '@/components/SearchForm';

const FEATURES = [
  { icon: Shield, label: 'Rank & Profile' },
  { icon: History, label: 'Match History' },
  { icon: Trophy, label: 'Top Champions' },
];

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center gap-5 text-center px-5 py-16 min-h-[calc(100vh-56px)]">
      <p className="text-xs font-semibold tracking-[0.2em] text-accent-foreground uppercase">Summoner Lookup</p>
      <h1 className="text-3xl md:text-4xl font-bold text-foreground max-w-xl leading-tight">
        Find your rank, match history &amp; top champions
      </h1>
      <div className="mt-2 w-full max-w-xl">
        <SearchForm variant="hero" />
      </div>
      <div className="flex gap-9 mt-8">
        {FEATURES.map(({ icon: Icon, label }) => (
          <div key={label} className="flex flex-col items-center gap-2 max-w-[150px]">
            <div className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center shadow-[0_0_10px_rgba(56,232,255,0.3)]">
              <Icon className="w-[18px] h-[18px] text-accent-foreground" />
            </div>
            <p className="text-sm font-bold text-foreground/80">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
