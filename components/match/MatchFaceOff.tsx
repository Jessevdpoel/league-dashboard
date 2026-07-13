import type { MatchDto, ParticipantDto, TeamDto } from '@/lib/riot/types';
import type { MatchGrades, ParticipantGrade } from '@/lib/matchGrade';
import type { RankSummary } from '@/lib/matchDetail';
import { championIconUrl, itemIconUrl, rankEmblemUrl } from '@/lib/dataDragon';
import { IconImg } from '@/components/IconImg';

/*
 * "Face-off" match detail: lane opponents rendered against a center spine
 * (spec: 2026-07-13-scoreboard-faceoff). Purely presentational — all data
 * arrives via props from /api/matches/[matchId]?ranks=1.
 */

const ROLE_ORDER = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;
const ROLE_LABEL: Record<string, string> = {
  TOP: 'TOP', JUNGLE: 'JG', MIDDLE: 'MID', BOTTOM: 'BOT', UTILITY: 'SUP',
};
const TIER_SHORT: Record<string, string> = {
  IRON: 'I', BRONZE: 'B', SILVER: 'S', GOLD: 'G', PLATINUM: 'P',
  EMERALD: 'E', DIAMOND: 'D', MASTER: 'M', GRANDMASTER: 'GM', CHALLENGER: 'C',
};
const DIVISION_SHORT: Record<string, string> = { I: '1', II: '2', III: '3', IV: '4' };
const APEX = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

export interface LanePair {
  blue: ParticipantDto;
  red: ParticipantDto;
  role: string | null;
}

/** Role-order pairing when both teams have all five positions; index fallback otherwise. */
export function lanePairs(participants: ParticipantDto[]): LanePair[] {
  const blue = participants.filter((p) => p.teamId === 100);
  const red = participants.filter((p) => p.teamId === 200);
  const byRolePossible =
    blue.length === 5 &&
    red.length === 5 &&
    ROLE_ORDER.every(
      (role) =>
        blue.some((p) => p.teamPosition === role) && red.some((p) => p.teamPosition === role)
    );
  if (byRolePossible) {
    return ROLE_ORDER.map((role) => ({
      blue: blue.find((p) => p.teamPosition === role)!,
      red: red.find((p) => p.teamPosition === role)!,
      role,
    }));
  }
  const count = Math.min(blue.length, red.length);
  return Array.from({ length: count }, (_, i) => ({ blue: blue[i], red: red[i], role: null }));
}

function shortRank(rank: RankSummary): string {
  const tier = TIER_SHORT[rank.tier] ?? '?';
  return APEX.has(rank.tier) ? tier : `${tier}${DIVISION_SHORT[rank.division] ?? ''}`;
}

function gradeClass(score: number): string {
  if (score >= 8) return 'text-gold';
  if (score >= 5) return 'text-foreground';
  return 'text-muted-foreground';
}

function kpPercent(p: ParticipantDto, teamKills: number): number {
  return Math.round(((p.kills + p.assists) / Math.max(teamKills, 1)) * 100);
}

function csOf(p: ParticipantDto): number | null {
  if (p.totalMinionsKilled === undefined && p.neutralMinionsKilled === undefined) return null;
  return (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0);
}

function Items({ p, version }: { p: ParticipantDto; version: string }) {
  const slots = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5];
  const trinketUrl = itemIconUrl(version, p.item6);
  return (
    <span className="flex items-center gap-0.5">
      {slots.map((itemId, i) => {
        const url = itemIconUrl(version, itemId);
        return url ? (
          <IconImg key={i} src={url} alt="" className="h-4.5 w-4.5 rounded-sm border border-panel-border" />
        ) : (
          <span key={i} className="h-4.5 w-4.5 rounded-sm border border-panel-border/60 bg-panel-2" />
        );
      })}
      <span className="ml-1">
        {trinketUrl ? (
          <IconImg src={trinketUrl} alt="" className="h-4.5 w-4.5 rounded-full border border-panel-border" />
        ) : (
          <span className="block h-4.5 w-4.5 rounded-full border border-panel-border/60 bg-panel-2" />
        )}
      </span>
    </span>
  );
}

function PlayerCell({
  p, grade, rank, version, teamKills, minutes, isViewer, side,
}: {
  p: ParticipantDto;
  grade: ParticipantGrade;
  rank: RankSummary | null;
  version: string;
  teamKills: number;
  minutes: number;
  isViewer: boolean;
  side: 'left' | 'right';
}) {
  const cs = csOf(p);
  const rowDir = side === 'right' ? 'flex-row-reverse text-right' : '';
  return (
    <div
      data-testid={isViewer ? `viewer-row-${p.puuid}` : undefined}
      className={`flex flex-col gap-1 rounded-lg p-2 ${isViewer ? 'bg-gold/5 shadow-[inset_2px_0_0_0_var(--color-gold)]' : ''}`}
    >
      <div className={`flex items-center gap-2 ${rowDir}`}>
        <span className="relative flex-none">
          <IconImg src={championIconUrl(version, p.championName)} alt={p.championName} className="h-8 w-8 rounded-md border border-panel-border" />
          <span className="absolute -bottom-1 -right-1 rounded bg-panel-2 px-0.5 text-[8px] font-extrabold text-muted-foreground">
            {p.champLevel}
          </span>
        </span>
        <span className="min-w-0 flex-1 truncate">
          <span className="block truncate text-xs font-extrabold text-foreground">{p.riotIdGameName}</span>
          <span className={`flex items-center gap-1 text-[10px] font-bold text-muted-foreground ${side === 'right' ? 'justify-end' : ''}`}>
            {rank && (
              <>
                <IconImg src={rankEmblemUrl(rank.tier)} alt={`${rank.tier} emblem`} className="h-4 w-4" />
                <span>{shortRank(rank)}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <span className={`font-extrabold ${gradeClass(grade.score)}`}>{grade.score.toFixed(1)}</span>
            {grade.badge === 'MVP' && (
              <span className="rounded bg-gradient-to-r from-gold-light to-gold px-1 text-[9px] font-extrabold text-black">MVP</span>
            )}
            {grade.badge === 'ACE' && (
              <span className="rounded bg-coach px-1 text-[9px] font-extrabold text-white">ACE</span>
            )}
          </span>
        </span>
      </div>
      <div className={`flex items-center gap-2 text-[10px] font-bold text-muted-foreground ${rowDir}`}>
        <span className="text-foreground">
          {p.kills}/<span className="text-loss">{p.deaths}</span>/{p.assists}
        </span>
        <span>{kpPercent(p, teamKills)}% KP</span>
        <span>{cs === null ? '—' : `${cs} (${(cs / minutes).toFixed(1)})`} CS</span>
        <span>{(p.goldEarned / 1000).toFixed(1)}k</span>
      </div>
      <div className={`flex ${side === 'right' ? 'justify-end' : ''}`}>
        <Items p={p} version={version} />
      </div>
    </div>
  );
}

function SpineBars({
  pair, maxDamage, maxTaken, role,
}: {
  pair: LanePair;
  maxDamage: number;
  maxTaken: number;
  role: string | null;
}) {
  const width = (value: number, max: number) => `${Math.round((value / Math.max(max, 1)) * 100)}%`;
  return (
    <div className="flex w-24 flex-none flex-col items-center justify-center gap-1 md:w-32">
      {role && (
        <span className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">
          {ROLE_LABEL[role] ?? role}
        </span>
      )}
      {(
        [
          ['dealt', pair.blue.totalDamageDealtToChampions, pair.red.totalDamageDealtToChampions, maxDamage, 'bg-gold/80'],
          ['taken', pair.blue.totalDamageTaken, pair.red.totalDamageTaken, maxTaken, 'bg-muted-foreground/40'],
        ] as const
      ).map(([label, blueValue, redValue, max, fill]) => (
        <div key={label} className="w-full">
          <div className="flex h-1.5 w-full items-stretch">
            <div className="flex flex-1 justify-end">
              <div className={`${fill} rounded-l-sm`} style={{ width: width(blueValue, max) }} />
            </div>
            <div className="w-px flex-none bg-panel-border" />
            <div className="flex flex-1">
              <div className={`${fill} rounded-r-sm`} style={{ width: width(redValue, max) }} />
            </div>
          </div>
          <div className="flex justify-between text-[8px] font-bold text-muted-foreground">
            <span>{(blueValue / 1000).toFixed(1)}k</span>
            <span className="uppercase">{label}</span>
            <span>{(redValue / 1000).toFixed(1)}k</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamHeader({
  team, participants, side,
}: {
  team: TeamDto | undefined;
  participants: ParticipantDto[];
  side: 'Blue side' | 'Red side';
}) {
  const won = participants[0]?.win ?? false;
  const kills = participants.reduce((sum, p) => sum + p.kills, 0);
  const gold = participants.reduce((sum, p) => sum + p.goldEarned, 0);
  return (
    <div className="flex-1">
      <p className={`text-[11px] font-extrabold uppercase tracking-widest ${won ? 'text-win' : 'text-loss'}`}>
        {won ? 'Victory' : 'Defeat'} <span className="text-muted-foreground">· {side}</span>
      </p>
      <p className="text-[10px] font-bold text-muted-foreground">
        {kills} kills · {(gold / 1000).toFixed(1)}k gold
        {team && (
          <>
            {' '}· Drakes {team.objectives.dragon.kills} · Barons {team.objectives.baron.kills} ·
            Heralds {team.objectives.riftHerald.kills} · Towers {team.objectives.tower.kills}
          </>
        )}
      </p>
    </div>
  );
}

function ShareBar({ blue, red, label }: { blue: number; red: number; label: string }) {
  const total = Math.max(blue + red, 1);
  return (
    <div className="my-1">
      <div className="flex h-1.5 overflow-hidden rounded-full">
        <div className="bg-gold/80" style={{ width: `${(blue / total) * 100}%` }} />
        <div className="bg-muted-foreground/40" style={{ width: `${(red / total) * 100}%` }} />
      </div>
      <p className="mt-0.5 text-center text-[8px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
  );
}

export interface MatchFaceOffProps {
  match: MatchDto;
  grades: MatchGrades;
  ranks: Record<string, RankSummary | null>;
  version: string;
  /** The profile being viewed — their rows get the gold accent. */
  viewerPuuid: string;
}

export function MatchFaceOff({ match, grades, ranks, version, viewerPuuid }: MatchFaceOffProps) {
  const participants = match.info.participants;
  const pairs = lanePairs(participants);
  const minutes = Math.max(match.info.gameDuration / 60, 1);
  const blueTeam = participants.filter((p) => p.teamId === 100);
  const redTeam = participants.filter((p) => p.teamId === 200);
  const killsFor = (team: ParticipantDto[]) => team.reduce((sum, p) => sum + p.kills, 0);
  const goldFor = (team: ParticipantDto[]) => team.reduce((sum, p) => sum + p.goldEarned, 0);
  const maxDamage = Math.max(...participants.map((p) => p.totalDamageDealtToChampions));
  const maxTaken = Math.max(...participants.map((p) => p.totalDamageTaken));
  const teams = match.info.teams;
  const blueMeta = teams?.find((t) => t.teamId === 100);
  const redMeta = teams?.find((t) => t.teamId === 200);
  const gradeOf = (p: ParticipantDto): ParticipantGrade =>
    grades.byPuuid[p.puuid] ?? { puuid: p.puuid, score: 0, ordinal: participants.length, badge: null };

  return (
    <div className="rounded-xl border border-panel-border bg-gradient-to-b from-panel to-panel-2 p-3">
      <div className="flex items-start gap-4">
        <TeamHeader team={blueMeta} participants={blueTeam} side="Blue side" />
        <TeamHeader team={redMeta} participants={redTeam} side="Red side" />
      </div>
      <ShareBar blue={killsFor(blueTeam)} red={killsFor(redTeam)} label="Kill share" />
      <ShareBar blue={goldFor(blueTeam)} red={goldFor(redTeam)} label="Gold share" />
      <div className="mt-2 flex flex-col gap-1.5">
        {pairs.map((pair) => (
          <div key={pair.blue.puuid} className="grid grid-cols-1 items-center gap-1 md:grid-cols-[1fr_auto_1fr]">
            <PlayerCell
              p={pair.blue}
              grade={gradeOf(pair.blue)}
              rank={ranks[pair.blue.puuid] ?? null}
              version={version}
              teamKills={killsFor(blueTeam)}
              minutes={minutes}
              isViewer={pair.blue.puuid === viewerPuuid}
              side="left"
            />
            <div className="hidden md:block">
              <SpineBars pair={pair} maxDamage={maxDamage} maxTaken={maxTaken} role={pair.role} />
            </div>
            <PlayerCell
              p={pair.red}
              grade={gradeOf(pair.red)}
              rank={ranks[pair.red.puuid] ?? null}
              version={version}
              teamKills={killsFor(redTeam)}
              minutes={minutes}
              isViewer={pair.red.puuid === viewerPuuid}
              side="right"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
