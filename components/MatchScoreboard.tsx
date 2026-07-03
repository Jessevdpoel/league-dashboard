import type { MatchDto, ParticipantDto } from '@/lib/riot/types';
import { championIconUrl } from '@/lib/dataDragon';

export interface MatchScoreboardProps {
  match: MatchDto;
  version: string;
}

function TeamTable({ team, label, version }: { team: ParticipantDto[]; label: string; version: string }) {
  return (
    <table className="w-full text-sm">
      <caption className="text-left text-cyan-400 mb-1 font-semibold">{label}</caption>
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
            <td className="text-frost-300">
              {participant.riotIdGameName}#{participant.riotIdTagline}
            </td>
            <td>
              <div className="flex items-center gap-2">
                <img
                  src={championIconUrl(version, participant.championName)}
                  alt={participant.championName}
                  className="w-6 h-6 rounded border border-line-strong"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
                <span className="text-frost-300">{participant.championName}</span>
              </div>
            </td>
            <td className="text-frost-300">
              {participant.kills}/{participant.deaths}/{participant.assists}
            </td>
            <td className="text-frost-300">{participant.totalDamageDealtToChampions}</td>
            <td className="text-frost-300">{participant.visionScore}</td>
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-ink-950 border border-line-subtle p-4 rounded-lg">
      <TeamTable team={blueTeam} label="Blue Team" version={version} />
      <TeamTable team={redTeam} label="Red Team" version={version} />
    </div>
  );
}
