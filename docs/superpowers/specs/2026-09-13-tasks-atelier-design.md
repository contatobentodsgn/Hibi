# Tarefas Atelier — desenho

## Objetivo

Transformar Tarefas em uma superfície de execução diária: o que exige atenção
agora aparece antes da lista completa, sem alterar tarefas, prazos, pastas ou os
contratos de persistência existentes.

## Alternativas avaliadas

1. **Só trocar estilo.** Baixo risco, mas mantém a lista sem orientação para a
   próxima decisão.
2. **Atelier orientado a contexto (escolhida).** Deriva uma síntese local de
   tarefas abertas, vencidas, para hoje e sem prazo; preserva filtros, criação,
   edição, exclusão e a lista detalhada existente.
3. **Quadro Kanban e arrastar-e-soltar.** Introduz estado, semântica e interação
   novos sem necessidade comprovada; não faz parte desta fase.

## Experiência

A tela terá quatro elementos, nesta ordem:

1. Cabeçalho com contagem de trabalho aberto e ação de criar.
2. Faixa de execução com a próxima tarefa datada, quantidade vencida e quantidade
   sem prazo. Quando não houver tarefa prioritária, comunica que a fila está
   livre em vez de escolher uma tarefa arbitrariamente.
3. Filtros existentes de escopo, pasta e ordenação, inalterados.
4. Lista detalhada existente, agora com metadados semânticos de prazo: atrasada,
   hoje, futura ou sem prazo. O estado nunca depende só de cor.

Uma tarefa concluída continua podendo ser reaberta. Pausadas continuam fora da
fila aberta. Criar, renomear, editar prazo e excluir preservam as mesmas ações e
diálogos acessíveis.

## Arquitetura

`task-rhythm.ts` será um seletor puro de UI. Ele recebe `Task[]` e um dia local
(`YYYY-MM-DD`) e devolve a próxima tarefa, métricas e a classificação de prazo
por id. O seletor lê a data como hora de parede e nunca deriva um dia por UTC.
`TasksAtelierSummary.tsx` renderiza a faixa sem conhecer callbacks. `TasksView`
apenas a monta acima dos filtros.

O CSS será isolado em `src/ui/tasks-atelier.css`; nenhuma alteração em dados,
IPC, `App.tsx`, dicionário ou `package.json` é necessária.

## Acessibilidade e estados

- A síntese é uma região nomeada e inclui texto para cada métrica.
- A tarefa escolhida tem ação explícita "Edit deadline" e não muda dados ao
  ser exibida.
- Prazo aparece em texto, não apenas em cor ou ícone.
- Sem tarefas abertas, a síntese comunica "Your queue is clear".
- Toda funcionalidade nova terá teste de marcação e e2e; uma mutação deliberada
  deve provar que o teste detecta a remoção da informação de prazo ou da ação.

## Fora de escopo

Kanban, arrastar-e-soltar, novos status, mudança de prioridade persistida,
sincronização de calendário, alterações no repositório local e novos canais IPC.
