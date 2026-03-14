# AGENTS.md

This file gives agentic coding assistants the project-specific context needed to work safely and efficiently in this repository.

## Project Summary

- Project name: `remote-mouse`
- Runtime: Node.js ESM (`"type": "module"`)
- Main entry point: `server.js`
- Frontend: static HTML/CSS/JS in `public/`
- Tests: Node built-in test runner in `test/`
- Primary behavior: serve a LAN remote mouse UI, pair devices over WebSocket, and control host mouse/keyboard through `@nut-tree-fork/nut-js`, including axis-locked two-finger scrolling

## Repository Layout

- `server.js` - app bootstrap, Express routes, WebSocket server, pairing/auth logic, trusted device persistence, input control API
- `public/index.html` - mobile controller UI
- `public/app.js` - mobile controller behavior and local storage state
- `public/host.html` - host approval dashboard
- `public/host.js` - host dashboard behavior
- `public/styles.css` - shared frontend styling
- `test/remote-mouse.test.js` - unit/integration-style tests using `node:test`
- `README.md` - English docs
- `README.zh-CN.md` - Chinese docs

## External Rules Files

- No `.cursorrules` file found.
- No `.cursor/rules/` directory found.
- No `.github/copilot-instructions.md` file found.
- If any of these are added later, treat them as higher-priority repository instructions and update this file.

## Install / Run / Test Commands

## Setup

```bash
npm install
```

## Start the app

```bash
npm start
```

Equivalent direct command:

```bash
node server.js
```

## Start on a different port

```bash
PORT=3001 npm start
```

## Run the full test suite

```bash
npm test
```

Equivalent direct command:

```bash
node --test
```

## Run a single test file

```bash
node --test test/remote-mouse.test.js
```

## Run a single test by name

```bash
node --test --test-name-pattern "remembered devices are auto-authorized on reconnect"
```

## Run a single test file and a single named test

```bash
node --test test/remote-mouse.test.js --test-name-pattern "host can revoke an approved device"
```

## Syntax-check a file

```bash
node --check server.js
node --check public/app.js
node --check public/host.js
```

## Lint / Format

- There is currently no configured lint script.
- There is currently no configured formatter script.
- Do not assume ESLint, Prettier, TypeScript, or bundlers are present.
- Keep edits consistent with existing formatting and style.

## Testing Notes

- Tests use the built-in `node:test` runner, not Jest or Vitest.
- Assertions use `node:assert/strict`.
- WebSocket tests use the `ws` package directly.
- Integration-style tests create ephemeral servers with `port: 0` and `silent: true`.
- Tests may create temporary trusted-device JSON files in the OS temp directory; clean them up after each test.

## Code Style Guidelines

## Language / Module Style

- Use modern JavaScript with ESM imports.
- Prefer named exports for reusable logic.
- Keep runtime entry logic at the bottom of `server.js` guarded by `if (process.argv[1] === __filename)`.
- Favor small helper functions over deeply nested inline logic.

## Imports

- Group imports in this order:
  1. Node built-ins
  2. Third-party packages
  3. Local files
- Separate groups with a blank line.
- Keep import specifiers concise and alphabetized when practical.
- Prefer direct named imports over namespace imports unless there is a strong reason.

## Formatting

- Use 2 spaces for indentation.
- Use semicolons.
- Use double quotes, matching the existing codebase.
- Prefer trailing commas only when already consistent with surrounding code.
- Keep object literals and arrays multi-line when they improve readability.
- Keep long single-line expressions readable; split when argument lists or object literals become dense.

## Naming

- Use `camelCase` for variables, functions, parameters, and non-constant values.
- Use `UPPER_SNAKE_CASE` only for true constants if introduced; current code mostly uses `const` with `camelCase` names.
- Use descriptive names for behavior-oriented functions, e.g. `createRemoteMouseServer`, `handleMessage`, `persistTrustedDevices`.
- DOM references in frontend files should use clear noun names like `pairButton`, `touchpadSizeValue`, `tabButtons`.
- Test names should describe observable behavior in plain English.

## Types / Data Shape Discipline

- This project is plain JavaScript, not TypeScript.
- Be explicit about data coercion at boundaries:
  - use `String(...)` for external text
  - use `Number(...)` for numeric payloads
  - use `Boolean(...)` only when intentional
- Sanitize user-controlled values before storing or displaying them.
- Preserve the current pattern of validating WebSocket payloads inside message handlers.

## Error Handling

- Throw `Error` with short, user-readable messages for invalid operations.
- In WebSocket handlers, catch errors and send structured error payloads back to the client.
- For startup failures, prefer actionable stderr output, as already done for `EADDRINUSE`.
- Do not swallow filesystem or socket errors silently unless there is an intentional fallback.
- When adding fallbacks, keep them deterministic and easy to test.

## Server Conventions

- Keep server logic testable by factoring side effects behind injectable options (`controlApi`, `hostProvider`, `trustedStorePath`, `silent`).
- When adding new control actions, update both the server handler and client sender logic.
- Maintain the distinction between pending, approved, revoked, and trusted device flows.
- Any new persistent local state should be easy to exclude from git if machine-specific.
- Use the existing helper style for derived collections like `getPendingClients`, `getApprovedClients`, and trusted-device summaries.

## Frontend Conventions

- Keep frontend code framework-free and DOM-driven.
- Prefer `const` DOM references at the top of the file.
- Store user preferences in `localStorage` only for device-local UX settings and trusted-device tokens.
- Current device-local settings include pointer sensitivity (`0.2x` to `4.0x`) and touch area height.
- Respect the current auth-aware navigation behavior:
  - authorized devices default to the touch tab
  - unauthorized devices default to the settings tab
- Maintain mobile-first behavior and avoid layouts that block touch interactions.
- Keep selection disabled on control surfaces unless text entry requires it.
- Keep the current touch gesture behavior consistent unless the task explicitly changes it:
  - single-finger drag moves the pointer
  - double tap triggers double click
  - two-finger gesture sends axis-locked scroll using the dominant direction
  - two-finger scroll reuses the current sensitivity multiplier

## CSS Conventions

- Reuse existing CSS custom properties where possible.
- Prefer class-based styling; avoid inline styles unless JS must update a CSS variable.
- Keep the visual language consistent with the current soft card / green accent style.
- When reducing UI density, prefer smaller padding and font-size adjustments over removing critical affordances.

## Testing Expectations For Changes

- For server changes, run at least `npm test`.
- For frontend-only JS changes, run `node --check public/app.js` and `node --check public/host.js`.
- For server entry or startup changes, run `node --check server.js`.
- If you add a new WebSocket flow, add at least one test covering success or rejection behavior.
- If you change scroll behavior, keep horizontal and vertical handling covered by tests.

## Agent Guidance

- Prefer minimal, targeted changes over broad rewrites.
- Preserve existing architecture unless the task requires refactoring.
- Do not introduce new tooling without a clear repo-level reason.
- If adding scripts, document them here and in `README.md`.
- If repository rules files are added later, update this file to summarize them.
