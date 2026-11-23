# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Plaid is a desktop Jira worklog editor built with Angular 21 + Electron 45. It provides a calendar-based UI for managing work log entries, Jira Cloud only (Jira Server unsupported since 2025-10).

## Build & Development Commands

```bash
# Development
npm run serve-dev      # Angular dev server on port 4300
npm run start-dev      # Run full Electron app in dev mode

# Production
npm run build          # Compile Angular to ./build/
npm run start          # Run Electron with production build
npm run package        # Build Electron installer (electron-builder)

# Testing
npm test               # Jest unit tests
npm run test:watch     # Jest in watch mode
npm run test:e2e       # Playwright E2E tests (starts dev server automatically)
```

## Architecture

### Layered Pattern (Facade → API → State)

Each domain (auth, worklog, issue) follows the same three-file pattern inside `src/plaid/core/`:

- **`*.facade.ts`** — Business logic and orchestration. Components interact with facades only.
- **`*.api.ts`** — HTTP calls to Jira REST API (`/rest/api/2/` and `/rest/api/3/`).
- **`*.state.ts`** — Reactive state via RxJS `BehaviorSubject`. No NgRx/Redux.

### Key Domains

- **`core/auth/`** — Login/logout, credential storage (localStorage), HTTP interceptor that adds Basic Auth headers and prepends Jira base URL to all requests.
- **`core/worklog/`** — CRUD for worklogs with paginated fetching pipeline using RxJS `expand`/`scan`. Supports periodic auto-refresh.
- **`core/issue/`** — Issue search, favorites management, pre-fetching suggestions.

### Global Services

- **`AppStateService`** — Visible date range, modal state.
- **`UserPreferencesService`** — Working hours, theme, favorites (localStorage-backed).
- **`SystemPreferencesService`** — OS dark mode detection via Electron IPC (`window.electronAPI`).
- **`ElectronService`** — Shell operations (openExternal) via IPC.

### Electron Layer

- `main.js` / `main-dev.js` — Entry points calling `bootstrap.js`.
- `bootstrap.js` — Window creation (1400×800, min 400×200), auto-updates, User-Agent stripping for Jira API compatibility, IPC handlers for nativeTheme and shell, hardware acceleration disabled (WSL workaround).
- `preload.js` — Exposes `window.electronAPI` via `contextBridge` for secure IPC communication (nativeTheme, shell.openExternal).
- `window-state.js` — Persists window position/size.

### Security

- `contextIsolation: true` and `nodeIntegration: false` — renderer process cannot access Node.js APIs directly.
- All Electron communication goes through `preload.js` → `contextBridge.exposeInMainWorld()` → IPC handlers in `bootstrap.js`.

### Component Structure

Components live in `src/plaid/components/`. The main view is a calendar grid (`grid/`) with worklog panels and an editor. The top bar has date range picker, zoom controls, settings, and auth status. Connection issues (auth errors, lost connection) are handled via modal components in `connection-issue-resolver/`. All components use `standalone: false` (NgModule-based).

## Code Style

- Component selectors: kebab-case (e.g., `plaid-grid`)
- Directive selectors: camelCase prefixed with `plaid`
- Max line length: 140 characters
- Single quotes, trailing semicolons
- No non-null assertions (`!`)

## Theming

All colors use CSS variables defined in `src/plaid/styles.scss`. Three themes: System (follows OS), Light, Dark. Never use hard-coded colors.
