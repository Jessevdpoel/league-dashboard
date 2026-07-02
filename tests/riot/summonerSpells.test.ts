import { describe, it, expect } from 'vitest';
import { summonerSpellKey } from '../../lib/riot/summonerSpells';

describe('summonerSpellKey', () => {
  it('maps known spell ids to their Data Dragon key', () => {
    expect(summonerSpellKey(4)).toBe('SummonerFlash');
    expect(summonerSpellKey(11)).toBe('SummonerSmite');
    expect(summonerSpellKey(7)).toBe('SummonerHeal');
  });

  it('returns null for an unknown spell id', () => {
    expect(summonerSpellKey(9999)).toBeNull();
  });
});
