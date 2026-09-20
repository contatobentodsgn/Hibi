# Hábitos e Metas Atelier — Design

## Objetivo

Dar contexto imediato às duas superfícies de progresso sem alterar a criação, edição, persistência ou semântica de hábitos e metas.

## Decisão

Dois resumos locais e complementares: Hábitos mostra concluídos hoje, maior sequência atual e itens em andamento; Metas mostra concluídas, em andamento e a meta aberta mais próxima de terminar. As listas e os controles existentes permanecem intactos.

## Limites

- Somente `src/ui/`, CSS e testes do Codex.
- Sem novas propriedades de dados, eventos, IPC, agendamento ou automação.
- Os seletores não mutam os arrays de `StudyData`.

## Verificação

Selectors puros recebem testes primeiro. Renderização estática confirma as duas regiões nomeadas. Um e2e abre Hábitos e Metas e comprova que os resumos continuam presentes após as interações já existentes.
