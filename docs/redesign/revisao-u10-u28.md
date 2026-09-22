# Revisão U10–U28 — progresso do exame (salvo em 2026-09-22)

> Exame atualizado após as correções incrementais da revisão. O relatório distingue casca migrada de conteúdo ainda legado.

## Base usada

- Plano: `docs/superpowers/plans/2026-09-18-hibi-ui-complete-implementation.md` (seções 9–12, U10–U28)
- Git: `main` contém as correções de localização da Agenda e a recuperação visual de Estatísticas (`b7765b1`, `c833078`)
- Roteamento real: `src/App.tsx` (~linhas 458–501) + `src/ui/shell/routes.ts`

## Mapa U10–U28 × arquivos (verificado por leitura direta)

| Unidade | Arquivo(s) lidos | Estado verificado |
|---|---|---|
| U10 Eventos externos e conflitos | `src/ui/redesign/screens/AgendaScreen.tsx`, `ExternalCalendarPanel.tsx`, `external-calendar-panel.css` | Painel existe e está montado dentro da Agenda nova; trata fontes, calendários (bidirecional/somente leitura), eventos somente-leitura, outgoing/incoming e conflitos `remote-deleted`/edição via bridge (`getCalendarSyncState`, `readCalendarSyncEvents`, `listCalendarSyncChanges`, `prepareCalendarUpdate`, `acknowledgeCalendarIncoming`, `resolveCalendarConflict`, `executeApprovedCalendarPublish`). ICS import/export vive na Agenda nova (`readIcsCalendar`/`toIcsCalendar`). Falta conferir UTC/TZID/dia-inteiro e 409/idempotência contra o plano. |
| U11 Foco/Pausa | `src/ui/FocusView.tsx` (usa `HibiUiRoot` + `redesign/screens/focus-screen.css`), `src/App.tsx` (`focusView`, `focusHost`, `keepFocus`) | Sem `FocusScreen` em `redesign/screens/`; foi reestilização do `FocusView` legado (`focus-view--redesign`), não rebuild. Continuidade preservada no App (sessão sobrevive à troca de tela). Falta auditar timer dominante, pausa, indicador persistente e sleep/wake contra o aceite da U11. |
| U12 Notas | `src/ui/redesign/screens/NotesScreen.tsx`, `notes-screen.css` | Tela nova completa: busca, pastas, criar/editar/excluir via `ActionDialog`, rascunho local, texto simples preservado. Mistura pt/en nos rótulos (ex.: título "Notes" + "Nova nota", botões "Add note"/"Cancel"). |
| U13 Taby e voz | `src/ui/redesign/screens/TabyScreen.tsx`, `taby-screen.css` | Tela nova completa: histórico recolhível com busca, nova/selecionar/excluir, streaming, cancelamento, confirmação, retry/fallback, voz (estados via `voice.notice`). Título em inglês ("Local assistant") destoa das demais. Troca de conversa durante geração ainda por verificar. |
| U14 Barra rápida e mascote | `src/ui/TabyBar.tsx`, `src/companion/*`, (sem referência em `src/ui/redesign/`) | `TabyBar` continua legada (sem import do redesign). Há commit `7085f8b` "aplicar tema do Hibi à barra rápida" ainda não examinado. Mascote/host preservados no App. U14 **não confirmada**. |
| U15 Rotina/Hábitos | `src/ui/redesign/screens/HabitsScreen.tsx`, `rhythm-screens.css` | Tela nova completa: criar/marcar/desmarcar/editar/excluir, `todayKey`, `streakFor`/`progressFor`. Botões com classes próprias `rhythm-*`, não HeroUI. Exclusão usa `ActionDialog`. |
| U16 Metas/Progresso | `src/ui/redesign/screens/GoalsScreen.tsx` | Tela nova completa: criar/+1/definir/editar/excluir, `deriveGoalsDirection`. Exclusão usa `ActionDialog`; regra de sair de Complete ao aumentar alvo permanece coberta pela lógica de direção. |
| U17 Revisão | `src/ui/ReviewView.tsx`, `src/App.tsx:469` | Casca migrada para `HibiUiRoot` + `SectionHeader`, com a lógica local de sugestões preservada. O conteúdo interno ainda usa classes legadas e precisa de uma rodada visual dedicada. U17 **parcial**. |
| U18 Tendências/Estatísticas | `src/ui/redesign/screens/StatsScreen.tsx` (10 linhas), `stats-screen.css` | Casca migrada para `HibiUiRoot`/`SectionHeader`, mas o conteúdo ainda é o `StatsView` legado. Período vazio/exportação herdados. U18 **parcial**. |
| U19 Comandos e rotas secundárias | `src/ui/palette/*`, `src/ui/shell/routes.ts`, `src/App.tsx` (palette) | A paleta existe e o menu “Mais” deixou de ser provisório: exibe somente seis rotas de uso recorrente. Suporte, diagnóstico, atualizações e hardware permanecem acessíveis pela paleta/Ajustes. U19 **parcial** até a validação visual final. |
| U20 Estrutura de Ajustes | `src/ui/redesign/settings/SettingsScreen.tsx`, `SettingsNavigation.tsx`, `settings-sections.ts`, `settings-screen.css` | Casca nova (intro, busca, navegação com `aria-current`, `key={active}`) sobre `SettingsView` legado. Seções: Geral, Taby e voz, Integrações, Foco, Notificações, Dados, Sobre — sem entrada separada de IA; aba `Taby` reaproveita `AiSettings`+`LocalModelSettings`. Busca filtra só rótulos das seções, não chaves de tradução/destinos como pede o plano. |
| U21–U25 | diff de `5abc3c6` | O commit "U21 a U28" altera só `SettingsView.tsx` (nova aba `Taby` via `SettingsTab`), 1 linha de CSS e 2 linhas em `settings-sections.ts`. Ou seja: U21–U25 **sem telas novas**; foi oficialização do que já existia. |
| U26 Auditoria | `docs/redesign/visual-audit.md` (novo, 30 linhas) | Tabela de superfícies marcada "aprovado" por unidade, sem capturas lado a lado do preview como exige a regra 6 (comparação obrigatória). Limites (VoiceOver, zoom 200%) declarados como pendentes de ambiente interativo. Evidência fraca. |
| U27 Validação | `docs/redesign/validation.md` (novo, 20 linhas) | Registra bateria local (vitest pontual, build, `npm test` 949+671). Fluxos reais (reinício, Google/EventKit/Notion, voz, monitores, Spaces, sleep/wake, medidas vs baseline) listados como "precisam de ambiente real" — ou seja, U27 **não executada de fato**. |
| U28 Remoção do legado | `docs/redesign/migration.md` (novo, 16 linhas) | O próprio documento admite: `SettingsView`, `StatsView` e painéis de integração permanecem, `legacy-surface` permanece nas telas não migradas. Critério do plano ("nova UI é o caminho normal; legado sem consumidores removido") **não atendido**. Reversão documentada por revert de commit. |

## Achados que já dão para afirmar

1. **U17 está parcial** — a rota agora usa a casca nova, mas ainda há classes e estruturas internas legadas na lista de revisão.
2. **U18 é invólucro, não rebuild** — risco de tema escuro/contraste herdado do `StatsView`.
3. **U19 ainda precisa de validação visual** — a lista diária do "Mais" foi reduzida a seis rotas e as rotas técnicas continuam acessíveis por comandos/Ajustes; falta conferir o comportamento em janela estreita.
4. **U28 não removeu legado** — o `migration.md` confirma a permanência; `legacy-surface` segue em `App.tsx:501` para rotas não migradas.
5. **U26/U27 são documentos, não evidências** — sem comparações lado a lado arquivadas em `docs/redesign/<unidade>-assets/` (pasta não existe para U10–U28) e sem execução real dos fluxos U27.
6. **Idioma** — os rótulos de interface auditados em Agenda, Hábitos, Metas e Tarefas estão no dicionário pt/en; dias, categorias e período da Agenda também foram corrigidos nesta passada.
7. **Diálogos U15/U16** — exclusão está padronizada em `ActionDialog`; permanece uma pendência estrutural separada para migrar o conteúdo de Revisão/Estatísticas.

## Correções incrementais registradas

- U11: tokens visuais inválidos e textos fixos do foco corrigidos; resumo e aviso de foco agora respeitam PT/EN.
- U12/U13: pontos principais de Notas e Taby passaram a usar o dicionário.
- Lembretes: título, filtros, estados, recorrência, formulário, exclusão, mensagens e rótulos de acessibilidade passaram a usar o dicionário.
- Navegação: “Mais” agora mostra somente foco, lembretes, hábitos, metas, revisão e estatísticas; rotas técnicas permanecem disponíveis por comandos/Ajustes.
- Validação visual: o preview Vite foi aberto com Chrome/Playwright em viewport larga (1440×1000) e estreita (900×900) para Hoje, Agenda, Tarefas, Notas, Taby, Lembretes, Hábitos, Metas, Revisão e Estatísticas. A navegação compacta foi acionada por DOM e todas as dez rotas produziram captura; a tela de Estatísticas revelou uma falha real de CSS, corrigida em `c833078`, e foi recapturada com cards, alerta e exportação estilizados.
- U15/U16: exclusões usam `ActionDialog`; entradas principais de Hábitos e Metas usam o dicionário.
- U07: título principal de Tarefas usa o dicionário.
- U17: a casca de Revisão foi movida para `HibiUiRoot` e `SectionHeader`; a migração visual interna continua.

## Verificação executada nesta passada

- `npm test`: Vitest **121 arquivos / 949 testes** e suíte Node **671 aprovados / 0 falhas**.
- `npm run parity:check`: **18 invariantes aprovadas**.
- `npm run safety:renderer`: aprovado.
- `npm run build`: build nativo, TypeScript e Vite aprovados; permanece apenas o aviso não bloqueante de chunk acima de 500 kB.
- `scripts/visual-u10-u28.mjs`: 10 rotas em viewport larga (1440×1000) + 10 em viewport estreita (900×900), total de **20 capturas reais**. A navegação compacta foi acionada e cada captura confirmou a rota esperada.
- Correção adicional: rótulos de dias/categorias e período da Agenda agora respeitam o idioma selecionado; a suíte de Agenda/Redesign passou com **2 arquivos / 3 testes**.

## Pendências de migração estrutural

- `7085f8b` (tema na barra rápida), `5075dd2`, `096c9cc`, `92a3c9a`, merges U10/U11 (`a2bbc5b`, `c564809`, `839b74f`)
- Testes: `src/ui/__tests__/RedesignScreens.test.tsx`, `RhythmScreens.test.tsx`, `palette.test.tsx`
- `CommandPalette.tsx`, `commands.ts`, `TodayScreen` links de contexto, `TasksScreen`/`RemindersScreen` detalhe
- Migrar o conteúdo interno de Revisão e Estatísticas para componentes da nova UI, removendo as estruturas legadas em vez de apenas preservar a lógica sob uma casca nova.
- Executar os fluxos que exigem ambiente nativo/externo real (EventKit/Google/Notion, voz, monitores, Spaces, sleep/wake) quando esse ambiente estiver disponível.
- Retirar consumidores restantes do legado conforme o plano U28, depois de concluir as migrações estruturais acima.
