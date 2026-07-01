export class TokenBucket {
  private tokens: number;
  private windowStart: number;

  constructor(
    private readonly capacity: number,
    private readonly windowMs: number,
    now: number = Date.now()
  ) {
    this.tokens = capacity;
    this.windowStart = now;
  }

  private refillIfNeeded(now: number): void {
    if (now - this.windowStart >= this.windowMs) {
      this.tokens = this.capacity;
      this.windowStart = now;
    }
  }

  hasToken(now: number = Date.now()): boolean {
    this.refillIfNeeded(now);
    return this.tokens > 0;
  }

  consume(now: number = Date.now()): void {
    this.refillIfNeeded(now);
    this.tokens = Math.max(0, this.tokens - 1);
  }

  msUntilNextToken(now: number = Date.now()): number {
    this.refillIfNeeded(now);
    if (this.tokens > 0) return 0;
    return this.windowMs - (now - this.windowStart);
  }
}

export class CompositeRateLimiter {
  constructor(private readonly buckets: TokenBucket[]) {}

  tryConsume(now: number = Date.now()): boolean {
    if (!this.buckets.every((bucket) => bucket.hasToken(now))) {
      return false;
    }
    this.buckets.forEach((bucket) => bucket.consume(now));
    return true;
  }

  msUntilAvailable(now: number = Date.now()): number {
    return Math.max(0, ...this.buckets.map((bucket) => bucket.msUntilNextToken(now)));
  }
}

export function createRiotRateLimiter(now: number = Date.now()): CompositeRateLimiter {
  return new CompositeRateLimiter([
    new TokenBucket(20, 1_000, now),
    new TokenBucket(100, 120_000, now),
  ]);
}
