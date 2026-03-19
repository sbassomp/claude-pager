# Conformity Audit - claude-relay

**Date**: 2026-03-19 (v2)
**Project**: claude-relay v0.1.0
**Language**: TypeScript (Node.js >= 20)
**Framework**: Fastify 5, Commander 13
**Auditor**: Automated audit

---

## Overall Score: 84/100

| Category | Score | Detail |
|----------|-------|--------|
| Code (SOLID, structure, readability) | 87/100 | Solid Strategy+Factory architecture, SRP respected, extracted utils, separated handlers |
| Security | 78/100 | Input validation, execFileSync, safeJsonParse, memory caps. Some best-effort catches remain |
| Tests | 75/100 | 36 tests, 7 files, coverage of utils/events/server. Missing injectors, hooks, voice |

---

## Project Metrics

| Metric | Value |
|--------|-------|
| Source files (.ts) | 25 (excluding tests) |
| Test files | 7 |
| Total lines of code | 2,190 |
| Test lines | 400 |
| Test/code ratio | ~18% |
| Build | OK (zero errors) |
| Tests | 36/36 pass |
| Lint (ESLint + typescript-eslint) | 0 errors |
| npm audit | 0 vulnerabilities |

---

## Violation Summary

| Priority | Count |
|----------|-------|
| Critical | 0 |
| Important | 3 |
| Minor | 5 |

---

## Important Violations (3)

### IMP-01. TelegramProvider exceeds 400 lines

**File**: `src/channels/telegram/provider.ts` (421 lines)
**Rule**: Size and complexity — files < 500, classes < 300
**Issue**: The TelegramProvider class spans 393 lines (29-421). `escapeHtml`/`markdownToHtml` extraction to utils is done, but `handleVoice` (75 lines) and `handleCallback` (70 lines) still bloat the class.
**Action**: Extract `handleVoice` into a `telegram/voice-handler.ts` module and message building logic into `telegram/message-builder.ts`.

### IMP-02. `cleanDeadSessions` uses unprotected JSON.parse

**File**: `src/sessions/tracker.ts:72`
**Rule**: Error handling — no generic catch
**Issue**: `getSession` and `listSessions` use `safeJsonParse` (fixed), but `cleanDeadSessions` still uses `JSON.parse` directly:
```typescript
const info: SessionInfo = JSON.parse(readFileSync(path, 'utf-8'));
```
**Action**: Use `safeJsonParse` and skip corrupted files instead of crashing.

### IMP-03. Missing tests for injectors and handlers

**File**: `src/injectors/`, `src/daemon/handlers.ts`
**Rule**: Tests — branch coverage
**Issue**: `TmuxInjector`, `XdotoolInjector` and `createChannelHandlers` have no tests. These modules contain critical routing logic (permission_prompt vs idle_prompt, picker, cwd fallback).
**Action**: Add unit tests with mocks for `execFile`, test allow/deny/free text branches in handlers.

---

## Minor Violations (5)

### MIN-01. `handleSessionStart` uses unprotected JSON.parse

**File**: `src/hooks/index.ts:97`
**Rule**: Error handling
**Issue**: `JSON.parse(input)` on hook stdin. If Claude Code sends malformed JSON, the hook crashes with a stack trace.
**Action**: Use `safeJsonParse` with a fallback and proper error logging.

### MIN-02. Duplicated session choice building logic

**File**: `src/daemon/handlers.ts:58-60` and `src/daemon/handlers.ts:153-155`
**Rule**: DRY — no duplicated code > 5 lines
**Issue**: The pattern `sessions.map(s => ({ id: s.sessionId, label: ... }))` is duplicated twice in `handlers.ts`.
**Action**: Extract a `buildSessionChoices(sessions)` function.

### MIN-03. Magic string `__session_pick__:` without constant

**File**: `src/daemon/handlers.ts:20`, `src/channels/telegram/provider.ts:235`
**Rule**: Named constants — no magic strings
**Issue**: The internal protocol `__session_pick__:` is used as a string convention across two files without a shared constant.
**Action**: Define `SESSION_PICK_PREFIX` in `types.ts` or `channels/channel.ts`.

### MIN-04. `installHooks` uses unprotected JSON.parse

**File**: `src/cli/setup.ts:252`
**Rule**: Error handling
**Issue**: `JSON.parse(readFileSync(CLAUDE_SETTINGS_FILE, 'utf-8'))` can crash if the settings.json file is corrupted.
**Action**: Use `safeJsonParse` with fallback `{}`.

### MIN-05. Unused parameter in DaemonDeps interface

**File**: `src/daemon/server.ts:10-14`
**Rule**: Dead code
**Issue**: The `DaemonDeps` interface declares `config: RelayConfig` but `config` is no longer used in `createServer` (destructured but ignored). The interface is still useful for `daemon/index.ts`, but the type should reflect what `createServer` actually consumes.
**Action**: Remove `config` from `DaemonDeps` or create a `ServerDeps` type without config.

---

## Positive Points

### Architecture & Code
- **Strategy + Factory**: Well-applied pattern for channels (ntfy/telegram) and injectors (tmux/xdotool)
- **Stable interfaces**: `ChannelProvider`, `InputInjector` define clear contracts with optional methods (`sendRaw?`, `sendSessionPicker?`)
- **Improved SRP**: Extracted `handlers.ts` separates routing logic from daemon lifecycle; `daemon/index.ts` went from 236 to 78 lines
- **Extracted utils**: `html.ts`, `json.ts`, `validation.ts` are reusable and tested
- **Guard clauses**: Early returns used consistently (tracker, events, handlers)
- **Cwd fallback**: Smart session UUID → cwd resolution when the session_id is no longer on disk
- **Naming**: Conventions respected (`*Provider`, `*Injector`, `*Factory`)
- **ESLint**: typescript-eslint configured, 0 errors

### Security
- **execFileSync** instead of execSync (cli/run.ts) — no more command injection
- **HTTP input validation**: Fastify JSON Schema on `/api/v1/events` and `/api/v1/respond`
- **isValidEventType + isValidSessionId**: Validation before processing
- **safeJsonParse**: Protection against corrupted JSON files (config, sessions)
- **Memory caps**: `processedIds` capped at 1,000 (ntfy), maps at 500 (telegram)
- **Bind 127.0.0.1** only — no network exposure
- **AbortSignal.timeout** on all Telegram fetch calls (15s)
- **Configurable port** via `CLAUDE_RELAY_PORT` in hooks

### Tests
- **36 tests** covering events, HTTP server, tracker, validation, json parse, html utils
- **All passing** (0 fail, 0 skip)

---

## Remediation Plan

### Sprint 1 — Remaining security (priority)
1. Replace `JSON.parse` with `safeJsonParse` in `cleanDeadSessions` (IMP-02)
2. Protect `handleSessionStart` and `installHooks` with `safeJsonParse` (MIN-01, MIN-04)

### Sprint 2 — Missing tests (priority)
1. Unit tests for `TmuxInjector` with `execFile` mock (IMP-03)
2. Tests for `createChannelHandlers`: allow/deny routing, cwd fallback, picker (IMP-03)
3. Integration test for hooks (stdin input, verify session created) (IMP-03)

### Sprint 3 — TelegramProvider refactoring (improvement)
1. Extract `handleVoice` into `telegram/voice-handler.ts` (IMP-01)
2. Extract `SESSION_PICK_PREFIX` constant (MIN-03)
3. Extract `buildSessionChoices()` in handlers (MIN-02)
4. Remove `config` from `DaemonDeps` in server.ts (MIN-05)

---

## Applied Fixes (history)

### Session 2026-03-19 (v1 → v2)

**Critical fixes**:
- CRIT-01: `execSync(claudeCmd)` → `execFileSync('claude', args)` in cli/run.ts
- CRIT-02: Event type validation with `isValidEventType()` in daemon/server.ts
- CRIT-03: `JSON.parse` → `safeJsonParse` in tracker.ts and config/index.ts
- CRIT-04: Memory cap on processedIds (1,000) and messageToEvent/messageToSession (500)

**Important fixes**:
- IMP-01: `escapeHtml`/`markdownToHtml` extracted to utils/html.ts, imported in TelegramProvider
- IMP-02: `createChannelHandlers()` extracted to daemon/handlers.ts (SRP)
- IMP-03: `sendSessionPicker?` added to ChannelProvider interface, removed instanceof
- IMP-04: Fastify JSON Schema on /events and /respond
- IMP-05: ESLint with typescript-eslint configured, 0 errors
- IMP-06: Unused `randomUUID` import removed from recover.ts
- IMP-07: sessionId validation with `isValidSessionId()` in tracker
- IMP-08: Routing + picker logic extracted to handlers.ts

**Minor fixes**:
- MIN-01: console.debug in important catch blocks (ntfy)
- MIN-03: Configurable port via `CLAUDE_RELAY_PORT`
- MIN-04: Seed `nextShortId` with `Date.now() % 10000`
- MIN-05: Fetch timeouts (15s) on all Telegram calls
- MIN-06: daemon/index.ts simplified (236 → 78 lines)
- MIN-07: CLI version read from package.json
- MIN-08: `throw Error` instead of `process.exit()` in setup.ts

**New files**:
- `src/utils/html.ts`, `src/utils/json.ts`, `src/utils/validation.ts`
- `src/daemon/handlers.ts`
- `eslint.config.mjs`
- 3 test files for utils (16 additional tests)

**Post-audit fix**:
- Cwd fallback in handlers.ts and server.ts when session UUID not found on disk

---

## Audit History

| Date | Code | Security | Tests | Average | Notes |
|------|------|----------|-------|---------|-------|
| 2026-03-19 v1 | 68/100 | 45/100 | 55/100 | 62/100 | Initial audit |
| 2026-03-19 v2 | 87/100 | 78/100 | 75/100 | 84/100 | +22 pts — 4 critical resolved, 8 important resolved, ESLint, +16 tests |
