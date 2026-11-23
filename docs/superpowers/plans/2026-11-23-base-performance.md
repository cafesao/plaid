# Base rápida e confiável (Jira Cloud) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir tela parada, carregamento pesado, busca limitada a 50 issues e falta de cache, numa base com
dependências atualizadas e testes onde as features vão mexer.

**Architecture:** Religar detecção de mudanças por zone.js no `PlaidModule`. Reescrever o pipeline de
`WorklogFacade`: paginação por `nextPageToken`, worklogs filtrados por período na API, no máximo 4 requisições de
worklog em paralelo e cache em memória (`WorklogCache`) com refresh em segundo plano. Um `RateLimitRetryInterceptor`
interno trata HTTP 429 antes do `AuthInterceptor` ver o erro.

**Tech Stack:** Angular 21 (NgModule, RxJS 7), Electron 45, Jest 30 + jest-preset-angular 17, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-base-performance-design.md`

## Global Constraints

- Só Jira Cloud. Busca: `GET /rest/api/3/search/jql`, paginação por `nextPageToken`/`isLast`, `maxResults=100`.
- Worklogs: `GET /rest/api/2/issue/{id}/worklog` com `startedAfter`/`startedBefore` em ms UNIX; paginação dessa rota
  segue por `startAt`/`total`. Endpoints de worklog ficam na API v2.
- No máximo 4 requisições de worklog por issue abertas ao mesmo tempo.
- HTTP 429: esperar `Retry-After` (segundos) ou 2000 ms se ausente; até 3 novas tentativas; o diálogo de erro só
  aparece depois de esgotá-las.
- Cache só em memória; nada de worklog em `localStorage`/disco.
- Troca de semana e refresh periódico não mostram spinner sobre dados do cache. Botão de atualizar (F5/Ctrl+R) e
  recarregamento após login/reconexão mantêm o comportamento atual (spinner, lista reconstruída).
- Electron 45; `npm ci` limpo passa sem `--legacy-peer-deps`.
- Estilo: aspas simples, ponto e vírgula, linhas até 140, sem non-null assertion (`!`), componentes `standalone: false`.
- Todo comando que pode travar roda com `timeout` (ex.: `timeout 180 npm test`). Commits sem linha `Claude-Session`.
- Cada prova roda uma vez; a suíte inteira (Jest + Playwright) roda uma vez, no fim (Task 7).

## Review Focus

1. Worklog às 23:30 do último dia visível aparece; worklog às 00:00 do dia seguinte não (Task 3).
2. Trocar de semana rápido (A → B antes de A terminar) mostra só B e não grava A parcial no cache (Task 5).
3. Uma rajada de 429 seguida de sucesso não abre o diálogo de erro (Task 4).
4. Issue com mais de uma página de worklogs no período mantém `startedAfter`/`startedBefore` na página 2 (Task 3).
5. Worklogs de outras pessoas na mesma issue não aparecem (Task 3).

---

### Task 1: Dependências atualizadas

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify (só se o breaking change exigir): `bootstrap.js`, `preload.js`, `window-state.js`

**Interfaces:**
- Produces: base com Electron 45, Angular 21.2 no último patch, Playwright 1.x mais novo. Tasks seguintes rodam
  testes já nessas versões.

- [ ] **Step 1: Atualizar pacotes**

```bash
timeout 600 npm --prefix /home/cafesao/personal/plaid install --no-audit --no-fund \
  electron@^45 electron-builder@^26.18.0 electron-updater@^6.8.11 @playwright/test@^1.65.1 \
  @angular/animations@~21.2.26 @angular/common@~21.2.26 @angular/compiler@~21.2.26 @angular/core@~21.2.26 \
  @angular/forms@~21.2.26 @angular/platform-browser@~21.2.26 @angular/platform-browser-dynamic@~21.2.26 \
  @angular/router@~21.2.26 @angular/compiler-cli@~21.2.26 @angular/language-service@~21.2.26 \
  @angular/cli@~21.2.31 @angular/build@~21.2.31 @angular-devkit/build-angular@~21.2.31
```

Pacotes de runtime ficam em `dependencies`, ferramentas em `devDependencies` (manter onde já estão).

- [ ] **Step 2: Conferir breaking changes do Electron 42–45**

Ler https://www.electronjs.org/docs/latest/breaking-changes (seções 42 a 45) e listar o que afeta as APIs usadas em
`bootstrap.js`/`preload.js`/`window-state.js`: `BrowserWindow` (`webPreferences`, `getNormalBounds`, `maximize`),
`session.webRequest.onBeforeSendHeaders`, `nativeTheme`, `Menu.buildFromTemplate`/`popup`, `ipcMain.handle`,
`contextBridge`, `app.requestSingleInstanceLock`, `app.commandLine.appendSwitch`. Ajustar só o que quebrou.

- [ ] **Step 3: Instalação limpa, testes e build**

```bash
rm -rf /home/cafesao/personal/plaid/node_modules
timeout 600 npm --prefix /home/cafesao/personal/plaid ci --no-audit --no-fund
timeout 180 npm --prefix /home/cafesao/personal/plaid test
timeout 300 npm --prefix /home/cafesao/personal/plaid run build
```

Expected: `ci` sem ERESOLVE; Jest `52 passed`; build `Application bundle generation complete`.

- [ ] **Step 4: Electron abre**

```bash
timeout 25 npx --prefix /home/cafesao/personal/plaid electron /home/cafesao/personal/plaid/main.js; echo "exit=$?"
```

Expected: `exit=124` (ainda rodando quando o prazo acabou) e nenhum erro de módulo/API no stderr. Uma janela abre
brevemente via WSLg; com `xvfb-run` disponível, preferir `xvfb-run -a` na frente.

- [ ] **Step 5: Commit**

```bash
git -C /home/cafesao/personal/plaid add package.json package-lock.json bootstrap.js preload.js window-state.js
git -C /home/cafesao/personal/plaid commit -m "chore: update Electron to 45 and Angular/Playwright patches"
```

---

### Task 2: Tela atualiza sozinha (zone.js de volta)

**Files:**
- Create: `src/plaid/plaid.module.spec.ts`
- Modify: `src/plaid/plaid.module.ts` (providers)
- Modify: `docs/bugs.md`

**Interfaces:**
- Produces: `PlaidModule.providers` contém `provideZoneChangeDetection({ eventCoalescing: true })`. Task 4 acrescenta
  um interceptor na mesma lista.

- [ ] **Step 1: Teste que falha**

O TestBed sempre usa zone (por isso não pega o bug). O teste recria o que `bootstrapModule` faz no Angular 21:
pai com `ɵprovideZonelessChangeDetectionInternal()` sobre o injector da plataforma (não o do TestBed, que já tem
`BrowserModule` e dispara NG05100).

```ts
import {TestBed} from '@angular/core/testing';
import {createEnvironmentInjector, createNgModule, EnvironmentInjector, getPlatform,
  ɵprovideZonelessChangeDetectionInternal, ɵZONELESS_ENABLED} from '@angular/core';
import {PlaidModule} from './plaid.module';

describe('PlaidModule', () => {
  it('uses zone-based change detection when bootstrapped', () => {
    TestBed.inject(EnvironmentInjector); // initializes the test platform
    const platformInjector = getPlatform().injector as EnvironmentInjector;
    const bootstrapParent = createEnvironmentInjector([ɵprovideZonelessChangeDetectionInternal()], platformInjector);
    const moduleRef = createNgModule(PlaidModule, bootstrapParent);
    expect(moduleRef.injector.get(ɵZONELESS_ENABLED)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `timeout 120 npx --prefix /home/cafesao/personal/plaid jest --config /home/cafesao/personal/plaid/jest.config.js --rootDir /home/cafesao/personal/plaid src/plaid/plaid.module.spec.ts`
Expected: FAIL, `Expected: false / Received: true` (comportamento confirmado em 2026-11-23).

- [ ] **Step 3: Adicionar `provideZoneChangeDetection({ eventCoalescing: true })` aos `providers` do `PlaidModule`**

- [ ] **Step 4: Rodar e ver passar** (mesmo comando) — Expected: PASS.

- [ ] **Step 5: Marcar o bug 1 de `docs/bugs.md` como resolvido**

Acrescentar ao fim da seção: `**Resolvido em 2026-11-23:** o Angular 21 iniciava o app sem zone.js; a tela só
redesenhava em eventos de clique. Corrigido com provideZoneChangeDetection no PlaidModule.`

- [ ] **Step 6: Commit** — `fix: restore zone-based change detection (screen only updated on click)`

---

### Task 3: Busca paginada e worklogs só do período, com limite de 4

**Files:**
- Modify: `src/plaid/model/search-results.ts`, `src/plaid/core/worklog/worklog.api.ts`,
  `src/plaid/core/worklog/worklog.facade.ts`, `src/plaid/core/issue/issue.api.ts`, `README.md`, `CLAUDE.md`
- Create: `src/plaid/core/worklog/worklog.api.spec.ts`, `src/plaid/core/worklog/worklog.facade.spec.ts`

**Interfaces:**
- Produces:
  - `SearchResults` ganha `nextPageToken?: string; isLast?: boolean;`
  - `WorklogApi.getIssuesForWorklogDateRange$(dateRange: DateRange, nextPageToken?: string): Observable<SearchResults>`
    (parâmetro `user` removido; JQL usa `currentUser()`)
  - `WorklogApi.getWorklogsForIssue$(issueId: string, dateRange: DateRange, startAt = 0): Observable<WorklogWithPagination>`
  - `export const WORKLOG_REQUEST_CONCURRENCY = 4;` em `worklog.facade.ts`
  - Helper de teste `createFacade()` em `worklog.facade.spec.ts` (Task 5 reutiliza): retorna
    `{ facade, api, state, user$, range$ }`, onde `api` é um objeto de `jest.fn()` com os métodos de `WorklogApi`,
    `state` é um `WorklogState` real, `user$`/`range$` são `BehaviorSubject` servidos por fakes de `AuthFacade`
    (`getAuthenticatedUser$`, `reconnect`) e `AppStateService` (`getVisibleDateRange$`), e
    `UserPreferencesService.getRefreshIntervalMinutes$` devolve `of(0)`. Facade criada com `new WorklogFacade(...)`.

Valores fixos dos testes: semana `start = new Date(2026, 10, 23)`, `end = new Date(2026, 10, 29)`; usuário
`{ self: 'https://jira.test/rest/api/2/user?accountId=u1' }`.

- [ ] **Step 1: Testes da API que falham** (`worklog.api.spec.ts`, com `provideHttpClient()` +
  `provideHttpClientTesting()` e `HttpTestingController`)

```ts
it('requests the first search page with maxResults=100 and a JQL range widened by one day', ...);
// expect url startsWith '/rest/api/3/search/jql'; params: maxResults=100, no startAt, no nextPageToken;
// decoded jql contains 'worklogDate >= "2026-11-22"' and 'worklogDate <= "2026-11-30"'
it('passes nextPageToken on later pages', ...);          // getIssuesForWorklogDateRange$(range, 'p2') -> nextPageToken=p2
it('limits issue worklogs to the visible period', ...);
// getWorklogsForIssue$('10', range) -> path '/rest/api/2/issue/10/worklog',
// startedAfter = new Date(2026, 10, 23).getTime(), startedBefore = new Date(2026, 10, 30).getTime()
it('keeps the period filter on later worklog pages', ...); // startAt=50 together with startedAfter/startedBefore
```

- [ ] **Step 2: Testes do facade que falham** (`worklog.facade.spec.ts`)

```ts
it('reads every search page until isLast', ...);
// page 1: 100 issues, nextPageToken 'p2', isLast false; page 2: 5 issues, isLast true
// expect getIssuesForWorklogDateRange$ calls: (range, undefined), (range, 'p2'); state ends with 105 worklogs
it('stops paging when nextPageToken is missing', ...);   // isLast undefined, no token -> 1 call
it('keeps at most 4 worklog requests open', ...);
// 10 issues; getWorklogsForIssue$ returns a new Subject per call; after user$ emits: 4 calls;
// complete one subject -> 5 calls
it('includes a worklog at 23:30 on the last visible day and excludes one at 00:00 the next day', ...);
it('ignores worklogs from other authors on the same issue', ...);
it('requests later worklog pages of an issue with the same period', ...);
// page 1 total 60 with 50 worklogs -> second call getWorklogsForIssue$(id, range, 50)
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `timeout 120 npx --prefix /home/cafesao/personal/plaid jest --config /home/cafesao/personal/plaid/jest.config.js --rootDir /home/cafesao/personal/plaid src/plaid/core/worklog`
Expected: FAIL nos testes novos (assinaturas e paginação ainda antigas).

- [ ] **Step 4: Implementar**
  - `WorklogApi`: novas assinaturas acima; `startedBefore` = início do dia seguinte a `dateRange.end`.
  - `WorklogFacade`: `expand` continua enquanto `isLast !== true && nextPageToken`; `mergeMap(..., WORKLOG_REQUEST_CONCURRENCY)`;
    filtro no cliente por autor e data mantido.
  - `IssueApi.search$`: tirar `&startAt=0`.

- [ ] **Step 5: Rodar e ver passar** (mesmo comando) — Expected: PASS, incluindo os 9 testes antigos de `worklog.state.spec.ts`.

- [ ] **Step 6: README e CLAUDE.md**
  - README: trocar "Works both with Jira Server and Jira Cloud." por: `Works with Jira Cloud only. Jira Server/Data
    Center stopped working in October 2025, when issue search moved to /rest/api/3/search/jql (required by Jira
    Cloud), an endpoint that Jira Server does not have.`
  - CLAUDE.md: "supporting both Jira Server and Jira Cloud" → "Jira Cloud only (Jira Server unsupported since 2025-10)".

- [ ] **Step 7: Commit** — `fix: page Jira search by token and fetch only the visible period's worklogs`

---

### Task 4: Nova tentativa em HTTP 429

**Files:**
- Create: `src/plaid/core/http/rate-limit-retry.interceptor.ts`, `src/plaid/core/http/rate-limit-retry.interceptor.spec.ts`
- Modify: `src/plaid/plaid.module.ts` (providers)

**Interfaces:**
- Produces: `@Injectable() export class RateLimitRetryInterceptor implements HttpInterceptor`, registrado em
  `HTTP_INTERCEPTORS` **depois** do `AuthInterceptor` (fica por dentro: o `AuthInterceptor` só vê o erro depois das
  tentativas). Constantes exportadas: `RATE_LIMIT_MAX_RETRIES = 3`, `RATE_LIMIT_DEFAULT_DELAY_MS = 2000`.

- [ ] **Step 1: Testes que falham** (TestBed com `provideHttpClient(withInterceptorsFromDi())`,
  `provideHttpClientTesting()`, os dois interceptors na ordem do módulo, `AuthState` real com `AUTH_INFO`/`AUTH_HEADER`
  no `localStorage`, `jest.useFakeTimers()`)

```ts
it('retries after Retry-After seconds on 429 and returns the later success', ...);
// flush 429 with header Retry-After: 1 -> no new request before 1000 ms -> advance 1000 -> flush 200 -> value received
it('waits 2000 ms when Retry-After is missing', ...);
it('gives up after 3 retries and propagates the 429', ...);   // 4 requests in total
it('does not retry other errors', ...);                       // 500 -> error at once, 1 request
it('does not report an error to AuthState while retries succeed', ...);
// spy AuthState.setError; 429 then 200 -> setError not called
```

- [ ] **Step 2: Rodar e ver falhar** — `... jest ... src/plaid/core/http` — Expected: FAIL (arquivo não existe).
- [ ] **Step 3: Implementar com `retry({ count: RATE_LIMIT_MAX_RETRIES, delay })` do RxJS**, `delay` devolvendo
  `timer(ms)` para 429 e `throwError(() => error)` para o resto. Registrar no `PlaidModule`.
- [ ] **Step 4: Rodar e ver passar** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: retry Jira requests on HTTP 429 before reporting an error`

---

### Task 5: Cache em memória de períodos

**Files:**
- Create: `src/plaid/core/worklog/worklog-cache.ts`, `src/plaid/core/worklog/worklog-cache.spec.ts`
- Modify: `src/plaid/core/worklog/worklog.facade.ts`, `src/plaid/core/worklog/worklog.facade.spec.ts`

**Interfaces:**
- Consumes: `createFacade()` e assinaturas de `WorklogApi` da Task 3.
- Produces: `@Injectable({ providedIn: 'root' }) export class WorklogCache` com
  - `get(range: DateRange): Worklog[] | undefined`
  - `set(range: DateRange, worklogs: Worklog[]): void` — chave `start.getTime() + '_' + end.getTime()`; guarda no máximo
    `WORKLOG_CACHE_MAX_RANGES = 20` períodos (descarta o usado há mais tempo)
  - `upsert(worklog: Worklog): void` — atualiza ou insere em todo período cacheado que contém `worklog.started`
  - `remove(worklogId: string): void`
  - `clear(): void`
  - `WorklogFacade` recebe `WorklogCache` como 6º parâmetro do construtor; `createFacade()` passa um `WorklogCache` real.

- [ ] **Step 1: Testes do cache que falham** (`worklog-cache.spec.ts`)

```ts
it('returns what was stored for the same range', ...);
it('returns undefined for a range never stored', ...);
it('upserts a worklog only into ranges that contain its start', ...);
it('removes a worklog from every range', ...);
it('forgets everything on clear', ...);
it('keeps at most 20 ranges, dropping the least recently used', ...);
```

- [ ] **Step 2: Testes do facade que falham** (acrescentar em `worklog.facade.spec.ts`; semana A = 23–29/11/2026,
  semana B = 30/11–06/12/2026)

```ts
it('shows a cached range at once, without the fetching flag, when returning to it', ...);
// load A, load B, make api pending (Subjects), range$.next(A) -> state === A's worklogs synchronously,
// fetching false, and a background request for A was made
it('replaces cached data when the background refresh completes', ...);
it('keeps an edit made while a background refresh was running', ...);
// refresh pending -> facade.addWorklog$(...) completes -> refresh completes with old data -> added worklog still in state
it('updates the cache on add, update and delete', ...);  // add in A, go to B, back to A -> added present
it('clears the cache when the user logs out', ...);      // user$ null then user -> back to A shows fetching true
it('does not cache a range whose first load was interrupted', ...);
// A pending, range$.next(B) -> B completes -> range$.next(A) -> fetching true (no cached A)
it('keeps the spinner on manual refresh even when the range is cached', ...); // fetchWorklogsVerbose() -> fetching true
```

- [ ] **Step 3: Rodar e ver falhar** — `... jest ... src/plaid/core/worklog` — Expected: FAIL nos novos.

- [ ] **Step 4: Implementar `WorklogCache`** (Map com reinserção no `get`/`set` para LRU).

- [ ] **Step 5: Integrar no `WorklogFacade`**
  - Troca de período (fora do caso "sub-intervalo", que segue sem buscar): com cache → `setWorklogs(cached)`,
    `setFetching(false)`, `fetchWorklogsQuiet()`; sem cache → `fetchWorklogsVerbose()`.
  - `fetchWorklogsVerbose()`: comportamento atual; no `complete`, `cache.set(range, final)`. Sem `complete` (trocou
    de período antes), nada vai ao cache.
  - `fetchWorklogsQuiet()`: guarda o contador de mutações ao começar; no resultado, se o contador mudou, descarta;
    senão `setWorklogs` + `cache.set`.
  - `addWorklog$`/`updateWorklog$`/`deleteWorklog`: incrementam o contador de mutações e chamam `cache.upsert`/`cache.remove`.
  - `getAuthenticatedUser$` emitindo (qualquer valor) → `cache.clear()` antes de buscar.

- [ ] **Step 6: Rodar e ver passar** — Expected: PASS em `src/plaid/core/worklog`.
- [ ] **Step 7: Commit** — `feat: in-memory cache of visited weeks with background refresh`

---

### Task 6: Teste ponta a ponta com Jira falso

**Files:**
- Create: `e2e/fake-jira.ts`, `e2e/worklog-week.spec.ts`

**Interfaces:**
- Produces: `installFakeJira(page: Page, opts: { issueCount: number; responseDelayMs?: number }): Promise<FakeJira>`
  com `FakeJira = { pauseResponses(): void; resumeResponses(): void }`.
  - Credenciais via `page.addInitScript`: `localStorage.AUTH_INFO = JSON.stringify({ jiraUrl: 'https://jira.test',
    username: 'e2e', password: 'e2e' })` e `localStorage.AUTH_HEADER = 'Basic ' + btoa('e2e:e2e')`, mais o mock de
    `window.electronAPI` já usado em `e2e/app.spec.ts`.
  - `page.route('https://jira.test/**')` responde: `/rest/api/2/myself` → usuário fixo; `/rest/api/3/search/jql` →
    issues `E2E-1..N` em páginas de 100 com `nextPageToken`/`isLast`; `/rest/api/2/issue/{id}/worklog` → 1 worklog
    do usuário por issue, dentro de `startedAfter`, em dias visíveis com as preferências padrão e sem sobreposição
    (21 por dia, blocos de 15 min a cada 20 min a partir das 08:00).
  - Respostas com `access-control-allow-origin: *`; `OPTIONS` → 204 com `access-control-allow-headers: *` e
    `access-control-allow-methods: *` (o Chromium de teste aplica CORS).
  - `pauseResponses()` segura toda resposta nova até `resumeResponses()`.

- [ ] **Step 1: Escrever os testes**

```ts
test('loads a week with two search pages and hides the spinner without any click', async ({ page }) => {
  await installFakeJira(page, { issueCount: 105, responseDelayMs: 200 });
  await page.goto('/');
  // no interaction after goto
  // expect worklog panels for E2E-1 and E2E-105 (exact key) attached
  // expect page.locator('.loading-overlay.visible') toHaveCount(0) within 10 s
});

test('shows a visited week at once when coming back to it', async ({ page }) => {
  const jira = await installFakeJira(page, { issueCount: 105 });
  // load, click a[title="Next week (F6)"], wait spinner gone
  jira.pauseResponses();
  // click a[title="Previous week (F4)"]
  // expect E2E-105 panel attached with timeout 1000 and '.loading-overlay.visible' count 0
  jira.resumeResponses();
});
```

- [ ] **Step 2: Rodar**

Run: `timeout 300 npx --prefix /home/cafesao/personal/plaid playwright test e2e/worklog-week.spec.ts`
(de dentro de `/home/cafesao/personal/plaid`; sobe o dev server na 4300 sozinho)
Expected: 2 passed. Se falhar, conferir antes se é o teste (CORS, seletor) ou o app.

- [ ] **Step 3: Commit** — `test: e2e week loading and cached navigation against a fake Jira`

---

### Task 7: Verificação final e entrega para o teste no Windows

- [ ] **Step 1: Suíte inteira, uma vez**

```bash
timeout 180 npm --prefix /home/cafesao/personal/plaid test
cd /home/cafesao/personal/plaid && timeout 600 npx playwright test
timeout 300 npm --prefix /home/cafesao/personal/plaid run build
```

Expected: Jest tudo verde; Playwright todos os arquivos verdes (os 6 antigos de `app.spec.ts` + 2 novos); build ok.
Se algo falhar, rodar só os arquivos que falharam no commit `f99f823` para saber se já falhavam antes.

- [ ] **Step 2: Push da branch** — `git -C /home/cafesao/personal/plaid push -u origin perf/base-cloud`

- [ ] **Step 3: Roteiro do usuário no Windows** (`C:\dev\plaid`): `git fetch`, `git checkout perf/base-cloud`,
  `npm ci`, `npm run serve-dev` + `npm run start-dev`. Conferir: app abre, login, semana carrega sem clique, trocar
  de semana e voltar é instantâneo, **adicionar, editar e excluir um lançamento de teste** no Jira real.

- [ ] **Step 4: Merge no `master`** só depois do ok do usuário no Windows.
