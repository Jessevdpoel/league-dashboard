export interface AccountDto {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface SummonerDto {
  puuid: string;
  profileIconId: number;
  summonerLevel: number;
}

export interface LeagueEntryDto {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

/**
 * Match-V5 `challenges` object: dozens of pre-computed advanced stats Riot ships
 * with each participant. We name the ones the stats engine consumes and keep an
 * index signature for the rest so callers can read any challenge without a type
 * change. All fields are optional — older matches / some queues omit them.
 */
export interface ChallengesDto {
  kda?: number;
  laneMinionsFirst10Minutes?: number;
  visionScorePerMinute?: number;
  soloKills?: number;
  turretPlatesTaken?: number;
  damagePerMinute?: number;
  killParticipation?: number;
  teamDamagePercentage?: number;
  controlWardsPlaced?: number;
  wardTakedowns?: number;
  goldPerMinute?: number;
  [key: string]: number | undefined;
}

export interface ParticipantDto {
  puuid: string;
  riotIdGameName: string;
  riotIdTagline: string;
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
  teamId: number;
  /** TOP | JUNGLE | MIDDLE | BOTTOM | UTILITY — needed to pick the lane opponent. */
  teamPosition?: string;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  summoner1Id: number;
  summoner2Id: number;
  totalDamageDealtToChampions: number;
  visionScore: number;
  challenges?: ChallengesDto;
}

export interface MatchDto {
  metadata: {
    matchId: string;
    participants: string[];
  };
  info: {
    gameCreation: number;
    gameDuration: number;
    queueId: number;
    participants: ParticipantDto[];
  };
}

// --- Match-V5 timeline ---------------------------------------------------

export interface TimelinePositionDto {
  x: number;
  y: number;
}

export interface ParticipantFrameDto {
  participantId: number;
  currentGold: number;
  totalGold: number;
  xp: number;
  level: number;
  minionsKilled: number;
  jungleMinionsKilled: number;
  position?: TimelinePositionDto;
}

/**
 * A single timeline event. The shape is a union across event types (CHAMPION_KILL,
 * WARD_PLACED, ELITE_MONSTER_KILL, ITEM_PURCHASED, TURRET_PLATE_DESTROYED, ...),
 * so most fields are optional. Index signature covers fields we don't model yet.
 */
export interface TimelineEventDto {
  type: string;
  timestamp: number;
  participantId?: number;
  killerId?: number;
  victimId?: number;
  assistingParticipantIds?: number[];
  position?: TimelinePositionDto;
  wardType?: string;
  creatorId?: number;
  killerTeamId?: number;
  monsterType?: string;
  monsterSubType?: string;
  buildingType?: string;
  laneType?: string;
  towerType?: string;
  itemId?: number;
  [key: string]: unknown;
}

export interface TimelineFrameDto {
  timestamp: number;
  participantFrames: Record<string, ParticipantFrameDto>;
  events: TimelineEventDto[];
}

export interface MatchTimelineDto {
  metadata: {
    matchId: string;
    participants: string[];
  };
  info: {
    frameInterval: number;
    frames: TimelineFrameDto[];
    participants: { participantId: number; puuid: string }[];
  };
}
