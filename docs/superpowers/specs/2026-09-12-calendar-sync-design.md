# Sincronização de calendário — Design

## Objetivo

Permitir que o Hibi importe reuniões do Google Calendar e dos calendários Apple/iCloud já configurados no macOS, e publique blocos escolhidos do Hibi nesses destinos, sem duplicar itens, vazar credenciais ou sobrescrever alterações concorrentes.

## Decisões de produto

- O Hibi é a agenda local de trabalho; reuniões externas entram como eventos com origem visível.
- Cada calendário é configurado individualmente como desativado, somente leitura ou bidirecional.
- Só blocos com horário definido podem ser publicados. Tarefas, lembretes e sessões de foco permanecem locais por padrão.
- Nunca há sobrescrita silenciosa: uma divergência de versões vira conflito revisável com as escolhas “manter Hibi”, “manter calendário” ou “duplicar”.
- Credenciais Google ficam exclusivamente no Keychain. A conta iCloud não é solicitada pelo Hibi: o EventKit usa a autorização de Calendário já concedida pelo macOS.

## Arquitetura

O processo principal é dono dos adaptadores e dos segredos. Um adaptador Apple consulta/escreve EventKit; um adaptador Google usa OAuth PKCE e sincronização incremental. Os dois normalizam eventos para uma estrutura serializável, onde cada vínculo guarda fornecedor, calendário remoto, id remoto, revisão remota e instante da última sincronização.

O renderer recebe apenas `CalendarSyncState`: fontes, calendários, modos, última sincronização, erros seguros e conflitos resumidos. Ele nunca recebe token, cookie ou conteúdo bruto de erro do provedor. A interface de Integrações mostra fontes conectadas, calendários selecionados, modo de cada um, ações de sincronização e cartões de conflito.

## Fluxo de dados

1. Usuário conecta Google ou concede Calendário ao macOS.
2. O adaptador lista calendários; a pessoa escolhe quais importar e quais aceitam publicação do Hibi.
3. Uma sincronização lê alterações incrementais, normaliza eventos e reconcilia cada vínculo local.
4. Eventos remotos novos criam/atualizam blocos externos locais; blocos Hibi selecionados são preparados para publicação.
5. Divergências desde o último checkpoint produzem conflitos; só a decisão explícita escreve em qualquer destino.

## Limites da primeira entrega

- Recorrências são importadas como séries preservadas e não são editadas pelo Hibi na primeira versão.
- Convites, participantes, videoconferência e anexos aparecem como detalhes somente leitura.
- A criação externa exige confirmação na interface do Hibi, como as demais escritas remotas.
- Sem conexão, mudanças locais ficam pendentes; o Hibi informa o estado e não tenta sincronizar em segundo plano sem pedido.

## Erros e privacidade

Erros são classificados como credencial inválida, permissão ausente, indisponibilidade temporária, conflito ou configuração incompleta. A UI mostra uma mensagem acionável e a hora da última sincronização válida. Logs de auditoria guardam somente fornecedor, calendário, tipo de ação e resultado — nunca título, descrição, participante ou token.

## Provas de conclusão

- Um calendário Apple/iCloud já presente no macOS é listado, escolhido, importado e recebe um bloco Hibi confirmado.
- Uma conta Google conectada por OAuth lista calendários, mantém um token de sincronização no Keychain/armazenamento seguro e atualiza apenas mudanças posteriores.
- Uma edição local e remota concorrentes abre um conflito e nenhuma versão é perdida sem escolha explícita.
- Renderer, backup e logs não contêm segredos.
