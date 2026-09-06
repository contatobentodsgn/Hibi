# Auditoria de paridade funcional

Referência: inventário local do aplicativo original e auditorias disponíveis em `/Volumes/SSD/app/node_modules/@hey-taby/`.

## Situação atual

Última verificação: 06/09/2026. Evidências executadas no repositório: `npm run build`, `npm test` (6 arquivos Vitest, 24 testes, mais 5 testes nativos), `npm run test:e2e` (15 fluxos aprovados) e `npm audit --omit=dev` (0 vulnerabilidades de produção). Esses testes validam a implementação do Hibi; não equivalem, por si só, a paridade 1:1 com o produto de referência.

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
| Taby/AI | Parcial | Assistente offline com consultas básicas; não é o Brain/LLM original. |
| Hardware/notch | Diagnóstico disponível | Há uma tela `/hardware` que reporta a ausência de integração; o SDK/notch real continua ausente. |
| Feedback/updates | Parcial | Feedback, bug e ideia são salvos localmente; `/updates` informa a build offline, sem serviço remoto de envio nem atualização do produto. |
| Notificações nativas | Funcional | Scheduler macOS para lembretes/deadlines, recorrência e teste. |
| Animações | Parcial | Transições CSS acessíveis; o inventário original referencia dezenas de vídeos/estados proprietários que não estão disponíveis no Hibi. |
| Integrações externas | Ausente | O app permanece local e sem conectores externos. |

## Conclusão

O Hibi não é atualmente uma réplica 1:1. O núcleo de planejamento local está operacional, mas a paridade total exigirá implementar as áreas ausentes e escolher substitutos seguros para integrações proprietárias do dispositivo, Brain e serviços externos.

## Próximo ciclo recomendado

1. Reproduzir os fluxos proprietários ausentes: Brain/IA, hardware/notch e integrações externas, somente quando houver contratos, assets e permissões disponíveis.
2. Expandir o registro de animações para estados de foco, conclusão, revisão e notificações, mantendo `prefers-reduced-motion`.
3. Adicionar teste E2E de importação ICS e persistência após reinício; a lógica do scheduler nativo já possui cobertura unitária Node.
4. Corrigir pendências de UX de alto risco: sincronizar o estado real de “Launch at login” e confirmar ações destrutivas de configurações.
5. Auditar acessibilidade e navegação por teclado em todas as telas.
