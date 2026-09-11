# Hibi — status de implementação e plano consolidado

Atualizado em 2026-09-11. Este documento é a fonte operacional do status atual e da paridade com o app original; os planos em `docs/superpowers/plans/` preservam o histórico de decisões e execução. `docs/parity-audit.md` fica como registro histórico de 07/09.

Última bateria completa em `feat/taby-conversations`: 539 testes Vitest em 71 arquivos, 189 `node --test`, 101 e2e Playwright, `tsc` sem erros e build de produção com o addon nativo.

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
| Conectores (base comum) | Implementado localmente | Adaptadores, normalização, Keychain, allowlist, OAuth PKCE com callback em loopback (com servidor de autorização configurável ao lado do endpoint, já que ele raramente mora no host da API), teste de conexão somente leitura, endpoint configurável e seleção de fontes importadas. |
| **Notion Sync v1** | **Concluído e validado ao vivo** | Sincronização manual bidirecional: base dedicada Hibi Tasks, reconciliação determinística, prévia com decisão por item, confirmação no app e no notch, checkpoints persistidos, lote recuperável e retry só dos pendentes. Validado em 2026-09-10 no workspace Kizuna, pelo app Electron real: setup, leitura, escrita remota e cancelamento confirmados pelo notch, e conflito de dois lados no mesmo minuto. A validação corrigiu quatro defeitos; ver o [registro de validação](validation/2026-09-10-notion-sync-v1.md). |
| **Monitor do notch e "Testar notch"** | **Implementado e validado no app real** | Configurações › Geral escolhe Automático ou um monitor; o automático é reavaliado a cada posicionamento (antes ficava preso à tela principal quando o app abria com a tampa fechada). O teste mostra um cartão passivo e uma confirmação no monitor escolhido e nunca tampa uma confirmação real. A validação com a tela integrada e o LG ULTRAWIDE corrigiu: confirmação posicionada a partir da tela com foco, texto do cartão passivo cortado e escondido atrás da câmera, confirmação transbordando a janela e superfície anterior esquecida na tela ao trocar de host. Registro em [`notch-manual-results.md`](notch-manual-results.md). Duas correções posteriores: uma confirmação respondida não reaparece mais — o companion só reapresenta quando o cartão muda de verdade, e responder a confirmação da API local descarta a apresentação em vez de deixá-la no estado até expirar —, e a janela do notch passou a ter preload próprio (`electron/notch-preload.cjs`), com só os quatro canais que a overlay usa, sem IA, Keychain, OAuth, webhook nem API local. Verificado no app de produção com userData isolado: a overlay expõe só esses quatro canais, a confirmação aparece, é respondida ali mesmo e a janela fica escondida depois. |
| Comandos `/folder` e `/break` | Implementado localmente | Pastas derivadas dos itens (nomes comparados depois de aparar espaços e normalizar para NFC), com filtros reais em Tarefas e Notas e navegação e renomeação pela paleta; juntar pastas pede confirmação e só é anunciado quando aplicado. `/break` abre o Foco em modo pausa, com eventos `break-*` que nunca contam como foco, e cada conclusão de foco ou pausa é registrada exatamente uma vez. Paridade com os 21 comandos do original. |
| Nova UI — fundação | Implementado localmente | Tokens claro/escuro com contraste testado, i18n `pt`/`en` ao vivo, shell sem moldura com dock, paleta `⌘K` unificada com o Taby; telas ainda com o visual anterior dentro do shell novo. |
| Estatísticas dedicadas | Implementado (PR #7) | Página `/stats` (menu "Mais" do dock e paleta; `/review` continua no Review) sobre um registro local de atividade só de acréscimo, gravado uma vez por ação feita no Hibi — Tarefas, Hábitos, Metas, blocos, Foco e ações confirmadas do Taby; pausas nunca contam como foco. Resumo com comparação ao período anterior, tendência diária em SVG com tabela equivalente, planejado x concluído, categorias, pastas, histórico filtrável e exportação CSV/JSON só do período (também vazio); Hoje, Semana e Mês partem da data local real, porque o registro usa o relógio real; backup versão 2 leva o registro. Código: `src/domain/activity.ts`, `activity-events.ts`, `stats.ts`, `stats-export.ts`, `src/data/workspace-backup.ts`, `src/ui/focus-lifecycle.ts`, `StatsView.tsx`, `stats-format.ts`, `stats.css`. Testes: `stats.test.ts` (em `TZ=UTC` e `America/Sao_Paulo`), `stats-export.test.ts`, `activity-events.test.ts`, `activity.test.ts`, `workspace-backup.test.ts`, `focus-lifecycle.test.ts`, `StatsView.test.tsx`, `shell.test.tsx`, `palette.test.tsx`; e2e `tests/e2e/stats.spec.ts` — tarefa concluída em Hoje, persistência após recarregar, período personalizado sem a tarefa, CSV do período, teclado, foco concluído e cancelado com relógio simulado e pausa sem efeito. Bateria do PR #7 (merge `6984c20`): 504 Vitest, 176 `node --test`, 100 e2e, `tsc` e build de produção. Checagem no app Electron de produção em 2026-09-10 (userData isolado): Revisão inalterada, tarefa em Semana e Hoje, exportações só do período, período invertido marca só o fim e nenhuma requisição de rede nas Estatísticas ([plano](superpowers/plans/2026-09-08-dedicated-stats.md), Task 8). |
| **Conversas do Taby** | Implementado (`feat/taby-conversations`) | O que se fala com o Taby é salvo e sobrevive a sair da tela e recarregar: lista lateral, busca **no texto das mensagens** (não só nos títulos), "Nova conversa", apagar uma conversa e apagar todas com confirmação. As perguntas feitas pela paleta `⌘K` entram na mesma thread — por isso o dono do histórico é `useConversations`, montado uma vez no `App.tsx`, acima das duas superfícies: a paleta pergunta com a tela Taby desmontada. **Privacidade: as conversas ficam neste Mac e não entram no backup do workspace.** Vivem na chave `localStorage` `hibi-conversations`, fora do `StudyData` que o `createWorkspaceBackup` serializa inteiro; restaurar noutra máquina traz tarefas, notas e atividade, **não** os chats, e a própria tela diz isso. Credenciais coladas por engano (`Bearer`, `sk-`, `api_key`, `token`) são substituídas antes de qualquer gravação; no máximo 50 conversas, a mais antiga podada primeiro, comparando instantes (`Date.parse`) e não texto — um `updatedAt` com fuso ordenaria errado. Uma gravação que falha não derruba a conversa: ela continua em memória, o evento sai com resultado `fail` e a tela avisa uma vez. Abrir o app começa numa **thread vazia**, com as conversas anteriores listadas: uma conversa nasce da primeira pergunta, nunca de chegar na tela. Código: `src/domain/conversations.ts`, `src/data/conversation-store.ts`, `src/ui/useConversations.ts`, `ConversationList.tsx`, `TabyView.tsx`, `palette/CommandPalette.tsx`, `src/App.tsx`, chaves `taby.*` em `src/i18n/dictionary.ts` (`pt` e `en`). Testes: `conversations.test.ts` (título, redação, sanitização, busca, poda e ordem por instante entre fusos diferentes), `conversation-store.test.ts` (chave própria, cota estourada, registro corrompido, armazenamento ilegível), `useConversations.test.ts` (criação na primeira pergunta, anexação e transição repetida), `ConversationList.test.tsx`, `TabyView.test.tsx`, `palette.test.tsx` e `workspace-backup.test.ts` — este último fixa a decisão de privacidade: um backup exportado não contém texto de conversa. E2e `tests/e2e/taby-conversations.spec.ts`: perguntar, recarregar e achar a conversa, perguntar de novo pela paleta e apagar todas. |
| Slack | **Adiado** | Adaptador de leitura e escrita existe e é coberto por testes, mas o produto de sincronização foi adiado: o esforço foi concentrado no Notion. Nenhuma validação ao vivo planejada por ora. |
| E-mail e notificações remotas | Implementado localmente; fiação validada ao vivo | Adaptadores, confirmação, endpoint HTTPS configurável e teste de conexão; entrega real exige credencial do serviço escolhido. Em 2026-09-11 o ciclo completo rodou por HTTPS contra uma **sandbox própria** que implementa o contrato que cada conector espera (e-mail: `profile`, `mailboxes`, `messages?flagged=true`, `send`; notificações: `health`, `send`): conexão, leitura só das mensagens sinalizadas, escrita confirmada e auditoria por ação. Isso valida a fiação — HTTPS, allowlist, credencial no Keychain, confirmação, relatório sanitizado —, **não** compatibilidade com um serviço de mercado. |
| Webhooks | Implementado localmente | Receptor de entrada que autentica e aceita: HMAC, nonce, janela de 5 minutos, limite de corpo de 64 KB, loopback e segredo no Keychain. Um evento verificado responde `200 { accepted: true, event }` e **nada é proposto ao workspace** — não há fluxo de aprovação. Ciclo iniciar/parar e estado após reinício cobertos por e2e; não é endpoint público. |
| API pública | Implementado localmente | API HTTP loopback, token revogável no Keychain, OpenAPI, leituras e escritas com confirmação. |
| **Processo principal (IPC)** | **Coberto por teste** | `electron/main.test.cjs` executa de verdade o callback de `app.whenReady()`. O harness anterior trocava `app` por um objeto cujo `then()` nunca rodava, então nenhum dos 43 `ipcMain.handle` chegava a ser registrado durante os testes. Cobre o registro dos 43 canais e a paridade bidirecional com o preload, a validação de entrada dos handlers que recebem dados do renderer ou da API local, o descarte de ações preparadas ao trocar endpoint (a regressão que voltava a apagar a auditoria) e o teardown do `before-quit`. Achou um crash real: `onTrigger` do agendador de notificações e `prepareWrite` da API local escreviam direto em `mainWindow.webContents.send`, mas `mainWindow` não vira `null` quando a janela é fechada no macOS — o `?.` passava direto e uma notificação agendada com a janela fechada lançava `Object has been destroyed` dentro de um callback de timer, derrubando o processo principal. As duas rotas passaram a usar a guarda `sendToMainWindow`. |
| Seed de demonstração | Relativo ao dia atual | `createSeedData(now = new Date())` monta os cinco dias a partir de hoje com `todayKey`/`shiftDayKey`, em vez das datas fixas de 07 a 11/09/2026 — com elas, uma instalação nova abria num dia **vazio** assim que a data real passava da janela, fazendo o app parecer quebrado na primeira impressão. Distribuição, títulos e durações do conteúdo seguem idênticos, e o lembrete semanal continua caindo numa terça real. |
| Lembretes semanais (dados gravados) | Corrigido na leitura | `firstWeeklyOccurrence` misturava dia da semana local com data UTC, então fora de UTC-03 o `schedule.at` gravado apontava para o dia errado. O cálculo foi corrigido antes; os registros já no disco são reancorados em `LocalRepository.fromJson`, a única porta por onde todo dado persistido entra. `StudyData` não tem versão de esquema — o `2` versiona o envelope de backup, não o workspace —, então a correção mora no ponto de entrada que o código realmente tem. Só é reancorado o lembrete cujo `at` cai num dia que a própria recorrência não repete: o registro contradiz a si mesmo e nada além do bug produz isso. Qualquer outro caso volta pelo mesmo objeto, sem cópia. |
| Hábitos | Ancorado no dia local | A tela tinha `TODAY = '2026-09-07'` fixo no código e derivava o dia com `toISOString().slice(0,10)`, que devolve o dia **UTC**: marcar um hábito gravava no dia errado e a sequência contava a partir de um "hoje" que não existe. `weekDates` ainda misturava dois calendários — âncora em `-03:00`, releitura em UTC —, deslocando a janela de segunda a domingo. Agora "hoje" sai de `todayKey(now)` a cada render, com `now` injetável para teste, e toda conversão passa por `date-context`. |
| Importação | Implementado localmente | CSV/JSON/ICS e leitura por conector a partir das fontes escolhidas, com prévia, deduplicação por referência remota, conflitos e aplicação local da decisão. |
| Compartilhamento | Implementado localmente | Convites somente leitura assinados e expirados. |
| Teste com provedor real | **Validado ao vivo** | Groq (`api.groq.com`, `openai/gpt-oss-120b`) em 2026-09-11: streaming com deltas, proveniência, consumo (337 tokens) e cancelamento real de um turno em voo. 401, limite de uso e indisponibilidade com retry são exercitados com respostas injetadas e carimbados `simulated` no relatório — não há como forçá-los num provedor real sem sujar a conta. A validação revelou e corrigiu um defeito no próprio harness: os eventos eram passados como terceiro argumento de `run()`, que aceita dois, então o relatório saía sem evento nenhum e um provedor que não streamasse teria passado. O relatório nunca traz a chave nem o texto. |
| Teste com conector real | Notion validado ao vivo; e-mail e notificações contra sandbox própria; Slack adiado | `npm run test:notion:live` roda o ciclo `criar → ler → atualizar → conflito` com a credencial que o próprio Hibi guarda no Keychain, sem expor o token. E-mail e notificações remotas rodaram leitura e escrita por HTTPS contra uma sandbox própria em 2026-09-11 — os conectores não falam nenhuma API de mercado, definem um contrato próprio, então não há serviço de terceiro contra o qual validar sem antes escrever um adaptador para ele. Slack segue adiado por decisão. |

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
| Tela de chats do Taby (várias conversas, busca, novo chat) | Conversas salvas com lista, busca no texto das mensagens, nova conversa e apagar uma ou todas — inclusive as perguntas feitas pela paleta `⌘K`. Ficam **neste Mac** e **não entram no backup do workspace**; abrir o app começa numa **thread vazia**, com as conversas anteriores listadas ao lado. Ver "Conversas do Taby" no Status atual. |
| Integrações | Além do original (Codex e Claude sem conexão, Google Calendar "em breve"): Notion validado ao vivo, API local, webhooks, e-mail e notificações remotas. |
| Notch | Host nativo público, confirmações no notch, escolha de monitor e botão de teste — ambos pedidos na auditoria do original —, validado com monitor externo. |
| Configurações gerais | Idioma, tema, formato de hora, abrir ao iniciar o Mac (ausente no original) e monitor do notch. |
| Dados | Exportação e restauração de backup JSON sem segredos (ausente no original). |
| Feedback e diagnóstico | Parcial: feedback, bug e ideia viram nota local; pacote de diagnóstico JSON exportável. |

### Falta

| Do original | Situação no Hibi | Observação |
| --- | --- | --- |
| Review da 0.2.3 com sugestões (`duplicate_task`, `missing_schedule`) | Ausente — o Review é um resumo | Evitar os defeitos auditados: números como identificadores, agrupar duplicidades, recalcular após mudanças, dispensa em lote, evidência da confiança. |
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

- [x] Conectar webhook à ponte Electron e à tela de Integrações. O que está ligado é o receptor: ele autentica o evento (HMAC, janela de 5 minutos, nonce, 64 KB), responde `200 { accepted: true, event }` e para por aí; a tela expõe segredo, iniciar/parar e estado. Não há aprovação de webhook dentro do app, e a resposta não promete nenhuma — ver o candidato 10 da Fase 5.
- [x] Exigir confirmação dentro do app para escritas recebidas pela API local. Auditoria de 2026-09-11: o lado servidor tem prova no nível HTTP (`electron/local-api.test.cjs` — a rota devolve 202 e nunca aplica a mutação), mas o cartão no renderer só é coberto por asserção sobre o texto de `App.tsx` em `src/App.test.ts`, e nenhum e2e o exercita. Vale notar que a aprovação é decidida no renderer: o processo principal só devolve o `approved`.
- [x] Recompilar o addon nativo do notch — **"validar" não se sustenta como estava escrito**. Auditoria de 2026-09-11: o binário é mais novo que `notch.mm`, carrega e devolve dados reais de tela, então "recompilar" é verdade e checável. Mas as asserções de `place`/`createHost` em `native/notch/index.test.cjs` vivem dentro de `if (!bridge.available())` e são **puladas justamente quando o addon funciona**, e as seis de `layout.test.cjs` são regex sobre o texto do `.mm`. O único exercício do binário compilado é `npm run native:notch:smoke`, manual, fora do `npm test` e fora da CI de PR.
- [x] Adicionar teste de interface para iniciar/parar webhook e confirmar estado após reinício.
- [x] Exibir histórico completo de confirmações de integrações, em vez de somente a contagem de auditoria. "Completo" quer dizer a sessão inteira: o log vive na memória do processo principal e atravessa a reconstrução dos conectores por troca de endpoint (`withConnectors`), mas não um reinício do app.

### Fase 2 — tornar conectores operacionais

- [x] Implementar fluxo OAuth PKCE real por conector, com callback local, state de uso único e refresh seguro.
- [x] Adicionar seleção de bases/canais/caixas de entrada importados.
- [x] Adicionar teste de conexão que não execute escrita.
- [x] Integrar ações preparadas ao cartão Confirmar/Cancelar do assistente e do companion.
- [x] Adicionar configuração de endpoint para notificações remotas e e-mail compatível.

### Fase 3 — validação externa

Os dois harness recusam a execução até que o opt-in e os parâmetros seguros estejam presentes. Falta apenas fornecer sandbox e credenciais.

- [x] Executar `HIBI_LIVE_PROVIDER_TEST=1 npm run test:providers:live` contra sandbox autorizado. Feito em 2026-09-11 contra a Groq.
- [x] Exercitar streaming, cancelamento, 401, limite de uso, indisponibilidade, retry e proveniência com o provedor real. Ao vivo: streaming, proveniência, consumo e cancelamento em voo. Simulados com respostas injetadas e marcados como tal no relatório: 401, limite de uso e indisponibilidade com retry.
- [x] Executar `HIBI_LIVE_CONNECTOR_TEST=1 npm run test:connectors:live` por conector, em modo somente leitura. Os quatro foram cobertos em 2026-09-11: Notion ao vivo; e-mail (conexão, 2 caixas, 1 mensagem sinalizada de 2), notificações remotas (conexão) e Slack (conexão, 2 canais, 1 item salvo de 2 pelo filtro de canal) contra sandbox própria. O Slack segue adiado **como produto de sincronização**, mas o conector foi exercitado.
- [x] Exercitar uma escrita real com `HIBI_LIVE_CONNECTOR_WRITE_TEST=1` e registrar o relatório sanitizado. `email.send` e `notification.send` responderam 200 com identificador remoto, cada uma precedida de `prepare` e registrada na auditoria. Slack continua adiado por decisão, e não foi exercitado.

#### Parâmetros dos harness

| Variável | Uso |
| --- | --- |
| `HIBI_LIVE_PROVIDER_TEST=1` | Libera o teste com provedor real. |
| `HIBI_LIVE_PROVIDER_ENDPOINT` | URL **completa** do `chat/completions`, só HTTPS: o cliente faz `POST` nela e recusa redirecionamento, então a base `/v1` não serve. |
| `HIBI_LIVE_PROVIDER_MODEL` | Identificador do modelo. Precisa aceitar JSON mode e streaming com `stream_options`. |
| `HIBI_LIVE_PROVIDER_KEY` | Credencial; fica só em memória. |
| `HIBI_LIVE_PROVIDER_ALLOW_HOSTS` | Hosts autorizados; o host do endpoint precisa estar na lista. |
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

E-mail e notificações remotas não têm serviço de mercado contra o qual rodar: o contrato é do próprio conector. `scripts/connector-sandbox.mjs` implementa esses contratos — e-mail, notificações e Slack — para que os itens 3 e 4 sejam reproduzíveis — suba com `SANDBOX_TOKEN=$(openssl rand -hex 16) node scripts/connector-sandbox.mjs`, exponha a porta em HTTPS (o harness recusa HTTP) e aponte `HIBI_LIVE_CONNECTOR_ENDPOINT` para `<url>/mail/` ou `<url>/notify/`. O cabeçalho do arquivo repete a ressalva: ela prova a fiação, não a compatibilidade com um serviço real.

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
2. [x] Salvar as conversas do Taby, com lista de chats, busca e novo chat. As conversas ficam **neste Mac**, fora do `StudyData`, e **não entram no backup do workspace** — restaurar noutra máquina traz tarefas, notas e atividade, não os chats. Abrir o app (ou recarregar) começa numa **thread vazia**, com as conversas anteriores listadas ao lado; a primeira pergunta é que cria a conversa. Ver "Conversas do Taby" no Status atual.
3. [ ] Ajustes de Foco: horário ativo, inatividade, pomodoro e intensidade dos nudges, com prévia de quantos alertas por dia.
4. [ ] Review com sugestões de duplicata e de agenda ausente, sem os falsos positivos auditados no original.
5. [ ] Persistência em SQLite com restore points antes de lotes e migrações.
6. [ ] Ajustes gerais restantes: atalho global, tamanho e local de exibição do Taby, tint e atividade de apps.
7. [ ] Visual novo nas telas, na ordem do dock.
8. [ ] Voz e modelo local, depois de decidir motor, tamanho de download e empacotamento.
9. [ ] Dispositivo físico, quando houver protocolo e hardware para teste.
10. [ ] Decidir se um evento de webhook verificado deve propor alterações no workspace. Hoje o receptor só autentica e aceita, e o verificador descarta o corpo: `createWebhookVerifier.verify` devolve apenas `{ event }`, então um cartão de confirmação não teria o que mostrar. Fazer isso de verdade exige definir um esquema por tipo de evento, mapear o corpo para uma alteração revisável e só então apresentar confirmação — foi por isso que a promessa pela metade foi removida em vez de fiada.

### Pendências registradas

Nenhuma pendência em aberto em 2026-09-11. As que estavam registradas aqui foram fechadas e o que cada uma passou a garantir está na tabela de **Status atual**, com a evidência. Itens novos entram nesta lista em ordem de gravidade; "tarefa criada" significa que já existe trabalho aberto para o item.


## Critério de conclusão

O projeto só deve ser considerado completo quando as fases 1–3 tiverem evidência executável. Recursos remotos não devem ser marcados como concluídos apenas pela existência de um adaptador: é necessário teste em sandbox autorizado e relatório sem segredos.

A Fase 3 está cumprida com uma distinção que o documento precisa preservar, para não se ler mais do que foi feito: **Notion e o provedor de IA foram validados contra serviços reais de terceiros**; **e-mail e notificações remotas foram validados contra uma sandbox própria**, o que prova a fiação do Hibi mas não a compatibilidade com um serviço de mercado. O primeiro serviço real que for plugado nesses dois conectores ainda pode revelar incompatibilidade de contrato.

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
