# Base rápida e confiável (Jira Cloud) — design

Data: 2026-11-23 · Branch: `perf/base-cloud`

## Intenção

Antes de começar features novas, deixar o Plaid numa base atualizada, rápida, confiável e com testes onde as
features vão mexer. O app é usado com Jira Cloud (softohq.atlassian.net) e será testado no Windows.

## Problemas a corrigir (achados no código em 2026-11-23)

1. **Tela não atualiza sozinha.** O Angular 21 passou a iniciar apps sem o mecanismo de detecção de mudanças por
   zone.js (`bootstrapModuleFactory` injeta `provideZonelessChangeDetectionInternal()`), e o app foi escrito
   contando com ele: `PlaidComponent` e outros assinam observables e atribuem campos simples. Sem zone, a tela só
   redesenha quando há um evento de template (clique). Efeitos: o bug 1 de `docs/bugs.md` (loading ao trocar de
   semana só some ao clicar), atualização automática periódica que não aparece, contagem de reconexão parada.
2. **Carregamento da semana pesado.** `WorklogFacade` faz 1 busca JQL e depois, para cada issue,
   `GET /rest/api/2/issue/{id}/worklog` sem filtro: traz o histórico inteiro de worklogs da issue (todas as pessoas,
   todas as datas), com `mergeMap` sem limite de concorrência. Issues antigas (reunião, suporte) deixam tudo lento e
   o burst pode bater no limite de requisições do Jira Cloud (HTTP 429).
3. **Busca para em 50 issues.** `/rest/api/3/search/jql` pagina por `nextPageToken`/`isLast` e não devolve
   `startAt`/`total`. A condição do `expand` em `streamAllIssuesForWorklogDateRange$` vira `NaN < undefined` e só a
   primeira página (50 issues, padrão) é lida. Lançamentos somem sem aviso.
4. **Sem cache.** Cada troca de semana busca tudo de novo; voltar para uma semana já vista custa o mesmo.
5. **Jira Server quebrado desde 2025-10.** `/rest/api/3/search/jql` não existe no Server/Data Center. O README ainda
   diz "Works both with Jira Server and Jira Cloud".

## Objetivos

- A tela reflete mudanças de estado sem interação (loading some sozinho, refresh periódico aparece, contagem anda).
- Semana com qualquer número de issues carrega todos os worklogs do usuário no período.
- Cada issue traz só os worklogs do período visível; no máximo 4 requisições ao Jira em paralelo.
- Voltar a um período já visto mostra os dados na hora e confere com o Jira em segundo plano.
- Dependências em versões com suporte: Electron 45, últimos patches de Angular 21 e Playwright.
- README e CLAUDE.md dizem que só Jira Cloud é suportado e por quê.
- Testes cobrindo carregamento, cache, atualização da tela e o fluxo de semana ponta a ponta.

## Fora do escopo

- Suporte a Jira Server/Data Center (decisão do usuário: só Cloud).
- Migrar componentes para signals/zoneless. Features novas podem usar signals; convivem com zone.
- Cache em disco (decisão do usuário: só memória).
- `webSecurity: false` no `BrowserWindow` (fica como tarefa própria, de segurança).
- TypeScript 7, mudança visual, features novas.

## Anti-objetivos (falha mesmo que "funcione")

- Mostrar dado do cache e nunca conferir com o Jira, ou cache que ignora edições feitas no app.
- Perder worklogs em silêncio (paginação, filtro de data, fuso).
- Diff espalhado pelos 20 componentes para resolver o item 1.
- Spinner de loading cobrindo dados do cache que já estão na tela.

## Abordagens consideradas

**Atualização da tela**
- *Religar zone.js* (`provideZoneChangeDetection()` no `PlaidModule`) — **escolhida pelo usuário**. Uma linha,
  corrige o app inteiro, código existente fica igual; zone.js já está no bundle (polyfills).
- *Migrar para zoneless com signals* — rumo do Angular, mas mexe em todos os componentes antes das features.

**Cache de períodos**
- *Em memória* — **escolhida pelo usuário**. Voltar a um período visto é instantâneo; confere em segundo plano;
  some ao fechar o app.
- *Em disco* — app abriria com a semana pronta, mas grava worklogs na máquina e pode mostrar dado velho.

**Testes** — usuário aprovou as quatro provas da seção "Testes", uma vez cada, suíte inteira uma vez no fim.

## Como (decidido)

### 1. Detecção de mudanças
- Adicionar `provideZoneChangeDetection({ eventCoalescing: true })` aos `providers` do `PlaidModule`.
- Corrige o bug 1 de `docs/bugs.md`; marcar como resolvido lá.

### 2. Busca de issues (paginação nova)
- `WorklogApi.getIssuesForWorklogDateRange$` passa a aceitar `nextPageToken` em vez de `startAt` e pede
  `maxResults=100`.
- `SearchResults` ganha `nextPageToken?: string` e `isLast?: boolean`.
- O `expand` segue enquanto `isLast !== true` e existir `nextPageToken`.
- `IssueApi.search$` (seletor de issues) tira o `startAt=0`, que o endpoint novo não usa; o resto fica.

### 3. Worklogs só do período
- `WorklogApi.getWorklogsForIssue$` recebe o período e envia `startedAfter` e `startedBefore` (milissegundos UNIX)
  em `GET /rest/api/2/issue/{id}/worklog`. Paginação dessa rota continua por `startAt`/`total` (inalterada no Cloud).
- `startedAfter` = início do primeiro dia visível; `startedBefore` = início do dia seguinte ao último dia visível.
- O filtro no cliente (autor + data) continua como rede de segurança.
- Endpoints de worklog continuam na API v2 (comentário em texto simples; a v3 usa ADF).

### 4. Limite de requisições
- `mergeMap(issue => ..., 4)`: no máximo 4 issues buscando worklogs ao mesmo tempo.
- Em HTTP 429, esperar o `Retry-After` (ou 2 s se ausente) e tentar de novo, até 3 vezes. *(decisão do Claude:
  complementa o limite de concorrência; o usuário viu o risco de 429 como efeito do problema 2)*

### 5. Cache em memória
- Requisitos:
  - Período já buscado nesta sessão aparece na hora ao ser revisitado (troca de semana), sem spinner de loading.
  - Em seguida o app busca de novo em segundo plano (sem spinner) e substitui o que estiver diferente.
  - Adicionar, editar e excluir worklog atualiza também o cache, não só o estado visível.
  - Refresh periódico e botão de refresh atualizam o período visível e o cache.
  - Logout, troca de usuário ou de Jira limpa o cache.
  - Só memória; nada vai para `localStorage`/disco.
- Primeira visita a um período continua com o comportamento atual (spinner e lista crescendo conforme chega).
- Botão de atualizar (F5 / Ctrl+R) e o recarregamento após login/reconexão continuam como hoje: spinner e lista
  reconstruída conforme chega, mesmo com o período no cache *(decisão do usuário: é uma ação pedida, o spinner é
  o sinal de que está atualizando)*. Ao terminar, o resultado também atualiza o cache.
- O anti-objetivo "spinner cobrindo dados do cache" vale para troca de semana e refresh periódico, não para essas
  ações explícitas.

### 6. Atualizações de dependências
- Electron 41 → 45 (a 41 está fora do suporte de segurança). Revisar breaking changes das versões 42–45 para o que
  `bootstrap.js`, `preload.js` e `window-state.js` usam: `BrowserWindow`, `webRequest.onBeforeSendHeaders`,
  `nativeTheme`, `Menu`, `ipcMain`/`contextBridge`, `requestSingleInstanceLock`. `electron-builder` e
  `electron-updater` no último 26.x/6.x compatível.
- Angular 21.2.x e Angular CLI/build no último patch; Playwright no último 1.x.
- `npm ci` limpo precisa continuar passando sem `--legacy-peer-deps`.

### 7. Documentação
- README: trocar "Works both with Jira Server and Jira Cloud" por aviso de que só Jira Cloud é suportado; Jira
  Server/Data Center parou de funcionar em 2025-10, quando a busca migrou para `/rest/api/3/search/jql` (exigência
  do Cloud), que não existe no Server.
- CLAUDE.md: mesma correção na visão geral.

## Testes (aprovados; uma prova de cada coisa)

| Prova | O que cobre | Custo estimado |
|---|---|---|
| Jest: carregamento | paginação por `nextPageToken` (2+ páginas, >50 issues); `startedAfter`/`startedBefore` corretos; nunca mais de 4 requisições de worklog abertas; retry em 429; cache (revisita imediata sem spinner, refresh em segundo plano, edição atualiza cache, logout limpa) | ~15 min |
| Jest: atualização da tela | `PlaidModule` provê detecção por zone (não zoneless) | ~5 min |
| Playwright com Jira falso | `page.route` simulando o Jira: abrir semana com 2 páginas de issues → todos os worklogs aparecem e o loading some **sem nenhum clique**; ir para a semana seguinte e voltar → dados aparecem antes da nova resposta do Jira | ~20 min, roda em ~1 min |
| Manual no Windows (usuário) | app abre, login, semana carrega, troca de semana; **adicionar, editar e excluir um lançamento de teste** no Jira real (única prova de que salvar continua funcionando após o Electron 45) | ~8 min do usuário |

- Teste manual no Windows roda do código, no clone `C:\dev\plaid` (`git pull`, `npm ci`, `npm run serve-dev` +
  `npm run start-dev`). Sem instalador, sem mudança de versão nesta entrega.
- Suíte inteira (Jest + Playwright) roda uma vez, no fim.
- O e2e roda no Chromium contra o dev server (porta 4300), não no Electron; as respostas falsas precisam dos
  cabeçalhos CORS (o browser de teste não tem `webSecurity: false`).

## Decisões do Claude (revisar)

- Retry em 429 não pode abrir o diálogo de erro do `AuthInterceptor` antes de esgotar as tentativas.
- O limite de 4 vale para as requisições de worklog por issue, não para o app inteiro.
- A busca JQL usa o período alargado em 1 dia para cada lado (o `worklogDate` segue o fuso do perfil no Jira, que
  pode diferir do fuso da máquina); o filtro no cliente por data corta o excesso.
- Refresh em segundo plano não sobrescreve worklog adicionado, editado ou excluído enquanto ele rodava.
- Logout, troca de usuário ou de Jira limpa o cache (evita mostrar dados de outra conta).
- O switch `disable-features=OutOfBlinkCors` em `bootstrap.js` fica como está: removê-lo exigiria provar contra o
  Jira real, e ele não pesa em desempenho.

## Deixado para quem constrói

- Estrutura interna do cache (chave por período ou por dia, limite de tamanho), desde que cumpra os requisitos.
- Onde mora a lógica de retry (interceptor ou operador na API).
- Forma de expor dados de teste no e2e (fixtures, helpers).
