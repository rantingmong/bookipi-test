# Load-test session feature

## Purpose

This feature creates unique Better Auth users for local checkout load tests. It returns each user ID and the cookie set by the real Better Auth sign-up method. It does not add an HTTP route.

## Behavior

`createLoadTestSessions` accepts a Better Auth instance and a positive count. It creates a unique email address and password for each user. It calls `signUpEmail` with `asResponse: true`, then returns the user ID and cookie name/value pairs. It does not return passwords or log cookies.

The local `src/load-test.ts` command connects to MongoDB and Valkey with the validated backend settings. It writes one JSON object with a `sessions` array to standard output. The output contains active session cookies. Keep it private and remove it after the test. Valkey loss or reset invalidates these sessions.

The focused test checks user creation, session-cookie extraction, invalid counts, and missing cookie handling. It does not test MongoDB or Valkey integration.

## Change log

### 2026-09-25

- Added local Better Auth session preload for k6 checkout tests.
