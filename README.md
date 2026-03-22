# Service Orchestrator

A TypeScript implementation of a service health monitoring system for a desktop application built with Electron. Built on top of a topic-based pub/sub message broker.

## Requirements

- Node.js 18+
- npm 9+

## Install

```bash
npm install
```

## Run tests

```bash
npm test
```

All 51 tests should pass with no manual setup required.

## Project structure

```
src/
  broker.ts              # Provided — topic-based pub/sub broker (unmodified)
  service-adapter.ts     # Provided — adapter pattern with PersistenceService example (unmodified)
  window-manager.ts      # Provided — simulated Electron BrowserWindow manager (unmodified)
  startup.ts             # Task 3 — extended startup orchestrator
  health/
    interfaces/          # Types, interfaces, and topic constants
    services/
      HealthMonitorService.ts   # Task 1 — service health state machine
    subscribers/
      HealthDashboard.ts        # Task 2 — health window wiring

tests/
  startup.test.ts
  health/
    services/
      HealthMonitorService.test.ts
    subscribers/
      HealthDashboard.test.ts
```

## AI disclosure

Claude (Anthropic) was used during this assignment as a pair-programming tool. Specifically:

- Explaining the starter code and task requirements
- Reviewing code for bugs and suggesting fixes
- Generating test cases and the DESIGN.md
- Answering TypeScript-specific questions (e.g. the `.includes()` type narrowing issue)

All implementation decisions, architecture choices, and code were written or directly approved by the author. The AI was not used to silently generate and submit code.
