# Auditoria de paridade funcional

Referência: inventário local do aplicativo original e auditorias disponíveis em `/Volumes/SSD/app/node_modules/@hey-taby/`.

## Situação atual

| Área | Hibi | Observação |
|---|---|---|
| Home | Parcial | Painel e atalhos existem; conteúdo ainda é demonstrativo em alguns cards. |
| Tasks | Funcional | CRUD básico, status, pasta Bento e deadline. |
| Day/Week | Funcional | Blocos, quick add, horários e bloqueio de conflitos. |
| Reminders | Funcional | CRUD básico, pausa, recorrência semanal e horário. |
| Focus | Funcional | Timer local de 25 minutos. |
| Settings | Parcial | Preferências locais, reset e inicialização no login. |
| Instrumentation | Funcional | Filtro, exportação JSON e limpeza. |
| Notes | Ausente | Precisa de modelo, editor, busca e pastas. |
| Habits | Ausente | Precisa de recorrência, histórico e sequência. |
| Goals | Ausente | Precisa de metas, progresso e revisão. |
| Review | Ausente | Precisa de análise de tarefas, lembretes, notas e atividade. |
| Taby/AI | Ausente | O original possui chats e Brain local; não há integração equivalente. |
| Hardware/notch | Ausente | Não há integração com dispositivo/notch. |
| Feedback/updates | Ausente | Não há fluxo de feedback nem atualização do produto. |
| Notificações nativas | Parcial | Há configuração de login, mas não há notificações macOS agendadas. |
| Animações | Parcial | Há transições CSS; não há registro completo de animações do original. |
| Integrações externas | Ausente | O app permanece local e sem conectores externos. |

## Conclusão

O Hibi não é atualmente uma réplica 1:1. O núcleo de planejamento local está operacional, mas a paridade total exigirá implementar as áreas ausentes e escolher substitutos seguros para integrações proprietárias do dispositivo, Brain e serviços externos.

## Próximo ciclo recomendado

1. Implementar Notes e folders compartilhando a persistência local.
2. Implementar Review usando os dados reais já existentes.
3. Implementar notificações macOS agendadas para lembretes e deadlines.
4. Adicionar Goals e Habits.
5. Auditar animações e acessibilidade por tela.
6. Definir explicitamente quais integrações externas serão suportadas, com consentimento e configuração local.
