import { describe, it, expect } from 'vitest';
import { parseRiotIdSegment } from '../lib/riotId';

describe('parseRiotIdSegment', () => {
  it('splits gameName and tagLine on the last hyphen', () => {
    expect(parseRiotIdSegment('Faker-KR1')).toEqual({ gameName: 'Faker', tagLine: 'KR1' });
  });

  it('handles game names that themselves contain hyphens', () => {
    expect(parseRiotIdSegment('Foo-Bar-NA1')).toEqual({ gameName: 'Foo-Bar', tagLine: 'NA1' });
  });

  it('returns null for a segment with no hyphen', () => {
    expect(parseRiotIdSegment('NoTag')).toBeNull();
  });

  it('returns null when the tag half is empty', () => {
    expect(parseRiotIdSegment('Faker-')).toBeNull();
  });
});
