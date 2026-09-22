# Auditoria visual U26

Data: 2026-09-22  
Commit de referência: `603f5d4` + U21–U25 em validação local

## Matriz de superfícies

| Área | Claro/escuro | Janela estreita | Teclado/semântica | Estados assíncronos | Resultado |
|---|---|---|---|---|---|
| Hoje | revisado nas unidades U06/U12 | adaptativo | navegação principal | vazio/erro local | aprovado |
| Agenda | revisado em U08/U09 | modo dia disponível | foco e rota | conflitos/salvamento | aprovado |
| Tarefas | revisado em U07/U10/U11 | lista responsiva | checkbox e comandos | criação/edição | aprovado |
| Notas/Taby | U13 | cards empilhados | editor e paleta | voz/streaming | aprovado |
| Hábitos/Metas | U15/U16 | cards responsivos | ações nomeadas | progresso | aprovado |
| Estatísticas | U18 | gráfico com rolagem interna | tabela acessível | período vazio/exportação | aprovado |
| Paleta | U19 | modal limitado à viewport | combobox/listbox/Escape | streaming/confirmação | aprovado |
| Ajustes | U20–U25 | navegação vira grade | `aria-current="page"` | loading/erro real preservados | aprovado |

## Pontos verificados

- Preferências de tema, tom, posição da barra e movimento continuam centralizadas no `ThemeProvider`/storage existentes.
- O modo escuro usa os mesmos tokens da nova UI; não há segunda preferência de tema.
- A navegação principal continua limitada aos cinco destinos e Ajustes; rotas secundárias permanecem acessíveis por contexto/paleta.
- Campos de credencial começam vazios e os componentes de IA/integrações não exibem segredos persistidos.
- A paleta mantém foco inicial, navegação por setas, `Enter`, `Escape` e retorno ao invocador.

## Limites conhecidos

- Capturas automatizadas de VoiceOver e zoom 200% dependem do ambiente macOS interativo e devem ser repetidas no checkout candidato.
- A galeria de assets continua fora da navegação principal, acessível apenas pela rota de diagnóstico de hardware.
