# Auditoria de acessibilidade e VoiceOver

Data: 14/09/2026  
Escopo: renderer do Hibi, shell principal, paleta de comandos, calendário, tarefas, lembretes, configurações, integrações e overlay do notch.

## Resultado executivo

O Hibi possui uma base semântica sólida para VoiceOver: a árvore de acessibilidade nativa expõe a navegação, os comandos, os diálogos e os controles principais com nomes compreensíveis. A bateria direcionada de teclado, foco e movimento reduzido passou integralmente.

A auditoria manual de fala ainda não pode ser considerada concluída. Não foi ativado o VoiceOver do macOS nesta sessão; portanto, ainda não há evidência observada de pronúncia, ordem de leitura, rotor, anúncio de mudanças de estado ou navegação no overlay nativo do notch.

## Evidências verificadas

- Árvore nativa do Electron/Hibi inspecionada na tela Help.
- Ações expostas com nomes acessíveis: HIBI, navegação principal, “Mais seções”, “Comandos” e todos os comandos `/day` a `/hardware`.
- Paleta de comandos usa `role="dialog"`, `aria-modal`, `role="combobox"`, `aria-expanded`, `aria-controls` e `aria-activedescendant`.
- Feedback assíncrono usa regiões `role="status"`/`role="alert"` em pontos críticos.
- O overlay do notch alterna entre `status` e `dialog`, com `aria-live="polite"` para conteúdo passivo.
- Testes executados: 16/16 passaram em `accessibility-motion.spec.ts` e `foundation.spec.ts`, usando `HIBI_E2E_PORT=4380`.

## Pontos que precisam de validação manual

### P0 — Fala real e ordem de leitura

Executar com VoiceOver ativo e verificar, em cada tela principal, se o foco segue a ordem visual e se títulos, estado atual e ação são anunciados sem duplicação. A árvore semântica, isoladamente, não comprova a experiência de fala.

### P1 — Foco ao abrir e fechar diálogos

Os diálogos têm `aria-modal="true"` e vários usam `autoFocus`, mas é necessário confirmar manualmente que:

1. o foco entra no diálogo ao abrir;
2. o VoiceOver não alcança elementos atrás do modal;
3. Escape/Cancelar fecha o diálogo;
4. o foco retorna ao controle que abriu o diálogo.

Isso é especialmente relevante para a paleta de comandos, edição/exclusão e confirmação no notch.

### P1 — Overlay do notch

Verificar no Mac com notch que o conteúdo passivo é anunciado uma vez, que uma confirmação anuncia claramente a ação e os botões “Confirmar”/“Cancelar”, e que o clique passivo não cria um ponto de foco inesperado.

### P1 — Idioma da fala

Há textos de acessibilidade em inglês em várias telas enquanto a interface também possui português. Confirmar se o idioma do documento/renderer acompanha o idioma escolhido; caso contrário, o VoiceOver pode pronunciar português com regras de inglês ou vice-versa.

### P2 — Controles compactos

Validar com o rotor de controles os botões iconográficos de editar, excluir, pausar/retomar e navegação de calendário. Eles têm rótulos dinâmicos no código, mas é necessário confirmar que o nome inclui o item afetado e o estado atual.

## Procedimento para fechar a auditoria

Com o Hibi aberto, ativar o VoiceOver pelo atalho do macOS e percorrer: Home → Tarefas → Agenda → Foco → Taby → Mais seções → Configurações → Integrações. Em cada rota, testar navegação por elemento, rotor de controles, abertura/fechamento de modal, edição, exclusão, confirmação e erro. Repetir com o overlay do notch e com o modo de movimento reduzido.

## Gate de release

Status: **não aprovado ainda para “auditoria manual com VoiceOver”**.  
Status automatizado: **aprovado nos testes direcionados**.  
Próximo passo: executar a rodada manual com VoiceOver ativo e registrar, por tela, fala esperada, fala observada, ordem e eventuais correções.
