# Projeto atual e pronto para agentes — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar npm por pnpm, levar tudo à última versão compatível (Node 26, Angular 22.3, TypeScript 6.0), migrar Jest
para Vitest, adicionar Biome + Prettier (só templates), um `pnpm check` único com CI, e `AGENTS.md` como contexto para
agentes.

**Architecture:** Uma mudança por task, na ordem que isola riscos: primeiro o gerenciador com as mesmas versões, depois
o salto de versões ainda no Jest, depois a troca de runner, depois a checagem/formatação, por fim documentação e CI.
Cada task termina com o app compilando e os 88 testes unitários passando.

**Tech Stack:** pnpm 12.23.0, Node 26 LTS, Angular 22.3 (NgModule), TypeScript ~6.0, zone.js 0.16, Electron 45,
Vitest 5 via `@angular/build:unit-test`, Biome 2.6, Prettier 3.10, Playwright 1.65, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-23-modern-tooling-design.md`

## Global Constraints

- pnpm como único gerenciador: `packageManager: "pnpm@12.23.0"`, `pnpm-lock.yaml` versionado, sem `package-lock.json`.
- Node 26 LTS: `.nvmrc` = `26`, `engines.node` = `>=26`.
- Angular 22.3, TypeScript `~6.0`, zone.js 0.16, `@types/node` 26; Electron e Playwright na última.
- `"strict": false` explícito, com comentário do motivo (o TS 6 liga por padrão; o modo estrito é o projeto seguinte).
- Sem `ignoreDeprecations`, `peerDependencyRules.allowAny` ou `overrides` forçando versão incompatível, salvo motivo
  escrito no ledger e ao lado da config.
- Regra de lint ou teste desligada só com o motivo escrito ao lado.
- Os 88 testes unitários continuam existindo e rodando, com os mesmos nomes.
- Formatação: aspas simples, ponto e vírgula, 2 espaços, linhas até 140, fim de linha LF.
- Formatação em massa num commit só dela, listado em `.git-blame-ignore-revs`.
- Nenhuma mudança de comportamento ou visual do app.
- Todo comando que pode travar roda com `timeout` (ou `bash ~/.claude/scripts/watchdog.sh` acima de 10 min).
  Commits sem linha `Claude-Session`.
- Cada prova roda uma vez; a suíte inteira (check + build + e2e) roda uma vez, no fim (Task 6).

## Review Focus

1. Clone novo no Windows (Node 26, pnpm, `core.autocrlf=true`): `pnpm install` e `pnpm check` passam (fim de linha não
   pode reprovar a formatação) — Task 4 fixa `.gitattributes` com `eol=lf`.
2. App empacotado com pnpm sobe sem módulo faltando (`electron-updater` etc.) — Task 1 prova com `electron-builder --dir`.
3. Regra do Biome que mexe em import (`useImportType`, imports "não usados") quebrando a injeção de dependência só em
   runtime — Task 4 roda o app compilado depois das correções; e2e no fim.
4. Teste migrado para o Vitest que passa sem rodar suas asserções (callback `done` convertido errado) — Task 3 compara
   nomes 88 = 88 e mostra que um teste convertido falha quando a asserção é quebrada.
5. Comando citado no `AGENTS.md` que não existe — Task 5 adiciona uma checagem automática dentro do `pnpm check`.

---

### Task 1: pnpm com as mesmas versões

**Files:**
- Create: `pnpm-lock.yaml`, `pnpm-workspace.yaml`
- Delete: `package-lock.json`
- Modify: `package.json` (`packageManager`, `engines`, scripts), `.nvmrc`, `playwright.config.ts`

**Interfaces:**
- Produces: instalação por `pnpm install --frozen-lockfile`; Node 26 ativo no WSL (`fnm use`); demais tasks rodam
  `pnpm <script>` / `pnpm exec <bin>`.

- [ ] **Step 1: Node 26 e pnpm 12 no WSL**

```bash
fnm install 26 && fnm use 26 && node --version
npm install -g pnpm@12.23.0 && pnpm --version
```
Expected: `v26.x`, `12.23.0`.

- [ ] **Step 2: Converter o lockfile mantendo as versões resolvidas**

`.nvmrc` = `26`; `package.json`: `"packageManager": "pnpm@12.23.0"`, `"engines": {"node": ">=26"}`,
`test:e2e` = `playwright test`; `playwright.config.ts`: `webServer.command` = `pnpm serve-dev`. Depois
`pnpm import` (gera `pnpm-lock.yaml` a partir do `package-lock.json`), apagar `package-lock.json` e `node_modules`.

- [ ] **Step 3: Instalação limpa**

Run: `timeout 600 pnpm install --frozen-lockfile`
Expected: termina sem erro e sem `WARN Issues with peer dependencies`. Scripts de build bloqueados: liberar em
`pnpm-workspace.yaml` só os necessários para o app rodar/compilar (cada um com uma linha de motivo no ledger).

- [ ] **Step 4: Testes, build, Electron**

```bash
timeout 180 pnpm test
timeout 300 pnpm build
timeout 25 pnpm exec electron main.js; echo "exit=$?"
```
Expected: Jest `88 passed`; `Application bundle generation complete`; `exit=124` sem erro de módulo.

- [ ] **Step 5: App empacotado abre**

```bash
timeout 600 pnpm exec electron-builder --dir
timeout 25 ./dist/linux-unpacked/plaid; echo "exit=$?"
```
Expected: `exit=124`, sem `Cannot find module`. Se falhar por layout do pnpm: `nodeLinker: hoisted` em
`pnpm-workspace.yaml`, repetir Steps 3–5 e registrar o motivo.

- [ ] **Step 6: Commit** — `build: switch package manager to pnpm 12 and Node 26`

---

### Task 2: Angular 22, TypeScript 6 e limpeza de dependências

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`, `angular.json`, `tsconfig.base.json`, `tsconfig.app.json`,
  `tsconfig.spec.json`, `src/main.ts`, `.browserslistrc`, arquivos que o `ng update` migrar

**Interfaces:**
- Consumes: Task 1 (pnpm).
- Produces: Angular 22.3 / TS ~6.0 / zone.js 0.16 / `@types/node` 26; `src/main.ts` com `platformBrowser()`;
  `tsconfig.base.json` com `"strict": false` comentado. Task 3 troca o runner em cima disso.

- [ ] **Step 1: `ng update`**

```bash
timeout 600 pnpm exec ng update @angular/core@22 @angular/cli@22 --allow-dirty
```
Expected: migrações aplicadas sem erro. Revisar o diff das migrações (só aceitar o que o `ng update` fez sozinho).

- [ ] **Step 2: Demais versões e remoções**

`typescript@~6.0`, `zone.js@~0.16`, `@types/node@^26`, `electron@latest`, `@playwright/test@latest`,
`electron-builder`/`electron-updater` na última, `tslib`, `rxjs`, fontes `@openfonts/*` na última. Remover
`@angular/animations`, `@angular/platform-browser-dynamic`; remover `ts-node`, `@angular-devkit/build-angular` e
`postcss` se `grep` confirmar que nada os usa. `src/main.ts`: `platformBrowser().bootstrapModule(PlaidModule)`.

- [ ] **Step 3: tsconfig compatível com TS 6**

`"strict": false` em `tsconfig.base.json` com comentário (motivo do spec §2). Remover/trocar opções que o TS 6 marca
como obsoletas (ex.: `baseUrl`, `downlevelIteration`) em vez de usar `ignoreDeprecations`.

Run: `timeout 120 pnpm exec tsc -p tsconfig.spec.json --noEmit`
Expected: sem erros e sem aviso de opção obsoleta.

- [ ] **Step 4: `.browserslistrc`**

Descobrir o Chromium do Electron: `ELECTRON_RUN_AS_NODE=1 pnpm exec electron -p process.versions.chrome`. Trocar
`Electron 8.2.1` por `Chrome >= <versão>` (ou apagar o arquivo se o padrão do Angular 22 já cobrir).

- [ ] **Step 5: Instalação, testes, build, Electron**

```bash
timeout 600 pnpm install --frozen-lockfile
timeout 180 pnpm test
timeout 300 pnpm build
timeout 25 pnpm exec electron main.js; echo "exit=$?"
```
Expected: sem aviso de peer; Jest `88 passed`; build sem `Unsupported browsers` e sem warning; `exit=124`.

- [ ] **Step 6: Commit** — `build: update to Angular 22, TypeScript 6 and latest dependencies`

---

### Task 3: Jest → Vitest

**Files:**
- Modify: `angular.json` (target `test`), `package.json` (scripts e deps), `tsconfig.spec.json`, os 11 `*.spec.ts`
- Create: `src/test-setup.ts` (só se o mock do `ElectronService` precisar)
- Delete: `jest.config.js`, `setup-jest.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces: `pnpm test` = `ng test --watch=false` (Vitest, jsdom, uma execução); `pnpm test:watch` = `ng test`.

- [ ] **Step 1: Lista de referência dos testes**

Run: `timeout 180 pnpm exec jest --config jest.config.js --json --outputFile=<workspace>/jest-before.json`
Extrair a lista ordenada de `ancestorTitles + title` (88 itens) para `<workspace>/names-before.txt`.

- [ ] **Step 2: Trocar o runner**

Target `test` com builder `@angular/build:unit-test` (`runner: vitest`, `buildTarget` de dev, `tsConfig:
tsconfig.spec.json`). Instalar `vitest@^5`, `jsdom`; remover `jest`, `jest-environment-jsdom`, `jest-preset-angular`,
`@types/jest`. `tsconfig.spec.json` com `types: ["vitest/globals"]`.

- [ ] **Step 3: Rodar e ver falhar**

Run: `timeout 300 pnpm test`
Expected: falhas de `jest` não definido e de callback `done` — confirma que os specs são encontrados.

- [ ] **Step 4: Migrar os specs**

`jest.fn/spyOn/useFakeTimers/advanceTimersByTime/useRealTimers` → `vi.*`; `jest.Mock` → `Mock` do Vitest;
`(done) => …` vira teste síncrono (os observables usados são síncronos) ou `async` com Promise. Mock do
`ElectronService` equivalente ao `moduleNameMapper` antigo (via `setupFiles` + `vi.mock`, ou `providersFile`).

- [ ] **Step 5: Mesmos testes, rodando de verdade**

```bash
timeout 300 pnpm exec ng test --watch=false --reporters=json --output-file=<workspace>/vitest-after.json
```
Expected: 88 passed; lista ordenada de nomes igual a `names-before.txt` (diff vazio). Depois, quebrar de propósito uma
asserção dentro de um teste que usava `done` (ex.: `worklog.state.spec.ts` › `should emit when set to true`), ver
falhar, desfazer.

- [ ] **Step 6: Commit** — `test: migrate unit tests from Jest to Vitest`

---

### Task 4: Biome, Prettier, templates estritos e `pnpm check`

**Files:**
- Create: `biome.json`, `.prettierrc.json`, `.prettierignore`, `.gitattributes`, `.git-blame-ignore-revs`
- Modify: `package.json` (deps `@biomejs/biome`, `prettier`; scripts), `tsconfig.app.json` /
  `angular.json` (`strictTemplates`), arquivos com violações

**Interfaces:**
- Consumes: Task 3 (`pnpm test`).
- Produces scripts: `lint` = `biome lint .`; `format` = Biome `format --write` + `prettier --write` nos templates (e SCSS
  se o Biome não formatar SCSS); `typecheck` = `tsc -p tsconfig.spec.json --noEmit`; `check` = `biome ci .` +
  `prettier --check` + `typecheck` + `test` + `build` (o build é o que checa os templates). Task 5 acrescenta um passo
  ao `check`.

- [ ] **Step 1: O portão falha quando deve**

Configurar Biome (recomendadas; formatter com aspas simples, ponto e vírgula, 2 espaços, 140, LF), Prettier (só
templates, mesmas opções) e os scripts. Criar um arquivo temporário com aspas duplas e uma variável não usada.
Run: `timeout 300 pnpm check; echo "exit=$?"`
Expected: `exit` ≠ 0 apontando o arquivo temporário. Apagar o arquivo.

- [ ] **Step 2: Templates estritos**

Ligar `strictTemplates` em `angularCompilerOptions`. Run: `timeout 300 pnpm build`. Corrigir os erros com tipos, sem
mudar comportamento; se algum exigir mudança de comportamento, desligar só aquele caso com motivo.

- [ ] **Step 3: Violações de lint**

Run: `timeout 120 pnpm lint`. Corrigir (correções seguras do Biome; as inseguras revisadas uma a uma). `useImportType`
e afins: configurar para não transformar imports usados na injeção pelo construtor (motivo no `biome.json`).
`.gitattributes`: `* text=auto eol=lf`.

- [ ] **Step 4: App ainda sobe**

```bash
timeout 300 pnpm test && timeout 300 pnpm build
timeout 25 pnpm exec electron main.js; echo "exit=$?"
```
Expected: 88 passed; build ok; `exit=124` sem erro de injeção (`NG0201`/`NullInjectorError`) no stderr.

- [ ] **Step 5: Commit da configuração e correções** — `chore: add Biome, Prettier for templates and pnpm check`

- [ ] **Step 6: Formatação em massa**

Run: `timeout 300 pnpm format && git diff --stat`. Conferir que o diff é só de formatação. Commit
`style: format codebase with Biome and Prettier`. Depois `.git-blame-ignore-revs` com o hash desse commit e commit
`chore: ignore mass formatting in git blame`.

- [ ] **Step 7: Portão verde**

Run: `timeout 300 pnpm check; echo "exit=$?"` — Expected: `exit=0`.

---

### Task 5: Contexto para agentes

**Files:**
- Create: `AGENTS.md`, `scripts/check-agents-doc.mjs`
- Modify: `CLAUDE.md`, `README.md`, `package.json` (`check` ganha `node scripts/check-agents-doc.mjs`)

**Interfaces:**
- Consumes: scripts da Task 4.
- Produces: `node scripts/check-agents-doc.mjs` — sai com erro se o `AGENTS.md` citar `pnpm <script>` inexistente no
  `package.json` ou caminho de arquivo/pasta inexistente (caminhos entre crases que começam com `src/`, `e2e/`,
  `docs/`, `scripts/` ou um arquivo da raiz).

- [ ] **Step 1: Checagem que falha**

Escrever `scripts/check-agents-doc.mjs` e um `AGENTS.md` mínimo citando `pnpm nao-existe` e `src/nao-existe.ts`.
Run: `node scripts/check-agents-doc.mjs; echo "exit=$?"` — Expected: `exit=1`, listando os dois.

- [ ] **Step 2: `AGENTS.md` completo**

Conteúdo do spec §7: o que é (Jira Cloud só, por quê); setup (Node 26 via `.nvmrc`, pnpm 12, Electron baixado na
primeira execução, `pnpm exec playwright install chromium`); comandos e quando usar; "pronto" = `pnpm check` verde, e2e
quando mexer em fluxo de tela; como provar cada tipo de mudança (Vitest; Playwright com `e2e/fake-jira.ts`; abrir o
Electron; salvar no Jira real só no teste manual); arquitetura (facade → api → state, `WorklogCache`, ordem
`AuthInterceptor` → `RateLimitRetryInterceptor`); convenções (incluindo `strict: false` e por quê); armadilhas (zone.js
obrigatório, WSL e GPU, `cmd.exe` para Windows, teste manual em `C:\dev\plaid`); onde ficam specs e planos.

- [ ] **Step 3: `CLAUDE.md` e README**

`CLAUDE.md`: `@AGENTS.md` no topo e só o específico do Claude Code (o resto migra para o `AGENTS.md`). README: seção
de desenvolvimento com Node 26 e pnpm.

- [ ] **Step 4: Checagem verde e dentro do `check`**

Run: `timeout 300 pnpm check; echo "exit=$?"` — Expected: `exit=0` com a checagem do `AGENTS.md` rodando.

- [ ] **Step 5: Commit** — `docs: AGENTS.md as the single agent context, checked by pnpm check`

---

### Task 6: CI, verificação final e entrega

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `pnpm check`, `pnpm test:e2e` (Tasks 4–5).

- [ ] **Step 1: Workflow**

Em `push` e `pull_request`: Ubuntu, Node de `.nvmrc`, pnpm pelo `packageManager`, cache do store,
`pnpm install --frozen-lockfile`, `pnpm check`, `pnpm exec playwright install --with-deps chromium`, `pnpm test:e2e`.

- [ ] **Step 2: Suíte inteira, uma vez**

```bash
rm -rf node_modules && timeout 600 pnpm install --frozen-lockfile
timeout 600 pnpm check
timeout 600 pnpm test:e2e
```
Expected: check `exit=0`; Playwright `8 passed`. Se algo falhar, rodar só o que falhou no commit `5e78d70` para saber
se já falhava.

- [ ] **Step 3: Revisão final do branch inteiro** (fresh reviewer), correções com teste RED→GREEN.

- [ ] **Step 4: Commit de tudo e push**

`git status` limpo; `git push`. Acompanhar o CI: `timeout 900 gh run watch --exit-status`. Expected: verde.

- [ ] **Step 5: Roteiro do Windows para o usuário** (`C:\dev\plaid`): Node 26 e pnpm 12 instalados; `git pull`,
  `pnpm install`, `pnpm check`, `pnpm serve-dev` + `pnpm start-dev`; roteiro da base rápida (abrir, login, semana sem
  clique, voltar de semana instantâneo, issue antiga sem rajada, adicionar/editar/excluir lançamento de teste).

- [ ] **Step 6: Merge no `master`** só depois do ok do usuário no Windows.
