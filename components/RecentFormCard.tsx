export interface RecentFormCardProps {
  results: boolean[];
}

export function RecentFormCard({ results }: RecentFormCardProps) {
  const wins = results.filter(Boolean).length;
  const losses = results.length - wins;
  const winRate = results.length === 0 ? 0 : Math.round((wins / results.length) * 100);

  return (
    <section aria-label="Recent form" className="rounded-lg bg-charcoal-800 p-5 text-gold-100">
      <p className="text-sm uppercase tracking-wide text-gold-400">Recent Form</p>
      <p className="text-xl font-display">
        {wins}W {losses}L
      </p>
      <p className="text-sm">
        {winRate}% over last {results.length} games
      </p>
      <div className="flex gap-1 mt-2">
        {results.map((win, index) => (
          <span
            key={index}
            aria-label={win ? 'Win' : 'Loss'}
            className={`h-2 w-2 rounded-full ${win ? 'bg-emerald-400' : 'bg-red-400'}`}
          />
        ))}
      </div>
    </section>
  );
}
