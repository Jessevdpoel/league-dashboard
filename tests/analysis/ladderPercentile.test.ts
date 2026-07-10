import { describe, it, expect } from 'vitest';
import { ladderPercentile, formatLadderChip } from '../../lib/analysis/ladderPercentile';

describe('ladderPercentile', () => {
  it('maps tier+division to approximate top share', () => {
    expect(ladderPercentile('DIAMOND', 'III')).toBe(2.8);
    expect(ladderPercentile('CHALLENGER', 'I')).toBe(0.02);
    expect(ladderPercentile('IRON', 'IV')).toBe(99.9);
  });
  it('is case-insensitive on tier and null on unknowns', () => {
    expect(ladderPercentile('diamond', 'III')).toBe(2.8);
    expect(ladderPercentile('WOOD', 'IV')).toBeNull();
    expect(ladderPercentile('GOLD', 'V')).toBeNull();
  });
  it('formats the chip', () => {
    expect(formatLadderChip('DIAMOND', 'III')).toBe('Top ~2.8%');
    expect(formatLadderChip('WOOD', 'I')).toBeNull();
  });
});
