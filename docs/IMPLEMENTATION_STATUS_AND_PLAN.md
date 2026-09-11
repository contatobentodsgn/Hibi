# Hibi — status de implementação e plano consolidado

Atualizado em 2026-09-10, depois do merge do PR #7 (`main` em `6984c20`). Este documento é a fonte operacional do status atual e da paridade com o app original; os planos em `docs/superpowers/plans/` preservam o histórico de decisões e execução. `docs/parity-audit.md` fica como registro histórico de 07/09.

Última bateria completa em `main` (conteúdo do PR #7): 504 testes Vitest, 176 `node --test`, 100 e2e Playwright, `tsc` sem erros e build de produção com o addon nativo; a CI do PR passou no Linux com `TZ=America/Sao_Paulo`.

## Status atual

| Área | Estado | Evidência atual |
| --- | --- | --- |
| Streaming visível | Implementado | Eventos SSE, montagem incremental no assistente e estado de geração na interface. |
| Cancelamento | Implementado | Abort por requisição, botão Parar, estado cancelado e nenhuma tentativa de fallback após cancelamento. |
| 401, limite e indisponibilidade | Implementado | Classificação segura, mensagens específicas e retry apenas para falhas temporárias. |
| Retry automático | Implementado | Backoff limitado, `Retry-After` e orçamento global de tentativas. |
| Consumo | Implementado | Ledger local limitado, tokens, custo conhecido e omissão de custo desconhecido. |
| Seleção orientada de modelos | Parcial | Perfis rápido/equilibrado/raciocínio e modelo customizado existem; a escolha do identificador final ainda depende do provedor configurado. |
| Provedor/modelo por resposta | Implementado | Proveniência exibida no assistente e nos eventos de streaming. |
| Fallback | Implementado | Políticas perguntar/automático/nunca e fallback local somente em falhas elegíveis. |
| Conectores (base comum) | Implementado localmente | Adaptadores, normalização, Keychain, allowlist, OAuth PKCE com callback em loopback, teste de conexão somente leitura, endpoint configurável e seleção de fontes importadas. |
| **Notion Sync v1** | **Concluído e validado ao vivo** | Sincronização manual bidirecional: base dedicada Hibi Tasks, reconciliação determinística, prévia com decisão por item, confirmação no app e no notch, checkpoints persistidos, lote recuperável e retry só dos pendentes. Validado em 2026-09-10 no workspace Kizuna, pelo app Electron real: setup, leitura, escrita remota e cancelamento confirmados pelo notch, e conflito de dois lados no mesmo minuto. A validação corrigiu quatro defeitos; ver o [registro de validação](validation/2026-09-10-notion-sync-v1.md). |
| **Monitor do notch e "Testar notch"** | **Implementado e validado no app real** | Configurações › Geral escolhe Automático ou um monitor; o automático é reavaliado a cada posicionamento (antes ficava preso à tela principal quando o app abria com a tampa fechada). O teste mostra um cartão passivo e uma confirmação no monitor escolhido e nunca tampa uma confirmação real. A validação com a tela integrada e o LG ULTRAWIDE corrigiu: confirmação posicionada a partir da tela com foco, texto do cartão passivo cortado e escondido atrás da câmera, confirmação transbordando a janela e superfície anterior esquecida na tela ao trocar de host. Registro em [`notch-manual-results.md`](notch-manual-results.md). |
| Comandos `/folder` e `/break` | Implementado localmente | Pastas derivadas dos itens (nomes comparados depois de aparar espaços e normalizar para NFC), com filtros reais em Tarefas e Notas e navegação e renomeação pela paleta; juntar pastas pede confirmação e só é anunciado quando aplicado. `/break` abre o Foco em modo pausa, com eventos `break-*` que nunca contam como foco, e cada conclusão de foco ou pausa é registrada exatamente uma vez. Paridade com os 21 comandos do original. |
| Nova UI — fundação | Implementado localmente | Tokens claro/escuro com contraste testado, i18n `pt`/`en` ao vivo, shell sem moldura com dock, paleta `⌘K` unificada com o Taby; telas ainda com o visual anterior dentro do shell novo. |
| Estatísticas dedicadas | Implementado (PR #7) | Página `/stats` (menu "Mais" do dock e paleta; `/review` continua no Review) sobre um registro local de atividade só de acréscimo, gravado uma vez por ação feita no Hibi — Tarefas, Hábitos, Metas, blocos, Foco e ações confirmadas do Taby; pausas nunca contam como foco. Resumo com comparação ao período anterior, tendência diária em SVG com tabela equivalente, planejado x concluído, categorias, pastas, histórico filtrável e exportação CSV/JSON só do período (também vazio); Hoje, Semana e Mês partem da data local real, porque o registro usa o relógio real; backup versão 2 leva o registro. Código: `src/domain/activity.ts`, `activity-events.ts`, `stats.ts`, `stats-export.ts`, `src/data/workspace-backup.ts`, `src/ui/focus-lifecycle.ts`, `StatsView.tsx`, `stats-format.ts`, `stats.css`. Testes: `stats.test.ts` (em `TZ=UTC` e `America/Sao_Paulo`), `stats-export.test.ts`, `activity-events.test.ts`, `activity.test.ts`, `workspace-backup.test.ts`, `focus-lifecycle.test.ts`, `StatsView.test.tsx`, `shell.test.tsx`, `palette.test.tsx`; e2e `tests/e2e/stats.spec.ts` — tarefa concluída em Hoje, persistência após recarregar, período personalizado sem a tarefa, CSV do período, teclado, foco concluído e cancelado com relógio simulado e pausa sem efeito. Bateria do PR #7 (merge `6984c20`): 504 Vitest, 176 `node --test`, 100 e2e, `tsc` e build de produção. Checagem no app Electron de produção em 2026-09-10 (userData isolado): Revisão inalterada, tarefa em Semana e Hoje, exportações só do período, período invertido marca só o fim e nenhuma requisição de rede nas Estatísticas ([plano](superpowers/plans/2026-09-08-dedicated-stats.md), Task 8). |
| Slack | **Adiado** | Adaptador de leitura e escrita existe e é coberto por testes, mas o produto de sincronização foi adiado: o esforço foi concentrado no Notion. Nenhuma validação ao vivo planejada por ora. |
| E-mail e notificações remotas | Implementado localmente | Adaptadores, confirmação, endpoint HTTPS configurável e teste de conexão; entrega real exige credencial do serviço escolhido. |
| Webhooks | Implementado localmente | HMAC, nonce, expiração, limite de corpo, loopback, Keychain e confirmação; ciclo iniciar/parar e estado após reinício cobertos por e2e; não é endpoint público. |
| API pública | Implementado localmente | API HTTP loopback, token revogável no Keychain, OpenAPI, leituras e escritas com confirmação. |
| Importação | Implementado localmente | CSV/JSON/ICS e leitura por conector a partir das fontes escolhidas, com prévia, deduplicação por referência remota, conflitos e aplicação local da decisão. |
| Compartilhamento | Implementado localmente | Convites somente leitura assinados e expirados. |
| Teste com provedor real | Bloqueado por configuração | Harness protegido criado; falta endpoint sandbox, modelo, credencial e opt-in explícito. |
| Teste com conector real | Notion validado; demais bloqueados por credencial | `npm run test:notion:live` roda o ciclo `criar → ler → atualizar → conflito` com a credencial que o próprio Hibi guarda no Keychain, sem expor o token. Slack, e-mail e notificações remotas seguem sem credencial de sandbox. |

## Paridade com o app original

Referência: Hey Taby 0.2.2 e 0.2.3, pelas auditorias em `/Volumes/SSD/app/node_modules/@hey-taby/` (`HEY_TABY_AUDIT_2026-07-30.md` e `HEY_TABY_AUDIT_0.2.3_2026-07-30.md`). O Hibi é uma implementação própria, não uma cópia: "pronto" significa a mesma capacidade para quem usa, não o mesmo visual.

### Já coberto

| Área do original | No Hibi |
| --- | --- |
| Tarefas, Notas, Hábitos, Metas, Lembretes | Funcionais localmente, com pastas reais, recorrência de lembretes e notificações macOS. |
| Visão diária e semanal | Blocos locais, conflitos, importação e exportação ICS. |
| Comandos `/` | Os 21 do original, na paleta `⌘K`. |
| Foco e pausa | Timer de 25 minutos e pausa de 5, 10 ou 15 minutos, com eventos separados. |
| Estatísticas | Página dedicada `/stats` com resumo por período, tendência diária, planejado x concluído, categorias, pastas, histórico e exportação CSV/JSON, a partir de um registro local de atividade. Ver "Estatísticas dedicadas" acima. |
| Taby | Assistente com provedor local ou compatível com OpenAI, confirmação antes de alterar dados e streaming. No original a tela ainda era "coming soon" (0.2.2) ou dependia do Brain não instalado (0.2.3). |
| Integrações | Além do original (Codex e Claude sem conexão, Google Calendar "em breve"): Notion validado ao vivo, API local, webhooks, e-mail e notificações remotas. |
| Notch | Host nativo público, confirmações no notch, escolha de monitor e botão de teste — ambos pedidos na auditoria do original —, validado com monitor externo. |
| Configurações gerais | Idioma, tema, formato de hora, abrir ao iniciar o Mac (ausente no original) e monitor do notch. |
| Dados | Exportação e restauração de backup JSON sem segredos (ausente no original). |
| Feedback e diagnóstico | Parcial: feedback, bug e ideia viram nota local; pacote de diagnóstico JSON exportável. |

### Falta

| Do original | Situação no Hibi | Observação |
| --- | --- | --- |
| Review da 0.2.3 com sugestões (`duplicate_task`, `missing_schedule`) | Ausente — o Review é um resumo | Evitar os defeitos auditados: números como identificadores, agrupar duplicidades, recalcular após mudanças, dispensa em lote, evidência da confiança. |
| Tela de chats do Taby (várias conversas, busca, novo chat) | Ausente | A conversa vive só no estado da tela e se perde ao sair; só o histórico de ações da IA é salvo. |
| Ajustes de Foco (horário ativo, ausência, inatividade, pomodoro, timeout de tela, loop visual, intensidade dos nudges) | Ausentes | A aba Foco mostra só a duração fixa de 25 minutos. |
| Ajustes gerais: tint, tamanho do Taby, local de exibição, atalho global, atividade de apps | Ausentes | No original o atalho global aparecia desabilitado. |
| Zona invisível no topo que abre o Taby | Ausente | A auditoria aponta que ela é pouco descobrível; se entrar, precisa de indicação visível. |
| Dados em SQLite com restore points automáticos | Ausente — `localStorage` com backup JSON manual | O original declarava restore points, mas não criava nenhum. |
| Atualização automática, assinatura e notarização | Ausentes — `/updates` informa build offline | Também na Fase 4. |
| Feedback remoto com captura de tela e pacote ZIP | Parcial | Ver "Já coberto". |
| Brain local (~5,2 GB) e voz (Kokoro) | Ausentes | No original a voz falhava por dependência não empacotada. |
| Dispositivo físico Taby (USB, firmware) | Ausente — adaptador marcado como indisponível | Depende de hardware e protocolo do dispositivo. |
| Animações em Rive | Parcial | Os estados do companion usam vídeos; `study-reference/rive/talk/taby-talk.riv` só é listado na galeria de assets e não anima o companion. |
| Sincronização com Google Calendar ou iCloud | Ausente | No original também "em breve". Também na Fase 4. |
| Visual novo das telas | Parcial | Só o shell, o dock e a paleta usam a nova UI. |

### Fora do escopo por decisão

- **Desenhar sobre a câmera.** O original eleva a janela com interfaces privadas do WindowServer. O Hibi usa só APIs públicas: o cartão fica abaixo da câmera. Ver `docs/notch-reference-analysis.md`.

## Plano restante

### Fase 1 — fechar configuração local

- [x] Conectar webhook à ponte Electron e à tela de Integrações.
- [x] Exigir confirmação dentro do app para escritas recebidas pela API local.
- [x] Recompilar e validar o addon nativo do notch.
- [x] Adicionar teste de interface para iniciar/parar webhook e confirmar estado após reinício.
- [x] Exibir histórico completo de confirmações de integrações, em vez de somente a contagem de auditoria.

### Fase 2 — tornar conectores operacionais

- [x] Implementar fluxo OAuth PKCE real por conector, com callback local, state de uso único e refresh seguro.
- [x] Adicionar seleção de bases/canais/caixas de entrada importados.
- [x] Adicionar teste de conexão que não execute escrita.
- [x] Integrar ações preparadas ao cartão Confirmar/Cancelar do assistente e do companion.
- [x] Adicionar configuração de endpoint para notificações remotas e e-mail compatível.

### Fase 3 — validação externa

Os dois harness recusam a execução até que o opt-in e os parâmetros seguros estejam presentes. Falta apenas fornecer sandbox e credenciais.

- [ ] Executar `HIBI_LIVE_PROVIDER_TEST=1 npm run test:providers:live` contra sandbox autorizado.
- [ ] Exercitar streaming, cancelamento, 401, limite de uso, indisponibilidade, retry e proveniência com o provedor real.
- [ ] Executar `HIBI_LIVE_CONNECTOR_TEST=1 npm run test:connectors:live` por conector, em modo somente leitura.
- [ ] Exercitar uma escrita real com `HIBI_LIVE_CONNECTOR_WRITE_TEST=1` e registrar o relatório sanitizado.

#### Parâmetros dos harness

| Variável | Uso |
| --- | --- |
| `HIBI_LIVE_CONNECTOR_TEST=1` | Libera qualquer tráfego real de conector. |
| `HIBI_LIVE_CONNECTOR_ID` | `notion`, `slack`, `email` ou `remote-notifications`. |
| `HIBI_LIVE_CONNECTOR_ENDPOINT` | Base HTTPS do sandbox. |
| `HIBI_LIVE_CONNECTOR_ALLOW_HOSTS` | Hosts autorizados; o endpoint precisa estar na lista. |
| `HIBI_LIVE_CONNECTOR_TOKEN` | Credencial do sandbox; fica só em memória. |
| `HIBI_LIVE_CONNECTOR_TARGETS` | Identificadores das fontes a importar, separados por vírgula. |
| `HIBI_LIVE_CONNECTOR_WRITE_TEST=1` | Segundo opt-in, exigido para qualquer escrita real. |
| `HIBI_LIVE_CONNECTOR_WRITE_KIND` e `..._WRITE_PAYLOAD` | Ação e corpo JSON da escrita avulsa. Opcionais quando o ciclo de vida do Notion está ligado. |
| `HIBI_LIVE_NOTION_LIFECYCLE=1` | Terceiro opt-in: roda `criar → ler → atualizar → conflito` no Notion. Exige também `HIBI_LIVE_CONNECTOR_WRITE_TEST=1`. |
| `HIBI_LIVE_NOTION_DATA_SOURCE` | Fonte de dados da base Hibi Tasks usada pelo ciclo de vida. |
| `HIBI_LIVE_NOTION_KEYCHAIN=1` | Opt-in de `npm run test:notion:live`: valida o Notion dentro do Electron com a credencial salva pelo Hibi, sem variável de token. |

O relatório traz apenas contagens, resultados e o host autorizado: nenhum título, corpo, identificador remoto ou credencial.

O ciclo de vida do Notion reaproveita sempre a mesma tarefa descartável, marcada como
`[hibi-harness] disposable validation task`. Repetir a validação não acumula páginas no
workspace; o conector não expõe arquivamento de propósito, então essa única página fica
lá entre as rodadas.

### Fase 4 — release e sincronização futura

- [ ] Decidir e implementar conta, nuvem e backup remoto.
- [ ] Decidir sincronização bidirecional com Google Calendar/iCloud e resolução de conflitos.
- [ ] Adicionar atualizador, assinatura, notarização, crash recovery e acessibilidade manual.
- [x] Validar o notch na tela com câmera e em monitor externo, com a janela do Hibi em cada tela (app real, cliques automatizados; 2026-09-10).
- [ ] Validar o notch em Mac sem câmera, em Spaces e tela cheia, na reconexão do monitor externo, após o sono e com clique e leitura humanos — roteiro em [`notch-manual-results.md`](notch-manual-results.md).

### Fase 5 — paridade com o original

Ordem recomendada, do que está mais adiantado e mais usado para o que depende de terceiros:

1. [x] Concluir as estatísticas dedicadas (PR #7, merge `6984c20`; Tasks 3–8, com checagem no app Electron de produção).
2. [ ] Salvar as conversas do Taby, com lista de chats, busca e novo chat.
3. [ ] Ajustes de Foco: horário ativo, inatividade, pomodoro e intensidade dos nudges, com prévia de quantos alertas por dia.
4. [ ] Review com sugestões de duplicata e de agenda ausente, sem os falsos positivos auditados no original.
5. [ ] Persistência em SQLite com restore points antes de lotes e migrações.
6. [ ] Ajustes gerais restantes: atalho global, tamanho e local de exibição do Taby, tint e atividade de apps.
7. [ ] Visual novo nas telas, na ordem do dock.
8. [ ] Voz e modelo local, depois de decidir motor, tamanho de download e empacotamento.
9. [ ] Dispositivo físico, quando houver protocolo e hardware para teste.

Pendências já registradas fora desta lista: confirmações da API local respondidas continuam reaparecendo no notch por até um minuto, e a janela do notch usa o preload completo do app. Início, Dia, Semana e o Taby ainda tratam como "hoje" a data do bloco mais antigo do workspace (`src/domain/date-context.ts`) e, sem blocos, caem numa data UTC que vira o dia seguinte depois das 21h em São Paulo; as Estatísticas já partem da data local real.

## Critério de conclusão

O projeto só deve ser considerado completo quando as fases 1–3 tiverem evidência executável. Recursos remotos não devem ser marcados como concluídos apenas pela existência de um adaptador: é necessário teste em sandbox autorizado e relatório sem segredos.

## Comandos de verificação

```text
npm test
npx tsc --noEmit
npm run build
npx playwright test
npm run test:providers:live
npm run test:connectors:live
```

Os dois últimos comandos devem permanecer recusando a execução, com código de saída 1, até que o opt-in e os parâmetros seguros estejam presentes.
