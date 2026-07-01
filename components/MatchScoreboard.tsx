import type { MatchDto, ParticipantDto } from '@/lib/riot/types';

export interface MatchScoreboardProps {
  match: MatchDto;
}

function TeamTable({ team, label }: { team: ParticipantDto[]; label: string }) {
  return (
    <table className="w-full text-sm">
      <caption className="text-left text-gold-400 mb-1">{label}</caption>
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
            <td>
              {participant.riotIdGameName}#{participant.riotIdTagline}
            </td>
            <td>{participant.championName}</td>
            <td>
              {participant.kills}/{participant.deaths}/{participant.assists}
            </td>
            <td>{participant.totalDamageDealtToChampions}</td>
            <td>{participant.visionScore}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MatchScoreboard({ match }: MatchScoreboardProps) {
  const blueTeam = match.info.participants.filter((p) => p.teamId === 100);
  const redTeam = match.info.participants.filter((p) => p.teamId === 200);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-charcoal-950 p-4 rounded-md">
      <TeamTable team={blueTeam} label="Blue Team" />
      <TeamTable team={redTeam} label="Red Team" />
    </div>
  );
}
