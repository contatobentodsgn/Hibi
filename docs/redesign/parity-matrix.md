# Matriz de paridade da nova UI

Data da leitura: 19/09/2026. Base: `183bdb8a753cf792d7885158b89678f21b3ab789`.

Esta matriz é o contrato de preservação funcional da migração. Uma tela visualmente pronta não encerra sua unidade enquanto as ações e estados abaixo não estiverem ligados ao comportamento real.

## Rotas e superfícies

| Origem atual | Destino final | Funções que precisam permanecer | Estados obrigatórios | Prova existente/recomendada |
| --- | --- | --- | --- | --- |
| HomeView | Hoje | abrir comandos, navegar, resumos diários | vazio, compromisso, tarefas, virada do dia | `home-atelier.spec.ts`, novo e2e Hoje |
| AgendaView/DayView/WeekView | Agenda | mudar dia/semana, navegar datas, criar/excluir bloco | vazio, sobreposição, dia inteiro, horários extremos | `calendar-day`, `calendar-grid`, `calendar-ics` |
| TasksView | Tarefas | criar, renomear, concluir, reabrir, excluir, editar prazo, filtrar pasta | lista vazia, filtro vazio, prazo, títulos longos | `tasks-atelier`, `task-quick-create`, `folders` |
| RemindersView | Tarefas → Lembretes | criar, renomear, pausar, retomar, excluir, editar agenda | único, recorrente, passado recusado, pausado | `reminders-atelier`, `review-goals-actions` |
| NotesView | Notas | criar, editar, excluir, pesquisar, filtrar pasta | vazio, busca vazia, rascunho, texto longo | `notes-atelier`, `folders`, novo reinício |
| TabyView | Taby | conversar, trocar/criar/excluir conversa, voz, cancelar, confirmar ação | ocioso, streaming, erro, voz, confirmação | `taby-conversations`, `voice-handsfree`, `assistant-integration-action` |
| FocusView | Foco/Pausa | iniciar, pausar, retomar, concluir, mudar modo | sessão ativa/oculta, ausência, sleep/wake | `focus-atelier`, `focus-presence`, `focus-survives-navigation` |
| HabitsView | Hoje → Rotina | criar, editar, marcar, desmarcar, excluir | dia local, virada do dia, histórico | `habits-goals-atelier` |
| GoalsView | Hoje → Progresso | criar, editar, atualizar progresso, excluir | zero, concluída, alvo aumentado | `habits-goals-atelier`, `review-goals-actions` |
| ReviewView | Hoje → Revisão | agendar pendência, abrir contexto, dispensar | sem sugestão, obsoleta, dispensada | `review-suggestions`, `review-goals-actions` |
| StatsView | Progresso → Tendências | período, filtro, exportação | sem dados, zero, intervalo personalizado | `stats.spec.ts` |
| SettingsView | Ajustes | todas as preferências e serviços atuais | desktop ausente, carregando, erro, salvo | testes de Settings por área |
| InstrumentationView | Ajustes → Avançado | visualizar/limpar eventos e histórico de IA | vazio, volume, confirmação | `smoke` e teste dedicado posterior |
| HelpView | Ajustes → Ajuda | abrir rotas e explicar atalhos atuais | pt/en, comandos atualizados | `smoke`, novo e2e Ajustes |
| FeedbackView | Ajustes → Ajuda | escolher tipo e salvar rascunho local | vazio, enviado localmente | novo e2e Ajustes |
| AvailabilityView updates | Ajustes → Sobre | estado e comandos reais do atualizador | disabled, checking, available, downloading, ready, error | `updates.spec.ts` |
| AvailabilityView hardware | Ajustes → Dispositivos | capacidades e diagnóstico reais | disponível, indisponível, fallback | `notch-display`, testes de adapter |
| CommandPalette | Busca de comandos | navegar, pasta, pedido ao Taby, confirmar/cancelar | pesquisa vazia, sem resultado, confirmação | `foundation`, `local-api-confirmation`, `folders` |
| TaskCreateModal | Tarefas/Hoje | título, duração, pasta, salvar/cancelar | inválido, pasta selecionada, Escape | `task-quick-create`, `smoke` |
| ReminderCreateModal | Lembretes | título, data/hora, recorrência, salvar/cancelar | passado, inválido, recorrente | `reminders-atelier` |
| DeadlineEditModal | Detalhe de tarefa | editar/remover prazo e cancelar | sem prazo, prazo existente | novo e2e tarefa |
| NotchOverlay | Mascote nativo/fallback | reproduzir estado e ação correta | idle, listening, thinking, acting, result, confirmation, error, reminder | `overlays`, `pending-confirmation-superseded` e manual Mac |
| TabyBar | Barra rápida | texto, voz, parar, fechar, confirmar/cancelar | input, listening, thinking, reply, notice, confirmation | `taby-bar`, `taby-bar-wiring` |

## Ajustes

| Grupo final | Fonte atual | Contrato a preservar | Prova |
| --- | --- | --- | --- |
| Aparência | ThemeProvider, TintSettings | sistema/claro/escuro, tint e aplicação imediata | `theme`, `tint`; novo menu-position |
| Geral | SettingsView, ShortcutSettings | idioma, 12h/24h, iniciar ao entrar, atalho global | `shortcut-*`, `calendar-grid`, e2e Settings |
| Foco e rotina | FocusSettingsPanel | duração, ausência, timeout, alertas, loop | `focus-settings`, `focus-presence` |
| Taby e voz | AiSettings, LocalModelSettings, voice hooks | provedor, fallback, uso, modelo, download/cancelamento e voz | `local-model-settings`, `voice-handsfree` |
| Notch e mascote | NotchDisplaySettings | monitor, tamanho, testar, capacidade do host | `notch-display`, manual Mac |
| Integrações | IntegrationsView | conectar/revogar, configurações e segredo nunca retornado | `integrations-connectors`, OAuth tests |
| Google Calendar | CalendarSyncPanel | fontes, modo, publicar/sincronizar e resolver conflito | `calendar-two-way` + roteiro real dedicado |
| Calendários do Mac | MacCalendarConnection | permissão, fontes EventKit, leitura/escrita e modo | testes EventKit + app real |
| Notion | NotionSyncPanel | prévia, decisões, confirmação e recusa de preview velho | `notion-sync*` |
| Notificações | SettingsView | capacidade real e teste | `notifications-settings` e manual |
| Dados | SettingsView/Data | exportar/importar, restaurar ponto, suporte e reset | `restore-points`, `workspace-states`, `destructive-actions` |
| Atualizações | UpdatePanel | verificar, baixar, progresso, reiniciar/instalar | `updates.spec.ts` + pacote |
| Dispositivos | AvailabilityView | status real do adapter e companion | testes de adapter + manual |
| Avançado | InstrumentationView | diagnóstico local e exportação sem segredos | testes de segurança e manual |

## Contratos de continuidade

| Evento durante operação | Estado que não pode ser perdido |
| --- | --- |
| Clicar na rota atual | Rascunho do formulário atual |
| Navegar durante foco | Sessão, tempo e estado pausado |
| Mudar tema ou posição do menu | Sessão, conversa em geração, seleção e rascunhos |
| Fechar paleta com confirmação | Cancelar somente a confirmação que ela levantou |
| Abrir paleta com modal global | Paleta permanece fechada; modal e rascunho ficam intactos |
| Trocar conversa durante geração | Resposta continua vinculada ao pedido/conversa corretos |
| Fechar barra rápida durante voz | Escuta para e apresentação correta é dispensada |
| Restaurar ponto | Operação conclui e janela recarrega antes de nova gravação |
| Virada de meia-noite | Dia, hábitos e indicadores passam para a data local correta |
| Renovar OAuth | Estado conectado só volta após credencial válida |

## Lacunas de apresentação que a migração deve resolver

- `AvailabilityView` usa texto histórico estático ao lado do `UpdatePanel` real.
- Diversas confirmações repetem overlays próprios e devem convergir no padrão acessível comum.
- Parte dos textos continua em inglês dentro da UI pt-BR.
- O menu Mais concentra áreas de uso e manutenção; a arquitetura final desloca cada uma para contexto ou Ajustes.
- `legacy-surface` mantém telas claras dentro de tema escuro; deve desaparecer por tela aceita, não globalmente no início.
- A posição da Adaptive Notch Navigation ainda não é uma preferência no app.
- O preview tem dados fictícios; nenhuma ação do preview é prova de integração.

## Regra de atualização

Cada PR de tela marca as linhas correspondentes em sua descrição com: comportamento preservado, teste executado, limitações reais e destino do componente legado. Esta matriz só deve ser alterada quando a `main` mudar o contrato; não deve ser usada para declarar sucesso sem evidência executável.
