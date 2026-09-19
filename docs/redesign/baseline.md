# Baseline da migração visual

Data: 19/09/2026

## Base observada

- Repositório: `contatobentodsgn/Hibi`.
- Commit-base: `183bdb8a753cf792d7885158b89678f21b3ab789` (`Merge pull request #164 from contatobentodsgn/claude/status-voice-plan`).
- Branch de trabalho: `codex/ui-baseline`, criada diretamente de `origin/main`.
- Reserva: issue #48, comentário `#issuecomment-5741542428`.
- Plano executivo: `docs/superpowers/plans/2026-09-18-hibi-ui-complete-implementation.md`.

O checkout local anterior estava 180 commits atrás e tinha 27 commits fora de `origin/main`. Ele não foi mesclado nem promovido. A branch de baseline foi criada diretamente da referência remota atual para evitar trazer de volta versões antigas de telas, voz ou calendário.

## Superfícies atuais

O Hibi tem três entradas React no mesmo bundle:

1. aplicação principal, sem parâmetro `overlay`;
2. mascote no notch, com `overlay=notch`;
3. barra rápida do Taby, com `overlay=bar`.

A reconstrução precisa validar as três. Estilizar somente a janela principal deixa duas superfícies de produção fora do sistema visual. A janela principal usa `AppShell`, a overlay do mascote usa `NotchOverlay`, e a barra rápida usa `TabyBar`.

## Navegação e estado que precisam ser preservados

O shell atual oferece cinco destinos no dock: Home, Tarefas, Agenda, Foco e Taby. O menu Mais contém Lembretes, Notas, Hábitos, Metas, Revisão, Estatísticas, Ajustes, Ajuda, Eventos, Feedback, Atualizações e Hardware. Dia/Semana são estados de Agenda; Pausa é estado de Foco.

O destino oficial aprovado será Hoje, Agenda, Tarefas, Notas e Taby, com Ajustes separado. Antes de remover o menu Mais, rotas secundárias precisam de acesso contextual e pela paleta de comandos.

Comportamentos sensíveis observados no `App`:

- clicar novamente na tela atual não remonta o formulário nem apaga o rascunho;
- a tela de Foco permanece montada enquanto uma sessão está ativa;
- uma Pausa ativa não é descartada ao clicar em Foco no dock;
- a paleta não abre por cima dos modais de tarefa, lembrete ou prazo;
- a barra rápida envia texto e voz ao mesmo fluxo do Taby;
- listeners da barra são removidos individualmente no teardown;
- `legacy-surface` mantém o isolamento visual durante a migração;
- validação e confirmação da API local aparecem acima do conteúdo;
- os três modais globais ficam montados dentro do shell.

Esses comportamentos são requisitos da nova navegação, não detalhes descartáveis da implementação antiga.

## Estado funcional já incorporado

| Área | Baseline que a UI deve preservar |
| --- | --- |
| Foco | Sessão sobrevive à navegação e mostra ação para retornar |
| Calendário | ICS UTC/TZID, dia inteiro, horários fora de 08h–22h, sobreposição e edição bidirecional |
| Tarefas | Criação rápida respeita a pasta filtrada |
| Datas | Telas atualizam na virada do dia mesmo após janela escondida |
| Lembretes | Ocorrência única não é gravada no passado |
| Metas | Aumentar o alvo retira estado de conclusão quando necessário |
| Revisão | Agenda tarefa sem horário e persiste dispensas |
| Notion | Prévia obsoleta é recusada antes da escrita |
| Recuperação | Pontos de restauração já são listados e aplicados na aba Dados |
| Taby | Conversas, streaming, cancelamento, voz e confirmação têm testes dedicados |
| Mascote | Host nativo, fallback Electron, vídeos por estado e barra rápida são separados |

## Baseline executável

Primeira execução de `npm test` após trocar para a principal:

- Vitest: 108 arquivos, 913 testes aprovados.
- Node: 659 aprovados, 1 falhou.
- Falha: `native/notch/calendar.test.cjs`, porque o addon carregado não expunha a função EventKit exigida pela principal atual.

O protocolo de `AGENTS.md` exige reconstruir dependências nativas em checkout atualizado. Depois de `npm --prefix native/notch install` e `npm run native:build`, a repetição passou:

- Vitest: 108 arquivos, 913 aprovados.
- Node: 660 aprovados, 0 falhas.
- Código final: 0.

Conclusão: a falha era um artefato nativo antigo, não um defeito da `main`. Qualquer validação futura que muda de base precisa reconstruir o addon antes de diagnosticar EventKit/notch.

## Estado visual atual e comparação futura

A janela atual usa uma topbar discreta, conteúdo legado claro e dock escuro flutuante. A nova Adaptive Notch Navigation substitui o shell visual, mas não o roteamento nem os proprietários de estado. A baseline visual oficial do destino está descrita em `reference-manifest.md`.

Capturas reproduzíveis da Home atual, geradas com o seed local pelo Vite:

- `docs/redesign/baseline-assets/main-light-1280x820.png`;
- `docs/redesign/baseline-assets/main-light-960x620.png`.

Elas confirmam um problema a considerar na migração: em 960×620 o dock cobre o conteúdo inferior visível. A nova barra inferior precisa reservar inset próprio; a posição superior não pode cobrir topbar, controles da janela ou cabeçalho.

Capturas da aplicação real devem usar workspace de teste e excluir conteúdo pessoal. A prova visual final precisa cobrir:

- janela 960×620, 1024×768, 1280×820 e 1440×900;
- claro e escuro;
- menu superior e inferior;
- modo compacto do preview;
- janela principal, mascote e barra rápida;
- macOS com regiões de arraste, controles de janela, tela cheia e Retina.

## Riscos confirmados pela inspeção

- A branch histórica `codex/local-ai-voice-device` não pode substituir a principal; ela diverge de correções recentes.
- Um reset global de CSS pode tornar as overlays opacas ou quebrar seus tamanhos.
- Remontar conteúdo por tema/posição pode apagar rascunhos ou reiniciar fluxo ativo.
- A grade da Agenda e os calendários externos precisam continuar usando hora local flutuante.
- A tela de Ajustes já contém pontos de restauração, modelo local, atalhos e integrações; reconstruí-la cedo aumenta conflito e risco.
- `AvailabilityView` combina estado real do atualizador com textos históricos estáticos; a migração deve consolidar essa contradição.

## Critério cumprido pela U00

- Referência remota, branch e reserva registradas.
- ZIP aprovado verificado e manifestado.
- Entradas de renderer e rotas inventariadas.
- Matriz de paridade criada.
- Suíte funcional executada depois da preparação nativa exigida.
- Falhas e riscos da base registrados sem editar núcleo ou dependências.

Verificações finais da branch:

- `npm test`: 913 Vitest + 660 Node, código 0;
- `TZ=Pacific/Kiritimati npm test`: 913 Vitest + 660 Node, código 0;
- `npm run parity:check`: 18 invariantes, código 0;
- `npm run safety:renderer`: aprovado, código 0;
- `npx tsc --noEmit`: código 0;
- `npm run build`: código 0; Vite gerou o bundle e advertiu que o chunk principal tem 579,70 kB;
- `HIBI_E2E_PORT=4380 npx playwright test`: 195 aprovados, código 0.

Medições de desempenho e capturas do app real serão repetidas em U27 nas mesmas condições. Esta baseline documental não usa o workspace pessoal nem serviços externos.
