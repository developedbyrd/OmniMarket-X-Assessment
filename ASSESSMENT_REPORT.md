# OmniMarket X Assessment Report

Assessment date: 2026-05-13
Environment: Windows host, Docker Desktop, Docker Compose
Scope: Backend API, Go engine, frontend app, test workflow, and project documentation

## Executive Summary

The codebase is in a substantially improved state and includes important fixes for trading correctness, endpoint validation, and test-environment isolation. The biggest unresolved risk remains engine behavior under high concurrency. The report below is aligned to the current workspace code.

## Validation Snapshot

- Docker services are configured for API, engine, frontend, and Postgres in docker-compose.yml.
- Makefile includes isolated engine test DB flow via omnimarket_test.
- Backend orderbook endpoint supports including MARKET orders with executed flag.
- Frontend market UI text reflects that executed MARKET orders are shown in Order Book.
- Frontend type model now includes optional executed field in OrderbookLevel.

## Issues Identified

| ID | Issue | Severity | Current Status |
|---|---|---|---|
| OMX-01 | Engine high-volume test instability (5k symmetric flow timeout) | P0 Critical | Open |
| OMX-02 | Local Windows frontend build instability (tailwindcss native binding / EPERM) | P1 High | Open |
| OMX-03 | API async deprecation debt (startup event + legacy event loop fixture pattern) | P2 Medium | Open |
| OMX-04 | MARKET order visibility semantics needed explicit API and UI alignment | P1 High | Fixed |
| OMX-05 | LIMIT and CLOB balance handling vulnerabilities in matching engine | P0 Critical | Fixed |
| OMX-06 | Order endpoint input hardening (invalid IDs/types/price/shares) | P1 High | Fixed |
| OMX-07 | Test workflow portability and isolation issues | P1 High | Fixed (major mitigation) |

## Root Cause Analysis

- OMX-01: Engine matching path relies on DB contention-prone concurrency behavior under extreme fanout.
- OMX-02: Host-specific native tooling behavior on Windows diverges from Linux container build path.
- OMX-03: Legacy lifecycle/fixture patterns remained after functional fixes.
- OMX-04: Original orderbook expectation was OPEN-only behavior; product requirement changed to include executed MARKET entries.
- OMX-05: Earlier balance checks were incomplete for LIMIT reserve and CLOB deduction paths.
- OMX-06: Endpoint-level validation previously accepted malformed or invalid order requests.
- OMX-07: Engine tests originally targeted shared dev DB and depended on hardcoded networking assumptions.

## Confirmed Fixes and Improvements

### Trading correctness and security

- Added LIMIT-order balance reserve path in matching engine.
- Added CLOB deduction path for MARKET taker cost handling.
- Added order request validation in engine API router:
  - positive user_id and market_id
  - market existence check
  - outcome validation (YES/NO)
  - order_type validation (MARKET/LIMIT)
  - price and shares range validation

### Backend market validation and API behavior

- Market creation validation now enforces:
  - question length 10-500
  - valid category existence
  - b_parameter range
  - expiry in the future
- Orderbook endpoint supports include_market=true and emits:
  - MARKET entries with executed=true
  - non-MARKET entries with executed=false and remaining shares

### Frontend alignment

- Market view copy now states MARKET orders appear in order book as executed.
- Order book description now states both open LIMIT and executed MARKET orders are shown.
- Numeric spinner arrows removed from trading number inputs.
- Default order type in Market view is LIMIT.
- Frontend orderbook type includes optional executed field for API parity.

### Test and workflow hardening

- Makefile supports isolated engine test DB setup using omnimarket_test.
- Added backend/api/init_db.py for test schema initialization.
- Makefile uses parameterized compose/network variables to improve portability.

## Recommended Fixes or Improvements

| Priority | Recommendation | Estimate |
|---|---|---|
| P0 | Add bounded worker model/backpressure and tune DB pool strategy for high-concurrency engine flows | 3-5 days |
| P0 | Add CI gates for container build, lint, API tests, and selected engine correctness suite | 1-2 days |
| P1 | Stabilize Windows host frontend build path and document supported Node/npm matrix | 0.5-1 day |
| P1 | Add API mocks in frontend tests to remove network-noise behavior | 0.5 day |
| P2 | Migrate FastAPI startup lifecycle to lifespan pattern | 0.5 day |
| P2 | Modernize pytest async loop policy and remove deprecated event_loop overrides | 0.5 day |
| P2 | Add explicit health/readiness endpoints and SLO-oriented checks | 0.5-1 day |

## Documentation Gaps and Onboarding Concerns

- SETUP should clearly separate host-native vs container-native frontend build troubleshooting.
- Test documentation should define two lanes explicitly:
  - deterministic correctness tests
  - stress/race tests with larger time budgets
- Onboarding should call out isolated test DB workflow and Makefile commands first.
- Architecture docs should state current orderbook semantics:
  - includes open LIMIT entries
  - includes executed MARKET entries when include_market=true (default behavior today)

## Suggestions: Reliability, Scalability, Testing, Developer Experience

### Reliability

- Add readiness checks for API and engine dependencies.
- Add explicit DB timeout handling around critical transaction segments.
- Add structured failure counters and request correlation IDs.

### Scalability

- Introduce per-market queueing or bounded workers in matching path.
- Measure and tune pgx pool saturation and lock wait behavior.
- Separate stress benchmarks from standard CI correctness gates.

### Testing

- Keep engine correctness tests isolated from developer data.
- Create repeatable load-test profiles and baseline thresholds.
- Mock frontend network layer in unit tests.

### Developer Experience

- Keep Makefile variable-driven and environment-portable.
- Add a preflight doctor command for required tools/ports/env vars.
- Add one-command local verification flow combining lint + targeted tests.

## Final Assessment

Current status: Conditionally production-ready for controlled workloads, with critical scalability hardening still required before high-volume production claims.

Most severe open item: engine concurrency scalability (OMX-01).
