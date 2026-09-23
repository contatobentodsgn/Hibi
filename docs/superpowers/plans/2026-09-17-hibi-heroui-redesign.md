# Hibi HeroUI — Plano de implementação

> **For agentic workers:** Use `subagent-driven-development` ou `executing-plans` para executar as unidades deste plano, com revisão entre entregas. As caixas representam trabalho ainda não executado. Respeitar o contrato do AGENTS.md e as autorizações do usuário.

**Goal:** Reconstruir a interface do Hibi com HeroUI, preservando dados, integrações e notch aprovado, com cinco destinos diários e configurações concentradas em Ajustes.

**Architecture:** React e Electron permanecem. A apresentação consome os adaptadores e contratos existentes; o host nativo do notch permanece separado. A migração acontece por telas, sobre componentes compartilhados e tema Hibi, sem substituir regras de calendário, armazenamento ou segurança.

**Tech Stack:** React 19, TypeScript, Vite, Electron/AppKit existentes; HeroUI React v3, Tailwind CSS v4 e Motion propostos, sujeitos à verificação de compatibilidade e ao protocolo de dependências do repositório.

---

## 1. Situação e limites do plano

Data: 17/09/2026. Documento de planejamento, não autorização implícita para iniciar a reconstrução nesta entrega.

Referências examinadas localmente:

| Referência | Commit observado | Uso |
| --- | --- | --- |
| `codex/local-ai-voice-device` | `478b6f1` | Comportamento e visual do notch aprovados pelo usuário; inventário de voz, modelo e dispositivo |
| `main` local | `6c0b7f1` | Histórico local divergente; não usar automaticamente como base limpa |
| `origin/main` | `c7e3fa6`, PR #111 | Principal mais recente disponível localmente durante a escrita; atualizar antes de executar |

Nenhum fetch foi necessário para escrever este documento; `origin/main` é uma referência local, não garantia do último estado no servidor. Já contém trabalho até #110 de modelo local e commits recentes de voz e companion. A separação antiga entre branches não representa mais exclusividade funcional.

O histórico local contém uma integração ampla e seu revert. Não refazer merge com preferência global por um lado, não reescrever main e não promover a branch antiga inteira. Comparar diferenças finais de arquivos e testes, não somente ancestralidade.

`docs/notch-manual-results.md` na branch examinada registra validação de um cartão textual de setembro/10. Isso não comprova a geometria, o vídeo ou a inicialização do gatinho aprovado depois. Registrar uma referência nova antes do redesign.

## 2. Decisões de produto

- Menu principal: Hoje, Agenda, Tarefas, Notas, Taby; acesso separado a Ajustes.
- Foco é uma superfície dedicada, aberta por ação persistente, tarefa ou widget de Hoje. Pausa é um estado do Foco.
- Hoje dá acesso a Rotina/Hábitos, Progresso/Metas/Estatísticas e Revisão. Essas funções não são configurações.
- Lembretes ficam dentro de Tarefas, mantendo seu modelo e recorrência próprios.
- Dia e semana são modos de Agenda, não itens de menu.
- Ajuda, feedback, atualizações, dispositivo e diagnósticos ficam em Ajustes.
- Busca/comandos permite chegar a qualquer área secundária. Rotas antigas devem continuar resolvendo para o contexto correspondente.
- Estética: referência 16 para composição, 15 para acabamento e 17 para detalhes. Branco sobre cinza suave, sombras delicadas, cor pontual e cantos proporcionais. Não reproduzir inclinações promocionais das montagens nas telas de trabalho.
- Preservar vídeo, geometria e comportamento aprovado do notch. HeroUI não substitui NSPanel/AppKit.

## 3. Escopo e fronteira funcional

Incluído: tema, navegação, telas existentes, formulários, estados de carregamento/erro/vazio, microinterações, localização, acessibilidade, reorganização de ajustes e preservação dos fluxos existentes.

Separado como evolução futura: projetos, subtarefas, recorrência de tarefas, editor rico/anexos, widgets reordenáveis, arrastar/redimensionar agenda quando ausente, conta/nuvem, sincronização entre computadores, automações propositivas, novos serviços externos e protocolo físico. Não exibir botões funcionais fictícios nem incluir essas funções silenciosamente em PRs visuais.

A migração visual não altera schemas do workspace, política de backup, tokens, Keychain ou regras de reconciliação. Conversas continuam fora do backup do workspace conforme contrato atual.

## 4. Coordenação e execução segura

- Codex: `src/ui/`, componentes, tema e documentação própria deste plano.
- Claude: `electron/`, `native/`, `src/data/`, scripts, IPC, `src/global.d.ts`, dependências e CI conforme AGENTS.md.
- Em `src/App.tsx` e `src/ui/SettingsView.tsx`, montar novos módulos com alterações pequenas. Não reformatar arquivos compartilhados por conveniência.
- Novas traduções de redesign: propor prefixo `redesign.*`; manter textos pt/en equivalentes e não editar `data.*` sem coordenação.
- Ao executar, verificar/reservar a unidade na issue #48 e respeitar reservas vigentes. Este documento não publica comentários nem reservas externas.
- Um item coeso por PR. Núcleo e interface em PRs separados quando necessário.
- Não usar os worktrees do Claude. Não alternar checkout com servidor de desenvolvimento rodando sobre arquivos que serão trocados.
- Base nova deve partir de `origin/main` atualizado após inspeção da divergência. Preservar referências e alterações locais; não forçar pull, reset ou push para resolver divergência.

## 5. Estrutura dos arquivos

Caminhos relativos à raiz `/Volumes/Games/Projetos/Hibi/Hibi`.

| Caminho | Responsabilidade |
| --- | --- |
| `src/ui/redesign/theme.css` (novo) | Tokens semânticos Hibi, integração HeroUI, temas claro/escuro |
| `src/ui/redesign/motion.ts` (novo) | Durações e transições compartilhadas; redução de movimento |
| `src/ui/redesign/RedesignProvider.tsx` (novo) | Ponte com tema/idioma existentes; provider só quando exigido pela versão adotada |
| `src/ui/redesign/components/` (novo) | Composições reutilizáveis: WidgetCard, SectionHeader, EmptyState e AsyncNotice, criadas quando houver consumidor real |
| `src/ui/redesign/preview/ComponentPreview.tsx` (novo) | Galeria de desenvolvimento com estados de controles; inacessível como menu de produção |
| `src/ui/shell/routes.ts`, `AppShell.tsx`, `Dock.tsx` | Destinos, agrupamento, teclado e shell |
| `src/ui/redesign/screens/` (novo) | Telas migradas uma a uma, com props compatíveis com os componentes existentes |
| `src/ui/redesign/settings/` (novo) | Seções de Ajustes, busca e navegação interna |
| `src/ui/__tests__/`, `tests/e2e/` | Testes comportamentais e visuais relevantes |
| `docs/redesign/` (novo) | Inventário consolidado, decisões e provas sem dados pessoais |

Não construir wrappers de todos os componentes HeroUI. Usar seus componentes diretamente e extrair composições Hibi onde houver repetição ou identidade própria. Evitar manter duas implementações permanentes após aceitar uma tela.

## 6. Inventário de migração

| Área e fonte existente | Entrega e melhoria | Componentes HeroUI previstos | Peça própria / prova essencial |
| --- | --- | --- | --- |
| Hoje — `HomeView.tsx` | Compromisso atual, próxima ação, rotina e foco com hierarquia | Card, Surface, Button, Chip | Widgets; dia vazio/ocupado e navegação correta |
| Agenda — `AgendaView.tsx`, `DayView.tsx`, `WeekView.tsx`, `ExternalCalendarAgenda.tsx` | Dia/semana legíveis, detalhes e sincronização contextual | Tabs, DatePicker, TimeField, Popover | Grade horária; datas locais, sobreposição e eventos externos |
| Tarefas — `TasksView.tsx` | Lista, busca, pastas, prazo e detalhes sem excesso de ações | Checkbox, SearchField, Dropdown, Drawer | Linha de tarefa; CRUD e filtros |
| Lembretes — `RemindersView.tsx` | Subseção de Tarefas; prioridade, próxima ocorrência e recorrência | Select, DateField, TimeField, Switch | Prévia de recorrência; pausar/retomar sem mudar horários |
| Notas — `NotesView.tsx` | Lista/galeria, editor ao selecionar e prévias | SearchField, ListBox, TextArea, Toolbar | Cartão de nota; criar, editar, pesquisar e preservar conteúdo |
| Foco/pausa — `FocusView.tsx` | Sessão dedicada e indicador persistente | Button, ToggleButtonGroup, ProgressCircle | Timer; navegação não reinicia sessão; política de ausência preservada |
| Taby — `TabyView.tsx`, `useAssistantTurn.ts`, `useConversations.ts` | Conversa, histórico e voz com estados claros; detalhes técnicos recolhidos | TextArea, ScrollShadow, Disclosure, Alert | Mensagens e propostas; streaming/cancelamento/erro e isolamento de conversas |
| Hábitos — `HabitsView.tsx` | Hoje → Rotina; marcação e histórico | Checkbox, Popover, ProgressBar | Faixa semanal; completar no dia local correto |
| Metas — `GoalsView.tsx` | Hoje → Progresso; unidade, valor e edição consistente | Meter, NumberField, Drawer | Cartão de meta; limites e atualização correta |
| Revisão — `ReviewView.tsx` | Hoje → Revisão; motivo e ação por sugestão | Accordion, Chip, Button | Sugestões existentes; dispensar sem executar mutação automática |
| Estatísticas — `StatsView.tsx` | Progresso → Tendências; linguagem da referência 15 | DateRangePicker, Tabs, Tooltip | Gráficos próprios; zero vs ausência, período e exportação |
| Ajustes — `SettingsView.tsx` | Novo agrupamento e busca; migrar visual por último | Form, Fieldset, Select, Switch | Navegação interna e estado de salvar |
| Integrações — `IntegrationsView.tsx`, `CalendarSyncPanel.tsx`, `NotionSyncPanel.tsx`, `MacCalendarConnection.tsx` | Configuração em Ajustes; conflitos acessíveis na Agenda | Card, Drawer, CheckboxGroup, AlertDialog | Conectar/reconectar, fontes e ações confirmadas |
| Ajuda — `HelpView.tsx` | Ajustes → Ajuda; informação coerente com capacidades | SearchField, Accordion, Kbd | Atalhos e rotas funcionais |
| Feedback — `FeedbackView.tsx` | Ajustes → Suporte; esclarecer destino e resultado | Select, TextArea, FieldError, Toast | Não declarar envio quando serviço não respondeu |
| Diagnósticos — `InstrumentationView.tsx` | Ajustes → Avançado; filtros e detalhes | Table, Disclosure, SearchField | Logs sanitizados e exportação existente |
| Atualizações — `AvailabilityView.tsx` | Ajustes → Sobre; versão e progresso reais | ProgressBar, Alert, Button | Indisponível/disponível/baixando/reinício |
| Hardware — `AvailabilityView.tsx` | Ajustes → Dispositivos; capacidades reais | Card, Badge, Alert | Sem pareamento fictício; protocolo futuro separado |
| Notch — `NotchOverlay.tsx`, `NotchDisplaySettings.tsx` | Ajustes e confirmação web refinados; host aprovado preservado | Select, RadioGroup, Button | Vídeo nativo e validação física em etapa do responsável pelo núcleo |

## 7. Ajustes: organização alvo

1. **Experiência:** Geral; Aparência; Notch e personagem; Foco e rotina; Notificações.
2. **Assistente:** IA e modelo local; Voz. Mover gestão do modelo de Dados para Assistente.
3. **Conexões:** Integrações; Dispositivos.
4. **Dados e sistema:** Dados e recuperação; Privacidade e permissões; Atalhos; Avançado.
5. **Suporte:** Ajuda e feedback; Sobre e atualizações.

Não criar uma página vazia para cada título. Agrupar subseções pequenas na mesma superfície e revelar opções avançadas por Disclosure. Busca deve encontrar a configuração e abrir sua seção. Disponibilidade de recursos vem de estado real; texto explicativo não substitui uma verificação.

Dados e recuperação inclui pontos de restauração: verificar a presença e o contrato da implementação mais recente antes de criar outra. Recarregar após restauração conforme contrato do adaptador. Exibir consequência, progresso, sucesso e falha sem acessar o banco diretamente pela UI.

## 8. Tema e movimento

Valores iniciais propostos, a validar no piloto, não amostragem exata dos prints:

- Fundo claro `#F5F5F7`; cartão `#FFFFFF`; texto principal `#202126`.
- Texto secundário com contraste mínimo 4,5:1 em tamanho normal; borda decorativa não substitui foco visível.
- Ritmo de 4/8 px; margens internas comuns de 16–24 px; raios de controles 10–14 px e cartões 20–24 px.
- Cor de destaque semântica configurável. Sucesso/atenção/erro também têm ícone e texto.
- Sombras curtas nos controles e difusas em overlays. Sem sombras pesadas em todas as linhas.
- Tipografia de sistema; números tabulares no timer e horários. Evitar títulos enormes no desktop.
- Motion: feedback curto de 100–160 ms; menus 160–220 ms; expansão 220–320 ms como ponto de partida. Mola controlada somente onde melhorar a continuidade.
- Reduzir movimento elimina deslocamentos e oscilações; mantém feedback imediato. Não duplicar animações HeroUI e Motion na mesma propriedade.
- Elementos não saltam ao receber foco; ações ficam acessíveis por teclado, não apenas no hover.
- CSS do redesign é escopado: não alterar transparência do documento da overlay nem criar fundo branco no notch.

## 9. Etapas executáveis e critérios de passagem

### E0 — Consolidar inventário e baseline

**Arquivos de entrega:** criar `docs/redesign/baseline.md` e `docs/redesign/feature-matrix.md`.

- [ ] Consultar issue #48, branches, worktrees e estado de trabalho; atualizar referência remota antes de escolher a base.
- [ ] Comparar main local, origin/main e branch aprovada por recurso; registrar commit, implementação escolhida, motivo e teste existente.
- [ ] Executar a baseline principal sem mudanças visuais; registrar falhas preexistentes separadamente.
- [ ] Abrir a versão aprovada e verificar o gatinho no MacBook: inicialização, loop, tamanho, margens das orelhas, menu, digitação e envio de mensagem.
- [ ] Registrar evidência por commit. Capturas devem mostrar só o app/notch e dados de teste; diagnóstico de processo não é prova visual.
- [ ] Definir com Claude qualquer portabilidade necessária do notch sobre a principal atual. Não bloquear o desenho do piloto, mas bloquear a declaração de versão final até resolver a baseline nativa.

**Aceite:** matriz sem recursos omitidos; implementação oficial do notch identificada; falhas conhecidas explícitas. Nenhum merge amplo ou reset feito para produzir a matriz.

### E1 — Fundação técnica e galeria de componentes

**Arquivos:** novos módulos `src/ui/redesign/` descritos na seção 5; alterações mínimas em `src/main.tsx`; dependências/configuração pelo responsável do repositório.

- [ ] Claude confirma versões estáveis compatíveis de HeroUI v3, Tailwind v4 e Motion, licença e lockfile. Não misturar APIs v2/v3 nem usar versões flutuantes no plano como garantia.
- [ ] Validar uma composição real com React 19/Vite e empacotamento file://; não instalar bibliotecas concorrentes de controles.
- [ ] Implementar tema Hibi e conexão com preferências de idioma/tint existentes.
- [ ] Montar galeria de Button, campo, busca, seletor, Card, menu e painel, com disabled, foco, processamento, erro e textos longos.
- [ ] Verificar que a galeria não muda os estilos da UI legada e do notch.
- [ ] Registrar comparação visual clara/escura e submeter esta unidade isoladamente.

**Aceite:** dependências reproduzíveis, nenhuma regressão de overlay, controles utilizáveis por teclado e sem APIs removidas.

### E2 — Shell e navegação

**Arquivos:** `src/ui/shell/routes.ts`, novo `src/ui/redesign/HibiShell.tsx`; linha de montagem em `src/App.tsx`; testes `shell.test.tsx` e `tests/e2e/redesign-navigation.spec.ts`.

- [ ] Mapear rotas antigas para os cinco destinos sem descartar acesso a nenhuma área.
- [ ] Construir navegação principal, Ajustes separado, busca e ação persistente de Foco.
- [ ] Implementar acessos contextuais de Hoje e Tarefas e manter comandos existentes.
- [ ] Testar teclado, item ativo, abertura de detalhe e retorno preservando filtros.
- [ ] Verificar 1024×768, janela usual do MacBook e monitor amplo; navegação não cobre campos.

**Aceite:** cinco destinos diários, Ajustes separado e nenhuma rota órfã. Não incluir 15 opções em um menu Mais substituto.

### E3 — Piloto Hoje + edição de tarefa

**Arquivos:** `src/ui/redesign/screens/TodayScreen.tsx`, `src/ui/redesign/components/TaskDetailsPanel.tsx`; reutilizar contratos de `HomeView.tsx`, `TasksView.tsx`, `TaskCreateModal.tsx`, `DeadlineEditModal.tsx`; montagem mínima em App.

- [ ] Definir composição com compromisso atual, próxima ação, rotina e foco inspirada na referência 16.
- [ ] Conectar dados e callbacks reais; cenários de demonstração ficam em fixtures de desenvolvimento.
- [ ] Construir painel de tarefa preservando criação, edição, pasta, status e prazo existentes.
- [ ] Cobrir vazio, dia cheio, nomes longos, atraso, indisponibilidade e erro de salvamento onde o contrato expuser erro.
- [ ] Validar que cancelar edição não grava e que salvar realmente reflete no workspace.
- [ ] Apresentar piloto no MacBook e registrar avaliação visual do usuário antes de replicar o acabamento.

**Aceite:** ações completas, estética aceita e nenhum botão decorativo simulando função. Se a composição for rejeitada, revisar o piloto, não espalhar a versão pelas outras telas.

### E4 — Tarefas, lembretes e agenda

**Arquivos:** telas novas em `src/ui/redesign/screens/`; fontes da seção 6; testes existentes de calendário/tarefas e `tests/e2e/redesign-planning.spec.ts`.

- [ ] Migrar Tarefas usando o painel aceito; preservar pastas, filtros e prazo.
- [ ] Migrar Lembretes como subseção sem converter lembretes em tarefas.
- [ ] Migrar Dia/Semana, controles de data e detalhes mantendo funções de data existentes.
- [ ] Manter sincronização e conflitos visíveis no contexto da agenda; configuração abre Ajustes → Integrações.
- [ ] Exercitar CRUD local e fluxos remotos com dublês; validação real somente em agenda dedicada.

**Aceite:** horários idênticos antes/depois, sem duplicação remota, filtros preservados e resolução de conflitos usando o serviço atual. Uma unidade/PR para cada área.

### E5 — Foco, Taby e continuidade do notch

**Arquivos:** telas de Foco/Taby novas; reaproveitar `focus-lifecycle.ts`, `useAssistantTurn.ts`, `useConversations.ts`, `assistant-presentation.ts`. Núcleo fica com Claude.

- [ ] Migrar Foco preservando timer e comportamento durante navegação/ausência.
- [ ] Migrar conversa, histórico e compositor, com estados de voz e geração conectados aos eventos reais.
- [ ] Exibir escolha de motor e informações técnicas em detalhes/ajustes; não ocupar o centro da conversa com diagnósticos.
- [ ] Testar cancelamento, falha, trocar conversa durante resposta, nova conversa e confirmação de ação.
- [ ] Verificar no app real que digitar, falar e enviar não encerram o notch; restaurar idle após apresentação temporária conforme núcleo oficial.

**Aceite:** nenhuma sessão perdida por remontagem visual; estados coerentes; gatinho preservado. Ouvintes devem ser removidos no teardown sem apagar assinaturas de outros consumidores.

### E6 — Notas, hábitos, metas, revisão e estatísticas

**Arquivos:** telas novas correspondentes, mantendo serviços e funções de domínio existentes; testes por área.

- [ ] Migrar Notas com lista/prévia/editor textual e tratamento de cancelamento.
- [ ] Migrar Hábitos e Metas para páginas acessíveis por Hoje, com ações reais.
- [ ] Migrar Revisão mantendo motivos, dispensas e navegação das sugestões.
- [ ] Migrar Estatísticas para o acabamento da referência 15; manter cálculos, períodos e exportações existentes.
- [ ] Validar dia local nos hábitos, limites das metas e zero/sem dados nas estatísticas.

**Aceite:** cada área tem seu PR e funciona isoladamente; não adicionar editor rico ou novos cálculos de produtividade nesta migração.

### E7 — Ajustes e suporte, por último

**Arquivos:** `src/ui/redesign/settings/SettingsScreen.tsx`, módulos por grupo; montagem mínima em `SettingsView.tsx`; reaproveitar painéis de integração e APIs existentes.

- [ ] Construir navegação interna/busca e migrar experiência, assistente e conexões em unidades separadas.
- [ ] Mover gestão do modelo para Assistente; preservar download, cancelamento, verificação e remoção conforme contrato real.
- [ ] Integrar Dados e restauração usando adaptador; nunca chamar SQLite diretamente.
- [ ] Migrar ajuda, feedback, diagnósticos, atualizações e dispositivo para os grupos definidos.
- [ ] Tratar credenciais por estado salvo/ausente e input vazio; não retornar ou renderizar segredo guardado.
- [ ] Verificar salvar, falhar, reabrir e reiniciar para preferências persistentes. Não declarar suporte a função somente porque existe um controle.

**Aceite:** nenhum recurso do inventário desaparece, configurações são encontráveis, main compartilhada não recebe reformatação ampla e textos pt/en acompanham a UI.

### E8 — Finalização e entrega

**Arquivos:** remover componentes/CSS substituídos sem consumidores; atualizar `docs/redesign/validation.md`; status oficial atualizado por Claude.

- [ ] Executar checks requeridos pelo repositório e confirmar códigos de saída.
- [ ] Revisar tema escuro, teclado, VoiceOver com operador, reduzir movimento e janelas pequenas.
- [ ] Validar build de produção e assets locais; comparar uso de CPU/memória com a baseline, inclusive vídeo ocioso.
- [ ] Executar roteiro nativo de monitores, Spaces e sleep/wake com participação humana quando necessária.
- [ ] Remover caminhos de preview de produção e CSS legado sem uso após comparação funcional.
- [ ] Registrar limitações restantes, commits e evidências; só então promover a versão visual conforme fluxo de PRs.

**Aceite:** fluxos críticos aprovados e nenhum recurso novo apresentado como completo sem prova real. CI indisponível deve ser registrada como limitação, não como verde.

## 10. Validação e proteção contra regressões

| Fluxo | Prova necessária |
| --- | --- |
| Inicialização | Janela e gatinho visíveis no monitor integrado; vídeo avança e margens não cortam o personagem |
| Tarefas/notas/lembretes | Criar, editar, cancelar, filtrar e reabrir; persistência após reinício |
| Agenda | Horário local consistente em São Paulo e Kiritimati; fontes selecionadas e confirmação mantidas |
| Taby/voz | Entrada real com operador, estado de escuta, envio/cancelamento e notch persistente |
| Foco | Timer não reinicia ao navegar; ausência segue preferência existente |
| Modelo local | Estado acompanha serviço real; falha e cancelamento não viram sucesso visual |
| Dados | Backup/restauração com fixture; chats e credenciais fora do pacote conforme contrato |
| Acessibilidade | Tab/Shift+Tab, Escape, retorno de foco, nomes acessíveis, contraste e teste humano de VoiceOver |
| Visual | Mesmos dados de teste, viewport e tema nas comparações; não usar capturas com dados pessoais |

Verificação incremental: testes comportamentais das áreas alteradas e typecheck. Não criar testes de getters de CSS ou snapshots triviais só para cumprir número. Interações HeroUI são testadas em Playwright; testes unitários existentes não têm DOM e usam renderToStaticMarkup. Testes novos precisam demonstrar a regressão que detectam conforme AGENTS.md.

Bateria antes de PR de implementação, seguindo scripts da base escolhida:

```sh
npm test
TZ=Pacific/Kiritimati npm test
npm run parity:check
npm run safety:renderer
npx tsc --noEmit
npm run build
HIBI_E2E_PORT=4380 npx playwright test
```

Resultado esperado: saída zero em cada comando. Guardar resultados reais; esta lista não significa execução. Rebuild nativo deve preceder conclusões sobre geometria: binário antigo carregado não prova defeito no código novo.

## 11. Recuperação e dados

- Antes de testar restauração/migração, usar workspace de teste ou backup verificado. Não copiar tokens/segredos para fixtures.
- Mudanças visuais não devem exigir migração de dados. Se surgir necessidade, abrir trabalho separado com contrato e testes do núcleo.
- Durante a migração, preservar exportações dos componentes legados até aceitar o substituto. Preferir reversão pequena por PR a um seletor permanente de duas UIs.
- Após falha de entrega, reverter apenas a unidade responsável; não restaurar versão antiga do banco sobre dados novos.
- Não executar o app antigo contra dados atuais sem verificar compatibilidade do armazenamento. A branch aprovada serve como referência, não licença para sobrescrever banco.
- Registrar última versão funcional e instrução de inicialização no baseline.

## 12. Backlog futuro, fora do primeiro redesenho

| Evolução | Local futuro | Dependência |
| --- | --- | --- |
| Primeiro uso guiado | Fluxo inicial, reabrível em Ajustes | Definir preferências obrigatórias; solicitar permissões no uso |
| Projetos/subtarefas | Tarefas | Modelo de dados, regras e migração |
| Editor rico/anexos | Notas | Formato, armazenamento, busca e backup |
| Layout personalizável | Hoje | Persistência de layout e alternativa ao arraste por teclado |
| Arraste/redimensionamento | Agenda | Regras de colisão, fuso e confirmação de escrita remota |
| Automações propositivas | Ajustes + propostas em Taby | Contrato de eventos, autorização e revisão de ações |
| Conta/nuvem | Ajustes → Conta | Decisão de produto, serviço e política de sincronização |
| Pareamento físico | Ajustes → Dispositivos | Hardware e protocolo reais |
| Reações adicionais do gatinho | Ajustes → Notch | Assets, mapeamento de estados e desempenho |

## 13. Conclusão verificável de cada unidade

- [ ] Escopo e dependências registrados; territórios respeitados.
- [ ] Funções anteriores continuam acessíveis e dados não mudam por efeito visual.
- [ ] Estados de carregamento, erro, vazio, sucesso, indisponível e texto longo tratados onde aplicáveis.
- [ ] Claro/escuro, teclado e redução de movimento verificados.
- [ ] Testes pertinentes e checks obrigatórios com códigos de saída reais.
- [ ] Prova visual do app real quando a entrega envolve aparência; não substituir por processo em execução.
- [ ] PR pequeno com arquivos compartilhados, validação e limitações descritos.

## 14. Referências e revisão deste documento

- `AGENTS.md`: responsabilidades e fluxo de colaboração.
- `docs/IMPLEMENTATION_STATUS_AND_PLAN.md`: status operacional, conferir na principal atual.
- `docs/notch-manual-results.md` e `docs/notch-manual-test-plan.md`: evidência histórica e cenários manuais; não tratar como aprovação do gatinho atual.
- HeroUI: https://heroui.com/en/docs/react/components e https://heroui.com/en/docs/react/getting-started/theming
- Motion: https://motion.dev/docs/react
- Referências visuais do usuário: imagens 15 (Performance), 16 (widgets de rotina), 17 (documentos/cartões). Arquivos temporários anexados não são armazenamento durável; ao executar, preservar cópias autorizadas no diretório do projeto, verificando disponibilidade e sem publicá-las no Git automaticamente.

Revisão de cobertura em 17/09/2026: todas as rotas do inventário têm destino; ajustes e suporte foram agrupados; recursos exclusivos/mais recentes exigem comparação E0; expansões futuras estão separadas; dados, notch e contratos possuem critérios de preservação. Este documento não afirma que dependências foram instaladas, testes executados ou telas reconstruídas.
