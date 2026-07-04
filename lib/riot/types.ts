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
