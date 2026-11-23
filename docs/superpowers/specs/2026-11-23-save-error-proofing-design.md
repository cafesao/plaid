# Salvar à prova de erro — design

Data: 2026-11-23 · Branch: `fix/save-errors` (a partir do `master` em `b5b9b24`) · Aprovado pelo usuário em 2026-11-23.

## Intenção

Salvar um lançamento (adicionar ou editar) nunca pode deixar o editor travado nem enviar o mesmo lançamento duas vezes.

## Problemas confirmados no código

- `save()` do editor não trata erro: se o Jira recusa (erro que não é de login, ex.: 400/500/429 depois das tentativas),
  o app mostra o diálogo "Application error", mas o editor fica em "salvando" (Cancel desabilitado, botão girando).
- Enter chama `save()` sem checar se há issue ou se já está salvando: duplica o lançamento ou envia sem issue.
- Esc fecha o editor durante o envio; reabrindo, dá para enviar de novo.

## Comportamento (decidido)

| Situação | Comportamento |
|---|---|
| Jira recusa o envio (erro que chega ao editor) | sai do "salvando"; editor continua aberto com tudo o que foi digitado; o diálogo de erro atual explica |
| Enter | faz o mesmo que o botão Add/Save: nada quando o botão está desabilitado (salvando ou sem issue) |
| Esc durante o envio | não faz nada (como Cancel e clicar fora já fazem) |

Vale para adicionar e para editar. Sem mudança visual. Erros de login e de conexão continuam como hoje (o app pede login
ou reconecta e reenvia sozinho).

## Abordagens

- **Tratar no editor** (escolhida): uma regra única "pode salvar" usada pelo botão, pelo Enter e pelo próprio `save()`, e
  tratamento de erro no `save()`. Pequena, no lugar onde o problema está.
- *Tratar no facade* devolvendo sucesso/erro: espalha a mudança sem ganho para o usuário.

## Fora do escopo

Mensagem de erro nova (o diálogo atual basta), teto do `Retry-After`, mudanças no rascunho além de Esc durante o envio.

## Como provar

Testes unitários do editor para cada linha da tabela; um teste de navegador em que o Jira falso recusa o primeiro envio,
o diálogo aparece, e o segundo Add funciona. `pnpm check` e `pnpm test:e2e` uma vez no fim; revisão independente;
versão 1.1.1 instalada no Windows para o usuário conferir; merge só com o ok dele.
