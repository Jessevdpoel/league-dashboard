export interface RecentFormCardProps {
  results: boolean[];
}

export function RecentFormCard({ results }: RecentFormCardProps) {
  const wins = results.filter(Boolean).length;
  const losses = results.length - wins;
  const winRate = results.length === 0 ? 0 : Math.round((wins / results.length) * 100);

  return (
    <section aria-label="Recent form" className="rounded-lg bg-card border border-border p-5">
      <p className="text-xs uppercase tracking-wide text-accent-foreground font-semibold">Recent Form</p>
      <p className="text-xl font-bold text-foreground mt-1">
        {wins}W {losses}L
      </p>
      <p className="text-sm text-muted-foreground font-semibold">
        {winRate}% over last {results.length} games
      </p>
      <div className="flex gap-1 mt-2">
        {results.map((win, index) => (
          <span
            key={index}
            aria-label={win ? 'Win' : 'Loss'}
            className={`h-2 w-4 rounded-full ${win ? 'bg-win' : 'bg-loss'}`}
          />
        ))}
      </div>
    </section>
  );
}
