# AGENTS.md

Context for any coding agent working in this repository. Keep it true: `pnpm check` fails when this file cites a
`pnpm` script or a path that does not exist (`scripts/check-agents-doc.mjs`).

## What this is

Plaid is a desktop Jira worklog editor: a calendar of the user's work logs that they add, move, edit and delete.
Angular 22 (NgModule components, zone-based change detection) inside Electron 45.

Jira Cloud only. Jira Server/Data Center stopped working in October 2025: issue search moved to `/rest/api/3/search/jql`,
which Jira Cloud requires and Jira Server does not have. Do not add Server-only code paths.

## Setup

- Node 26 (version in `.nvmrc`; `engines` in `package.json` requires it) and pnpm 12 (pinned by `packageManager`).
- `pnpm install --frozen-lockfile`. Dependency build scripts are denied on purpose; the reasons are in
  `pnpm-workspace.yaml`.
- Electron downloads its binary the first time it runs (`pnpm start`, `pnpm start-dev`), not at install.
- Playwright needs Chromium once: `pnpm exec playwright install chromium`.

## Commands

| Command | When |
|---|---|
| `pnpm check` | Before saying anything is done. Biome (lint + format), Prettier (templates), types, unit tests, production build (which also type-checks templates strictly), and this file's references. |
| `pnpm test` | Unit tests (Vitest through `@angular/build:unit-test`, jsdom), one run. One file: `pnpm test --include src/plaid/core/worklog/worklog.state.spec.ts`. |
| `pnpm test:watch` | Unit tests in watch mode. |
| `pnpm test:e2e` | Playwright against the dev server (started automatically) and a fake Jira. Run it when a screen flow changes. |
| `pnpm lint` | Biome lint only. |
| `pnpm format` | Apply Biome formatting and Prettier (Angular templates). |
| `pnpm typecheck` | `tsc` over app and unit tests (`tsconfig.spec.json`). |
| `pnpm build` | Production build to `build/`. |
| `pnpm serve-dev` + `pnpm start-dev` | Dev server on port 4300, then Electron loading it. |
| `pnpm start` | Electron with the production build. |
| `pnpm package` | Installer for the current platform in `dist/` (electron-builder). |

Done means `pnpm check` exits 0, plus `pnpm test:e2e` when a screen flow changed.

## How to prove a change

- Logic (facades, state, API calls, helpers): a Vitest spec next to the file (`*.spec.ts`). Write it first and see it
  fail.
- Screen flow (loading weeks, navigation, editor): Playwright in `e2e/`, against the fake Jira in `e2e/fake-jira.ts`
  (intercepts `https://jira.test`, logs in through localStorage, can pause responses).
- Electron (window, preload, IPC, packaging): open the app. `pnpm build` then `pnpm start`; for packaging,
  `pnpm exec electron-builder --dir` and run the app in `dist/`.
- Saving to a real Jira: only by hand, in the manual test. Never point automated tests at a real Jira.

## Architecture

- `src/plaid/core/` has one folder per domain (`auth/`, `worklog/`, `issue/`), each with the same three layers:
  `*.facade.ts` (business logic; components talk only to facades), `*.api.ts` (Jira REST calls, `/rest/api/2/` and
  `/rest/api/3/`), `*.state.ts` (RxJS `BehaviorSubject` state; no NgRx).
- `src/plaid/core/worklog/worklog-cache.ts`: in-memory cache of visited periods (no disk). Going back to a week shows the
  cached work logs at once and refreshes in the background.
- HTTP interceptors, in this order (`src/plaid/plaid.module.ts`): `AuthInterceptor` (adds Basic Auth, prepends the
  Jira URL, reports errors, retries after a new login) then `RateLimitRetryInterceptor` (`src/plaid/core/http/`, retries HTTP 429 before
  `AuthInterceptor` sees the error). The order is covered by `src/plaid/plaid.module.spec.ts`.
- Global services in `src/plaid/core/`: app state (visible period, modals), user preferences (localStorage), system
  preferences (OS dark mode via Electron IPC), Electron shell.
- Electron: `main.js` / `main-dev.js` call `bootstrap.js` (window, auto-update, User-Agent stripping for Jira, IPC);
  `preload.js` exposes `window.electronAPI` through `contextBridge` (typed in `src/plaid/core/electron-api.ts`).
  `contextIsolation: true`, `nodeIntegration: false`.
- Components in `src/plaid/components/`, all `standalone: false`; the main view is the calendar grid
  (`src/plaid/components/grid/`).

## Conventions

- Formatting is enforced by Biome (`biome.jsonc`) and Prettier for templates (`.prettierrc.json`): single quotes,
  semicolons, 2 spaces, 140 columns, LF. Run `pnpm format` instead of formatting by hand.
- No non-null assertions (`!`); Biome rejects them.
- `strict: false` on purpose (`tsconfig.base.json`): TypeScript 6 turns strict mode on by default, the code was never
  written for it. Strict mode is a separate project; do not flip it as a side effect.
- Strict template type checking is on. Lint rules switched off in `biome.jsonc` have their reason next to them; keep
  it that way if you change one.
- Component selectors kebab-case with the `plaid` prefix (`plaid-grid`); directive selectors camelCase prefixed with
  `plaid`.
- Colors only through the CSS variables in `src/styles.scss` (themes: System, Light, Dark). No hard-coded colors.
- Mass formatting commits are listed in `.git-blame-ignore-revs`
  (`git config blame.ignoreRevsFile .git-blame-ignore-revs`).

## Known traps

- zone.js is required. Angular bootstraps without zone unless `provideZoneChangeDetection` is in the module; without it
  the screen only updates on click. `src/plaid/plaid.module.spec.ts` guards this.
- Only Jira Cloud works (see above).
- WSL: Electron runs with hardware acceleration disabled (`bootstrap.js`). Windows programs are reached through
  `cmd.exe /c ...`.
- The manual test runs on Windows in `C:\dev\plaid` (Node 26 and pnpm 12 installed there): real login, weeks, and
  adding/editing/deleting a test work log.
- Clones made before `.gitattributes` existed (Windows, `core.autocrlf=true`) keep CRLF in files that did not change
  since; `pnpm check` then fails on them while `git status` is clean. Re-checkout once: `git rm -r --cached -q .`
  followed by `git reset --hard`.
- Unit tests replace `ElectronService` with `src/__mocks__/electron.service.ts` through `src/test-providers.ts`.

## Specs and plans

Designs live in `docs/superpowers/specs/`, implementation plans in `docs/superpowers/plans/`. Known bugs: `docs/bugs.md`.
