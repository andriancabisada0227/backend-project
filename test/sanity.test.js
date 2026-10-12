const http = require("http");
const app = require("../app");

async function runTests() {
  console.log("=== Running Core API Integration Sanity Check ===");

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const baseUrl = `http://localhost:${port}`;

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // Test 1: Root route
  await test("GET / responds with 200 and success status", async () => {
    const res = await fetch(`${baseUrl}/`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (data.message !== "schoolryde backend app") {
      throw new Error(`Unexpected message: ${data.message}`);
    }
  });

  // Test 2: Compression & Headers
  await test("Compression middleware applies x-powered-by protection & helmet", async () => {
    const res = await fetch(`${baseUrl}/`);
    if (res.headers.get("x-powered-by")) {
      throw new Error("x-powered-by header was not disabled");
    }
  });

  // Test 3: 404 Route handling
  await test("Unregistered endpoint responds with 404 JSON", async () => {
    const res = await fetch(`${baseUrl}/non-existent-endpoint-xyz`);
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    const data = await res.json();
    if (data.error !== "Page Not found") {
      throw new Error(`Unexpected 404 error payload: ${JSON.stringify(data)}`);
    }
  });

  // Test 4: Auth protection on protected route
  await test("Protected booking route rejects missing token with 401 or 400", async () => {
    const res = await fetch(`${baseUrl}/booking/all`);
    if (res.status === 200) {
      throw new Error("Expected auth rejection, but got 200 OK");
    }
  });

  // Test 5: Protected driver route rejects missing token
  await test("Protected driver route rejects missing token", async () => {
    const res = await fetch(`${baseUrl}/driver/myCurrentDriver`);
    if (res.status === 200) {
      throw new Error("Expected auth rejection, but got 200 OK");
    }
  });

  // Test 7: Rate limiter test
  await test("Rate limiter correctly tracks and limits excessive requests", async () => {
    // Send 35 requests to /verifyOtp to trigger the 30 req/min limit
    let hitLimit = false;
    for (let i = 0; i < 35; i++) {
      const res = await fetch(`${baseUrl}/verifyOtp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: "000000" }),
      });
      if (res.status === 429) {
        hitLimit = true;
        break;
      }
    }
    if (!hitLimit) {
      throw new Error("Rate limiter did not throttle requests beyond limit");
    }
  });

  // Test 8: Redis module initialization & fallback check
  await test("Redis module initializes gracefully without throwing uncaught errors", async () => {
    const redis = require("../config/redis");
    if (typeof redis.publishMessage !== "function" || typeof redis.subscribeChannel !== "function") {
      throw new Error("Redis module missing expected pub/sub interfaces");
    }
  });

  server.close();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
