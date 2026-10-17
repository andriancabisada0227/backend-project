/**
 * Asynchronous Outbox Event Dispatcher.
 * Dispatches non-critical notifications, webhooks, and analytics asynchronously
 * with retry logic and exponential backoff, ensuring high-throughput APIs remain fast (<50ms).
 */
const { publishMessage, isAvailable } = require("../config/redis");

const OUTBOX_CHANNEL = "system:outbox:events";
const inMemoryQueue = [];
let isProcessing = false;

/**
 * Enqueue an event for asynchronous processing.
 * @param {string} eventType e.g. "NOTIFICATION_DISPATCH", "WEBHOOK_EVENT"
 * @param {object} payload arbitrary event payload
 * @param {function} [handler] optional handler function to execute
 */
async function enqueueEvent(eventType, payload, handler = null) {
  const event = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    eventType,
    payload,
    timestamp: Date.now(),
    attempts: 0,
    maxAttempts: 3,
  };

  // If Redis is online, publish to cluster workers
  if (isAvailable()) {
    publishMessage(OUTBOX_CHANNEL, event);
  }

  // Push to local worker queue
  inMemoryQueue.push({ event, handler });
  processQueue();
  return event.id;
}

async function processQueue() {
  if (isProcessing || inMemoryQueue.length === 0) return;
  isProcessing = true;

  while (inMemoryQueue.length > 0) {
    const item = inMemoryQueue.shift();
    if (!item) continue;

    const { event, handler } = item;
    event.attempts++;

    try {
      if (typeof handler === "function") {
        await handler(event.payload);
      }
    } catch (err) {
      console.warn(`[Outbox] Event ${event.id} (${event.eventType}) failed attempt ${event.attempts}:`, err.message);
      if (event.attempts < event.maxAttempts) {
        // Exponential backoff
        const delay = Math.pow(2, event.attempts) * 200;
        setTimeout(() => {
          inMemoryQueue.push(item);
          processQueue();
        }, delay);
      } else {
        console.error(`[Outbox Dead Letter] Event ${event.id} exceeded max retries.`);
      }
    }
  }

  isProcessing = false;
}

module.exports = {
  enqueueEvent,
  getQueueLength: () => inMemoryQueue.length,
};
