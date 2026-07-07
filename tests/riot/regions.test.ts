import { describe, it, expect } from 'vitest';
import { isPlatformRegion, toRegionalRoute, platformFromMatchId, defaultTagForRegion } from '../../lib/riot/regions';

describe('regions', () => {
  it('recognizes valid platform regions', () => {
    expect(isPlatformRegion('na1')).toBe(true);
    expect(isPlatformRegion('xx9')).toBe(false);
  });

  it('maps platform region to correct regional route', () => {
    expect(toRegionalRoute('na1')).toBe('americas');
    expect(toRegionalRoute('br1')).toBe('americas');
    expect(toRegionalRoute('euw1')).toBe('europe');
    expect(toRegionalRoute('eun1')).toBe('europe');
    expect(toRegionalRoute('kr')).toBe('asia');
    expect(toRegionalRoute('jp1')).toBe('asia');
  });

  it('derives the platform region from a match id prefix', () => {
    expect(platformFromMatchId('NA1_4567890123')).toBe('na1');
    expect(platformFromMatchId('EUW1_1111111111')).toBe('euw1');
  });

  it('throws for an unrecognized match id prefix', () => {
    expect(() => platformFromMatchId('ZZ9_123')).toThrow();
  });
});

describe('defaultTagForRegion', () => {
  it('returns the conventional default tag for each supported region', () => {
    expect(defaultTagForRegion('na1')).toBe('NA1');
    expect(defaultTagForRegion('euw1')).toBe('EUW');
    expect(defaultTagForRegion('eun1')).toBe('EUNE');
    expect(defaultTagForRegion('kr')).toBe('KR1');
    expect(defaultTagForRegion('jp1')).toBe('JP1');
    expect(defaultTagForRegion('br1')).toBe('BR1');
  });
});
