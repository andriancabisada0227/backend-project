const { createClient } = require('redis');

let publisher = null;
let subscriber = null;
let isRedisAvailable = false;
let initPromise = null;

async function initRedis() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    try {
      publisher = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 5) {
              // Stop continuous aggressive retry if Redis is not installed/running locally
              return false;
            }
            return Math.min(retries * 500, 3000);
          },
        },
      });

      publisher.on('error', (err) => {
        // Log once or quietly keep track to avoid stdout spam when Redis is offline
        if (isRedisAvailable) {
          console.warn('[Redis] Connection lost:', err.message);
          isRedisAvailable = false;
        }
      });

      publisher.on('ready', () => {
        isRedisAvailable = true;
        console.log('[Redis] Publisher connected and ready');
      });

      await publisher.connect();
      isRedisAvailable = true;

      // Duplicate for subscriber client
      subscriber = publisher.duplicate();
      subscriber.on('error', (err) => {
        if (isRedisAvailable) {
          console.warn('[Redis Subscriber] Error:', err.message);
        }
      });
      await subscriber.connect();
      console.log('[Redis] Subscriber connected and ready');
    } catch (err) {
      console.warn(`[Redis] Redis offline or unreachable at ${redisUrl}. Falling back to in-memory mode.`);
      isRedisAvailable = false;
      publisher = null;
      subscriber = null;
    }
  })();

  return initPromise;
}

// Automatically initiate on import (non-blocking)
initRedis().catch(() => {});

/**
 * Publish a message to a Redis channel.
 * Gracefully no-ops if Redis is unavailable.
 */
async function publishMessage(channel, data) {
  if (!isRedisAvailable || !publisher) return false;
  try {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    await publisher.publish(channel, payload);
    return true;
  } catch (err) {
    console.warn(`[Redis Publish Error] Channel: ${channel}:`, err.message);
    return false;
  }
}

/**
 * Subscribe to a Redis channel with a message callback.
 * Gracefully no-ops if Redis is unavailable.
 */
async function subscribeChannel(channel, callback) {
  if (!isRedisAvailable || !subscriber) return false;
  try {
    await subscriber.subscribe(channel, (message) => {
      try {
        const parsed = JSON.parse(message);
        callback(parsed);
      } catch {
        callback(message);
      }
    });
    return true;
  } catch (err) {
    console.warn(`[Redis Subscribe Error] Channel: ${channel}:`, err.message);
    return false;
  }
}

/**
 * Update driver geospatial position in Redis GEO set.
 */
async function updateDriverLocation(driverId, longitude, latitude) {
  if (!isRedisAvailable || !publisher) return false;
  try {
    await publisher.geoAdd("drivers:locations", {
      longitude: Number(longitude),
      latitude: Number(latitude),
      member: String(driverId),
    });
    return true;
  } catch (err) {
    console.warn(`[Redis GeoAdd Error] Driver ${driverId}:`, err.message);
    return false;
  }
}

/**
 * Find drivers within radiusKm of longitude, latitude.
 */
async function getNearbyDrivers(longitude, latitude, radiusKm = 5) {
  if (!isRedisAvailable || !publisher) return [];
  try {
    const results = await publisher.geoSearch("drivers:locations", {
      longitude: Number(longitude),
      latitude: Number(latitude),
    }, {
      radius: Number(radiusKm),
      unit: "km",
    });
    return results || [];
  } catch (err) {
    console.warn("[Redis GeoSearch Error]:", err.message);
    return [];
  }
}

module.exports = {
  initRedis,
  publishMessage,
  subscribeChannel,
  updateDriverLocation,
  getNearbyDrivers,
  isAvailable: () => isRedisAvailable,
  getClient: () => publisher,
};

