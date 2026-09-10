# Notion Sync v1 — registro de validação

Data: 2026-09-10. Branch: `feat/ai-production-integrations`.

**Resultado: concluído e validado ao vivo** no workspace Kizuna, pelo app Electron real. A
validação encontrou quatro defeitos que os testes com pontes simuladas não alcançavam; os
quatro estão corrigidos e cobertos por testes de regressão verificados por mutação.

Este documento separa o que foi **executado e observado** do que continua **fora do alcance**.
Nada aqui é marcado como validado por inferência a partir de teste automatizado.

## Gate automatizado — final

| Verificação | Resultado |
| --- | --- |
| `npm test` (Vitest) | 45 arquivos, 216 testes, verde |
| `npm test` (`node --test`) | 135 testes, verde |
| `npm run build` (addon nativo + `tsc` + `vite build`) | verde |
| `npm run test:e2e` (Playwright) | 46 testes, verde |

## Validação ao vivo com a credencial guardada pelo Hibi

`HIBI_LIVE_NOTION_KEYCHAIN=1 npm run test:notion:live` roda dentro do Electron, porque só o
addon nativo do app lê o item do Keychain. O token nunca foi para variável de ambiente,
histórico de shell ou relatório.

| Verificação | Observado |
| --- | --- |
| Conexão | Aceita pelo Notion |
| Base Hibi Tasks | Exatamente uma fonte de dados |
| Caminho do setup | A criação contra uma página inexistente **chegou ao Notion** e voltou 404; nada foi criado |
| Tarefa de validação de 2026-09-09 | Adotada como tarefa fixa: renomeada e concluída, sem página nova |
| Leitura e atualização | Duração aplicada e revisão alterada |
| Conflito de dois lados | Detectado, com `skip` como decisão padrão |

## App Electron real, com a confirmação do notch

Modo de produção, dirigido por automação sobre as janelas reais do Electron. Os cliques de
Confirmar e Cancelar foram feitos **na janela real da overlay do notch**, não por IPC simulado.
Todos os demais itens da prévia ficaram em Ignorar; a única escrita remota foi na tarefa fixa.

| Fase | Observado |
| --- | --- |
| Primeira confirmação depois de abrir o app | A overlay renderizou "Confirmar" e "Cancelar" |
| Cancelar pelo notch | Nenhuma escrita remota; o item continuou pendente na releitura |
| Confirmar pelo notch uma importação | Tarefa importada e vinculada; checkpoint e última sincronização gravados |
| Confirmar pelo notch uma escrita remota | Uma execução no Notion, aviso de sucesso, releitura em dia |
| Edição no Notion **2 s** depois da nossa escrita | `conflict`, padrão `skip`; resolvido com Manter Notion pelo notch |

Como os lados foram alterados: a edição local foi feita no armazenamento do workspace seguida
de recarga, no lugar de preencher a tela de Tarefas; a edição do lado do Notion foi uma escrita
direta pela ponte do app, no lugar de alguém editando no Notion. As confirmações e a leitura
do conflito foram o fluxo real da interface.

## Defeitos encontrados e corrigidos

| Defeito | Efeito para quem usa | Correção |
| --- | --- | --- |
| `prepareWrite` do Notion não era idempotente | "Prepare Hibi Tasks" → Confirmar falhava **depois** da aprovação | `96a889b`; agora chega ao Notion ao vivo |
| `place` recebia o objeto `bounds` em vez de quatro números | **Nenhuma** confirmação interativa aparecia no notch — só o cartão dentro do app | `8b9dc94`; quebrado desde `197da2e` (2026-09-06) |
| A primeira apresentação chegava antes de a overlay assinar o canal | A primeira confirmação depois de abrir o app era um painel vazio capturando o mouse | `af65c10`; a overlay busca a apresentação ativa ao montar |
| O Notion arredonda `last_edited_time` para o minuto | Uma edição no Notion no mesmo minuto da última sincronização aparecia como "local changed" com padrão Manter Hibi — **sobrescrita silenciosa** | `37c7d6a`; conteúdo comparado com o que foi sincronizado |

Por que escaparam: nenhuma ponte falsa dos testes do notch implementava `place`, e o optional
chaining pulava a chamada; o e2e simula a ponte inteira; e o Notion falso do harness gera
revisões com segundos, então nunca reproduzia o arredondamento.

A validação corrige também o registro anterior: a ida e volta de 2026-09-09 passou pelo lote
e não pelo setup, por isso não esbarrou no primeiro defeito.

## Estado deixado

- **Notion:** o único item da base Hibi Tasks é `[hibi-harness] disposable validation task`,
  concluído. As próximas rodadas do harness reaproveitam essa mesma página.
- **App nesta máquina:** a configuração do Notion foi salva apontando para a Hibi Tasks
  existente, sem o identificador da base, que só o setup usa. A tarefa fixa está importada,
  vinculada e concluída no workspace local.

## Fora do alcance desta validação

| Item | Situação |
| --- | --- |
| Retry de um item que falhou no serviço real | Não provocado ao vivo, porque exigiria forçar uma falha real no Notion; coberto pelo e2e |
| Clique humano no painel físico | Os cliques foram na janela real da overlay, por automação |
| Monitor externo, Spaces, tela cheia, sono | Seguem no plano de validação do notch |

## Acabamentos conhecidos, não bloqueantes

- A data da última sincronização sai em 12 h mesmo com a preferência de 24 h ligada. Os
  formatadores por locale estão na branch `feat/ui-foundation`.
- A confirmação diz "Aplicar 1 alterações" — falta a concordância no singular.
- `node scripts/renderer-safety-check.mjs` falha com 2 ocorrências em `src/global.d.ts`. O
  resultado é o mesmo no código anterior a esta rodada: não foi introduzido por ela.
