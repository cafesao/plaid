# Rascunho ao adicionar lançamento — design

Data: 2026-11-23 · Branch: `feat/add-worklog-draft` (a partir do `master` em `541e4a8`)

## Intenção

Ao adicionar um lançamento, o usuário escolhe a issue e escreve o comentário. Hoje, clicar fora do painel (ou apertar
Esc) fecha o editor e perde tudo o que foi digitado. O usuário quer que o que digitou só suma quando ele de fato alocar
a hora (clicar em **Add** e o lançamento ser salvo).

## Objetivos

1. No modo de adicionar, fechar o editor sem salvar (clicar fora ou Esc) guarda issue e comentário.
2. Ao abrir o editor de adicionar de novo (qualquer **+**), issue e comentário guardados voltam preenchidos.
3. O rascunho some quando o lançamento é salvo com sucesso, quando o usuário clica em **Cancelar** ou quando sai/troca
   de conta.

## Fora do escopo

- Editar um lançamento existente: continua como hoje (o lançamento já está no Jira).
- Guardar o rascunho entre execuções do app (fechou o Plaid, o rascunho se perde), como o cache das semanas.
- Guardar dia, horário ou duração: vêm de onde o usuário clicar no **+**.
- Mais de um rascunho.

## Anti-objetivos (falha mesmo que "funcione")

- A sugestão automática de issue sobrescrever a issue do rascunho.
- O rascunho de uma conta aparecer em outra conta ou outro Jira.
- Um rascunho aparecer no editor de um lançamento existente, ou ser apagado ao editar um.
- Mudar o comportamento de salvar, arrastar, esticar ou dos atalhos (Enter, Esc com nuvem aberta).

## Abordagens consideradas

- **Fecha e guarda o rascunho** — escolhida pelo usuário. O editor fecha como hoje, então dá para olhar a grade
  livremente, e nada digitado se perde até salvar.
- *Não fecha ao clicar fora* — mais simples, mas Esc e Cancelar ainda apagariam, e não daria para olhar a grade sem
  fechar o editor.
- *Pergunta antes de descartar* — nada some sem confirmação, mas é um clique a mais toda vez.

## Comportamento (decidido)

| Ação no modo adicionar | Editor | Rascunho |
|---|---|---|
| Clicar fora do painel | fecha | guarda |
| Esc (sem nuvem aberta) | fecha | guarda |
| Botão Cancelar | fecha | apaga |
| Add salvo com sucesso | fecha | apaga |
| Add com erro | continua aberto (como hoje) | continua |
| Sair da conta / trocar de Jira | fecha | apaga |
| Editor fechado porque o dia saiu dos dias visíveis | fecha | guarda |

- O que entra no rascunho é só o que o usuário fez (decisão do Claude, revisar): a issue que ele
  escolheu à mão e o comentário que digitou. Se ele não escolheu issue, a próxima abertura usa a sugestão automática como
  hoje.
- Ao abrir com rascunho que tem issue, a sugestão automática não troca essa issue. Isso também corrige o caso atual em
  que a sugestão chega depois de o usuário ter escolhido uma issue e troca a escolha dele.

## Restrições

- Arquitetura atual (facade → api → state; componentes NgModule com zone). Sem dependência nova.
- Nenhuma mudança visual além dos campos aparecerem preenchidos.

## Como provar (uma prova de cada comportamento; suíte inteira uma vez no fim)

- Teste unitário (Vitest) da regra do rascunho: guarda ao fechar, devolve ao abrir, apaga com Cancelar, Add e troca de
  conta; sugestão não sobrescreve issue do rascunho; editor de lançamento existente não usa nem apaga. ~5 min.
- Um teste de navegador (Playwright, Jira falso): adicionar, escolher issue, digitar comentário, clicar fora, abrir **+**
  de novo e ver issue e comentário; salvar e abrir **+** de novo vazio. ~5 min.
- `pnpm check` e `pnpm test:e2e` uma vez no fim. ~2 min.
- Manual (usuário, Windows): o mesmo fluxo com o Jira real. ~3 min.

## Deixado para quem constrói

- Onde o rascunho mora (campo no editor, que é único, ou um serviço pequeno) e como saber se a issue foi escolhida à mão.
- Como impedir a sugestão de sobrescrever a issue (ignorar a emissão quando já há issue escolhida à mão, ou não pedir a
  sugestão quando há rascunho).
