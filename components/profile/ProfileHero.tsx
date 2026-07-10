import { profileIconUrl } from '@/lib/dataDragon';
import { IconImg } from '@/components/IconImg';
import { RefreshButton } from './RefreshButton';

export function ProfileHero({
  gameName,
  tagLine,
  level,
  profileIconId,
  version,
  regionLabel,
  ladderChip,
}: {
  gameName: string;
  tagLine: string;
  level: number;
  profileIconId: number;
  version: string;
  regionLabel: string;
  ladderChip: string | null;
}) {
  return (
    <header className="flex items-center gap-5 border-b border-gold/25 px-1 pb-6">
      <div className="relative flex-none">
        <IconImg
          src={profileIconUrl(version, profileIconId)}
          alt=""
          className="h-20 w-20 rounded-xl ring-1 ring-gold/70"
        />
        <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-gold/60 bg-panel-2 px-2.5 py-0.5 text-[10px] font-extrabold text-gold-light">
          LVL {level}
        </span>
      </div>
      <div className="min-w-0">
        <h1 className="text-3xl font-extrabold text-foreground">
          {gameName} <span className="text-lg font-semibold text-muted-foreground">#{tagLine}</span>
        </h1>
        <div className="mt-1.5 flex items-center gap-3 text-xs font-semibold text-muted-foreground">
          {ladderChip ? (
            <span className="rounded-full border border-gold/35 bg-gold/10 px-2.5 py-0.5 font-bold text-gold-light">
              {ladderChip} · {regionLabel}
            </span>
          ) : (
            <span>{regionLabel}</span>
          )}
        </div>
      </div>
      <div className="ml-auto self-start">
        <RefreshButton />
      </div>
    </header>
  );
}
