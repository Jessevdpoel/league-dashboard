import type { ParticipantDto } from './riot/types';

/** One short highlight per match, or null. Priority: rarest feat first. */
export function performanceBadge(participant: ParticipantDto): string | null {
  const multi = participant.largestMultiKill ?? 0;
  if (multi >= 5) return 'PENTA KILL';
  if (multi === 4) return 'QUADRA KILL';
  if (multi === 3) return 'TRIPLE KILL';
  const solo = participant.challenges?.soloKills ?? 0;
  if (solo >= 2) return `SOLO KILL ×${solo}`;
  if (participant.firstBloodKill) return 'FIRST BLOOD';
  if (multi === 2) return 'DOUBLE KILL';
  return null;
}
