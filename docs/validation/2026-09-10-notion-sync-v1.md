# Notion Sync v1 — registro de validação

Data: 2026-09-10. Branch: `feat/ai-production-integrations`.

Este documento separa o que foi **executado e observado** do que continua **pendente**.
Nada aqui é marcado como validado por inferência a partir de teste automatizado.

## Gate automatizado — executado em 2026-09-10

| Verificação | Resultado |
| --- | --- |
| `npm test` (Vitest) | 45 arquivos, 214 testes, verde |
| `npm test` (`node --test`) | 130 testes, verde |
| `npm run build` (addon nativo + `tsc` + `vite build`) | verde |
| `npm run test:e2e` (Playwright) | 46 testes, verde |

## Comportamento coberto por teste de interação

Os testes de unidade rodam sem DOM, então estes vivem em `tests/e2e/notion-sync.spec.ts`,
sobre uma ponte que registra tudo que sairia para o Notion:

| Garantia | Como é provada |
| --- | --- |
| Nenhuma escrita antes de confirmar | Preparar o lote deixa `writes` vazio |
| Cancelar no app não escreve | `writes` vazio e o cartão do notch é retirado |
| Confirmar pelo notch aplica o lote preparado | A execução usa o mesmo `confirmationId` apresentado |
| Cancelar pelo notch não escreve | `writes` vazio |
| Retry reenvia só o pendente | O segundo lote contém exatamente a chave que falhou |
| A base criada no setup fica usável na mesma sessão | Regressão da correção de configurações abaixo |

Cada um foi verificado por mutação: desligar a proteção correspondente no código faz o
teste falhar. Os testes não são vacuosos.

## Ciclo de vida ao vivo — automatizado, ainda não executado contra o Notion real

`scripts/test-live-connectors.mjs` ganhou o ciclo `criar → ler → atualizar → conflito`,
atrás de um **terceiro** opt-in (`HIBI_LIVE_NOTION_LIFECYCLE=1`), acima dos opt-ins de
leitura e de escrita. Ele usa o reconciliador e o mapeamento reais do app, e escreve pelo
mesmo `notion.sync.batch` que a interface envia — não por um atalho do harness.

O conflito que ele valida **não é simulado**: a revisão remota muda porque a etapa
anterior editou de fato a página no Notion; o lado local muda a partir do mesmo
checkpoint. O harness então confere que o plano classifica como `conflict` e que a
decisão padrão é `skip`, isto é, que o padrão não escreve em nenhum dos dois lados.

Está coberto por teste contra um Notion falso fiel ao contrato (`scripts/test-live-connectors.test.mjs`),
incluindo a repetição, que reaproveita a mesma tarefa descartável em vez de acumular páginas.

**Não executado contra o workspace Kizuna.** O token vive no Keychain do macOS e não foi
extraído. Para rodar:

```bash
HIBI_LIVE_CONNECTOR_TEST=1 HIBI_LIVE_CONNECTOR_WRITE_TEST=1 HIBI_LIVE_NOTION_LIFECYCLE=1 \
HIBI_LIVE_CONNECTOR_ID=notion HIBI_LIVE_CONNECTOR_ENDPOINT=https://api.notion.com/v1/ \
HIBI_LIVE_CONNECTOR_ALLOW_HOSTS=api.notion.com HIBI_LIVE_CONNECTOR_TOKEN=<token> \
HIBI_LIVE_CONNECTOR_TARGETS=<dataSourceId> HIBI_LIVE_NOTION_DATA_SOURCE=<dataSourceId> \
npm run test:connectors:live
```

## Defeito encontrado durante esta rodada

**A criação da base falhava depois da aprovação do usuário.** `prepareAction` guarda o que
`prepareWrite` devolve, e `executeApproved` prepara esse valor outra vez — logo, preparar
precisa ser idempotente. Todos os outros conectores satisfazem isso porque validam e
normalizam; o do Notion transformava o payload no corpo da API.

O efeito era direto: "Prepare Hibi Tasks" seguido de Confirmar terminava em
`Notion parent page identifier is invalid`, **depois** de o usuário já ter aprovado a
escrita. Escritas avulsas de página falhavam do mesmo jeito. Só `notion.sync.batch`
funcionava, por preservar os payloads originais das operações — que é exatamente por que
a ida e volta de 2026-09-09 passou apesar do defeito: ela não passou pelo caminho do setup.

Corrigido em `96a889b`. A garantia de allowlist de propriedades não mudou: o corpo continua
sendo montado por `taskProperties`, só que na hora do envio.

Consequência para o registro anterior: a afirmação de que o setup estava validado ao vivo
**não se sustenta**. A base Hibi Tasks existe, mas não foi criada por este caminho.

## Verificação visual — executada

Servidor Vite da worktree, tela Integrações. O painel foi observado nos dois estados:

- **Sem configuração**: cartão de setup, campo da página Kizuna, aviso de que a escrita
  remota exige confirmação.
- **Configurado**: workspace, base, última sincronização, contadores e a prévia com decisão
  por item — `local new` cai em Manter Hibi, `remote new` em Manter Notion, como esperado.

Sem transbordo de layout. Captura em `notion-panel.png` (não versionada).

## Pendente — exige credencial ou ação física

| Item | Por que continua aberto |
| --- | --- |
| Ciclo de vida contra o workspace Kizuna | O token está no Keychain e não foi lido |
| Conflito real de dois lados no serviço | Mesma dependência; o cenário já está automatizado |
| Fluxo manual no app Electron com notch real | Exige o app empacotado, credencial e observação do compositor |
| Renomear ou arquivar a tarefa de validação criada em 2026-09-09 | Está no workspace Kizuna; o MCP do Notion disponível aqui está conectado a outro workspace (Kabrito Digital) e não a alcança |

## Acabamento conhecido, não bloqueante

A data de última sincronização usa `toLocaleString()` e sai em 12 horas mesmo com a
preferência de 24 h ligada. Os formatadores por locale foram construídos na branch
`feat/ui-foundation`; o ajuste natural é quando as duas se encontrarem.
