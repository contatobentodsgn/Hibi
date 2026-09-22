# Validação U27

Este documento registra a validação executável do candidato, sem incluir tokens, credenciais ou conteúdo pessoal.

## Bateria local

| Comando | Resultado |
|---|---|
| `npx vitest run src/ui/__tests__/RedesignScreens.test.tsx src/ui/__tests__/notifications-settings.test.tsx` | 11 arquivos, 16 testes aprovados |
| `npm run build` | aprovado; apenas aviso existente de chunk grande do Vite |
| `npm test` | 121 arquivos Vitest, 949 testes; 671 testes Node, todos aprovados |

## Fluxos que precisam de ambiente real

- Reiniciar o app e conferir tarefas, notas, lembretes, conversas e preferências.
- Exercitar Google/EventKit/Notion somente com fontes de teste autorizadas.
- Conferir voz, modelo local, foco e companion em janela normal, tela cheia, Spaces e sleep/wake.
- Medir abertura, troca de rota e ociosidade contra `docs/redesign/performance-baseline.md`.

Falhas de serviços externos devem ser registradas como indisponibilidade do ambiente, nunca como sucesso da UI.
