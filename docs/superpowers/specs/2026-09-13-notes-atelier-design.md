# Notas Atelier — Design

## Objetivo

Transformar Notas em uma superfície de leitura e captura mais orientada a contexto, sem mudar o modelo `Note`, a persistência, os formulários ou as ações existentes.

## Decisão

Adicionar uma camada local de resumo e apresentar cada nota como um cartão editorial compacto. O resumo informa a última nota atualizada, a quantidade sem pasta e o resultado da busca. Os cartões preservam título, prévia de conteúdo, pasta e as ações atuais de editar/excluir.

## Limites

- Nenhuma mudança em `electron/`, `src/data/`, contratos IPC ou esquema de dados.
- Não há tags, backlinks, editor rico, ordenação persistida ou sincronização.
- Datas continuam sendo contexto de leitura; a ordem é derivada de `updatedAt` sem gravar nada.

## Componentes e testes

- `note-rhythm.ts` deriva ordem, última nota e contadores sem mutar dados.
- `NotesAtelierSummary.tsx` oferece a região nomeada de contexto.
- `notes-atelier.css` isola o estilo da camada Atelier.
- `NotesView.tsx` preserva busca, filtros, formulários e callbacks.
- Vitest cobre o selector e a renderização; Playwright confirma que o resumo sobrevive à criação de uma nota. Cada teste recebe prova de mutação deliberada.
