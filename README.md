# Load Testing a Website with Grafana K6

k6 load testing script for `https://www.testing.com/`.

## Requirements

- [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) installed locally

## Usage

Run a single scenario:

```bash
k6 run --env SCENARIO=<name> load_test_script.js
```

Run all scenarios sequentially:

```bash
k6 run load_test_script.js
```

## Scenarios

| Name | Executor | Load | Duration |
|---|---|---|---|
| `smoke` | constant-vus | 1 VU | 1 min |
| `baseline` | constant-arrival-rate | 5 req/s | 3 min |
| `ramp_up` | ramping-vus | 0 → 50 VUs | 7 min |
| `sustained` | constant-vus | 50 VUs | 10 min |
| `peak_launch` | constant-arrival-rate | 25 req/s (~90k/hr) | 5 min |
| `stress` | ramping-vus | 0 → 150 VUs | 10 min |
| `spike` | ramping-vus | 0 → 200 VUs (burst) | ~2 min |
| `soak` | constant-vus | 30 VUs | 10 min |

## Thresholds

The test fails if any of these are breached:

- `http_req_duration` p(95) < 3s
- `http_req_duration` p(99) < 5s *(smoke only)*
- `error_rate` < 5%
- `page_load_time` p(95) < 3s

## Custom Metrics

| Metric | Type | Description |
|---|---|---|
| `error_rate` | Rate | Proportion of failed check sets |
| `page_load_time` | Trend | Wall-clock request duration |
| `success_count` | Counter | Total requests where all checks passed |

## Checks (per request)

- HTTP status is `200`
- Response time under 3s
- Body is not empty
- No 5xx server error
- `Content-Type` includes `text/html`
