# Notion Sync v1 — Design

**Data:** 2026-09-09  
**Status:** aguardando aprovação final da especificação  
**Workspace de validação:** Kizuna Std's Notion  
**Página-mãe:** Kizuna

## Objetivo

Entregar uma sincronização manual e bidirecional de tarefas entre Hibi e Notion, usando uma base dedicada chamada **Hibi Tasks** dentro da página **Kizuna**. A sincronização deve ser previsível, auditável e nunca sobrescrever dados silenciosamente.

Slack fica explicitamente adiado e fora deste ciclo.

## Escopo da primeira versão

- Preparar ou localizar a base **Hibi Tasks** dentro da página Kizuna.
- Ler, criar e atualizar tarefas no Notion.
- Importar tarefas do Notion para o Hibi.
- Enviar tarefas do Hibi para o Notion.
- Detectar itens novos, duplicados e conflitos.
- Exigir decisão explícita em conflitos e confirmação antes de qualquer escrita remota.
- Mostrar última sincronização, totais, conflitos, erro e opção de tentar novamente.
- Persistir o vínculo estável entre a tarefa local e a página remota.
- Registrar auditoria sem credenciais nem conteúdo privado desnecessário.

Não fazem parte desta versão: sincronização automática em segundo plano, colaboração multiusuário, comentários do Notion, anexos, relações entre bases e Slack.

## Contrato do Notion

O conector migrará do cabeçalho antigo `2022-06-28` para a versão atual documentada `2026-03-11`. A versão ficará centralizada em uma constante e presente em todas as requisições.

A implementação usará o modelo moderno de fontes de dados:

- descoberta da base e de seu `data_source_id`;
- consulta em `POST /v1/data_sources/{data_source_id}/query`;
- criação de páginas com pai do tipo `data_source_id`;
- identificadores tratados como opacos, sem extrair IDs de URLs;
- paginação com cursores opacos;
- respeito ao cabeçalho `Retry-After` em limitação temporária;
- tolerância a campos adicionais desconhecidos nas respostas.

Referências oficiais:

- https://developers.notion.com/reference/versioning
- https://developers.notion.com/guides/get-started/upgrade-guide-2025-09-03

## Base Hibi Tasks

Na primeira configuração, o Hibi procurará uma base chamada **Hibi Tasks** acessível à integração. Se não existir, apresentará uma ação de preparação que só será executada após confirmação. A base será criada sob a página Kizuna configurada.

O identificador da base e o `data_source_id` descoberto serão persistidos nas configurações não secretas do conector. O token continuará exclusivamente no Keychain.

### Propriedades

| Propriedade no Notion | Tipo | Campo no Hibi |
|---|---|---|
| Name | title | `task.title` |
| Status | select | `task.status` |
| Start | date | `task.deadline` |
| Duration minutes | number | `task.durationMinutes` |
| Description | rich_text | `task.description` |
| Hibi ID | rich_text | `task.id` |
| Hibi updated at | date | revisão local usada pela sincronização |

Valores de status: `Open`, `Paused` e `Completed`, mapeados respectivamente para `open`, `paused` e `completed`.

Datas serão enviadas como ISO 8601 com fuso explícito. Campos ausentes continuarão ausentes; o sincronizador não inventará prazos nem descrições.

## Identidade e revisão

Cada tarefa sincronizada manterá `remoteRef.connectorId = "notion"`, `remoteRef.remoteId` com o ID da página e `remoteRef.revision` com a última revisão remota observada.

Para detectar alterações dos dois lados, o Hibi persistirá também uma impressão do último estado sincronizado. Essa impressão conterá apenas os campos mapeados, normalizados e resumidos por hash. O conteúdo integral não será duplicado em logs.

## Fluxo de sincronização

1. A pessoa abre Integrações e escolhe **Sincronizar agora** no cartão do Notion.
2. O Hibi lê a base remota e compara cada registro com as tarefas locais e com o último estado sincronizado.
3. O Hibi produz uma prévia sem escrever nada.
4. A prévia classifica cada item como:
   - **Novo no Notion:** importar para o Hibi;
   - **Novo no Hibi:** preparar envio ao Notion;
   - **Sem alteração:** nenhuma ação;
   - **Alterado apenas no Notion:** atualizar localmente após aceitação;
   - **Alterado apenas no Hibi:** preparar atualização remota;
   - **Conflito:** ambos mudaram desde a última sincronização;
   - **Possível duplicata:** mesmo Hibi ID ou vínculo remoto inconsistente.
5. Para conflitos, a pessoa escolhe **Manter Hibi**, **Manter Notion**, **Criar cópia** ou **Ignorar**.
6. Escritas no Notion são agrupadas em uma ação preparada e exibidas no cartão seguro **Confirmar / Cancelar**. Cancelar não altera dados.
7. Depois da confirmação, o Hibi executa as operações, atualiza referências e revisões somente para itens confirmados como concluídos e mostra um resumo.

Uma falha parcial não será tratada como sucesso total. Itens concluídos e itens pendentes serão discriminados, e **Tentar novamente** atuará apenas sobre os pendentes.

## Resolução de conflitos

- Nenhuma política automática de “última alteração vence”.
- Uma alteração local e uma remota desde a base comum sempre geram conflito.
- `Manter Hibi` exige confirmação porque escreve no Notion.
- `Manter Notion` altera apenas o armazenamento local depois da decisão explícita.
- `Criar cópia` conserva os dois conteúdos com IDs distintos.
- `Ignorar` mantém o conflito pendente para a próxima revisão.
- Exclusões não serão propagadas na v1; itens ausentes serão sinalizados, não apagados.

## Interface

O cartão do Notion em Integrações mostrará:

- estado da conexão;
- workspace configurado: **Kizuna Std's Notion**;
- base selecionada: **Hibi Tasks**;
- última sincronização concluída;
- botão **Sincronizar agora**;
- resumo com importados, enviados, atualizados, ignorados e falhos;
- quantidade de conflitos pendentes;
- mensagem de erro sanitizada;
- botão **Tentar novamente** quando aplicável.

A prévia será revisável por item. A confirmação de escrita continuará usando o mesmo fluxo seguro já disponível no assistente e no notch.

## Segurança e privacidade

- Token somente no Keychain.
- Hosts restritos a `api.notion.com`.
- Limites existentes de tamanho de requisição e resposta permanecem ativos.
- Escrita remota somente por ação preparada com confirmação correspondente.
- Logs registram tipo de ação, contagem, horário e resultado; não registram token nem corpos completos.
- Erros externos são transformados em mensagens seguras antes de chegar à interface.
- A configuração nunca armazenará dados da conta retornados pelo endpoint de identidade.

## Persistência e módulos

- `electron/connectors/notion.cjs`: contrato HTTP, paginação, esquema, normalização e operações remotas.
- `electron/integrations.cjs`: preparação, confirmação, execução, auditoria e resposta sanitizada.
- `electron/connector-settings.cjs`: IDs da base/fonte de dados e resumo persistido da última sincronização.
- `src/integrations/notion-sync.ts`: modelo puro de comparação e plano de reconciliação.
- `src/ui/IntegrationsView.tsx`: configuração, prévia, conflitos, progresso, resumo e repetição.
- modelo de tarefa: revisão local mínima e referência remota, com migração compatível dos dados existentes.

O motor de comparação será puro e determinístico; chamadas remotas e persistência ficarão nas bordas. Isso permite cobrir toda a matriz de conflitos sem depender da rede.

## Falhas e recuperação

- Credencial inválida: instrução para reconectar, sem apagar configuração.
- Base sem permissão: explicar que **Hibi Tasks** precisa ser compartilhada com a integração.
- Limite de uso: respeitar `Retry-After` e oferecer repetição.
- Rede indisponível: preservar a prévia e permitir nova tentativa.
- Esquema alterado: bloquear escrita, listar propriedades incompatíveis e oferecer reparo confirmado.
- Resultado parcial: salvar somente vínculos efetivamente confirmados pela API.

## Testes

### Automatizados

- versão e cabeçalhos em todas as chamadas;
- descoberta de base e fonte de dados;
- paginação de busca e consulta;
- criação do esquema Hibi Tasks;
- mapeamento completo nos dois sentidos;
- campos vazios, datas com fuso e títulos longos;
- estados novo, inalterado, alteração unilateral, conflito e duplicata;
- confirmação obrigatória para criação e atualização remota;
- falha parcial, retry e `Retry-After`;
- sanitização de logs e respostas;
- migração das configurações e tarefas existentes.

### Validação real no workspace Kizuna Std's Notion

1. Criar ou localizar Hibi Tasks dentro de Kizuna.
2. Criar uma tarefa no Hibi e enviá-la.
3. Editar a página no Notion e importá-la.
4. Editar os dois lados e confirmar que surge conflito.
5. Resolver cada tipo de decisão em registros descartáveis.
6. Verificar contagens, última sincronização e repetição após uma falha controlada.
7. Confirmar que nenhuma credencial ou conteúdo integral aparece em arquivos rastreados ou logs.

## Critérios de aceite

- A base Hibi Tasks funciona dentro do workspace Kizuna Std's Notion.
- Todos os sete campos mapeados preservam seus valores nos dois sentidos.
- Nenhuma escrita remota ocorre sem confirmação explícita.
- Conflitos nunca são sobrescritos silenciosamente.
- Falhas parciais são recuperáveis sem duplicar itens já concluídos.
- A interface informa estado, resultado e próximo passo com clareza.
- Testes automatizados passam e a validação real de criar, ler, atualizar e conflitar é documentada.
- O plano oficial marca Notion Sync v1 como implementado e validado; Slack permanece adiado.
