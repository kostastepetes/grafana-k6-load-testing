/**
 * k6 Load Test — Website
 * URL: https://www.testing.com/
 *
 * Scenarios:
 *  1. smoke        — Quick sanity check (1 VU, 1 min)
 *  2. baseline     — Light constant traffic (5 req/s for 3 min, up to 50 VUs)
 *  3. ramp_up      — Gradually increase load (0→50 VUs over 7 min, then back to 0)
 *  4. sustained    — Hold steady load (50 VUs for 10 min)
 *  5. peak_launch  — Realistic launch-week simulation (25 req/s for 5 min, up to 200 VUs)
 *  6. stress       — Push beyond normal capacity (up to 150 VUs over 10 min)
 *  7. spike        — Sudden burst of traffic (0→200 VUs instantly, hold 1 min, then back)
 *  8. soak         — Long-running stability test (30 VUs for 10 min)
 *
 * Run a specific scenario:
 *   k6 run --env SCENARIO=smoke testing_script.js
 *   k6 run --env SCENARIO=baseline testing_script.js
 *   k6 run --env SCENARIO=ramp_up testing_script.js
 *   k6 run --env SCENARIO=sustained testing_script.js
 *   k6 run --env SCENARIO=peak_launch testing_script.js
 *   k6 run --env SCENARIO=stress testing_script.js
 *   k6 run --env SCENARIO=spike testing_script.js
 *   k6 run --env SCENARIO=soak testing_script.js
 *
 * Run ALL scenarios sequentially (default):
 *   k6 run testing_script.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

// ─── Custom Metrics ────────────────────────────────────────────────────────────
const errorRate = new Rate("error_rate");
const pageLoadTime = new Trend("page_load_time", true);
const successCount = new Counter("success_count");

// ─── Target URL ────────────────────────────────────────────────────────────────
const TARGET_URL =
  "https://www.testing.com/";

// ─── Scenario Definitions ──────────────────────────────────────────────────────
const ALL_SCENARIOS = {
  // 1. Smoke — single user, 1 minute sanity check
  smoke: {
    executor: "constant-vus",
    vus: 1,
    duration: "1m",
    tags: { scenario: "smoke" },
  },

  // 2. Baseline — light constant traffic at 5 req/s for 3 min (up to 50 VUs)
  baseline: {
      executor: "constant-arrival-rate",
      rate: 5, // 5 requests/sec
      timeUnit: "1s",
      duration: "3m",
      preAllocatedVUs: 20,
      maxVUs: 50,
      tags: { scenario: "baseline" },
  },

  // 3. Ramp-up — 0→10→30→50 VUs over 7 min, then back to 0
  ramp_up: {
    executor: "ramping-vus",
    startVUs: 0,
    stages: [
      { duration: "2m", target: 10 },
      { duration: "2m", target: 30 },
      { duration: "1m", target: 50 },
      { duration: "2m", target: 0 },
    ],
    tags: { scenario: "ramp_up" },
  },

  // 4. Sustained — hold 50 VUs for 10 minutes
  sustained: {
    executor: "constant-vus",
    vus: 50,
    duration: "10m",
    tags: { scenario: "sustained" },
  },

  // 5. Peak Launch — launch-week simulation at 25 req/s for 5 min (~90k req/hour, up to 200 VUs)
  peak_launch: {
      executor: "constant-arrival-rate",
      rate: 25, // 25 requests/sec (~90k/hour)
      timeUnit: "1s",
      duration: "5m",
      preAllocatedVUs: 100,
      maxVUs: 200,
      tags: { scenario: "peak_launch" },
  },

  // 6. Stress — ramp 0→50→100→150 VUs over 10 min, then back to 0
  stress: {
    executor: "ramping-vus",
    startVUs: 0,
    stages: [
      { duration: "2m", target: 50 },
      { duration: "3m", target: 100 },
      { duration: "3m", target: 150 },
      { duration: "2m", target: 0 },
    ],
    tags: { scenario: "stress" },
  },

  // 7. Spike — burst to 200 VUs in 30s, hold for 1 min, drop back in 30s
  spike: {
    executor: "ramping-vus",
    startVUs: 0,
    stages: [
      { duration: "30s", target: 200 }, // spike up
      { duration: "1m", target: 200 },  // hold
      { duration: "30s", target: 0 },   // drop back
    ],
    tags: { scenario: "spike" },
  },

  // 8. Soak — long-running stability check at 30 VUs for 10 min
  soak: {
    executor: "constant-vus",
    vus: 30,
    duration: "10m",
    tags: { scenario: "soak" },
  },
};

// ─── Active Scenario Selection ─────────────────────────────────────────────────
const SELECTED = __ENV.SCENARIO;
const activeScenarios = SELECTED
  ? { [SELECTED]: ALL_SCENARIOS[SELECTED] }
  : ALL_SCENARIOS;

if (SELECTED && !ALL_SCENARIOS[SELECTED]) {
  throw new Error(
    `Unknown scenario "${SELECTED}". Valid options: ${Object.keys(ALL_SCENARIOS).join(", ")}`
  );
}

// ─── k6 Options ────────────────────────────────────────────────────────────────
export const options = {
  scenarios: activeScenarios,

  thresholds: {
    // 95% of requests must complete within 3 seconds
    http_req_duration: ["p(95)<3000"],
    // 99% of smoke requests within 5 seconds
    "http_req_duration{scenario:smoke}": ["p(99)<5000"],
    // Error rate must stay below 5%
    error_rate: ["rate<0.05"],
    // Custom page load trend: 95th percentile under 3 seconds
    page_load_time: ["p(95)<3000"],
  },
};

// ─── Default Function (VU workload) ───────────────────────────────────────────
export default function () {
  const params = {
    headers: {
      Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    },
    tags: { name: "anniversary_hub" },
  };

  const startTime = Date.now();
  const res = http.get(TARGET_URL, params);
  const duration = Date.now() - startTime;

  // ── Checks ──────────────────────────────────────────────────────────────────
  const passed = check(res, {
    "status is 200": (r) => r.status === 200,
    "response time < 3s": (r) => r.timings.duration < 3000,
    "body is not empty": (r) => r.body && r.body.length > 0,
    "no server error": (r) => r.status < 500,
    "content-type is HTML": (r) =>
      (r.headers["Content-Type"] || "").includes("text/html"),
  });

  // ── Record custom metrics ───────────────────────────────────────────────────
  errorRate.add(!passed);
  pageLoadTime.add(duration);
  if (passed) successCount.add(1);

  // ── Think time between requests (simulates real user) ───────────────────────
  sleep(Math.random() * 2 + 1); // 1–3 seconds
}

// ─── Setup (runs once before test) ────────────────────────────────────────────
export function setup() {
  console.log("=== Website — Load Test ===");
  console.log(`Target URL : ${TARGET_URL}`);
  console.log(
    `Scenario(s): ${Object.keys(activeScenarios).join(", ")}`
  );
  console.log("==========================================");

  // Warm-up / connectivity check
  const res = http.get(TARGET_URL);
  if (res.status !== 200) {
    console.warn(`⚠ Pre-test check returned HTTP ${res.status}. Proceeding anyway.`);
  } else {
    console.log(`✓ Pre-test connectivity check passed (HTTP ${res.status})`);
  }
}

// ─── Teardown (runs once after test) ──────────────────────────────────────────
export function teardown(data) {
  console.log("=== Test Complete ===");
}
