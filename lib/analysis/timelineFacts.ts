import type { MatchTimelineDto, TimelineFrameDto } from '../riot/types';

/** Control ward item id (Data Dragon). */
const CONTROL_WARD_ITEM_ID = 2055;

/** Minute marks we sample lane diffs at. */
export const LANE_DIFF_MINUTES = [5, 10, 14, 20] as const;

export interface LaneDiff {
  /** Player minus lane opponent at this minute (positive = player ahead). */
  gold: number;
  xp: number;
  cs: number;
}

export interface DeathFact {
  minute: number;
  position?: { x: number; y: number };
  killerParticipantId?: number;
  /** Resolved from options.rolesByParticipantId when available. */
  killerRole?: string;
  /** No assisting enemies on the kill — a 1v1 loss. */
  wasSoloDeath: boolean;
}

export interface TimelineFacts {
  participantId: number;
  /** Keyed by minute (5/10/14/20). Absent entries mean no data / no opponent. */
  laneDiffs: Partial<Record<number, LaneDiff>>;
  deaths: DeathFact[];
  deathBuckets: {
    /** Deaths before 14:00 (laning phase). */
    pre14: number;
    /** 14:00–25:00 (mid game). */
    mid: number;
    /** 25:00+ (late game). */
    late: number;
  };
  soloDeaths: number;
  /** Solo deaths after 25:00 — the classic late-game throw signal. */
  soloDeathsLate: number;
  wards: {
    placed: number;
    killed: number;
    controlWardsPurchased: number;
    firstControlWardMinute: number | null;
  };
}

export interface ExtractOptions {
  /** Lane opponent's PUUID (same teamPosition, enemy team) for lane diffs. */
  opponentPuuid?: string;
  /** participantId -> role, used to attribute killer roles on deaths. */
  rolesByParticipantId?: Record<number, string>;
}

function participantIdForPuuid(timeline: MatchTimelineDto, puuid: string): number | null {
  const entry = timeline.info.participants.find((p) => p.puuid === puuid);
  return entry ? entry.participantId : null;
}

const toMinute = (timestampMs: number): number => timestampMs / 60_000;

/** Frame nearest a target minute (frames are ~1/min but pick by closest timestamp). */
function frameAtMinute(frames: TimelineFrameDto[], minute: number): TimelineFrameDto | undefined {
  if (frames.length === 0) return undefined;
  const targetMs = minute * 60_000;
  // Frames are ordered; the last frame at/under target is the state "at" that minute.
  let chosen: TimelineFrameDto | undefined;
  for (const frame of frames) {
    if (frame.timestamp <= targetMs) chosen = frame;
    else break;
  }
  return chosen;
}

function csOf(frame: TimelineFrameDto, participantId: number): number {
  const pf = frame.participantFrames[String(participantId)];
  if (!pf) return 0;
  return (pf.minionsKilled ?? 0) + (pf.jungleMinionsKilled ?? 0);
}

function goldOf(frame: TimelineFrameDto, participantId: number): number {
  return frame.participantFrames[String(participantId)]?.totalGold ?? 0;
}

function xpOf(frame: TimelineFrameDto, participantId: number): number {
  return frame.participantFrames[String(participantId)]?.xp ?? 0;
}

/**
 * Pure derivation of the timeline-only facts the stats engine needs. Match-level
 * stats (KDA, damage share, etc.) come from the match `challenges` object instead.
 */
export function extractTimelineFacts(
  timeline: MatchTimelineDto,
  puuid: string,
  options: ExtractOptions = {}
): TimelineFacts {
  const participantId = participantIdForPuuid(timeline, puuid);
  if (participantId === null) {
    throw new Error(`PUUID ${puuid} not found in timeline ${timeline.metadata.matchId}`);
  }
  const opponentId =
    options.opponentPuuid !== undefined
      ? participantIdForPuuid(timeline, options.opponentPuuid)
      : null;
  const roles = options.rolesByParticipantId ?? {};
  const frames = timeline.info.frames;

  // Lane diffs vs opponent at each sampled minute.
  const laneDiffs: Partial<Record<number, LaneDiff>> = {};
  if (opponentId !== null) {
    for (const minute of LANE_DIFF_MINUTES) {
      const frame = frameAtMinute(frames, minute);
      if (!frame) continue;
      laneDiffs[minute] = {
        gold: goldOf(frame, participantId) - goldOf(frame, opponentId),
        xp: xpOf(frame, participantId) - xpOf(frame, opponentId),
        cs: csOf(frame, participantId) - csOf(frame, opponentId),
      };
    }
  }

  // Deaths + wards from the event stream.
  const deaths: DeathFact[] = [];
  const wards = {
    placed: 0,
    killed: 0,
    controlWardsPurchased: 0,
    firstControlWardMinute: null as number | null,
  };

  for (const frame of frames) {
    for (const event of frame.events) {
      switch (event.type) {
        case 'CHAMPION_KILL':
          if (event.victimId === participantId) {
            const assisters = event.assistingParticipantIds ?? [];
            deaths.push({
              minute: toMinute(event.timestamp),
              position: event.position,
              killerParticipantId: event.killerId,
              killerRole: event.killerId !== undefined ? roles[event.killerId] : undefined,
              wasSoloDeath: assisters.length === 0,
            });
          }
          break;
        case 'WARD_PLACED':
          if (event.creatorId === participantId) wards.placed += 1;
          break;
        case 'WARD_KILL':
          if (event.killerId === participantId) wards.killed += 1;
          break;
        case 'ITEM_PURCHASED':
          if (event.participantId === participantId && event.itemId === CONTROL_WARD_ITEM_ID) {
            wards.controlWardsPurchased += 1;
            const minute = toMinute(event.timestamp);
            if (wards.firstControlWardMinute === null) wards.firstControlWardMinute = minute;
          }
          break;
      }
    }
  }

  const deathBuckets = { pre14: 0, mid: 0, late: 0 };
  let soloDeaths = 0;
  let soloDeathsLate = 0;
  for (const death of deaths) {
    if (death.minute < 14) deathBuckets.pre14 += 1;
    else if (death.minute < 25) deathBuckets.mid += 1;
    else deathBuckets.late += 1;
    if (death.wasSoloDeath) {
      soloDeaths += 1;
      if (death.minute >= 25) soloDeathsLate += 1;
    }
  }

  return {
    participantId,
    laneDiffs,
    deaths,
    deathBuckets,
    soloDeaths,
    soloDeathsLate,
    wards,
  };
}

export interface GoldDiffPoint {
  /** Whole minutes from game start (frames arrive ~1/min). */
  minute: number;
  /** Player minus lane opponent total gold (positive = player ahead). */
  gold: number;
}

/**
 * Per-frame gold diff vs the lane opponent, for the timeline strip chart.
 * Not part of the LLM fact sheet — UI data only. Empty when no opponent.
 */
export function extractGoldDiffSeries(
  timeline: MatchTimelineDto,
  puuid: string,
  opponentPuuid: string | undefined
): GoldDiffPoint[] {
  if (opponentPuuid === undefined) return [];
  const participantId = participantIdForPuuid(timeline, puuid);
  const opponentId = participantIdForPuuid(timeline, opponentPuuid);
  if (participantId === null || opponentId === null) return [];
  return timeline.info.frames.map((frame) => ({
    minute: Math.round(frame.timestamp / 60_000),
    gold: goldOf(frame, participantId) - goldOf(frame, opponentId),
  }));
}
