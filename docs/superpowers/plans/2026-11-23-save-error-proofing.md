# Salvar à prova de erro — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erro do Jira ao salvar não trava o editor; Enter e Esc respeitam o estado de "salvando" e a falta de issue.

**Architecture:** Uma regra `canSave()` no editor, usada pelo botão, pelo Enter e como guarda do `save()`; `save()` trata
erro saindo do "salvando"; Esc ignora enquanto salva.

**Tech Stack:** Angular 22 (NgModule, zone), RxJS, Vitest, Playwright com Jira falso.

**Spec:** `docs/superpowers/specs/2026-11-23-save-error-proofing-design.md`

## Global Constraints

- Vale para adicionar e editar; sem mudança visual; erros de login/conexão continuam como hoje.
- Regras do rascunho inalteradas, exceto Esc durante o envio (não fecha).
- Node 26 (`fnm use 26` no WSL), `pnpm`, `timeout` em todo comando que pode travar; commits sem `Claude-Session`.
- Uma prova por comportamento; `pnpm check` e `pnpm test:e2e` uma vez no fim (~2 min).

## Review Focus

1. Erro 429 depois das tentativas e erro 404 de lançamento: chegam ao editor como erro comum — Task 1 usa 500; o caminho
   é o mesmo `error` do subscribe.
2. Erro ao editar lançamento existente: mesmo tratamento que adicionar — Task 1.
3. Duplo clique rápido no botão Add: a guarda do `save()` barra o segundo — Task 1 (dois `save()` seguidos).
4. Erro de login (401) durante o envio: continua reenviando depois do login, sem sair do "salvando" antes — não muda
   (o interceptor não propaga erro); conferir na revisão.
5. Enter no campo de comentário sem Ctrl continua quebrando linha — não muda; conferir na revisão.

---

### Task 1: Editor

**Files:**
- Modify: `src/plaid/components/grid/worklog-editor/worklog-editor.component.ts`, `worklog-editor.component.html`
- Test: `src/plaid/components/grid/worklog-editor/worklog-editor.component.spec.ts` (novo `describe`)

**Interfaces:**
- Produces: `canSave(): boolean` = `!saving && !!worklog && !!worklog.issueId`. Botão Add/Save: `[disabled]="!canSave()"`.
  `save()` retorna sem fazer nada quando `!canSave()`; no `error` do subscribe (adicionar e editar): `saving = false` e
  `cdr.detectChanges()`, editor continua aberto. `onKeydown` Escape: fecha só se `!saving`. Enter continua chamando
  `save()` (a guarda decide).

- [ ] **Step 1: Testes que falham** — no mesmo arquivo de spec, `describe('WorklogEditorComponent saving')` com o mesmo
  setup do `describe` existente, mais `editor.cancelButton = {nativeElement: document.createElement('button')}` e
  `editor.commentTextArea = {nativeElement: document.createElement('textarea')}` (o Enter compara o foco com eles), e
  `const key = (k: string) => editor.onKeydown(new KeyboardEvent('keydown', {key: k}))`.

```ts
it('leaves saving and stays open when Jira rejects a new entry', ...);
// addWorklog$ → throwError(() => new HttpErrorResponse({status: 500})); openAdd(); selectIssue(ISSUE_2); commentString='Draft'; save()
// → saving false; worklog não nulo; commentString 'Draft'
it('leaves saving and stays open when Jira rejects an edited entry', ...); // updateWorklog$ com erro; lançamento existente
it('does not send twice when saving is triggered again', ...);   // addWorklog$ → new Subject(); save(); save(); key('Enter') → chamado 1 vez
it('Enter does nothing without an issue', ...);                  // openAdd() sem issue; key('Enter') → addWorklog$ não chamado; saving false
it('Escape does nothing while saving', ...);                     // pendente; save(); key('Escape') → worklog não nulo
it('Escape still closes when not saving', ...);                  // openAdd(); key('Escape') → worklog nulo
```

- [ ] **Step 2: Rodar e ver falhar** — `timeout 300 pnpm test --include src/plaid/components/grid/worklog-editor/worklog-editor.component.spec.ts`
  Expected: falham os 5 primeiros (o último já passa: é a regressão do caminho normal).
- [ ] **Step 3: Implementar** conforme Interfaces.
- [ ] **Step 4: Rodar e ver passar** — o mesmo comando, depois `timeout 300 pnpm test`. Expected: tudo verde.
- [ ] **Step 5: Commit** — `fix: saving errors no longer lock the editor; Enter and Esc respect saving`

---

### Task 2: Navegador, versão 1.1.1 e entrega

**Files:**
- Modify: `e2e/fake-jira.ts`, `package.json` (versão), `changelog.md`
- Create: `e2e/worklog-save-error.spec.ts`

**Interfaces:**
- Produces: `FakeJiraOptions.failWorklogPosts?: number` — os primeiros N `POST` de lançamento respondem HTTP 500 (com
  CORS), os seguintes funcionam como hoje.

- [ ] **Step 1: Teste de navegador que falha**

```ts
test('a rejected save leaves the editor usable and the next Add works', async ({page}) => {
  await installFakeJira(page, {issueCount: 1, suggestedIssueCount: 1, failWorklogPosts: 1});
  await page.goto('/');
  await page.locator('a[title="Add new entry"]').click();
  await expect(page.locator('#issue-picker-toggle')).toHaveValue('E2E-1 - Fake issue 1');
  await page.locator('plaid-worklog-editor textarea').fill('Retry me');
  await page.locator('#save-button').click();
  const errorModal = page.locator('plaid-error-modal .modal.open');
  await expect(errorModal).toBeVisible();
  await errorModal.getByRole('button', {name: 'Close'}).click();
  await expect(page.locator('#save-button')).toBeEnabled();
  await expect(page.locator('plaid-worklog-editor textarea')).toHaveValue('Retry me');
  await page.locator('#save-button').click();
  await expect(page.locator('plaid-worklog-editor .wrapper.visible')).toHaveCount(0);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `timeout 300 pnpm exec playwright test e2e/worklog-save-error.spec.ts`
  Expected: falha (o Jira falso ainda aceita o primeiro envio: o diálogo não aparece).
- [ ] **Step 3: Jira falso** — `failWorklogPosts` como nas Interfaces.
- [ ] **Step 4: Rodar e ver passar** — o mesmo comando. Expected: 1 passed.
- [ ] **Step 5: Versão 1.1.1** — `package.json` `version: "1.1.1"`; `changelog.md` com a entrada 1.1.1 (erro ao salvar
  não trava o editor; Enter/Esc não duplicam).
- [ ] **Step 6: Suíte inteira, uma vez** — `timeout 600 pnpm check` (exit 0) e `timeout 600 pnpm test:e2e` (10 passed).
- [ ] **Step 7: Commit** — `test: e2e for a rejected save; release: 1.1.1`
- [ ] **Step 8: Revisão final do branch** (revisor independente), correções com teste RED→GREEN.
- [ ] **Step 9: Push do branch, instalador no Windows e instalação** (`pnpm build` + `pnpm package` em `C:\dev\plaid`,
  `Plaid Setup 1.1.1.exe /S`), conferindo `DisplayVersion 1.1.1`. Merge no `master` só com o ok do usuário.
