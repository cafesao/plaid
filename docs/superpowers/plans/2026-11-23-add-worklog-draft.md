# Rascunho ao adicionar lançamento — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No modo de adicionar, fechar o editor sem salvar guarda a issue escolhida à mão e o comentário, que voltam no
próximo **+**; o rascunho só some com Add salvo, Cancelar ou saída/troca de conta.

**Architecture:** Um serviço pequeno (`WorklogDraftService`) guarda o rascunho em memória e se limpa sozinho quando a
conta muda. O editor decide quando guardar (fechar), quando apagar (Cancelar, Add salvo) e quando restaurar (abrir para
adicionar). O picker de issue passa a separar "o usuário escolheu" de "chegou uma sugestão", para a sugestão nunca
sobrescrever a escolha do usuário.

**Tech Stack:** Angular 22 (NgModule, zone), RxJS, Vitest via `@angular/build:unit-test`, Playwright com o Jira falso.

**Spec:** `docs/superpowers/specs/2026-11-23-add-worklog-draft-design.md`

## Global Constraints

- Só o modo de adicionar muda; editar lançamento existente não usa nem apaga o rascunho.
- Rascunho só em memória (nada em localStorage/disco); só issue escolhida à mão e comentário (nada de dia/hora/duração).
- Sem dependência nova; nenhuma mudança visual além dos campos aparecerem preenchidos.
- Não mudar salvar, arrastar, esticar nem os atalhos (Enter, Esc com nuvem aberta).
- Comandos: Node 26 (`fnm use 26` no WSL), `pnpm`; todo comando que pode travar com `timeout`. Commits sem linha
  `Claude-Session`.
- Uma prova de cada comportamento; `pnpm check` e `pnpm test:e2e` uma vez, no fim (Task 3). Custo: unitários ~1 min por
  rodada, e2e ~1 min, check ~1 min.

## Review Focus

1. Logout com o editor aberto: o editor fecha (e guardaria o rascunho) antes de as credenciais sumirem; o rascunho tem
   de acabar apagado — Task 1 testa nessa ordem.
2. Erro 401 seguido de novo login na mesma conta: o rascunho continua — Task 1.
3. Editor fechado porque o dia saiu dos dias visíveis (mudança em Settings): guarda o rascunho — Task 2.
4. Add ainda sem resposta do Jira: o rascunho só some quando o Jira confirma — Task 2.
5. **+** de um vão da grade (não o do topo): restaura o rascunho igual — Task 2 abre o editor com o mesmo objeto que o
   vão emite (`{started, timeSpentSeconds}`).

---

### Task 1: `WorklogDraftService`

**Files:**
- Create: `src/plaid/components/grid/worklog-editor/worklog-draft.service.ts`
- Test: `src/plaid/components/grid/worklog-editor/worklog-draft.service.spec.ts`

**Interfaces:**
- Produces:
  - `export interface WorklogDraft { issue: Issue | null; comment: string; }`
  - `@Injectable({providedIn: 'root'}) export class WorklogDraftService` com `constructor(authFacade: AuthFacade)`,
    `get(): WorklogDraft | null`, `keep(draft: WorklogDraft): void`, `clear(): void`.
- Regras: `keep` com `issue` nulo e comentário vazio ou só espaços equivale a `clear`. O rascunho pertence ao último
  usuário não nulo visto (`user.self`). Apaga quando `authFacade.getAuthInfo$()` emite `null` (logout) e quando
  `getAuthenticatedUser$()` emite um usuário com `self` diferente do dono. Usuário `null` sozinho (erro 401) não apaga.

- [ ] **Step 1: Testes que falham**

Fake de `AuthFacade` com `authInfo$ = new BehaviorSubject<AuthInfo>({jiraUrl: 'https://jira.test', username: 'a',
password: 'a'})` e `user$ = new BehaviorSubject<User>({self: 'https://jira.test/rest/api/2/user?accountId=a'})`;
`ISSUE = {id: '10002', key: 'E2E-2', fields: {summary: 'Fake issue 2'}}`.

```ts
it('returns nothing before anything is kept', () => expect(service.get()).toBeNull());
it('returns the kept issue and comment', () => {
  service.keep({issue: ISSUE, comment: 'Draft'});
  expect(service.get()).toEqual({issue: ISSUE, comment: 'Draft'});
});
it('keeps a comment without an issue', ...);            // keep({issue: null, comment: 'Draft'}) → get() igual
it('treats no issue and a blank comment as no draft', ...); // keep(ISSUE,'Draft'); keep({issue: null, comment: '  '}) → null
it('clear() removes the draft', ...);
it('drops the draft on logout even if the editor keeps it while closing', () => {
  user$.next(null);                                   // logout() zera o usuário primeiro: o editor fecha e guarda
  service.keep({issue: ISSUE, comment: 'Draft'});
  authInfo$.next(null);                               // depois as credenciais somem
  expect(service.get()).toBeNull();
});
it('drops the draft when another account logs in', ...);   // keep; user$.next({self: '...accountId=b'}) → null
it('keeps the draft when the same account logs in again after an authentication error', ...);
// keep; user$.next(null); user$.next({self: '...accountId=a'}) → get() ainda é o rascunho
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `timeout 300 pnpm test --include src/plaid/components/grid/worklog-editor/worklog-draft.service.spec.ts`
Expected: falha de compilação/import (`worklog-draft.service` não existe).

- [ ] **Step 3: Implementar `WorklogDraftService`** conforme as Interfaces (assinaturas no construtor, uma
  `BehaviorSubject` não é necessária: campos privados bastam).

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo do Step 2. Expected: 8 passed.

- [ ] **Step 5: Commit** — `feat: in-memory draft for a new worklog, dropped on logout or account change`

---

### Task 2: Editor e picker usam o rascunho

**Files:**
- Modify: `src/plaid/components/grid/worklog-editor/worklog-editor.component.ts`,
  `worklog-editor.component.html` (botão Cancel e picker),
  `issue-picker-cloud/issue-picker-cloud.component.ts` (nova saída)
- Test: `src/plaid/components/grid/worklog-editor/worklog-editor.component.spec.ts`

**Interfaces:**
- Consumes: `WorklogDraftService` (Task 1).
- Produces:
  - `IssuePickerCloudComponent`: `@Output() suggestedIssueChange = new EventEmitter<Issue>()`; a assinatura de
    sugestões emite nela (não mais em `issueChange`). `issueChange` passa a significar só escolha do usuário.
  - `WorklogEditorComponent`:
    - construtor ganha `private worklogDraft: WorklogDraftService` como último parâmetro;
    - `issuePickedByHand = false` (zerado a cada `set worklog`);
    - `selectIssue(issue: Issue): void` — escolha à mão: aplica a issue e marca `issuePickedByHand = true`;
    - `applySuggestedIssue(issue: Issue): void` — só aplica se `worklog && adding && !issuePickedByHand`;
    - `close(): void` — fecha; se adicionando, `worklogDraft.keep({issue: issuePickedByHand ? worklog.issue : null,
      comment: commentString})`;
    - `cancel(): void` — fecha; se adicionando, `worklogDraft.clear()`;
    - `save()` no modo adicionar: no `next`, `worklogDraft.clear()` e fecha sem guardar;
    - `set worklog` no modo adicionar: com rascunho, aplica a issue dele (marcando `issuePickedByHand`) e o comentário.
  - Template: Cancel chama `cancel()`; picker liga `(suggestedIssueChange)="applySuggestedIssue($event)"`.
  - Esc e clicar fora continuam chamando `close()`; mudança de dias visíveis e de usuário também.

- [ ] **Step 1: Testes que falham**

Editor criado direto pela classe (sem TestBed), com stubs: `cdr = {detectChanges: vi.fn()}`, `authFacade` fake da Task 1,
`worklogFacade = {addWorklog$: vi.fn(() => of({id: '30001'})), updateWorklog$: vi.fn(() => of({}))}`,
`appStateService = {}`, `worklogDraft = new WorklogDraftService(authFacade)`. Antes de abrir, `editor.dateRange =
{start: new Date(2020, 0, 6), end: new Date(2020, 0, 12)}` (fora do período: não mede o painel), `visibleDaysStart = 0`,
`visibleDaysEnd = 6`. Abrir para adicionar = `editor.worklog = {started: new Date(2026, 10, 24, 9).getTime(),
timeSpentSeconds: 3600}` (o mesmo formato do **+** do topo e dos vãos). Issues: `ISSUE_1` (sugestão), `ISSUE_2` (à mão),
`ISSUE_3` (de um lançamento existente).

```ts
it('keeps the hand-picked issue and the comment when closed without saving', () => {
  openAdd(); editor.selectIssue(ISSUE_2); editor.commentString = 'Draft'; editor.close();
  openAdd(); // outro horário
  expect(editor.worklog.issue).toBe(ISSUE_2);
  expect(editor.worklog.issueId).toBe('10002');
  expect(editor.issueString).toBe('E2E-2 - Fake issue 2');
  expect(editor.commentString).toBe('Draft');
});
it('does not keep an issue that only came from the suggestion', ...);   // applySuggestedIssue(ISSUE_1); comment; close() → draft.get() = {issue: null, comment: 'Draft'}
it('a suggestion does not replace an issue picked by hand', ...);       // selectIssue(ISSUE_2); applySuggestedIssue(ISSUE_1) → worklog.issue ISSUE_2
it('a suggestion does not replace the draft issue when reopening', ...); // draft com ISSUE_2; openAdd(); applySuggestedIssue(ISSUE_1) → ISSUE_2
it('Cancel discards the draft', ...);                                    // select; comment; cancel(); openAdd() → issueId undefined, commentString undefined; draft.get() null
it('keeps the draft when the day leaves the visible days', ...);         // select; comment; editor.visibleDaysStart = 3 (24/11/2026 é terça=2) → worklog null; draft.get() com ISSUE_2
it('drops the draft only once the entry is added', () => {
  const response = new Subject<Worklog>();
  worklogFacade.addWorklog$.mockReturnValue(response);
  openAdd(); editor.selectIssue(ISSUE_2); editor.commentString = 'Draft'; editor.save();
  expect(worklogDraft.get()).not.toBeNull();
  response.next({id: '30001'}); response.complete();
  expect(worklogDraft.get()).toBeNull();
  expect(editor.worklog).toBeNull();
});
it('editing an existing entry neither uses nor erases the draft', ...);
// draft com ISSUE_2/'Draft'; editor.worklog = {id: '5', issueId: '10003', issue: ISSUE_3, comment: 'Old', started, timeSpentSeconds}
// → worklog.issue ISSUE_3, commentString 'Old'; applySuggestedIssue(ISSUE_1) não muda; cancel() → draft intacto
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `timeout 300 pnpm test --include src/plaid/components/grid/worklog-editor/worklog-editor.component.spec.ts`
Expected: falha (construtor sem `worklogDraft`, `applySuggestedIssue`/`cancel` inexistentes).

- [ ] **Step 3: Picker** — `suggestedIssueChange` como nas Interfaces.

- [ ] **Step 4: Editor e template** — como nas Interfaces. `close()`, `cancel()` e o sucesso do Add usam um método
  privado comum que emite `cancelEdit` e zera `worklog`.

- [ ] **Step 5: Rodar e ver passar**

Run: o mesmo do Step 2, depois `timeout 300 pnpm test`. Expected: 8 novos passam; suíte unitária inteira verde.

- [ ] **Step 6: Commit** — `feat: keep the new worklog's issue and comment until it is added or cancelled`

---

### Task 3: Fluxo no navegador, documentação e verificação final

**Files:**
- Modify: `e2e/fake-jira.ts`, `README.md` (seção "Adding entries")
- Create: `e2e/worklog-draft.spec.ts`

**Interfaces:**
- Consumes: comportamento das Tasks 1–2.
- Produces: `FakeJiraOptions.suggestedIssueCount?: number` (padrão 0: buscas sem `worklogDate` devolvem as issues
  `E2E-1..N`); `POST /rest/api/2/issue/{id}/worklog` responde o lançamento criado (`id` novo, `issueId`, `author`
  = usuário, e `started`/`timeSpentSeconds`/`comment` do corpo). Os testes de navegador atuais não mudam.

- [ ] **Step 1: Teste de navegador que falha (no código anterior às Tasks 1–2 falharia; aqui falha por falta do suporte no
  Jira falso)**

```ts
test('keeps issue and comment after clicking outside, until the entry is added', async ({page}) => {
  await installFakeJira(page, {issueCount: 1, suggestedIssueCount: 2});
  await page.goto('/');
  const add = page.locator('a[title="Add new entry"]');
  const issueField = page.locator('#issue-picker-toggle');
  const comment = page.locator('plaid-worklog-editor textarea');
  const editorOpen = page.locator('plaid-worklog-editor .wrapper.visible');

  await add.click();
  await expect(issueField).toHaveValue('E2E-1 - Fake issue 1');          // sugestão
  await issueField.click();
  await page.locator('plaid-issue-picker-cloud plaid-issue-details').filter({hasText: 'E2E-2'}).first().click();
  await expect(issueField).toHaveValue('E2E-2 - Fake issue 2');
  await comment.fill('Draft comment');
  await page.locator('plaid-worklog-editor .wrapper').click({position: {x: 5, y: 5}}); // fora do painel
  await expect(editorOpen).toHaveCount(0);

  await add.click();
  await expect(issueField).toHaveValue('E2E-2 - Fake issue 2');
  await expect(comment).toHaveValue('Draft comment');

  await page.locator('#save-button').click();
  await expect(editorOpen).toHaveCount(0);
  await add.click();
  await expect(comment).toHaveValue('');
  await expect(issueField).toHaveValue('E2E-1 - Fake issue 1');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `timeout 300 pnpm exec playwright test e2e/worklog-draft.spec.ts`
Expected: falha esperando `E2E-1 - Fake issue 1` (o Jira falso ainda não devolve sugestões).

- [ ] **Step 3: Jira falso** — `suggestedIssueCount` e o `POST` de lançamento como nas Interfaces.

- [ ] **Step 4: Rodar e ver passar** — o mesmo do Step 2. Expected: 1 passed.

- [ ] **Step 5: README** — em "Adding entries", uma frase: fechar o editor sem adicionar (clicar fora ou Esc) guarda a
  issue escolhida e o comentário para o próximo lançamento; Cancel descarta.

- [ ] **Step 6: Suíte inteira, uma vez**

```bash
timeout 600 pnpm check
timeout 600 pnpm test:e2e
```
Expected: check `exit=0`; Playwright `9 passed`.

- [ ] **Step 7: Commit** — `test: e2e for the add-worklog draft; docs: README`

- [ ] **Step 8: Revisão final do branch inteiro** (revisor independente), correções com teste RED→GREEN.

- [ ] **Step 9: Teste manual do usuário (Windows, Jira real)** — abrir **+**, escolher issue, comentar, clicar fora,
  abrir **+** de novo (topo e um vão) e ver os campos; Esc guarda; Cancel apaga; Add salva e o próximo **+** vem limpo.
  Merge no `master` só com o ok do usuário.
