/**
 * High-performance sliding-window rate limiter middleware.
 * Uses an in-memory Map with automatic periodic cleanup, and can connect
 * to Redis when available for distributed rate limiting.
 */
const { getClient, isAvailable } = require("../config/redis");

function createRateLimiter({ windowMs = 60000, maxRequests = 100, message = "Too many requests, please try again later." } = {}) {
  const localHits = new Map();

  // Periodic cleanup of expired local IP keys every 60s
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of localHits.entries()) {
      if (now > record.resetTime) {
        localHits.delete(key);
      }
    }
  }, 60000).unref(); // unref so it won't block process exit

  return async function rateLimiter(req, res, next) {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown_ip";
    const key = `ratelimit:${req.baseUrl || ""}${req.path}:${ip}`;

    // If Redis is active, use distributed atomic increment with TTL
    if (isAvailable()) {
      try {
        const client = getClient();
        if (client) {
          const count = await client.incr(key);
          if (count === 1) {
            await client.pExpire(key, windowMs);
          }
          if (count > maxRequests) {
            return res.status(429).json({
              success: false,
              error: message,
            });
          }
          return next();
        }
      } catch (err) {
        // Fall back to in-memory on redis glitch
      }
    }

    // In-Memory sliding bucket fallback
    const now = Date.now();
    let record = localHits.get(key);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      localHits.set(key, record);
      return next();
    }

    record.count++;
    if (record.count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: message,
      });
    }

    next();
  };
}

module.exports = createRateLimiter;
