import { getDb } from '@/lib/mongodb';

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  limit: number;
  resetAt: Date;
  resetInSeconds: number;
}

export class RateLimitService {
  /**
   * In-process fallback buckets used when MongoDB is unavailable.
   * Prevents the rate limiter from failing open during transient DB errors.
   */
  private static readonly fallbackBuckets = new Map<string, { count: number; windowStart: number }>();

  /**
   * Distributed, atomic rate limiter backed by MongoDB with automatic TTL cleanup.
   * Falls back to an in-process token bucket on transient DB errors (fail-closed).
   * Works consistently across multiple serverless / multi-instance deployments.
   *
   * @param params.key           - Scoped rate limit identifier (e.g. `gemini:ip_1.2.3.4`)
   * @param params.maxRequests   - Maximum requests permitted within the window (e.g. 10)
   * @param params.windowSeconds - Window length in seconds (e.g. 60)
   */
  static async checkLimit(params: {
    key: string;
    maxRequests: number;
    windowSeconds: number;
  }): Promise<RateLimitResult> {
    const { key, maxRequests, windowSeconds } = params;
    const db = await getDb();
    const now = new Date();
    const windowMs = windowSeconds * 1000;

    // Fixed-window bucketing
    const windowBucket = Math.floor(now.getTime() / windowMs);
    const docKey = `${key}:${windowBucket}`;
    const windowExpiresAt = new Date((windowBucket + 1) * windowMs + 5000); // 5s buffer past window

    try {
      const result = await db.collection('rate_limits').findOneAndUpdate(
        { key: docKey },
        {
          $inc: { count: 1 },
          $setOnInsert: {
            key: docKey,
            createdAt: now,
            expiresAt: windowExpiresAt
          }
        },
        {
          upsert: true,
          returnDocument: 'after'
        }
      );

      const rawResult = result as any;
      const count = typeof rawResult?.count === 'number' 
        ? rawResult.count 
        : (typeof rawResult?.value?.count === 'number' ? rawResult.value.count : 1);
      const allowed = count <= maxRequests;
      const remaining = Math.max(0, maxRequests - count);
      const resetInSeconds = Math.max(1, Math.ceil((windowExpiresAt.getTime() - now.getTime()) / 1000));

      return {
        allowed,
        count,
        remaining,
        limit: maxRequests,
        resetAt: windowExpiresAt,
        resetInSeconds
      };
    } catch (err: any) {
      console.warn('[RateLimitService] Error accessing rate limits collection — using in-process fallback:', err.message);
      // Fail CLOSED: use an in-process token bucket so a DB outage cannot be abused to bypass rate limits.
      const now2 = Date.now();
      const windowMs2 = windowSeconds * 1000;
      const windowBucket2 = Math.floor(now2 / windowMs2);
      const bucketKey = `${key}:${windowBucket2}`;

      let bucket = RateLimitService.fallbackBuckets.get(bucketKey);
      if (!bucket || bucket.windowStart !== windowBucket2) {
        bucket = { count: 0, windowStart: windowBucket2 };
        RateLimitService.fallbackBuckets.set(bucketKey, bucket);
        // Prune stale buckets to avoid unbounded growth in long-lived processes
        for (const [k] of RateLimitService.fallbackBuckets) {
          const [, bkt] = k.split(':').slice(-1);
          if (Number(bkt) < windowBucket2 - 2) RateLimitService.fallbackBuckets.delete(k);
        }
      }
      bucket.count++;

      const fallbackResetAt = new Date((windowBucket2 + 1) * windowMs2);
      const fallbackResetInSeconds = Math.max(1, Math.ceil((fallbackResetAt.getTime() - now2) / 1000));
      const allowed = bucket.count <= maxRequests;
      return {
        allowed,
        count: bucket.count,
        remaining: Math.max(0, maxRequests - bucket.count),
        limit: maxRequests,
        resetAt: fallbackResetAt,
        resetInSeconds: fallbackResetInSeconds
      };
    }
  }

  /**
   * Resets rate limit for a given key (e.g. administrative unblock).
   * Escapes regex metacharacters to prevent unintended wildcard deletions.
   */
  static async resetLimit(key: string): Promise<void> {
    try {
      const db = await getDb();
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      await db.collection('rate_limits').deleteMany({
        key: new RegExp(`^${escapedKey}:`)
      });
      for (const k of RateLimitService.fallbackBuckets.keys()) {
        if (k.startsWith(`${key}:`)) {
          RateLimitService.fallbackBuckets.delete(k);
        }
      }
    } catch (err: any) {
      console.warn('[RateLimitService] Reset limit error:', err.message);
    }
  }
}

