# Auditoria de paridade funcional

> **Substituído em 2026-09-10.** Este registro descreve o estado de 07/09 e ficou desatualizado:
> integrações, confirmações no notch e validação com monitor externo mudaram depois. A paridade
> atual com o app original está na seção "Paridade com o app original" de
> [`IMPLEMENTATION_STATUS_AND_PLAN.md`](IMPLEMENTATION_STATUS_AND_PLAN.md); a validação do notch está
> em [`notch-manual-results.md`](notch-manual-results.md). Mantido como histórico.

Referência: inventário local do aplicativo original e auditorias disponíveis em `/Volumes/SSD/app/node_modules/@hey-taby/`.

## Situação atual

Última verificação: 07/09/2026. Evidências executadas no repositório: `npm run build`, `npm test` (6 arquivos Vitest, 24 testes, mais 5 testes nativos), `npm run test:e2e` (15 fluxos aprovados) e `npm audit --omit=dev` (0 vulnerabilidades de produção). Esses testes validam a implementação do Hibi; não equivalem, por si só, a paridade 1:1 com o produto de referência.

| Área | Hibi | Observação |
|---|---|---|
| Home | Funcional localmente | Painel, contagens, próximos itens e atalhos são derivados do snapshot local; a agenda seed continua fixa para o estudo. |
| Tasks | Funcional | CRUD local, status, pasta Bento e deadline. |
| Day/Week | Funcional local | Blocos, quick add, horários, bloqueio de conflitos e importação/exportação ICS local; sem sincronização externa. |
| Reminders | Funcional | CRUD local, pausa, recorrência semanal, horários e notificações macOS. |
| Focus | Funcional | Timer local de 25 minutos com pausa e conclusão. |
| Settings | Funcional localmente | Abas General/Focus/Notifications/Data/About, preferências locais, reset, login automático e teste de notificação. Integrações externas continuam fora do escopo local. |
| Instrumentation | Funcional | Filtro, exportação JSON, limpeza e registro de ações. |
| Notes | Funcional | Criar, editar, buscar, excluir e pasta padrão Bento. |
| Habits | Funcional | Recorrência, histórico de conclusão, edição e exclusão. |
| Goals | Funcional | Metas, progresso limitado ao alvo, conclusão, edição e exclusão. |
| Review | Funcional | Resumo de tarefas, hábitos, metas, notas e blocos com atalhos. |
| Taby/AI | Funcional local / extensível | Runtime próprio com provedor heurístico, contrato para provedor OpenAI-compatível, contexto mínimo, política determinística e confirmação vinculada. Não reutiliza o Brain original. |
| Hardware/notch | Funcional com ponte AppKit pública | Janela Electron transparente no topo do monitor, todos os Spaces, click-through e estados semânticos. Em 07/09/2026, o addon próprio compilado informou a tela interna com `hasCameraHousing: true` e área segura de 32 pt, além do LG ULTRAWIDE externo sem notch. |
| Feedback/updates | Parcial | Feedback, bug e ideia são salvos localmente; `/updates` informa a build offline, sem serviço remoto de envio nem atualização do produto. |
| Notificações nativas | Funcional | Scheduler macOS para lembretes/deadlines, recorrência e teste. |
| Animações | Parcial | Transições CSS acessíveis; o inventário original referencia dezenas de vídeos/estados proprietários que não estão disponíveis no Hibi. |
| Integrações externas | Ausente | O app permanece local e sem conectores externos. |

## Conclusão

O Hibi não é uma réplica 1:1. O núcleo de planejamento local e a nova base de IA/companion estão operacionais com implementação própria; paridade visual e integrações proprietárias continuam fora do escopo.

## Validação manual do notch no macOS — 07/09/2026

Os testes automatizados cobrem geometria, fallback, IPC, política e reducer. A validação manual nesta máquina encontrou a tela interna com camera housing e um LG ULTRAWIDE externo conectado como monitor principal. A ponte AppKit compilada devolveu as duas geometrias corretamente e a janela principal permaneceu acessível após alternar para tela cheia.

| Cenário | Evidência atual | Estado |
|---|---|---|
| Tela interna com notch | `hasCameraHousing: true`, `safeAreaTop: 32` no addon | Aprovado para detecção e geometria |
| Monitor externo | LG ULTRAWIDE 2560×1080 online, sem notch; addon devolveu `hasCameraHousing: false` | Aprovado para detecção e geometria |
| Tela cheia | Janela do Hibi alternada para tela cheia e continuou acessível por automação de interface | Aprovado para janela principal; o card do overlay depende da correção abaixo |
| Spaces e clique pass-through | Configuração confirmada no runtime: `CanJoinAllSpaces`, `FullScreenAuxiliary`, `setVisibleOnAllWorkspaces`, `setIgnoreMouseEvents` | Cobertura de implementação; observação visual pendente |
| Card interativo | O fluxo de confirmação e IPC foram disparados três vezes após correções de ponte e superfície; a janela auxiliar continuou como `onscreen: 0` no compositor | Reprovado na inspeção visual; requer revisão arquitetural da estratégia de superfície |
| Repouso/despertar | Não executado para não interromper a sessão do usuário | Pendente de ação física controlada |
| Desconexão/reconexão do display | Não executada para não alterar a estação de trabalho do usuário | Pendente de ação física controlada |

Durante a investigação, a ponte AppKit foi corrigida para resolver o `NSView*` documentado pelo Electron até a `NSWindow` proprietária, e o overlay passou a usar uma `panel` não ativadora — a superfície pública recomendada pelo Electron para flutuar acima de apps em tela cheia e em todos os Spaces. Mesmo assim, a confirmação continua criada fora do compositor. As três hipóteses isoladas testadas foram: promoção de z-order, resolução correta do handle e uso de `panel`; nenhuma tornou a janela visível. Novas tentativas incrementais devem parar até que a estratégia seja redesenhada (por exemplo, um host AppKit dedicado em vez de uma janela secundária do Electron).

O runtime já assina eventos de adição, remoção e mudança de métricas dos displays,
além do retorno do repouso, e solicita o reposicionamento do overlay nesses eventos.
Repouso/despertar e reconexão continuam pendentes de teste físico: a presença dos
listeners e seus testes automatizados comprova o caminho de implementação, mas não
substitui a observação do compositor e do hardware reais.

## Próximo ciclo recomendado

1. Reproduzir os fluxos proprietários ausentes: Brain/IA, hardware/notch e integrações externas, somente quando houver contratos, assets e permissões disponíveis.
2. Expandir o registro de animações para estados de foco, conclusão, revisão e notificações, mantendo `prefers-reduced-motion`.
3. Adicionar teste E2E de importação ICS e persistência após reinício; a lógica do scheduler nativo já possui cobertura unitária Node.
4. Corrigir pendências de UX de alto risco: sincronizar o estado real de “Launch at login” e confirmar ações destrutivas de configurações.
5. Auditar acessibilidade e navegação por teclado em todas as telas.
