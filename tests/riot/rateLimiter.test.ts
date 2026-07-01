import { describe, it, expect } from 'vitest';
import { TokenBucket, CompositeRateLimiter, createRiotRateLimiter } from '../../lib/riot/rateLimiter';

describe('TokenBucket', () => {
  it('allows consuming up to capacity within the window', () => {
    const bucket = new TokenBucket(2, 1000, 0);
    expect(bucket.hasToken(0)).toBe(true);
    bucket.consume(0);
    expect(bucket.hasToken(0)).toBe(true);
    bucket.consume(0);
    expect(bucket.hasToken(0)).toBe(false);
  });

  it('refills after the window elapses', () => {
    const bucket = new TokenBucket(1, 1000, 0);
    bucket.consume(0);
    expect(bucket.hasToken(500)).toBe(false);
    expect(bucket.hasToken(1000)).toBe(true);
  });
});

describe('CompositeRateLimiter', () => {
  it('only consumes when every bucket has capacity', () => {
    const limiter = new CompositeRateLimiter([
      new TokenBucket(1, 1000, 0),
      new TokenBucket(5, 1000, 0),
    ]);
    expect(limiter.tryConsume(0)).toBe(true);
    expect(limiter.tryConsume(0)).toBe(false);
  });
});

describe('createRiotRateLimiter', () => {
  it('allows 20 calls in the first second and rejects the 21st', () => {
    const limiter = createRiotRateLimiter(0);
    for (let i = 0; i < 20; i += 1) {
      expect(limiter.tryConsume(0)).toBe(true);
    }
    expect(limiter.tryConsume(0)).toBe(false);
  });
});
