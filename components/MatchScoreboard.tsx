import type { MatchDto, ParticipantDto } from '@/lib/riot/types';
import { championIconUrl } from '@/lib/dataDragon';
import { IconImg } from './IconImg';

export interface MatchScoreboardProps {
  match: MatchDto;
  version: string;
}

function TeamTable({ team, label, version }: { team: ParticipantDto[]; label: string; version: string }) {
  return (
    <table className="w-full text-sm">
      <caption className="text-left text-accent-foreground mb-1 font-semibold">{label}</caption>
      <thead>
        <tr>
          <th className="text-left">Player</th>
          <th className="text-left">Champion</th>
          <th className="text-left">KDA</th>
          <th className="text-left">Damage</th>
          <th className="text-left">Vision</th>
        </tr>
      </thead>
      <tbody>
        {team.map((participant) => (
          <tr key={participant.puuid}>
            <td className="text-foreground/80">
              {participant.riotIdGameName}#{participant.riotIdTagline}
            </td>
            <td>
              <div className="flex items-center gap-2">
                <IconImg
                  src={championIconUrl(version, participant.championName)}
                  alt={participant.championName}
                  className="w-6 h-6 rounded border border-border"
                />
                <span className="text-foreground/80">{participant.championName}</span>
              </div>
            </td>
            <td className="text-foreground/80">
              {participant.kills}/{participant.deaths}/{participant.assists}
            </td>
            <td className="text-foreground/80">{participant.totalDamageDealtToChampions}</td>
            <td className="text-foreground/80">{participant.visionScore}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MatchScoreboard({ match, version }: MatchScoreboardProps) {
  const blueTeam = match.info.participants.filter((p) => p.teamId === 100);
  const redTeam = match.info.participants.filter((p) => p.teamId === 200);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-background border border-border p-4 rounded-lg">
      <TeamTable team={blueTeam} label="Blue Team" version={version} />
      <TeamTable team={redTeam} label="Red Team" version={version} />
    </div>
  );
}
