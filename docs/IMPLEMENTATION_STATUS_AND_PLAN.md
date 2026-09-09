# Hibi — status de implementação e plano consolidado

Atualizado em 2026-09-09. Este documento é a fonte operacional do status atual; os planos em `docs/superpowers/plans/` preservam o histórico de decisões e execução.

## Status atual

| Área | Estado | Evidência atual |
| --- | --- | --- |
| Streaming visível | Implementado | Eventos SSE, montagem incremental no assistente e estado de geração na interface. |
| Cancelamento | Implementado | Abort por requisição, botão Parar, estado cancelado e nenhuma tentativa de fallback após cancelamento. |
| 401, limite e indisponibilidade | Implementado | Classificação segura, mensagens específicas e retry apenas para falhas temporárias. |
| Retry automático | Implementado | Backoff limitado, `Retry-After` e orçamento global de tentativas. |
| Consumo | Implementado | Ledger local limitado, tokens, custo conhecido e omissão de custo desconhecido. |
| Seleção orientada de modelos | Parcial | Perfis rápido/equilibrado/raciocínio e modelo customizado existem; a escolha do identificador final ainda depende do provedor configurado. |
| Provedor/modelo por resposta | Implementado | Proveniência exibida no assistente e nos eventos de streaming. |
| Fallback | Implementado | Políticas perguntar/automático/nunca e fallback local somente em falhas elegíveis. |
| Notion, Slack e e-mail | Implementado localmente | Adaptadores, normalização, Keychain, allowlist, OAuth PKCE com callback em loopback, teste de conexão somente leitura, endpoint configurável e seleção de fontes importadas; falta exercitar contra contas reais. |
| Webhooks | Implementado localmente | HMAC, nonce, expiração, limite de corpo, loopback, Keychain e confirmação; ciclo iniciar/parar e estado após reinício cobertos por e2e; não é endpoint público. |
| API pública | Implementado localmente | API HTTP loopback, token revogável no Keychain, OpenAPI, leituras e escritas com confirmação. |
| Importação | Implementado localmente | CSV/JSON/ICS e leitura por conector a partir das fontes escolhidas, com prévia, deduplicação por referência remota, conflitos e aplicação local da decisão. |
| Compartilhamento | Implementado localmente | Convites somente leitura assinados e expirados. |
| Notificações remotas | Implementado localmente | Adaptador, confirmação, endpoint HTTPS configurável e teste de conexão; entrega real exige credencial do serviço escolhido. |
| Teste com provedor real | Bloqueado por configuração | Harness protegido criado; falta endpoint sandbox, modelo, credencial e opt-in explícito. |
| Teste com conector real | Bloqueado por configuração | Harness protegido criado, com opt-ins separados para leitura e escrita; falta endpoint sandbox, token e alvos. |

## Plano restante

### Fase 1 — fechar configuração local

- [x] Conectar webhook à ponte Electron e à tela de Integrações.
- [x] Exigir confirmação dentro do app para escritas recebidas pela API local.
- [x] Recompilar e validar o addon nativo do notch.
- [x] Adicionar teste de interface para iniciar/parar webhook e confirmar estado após reinício.
- [x] Exibir histórico completo de confirmações de integrações, em vez de somente a contagem de auditoria.

### Fase 2 — tornar conectores operacionais

- [x] Implementar fluxo OAuth PKCE real por conector, com callback local, state de uso único e refresh seguro.
- [x] Adicionar seleção de bases/canais/caixas de entrada importados.
- [x] Adicionar teste de conexão que não execute escrita.
- [x] Integrar ações preparadas ao cartão Confirmar/Cancelar do assistente e do companion.
- [x] Adicionar configuração de endpoint para notificações remotas e e-mail compatível.

### Fase 3 — validação externa

Os dois harness recusam a execução até que o opt-in e os parâmetros seguros estejam presentes. Falta apenas fornecer sandbox e credenciais.

- [ ] Executar `HIBI_LIVE_PROVIDER_TEST=1 npm run test:providers:live` contra sandbox autorizado.
- [ ] Exercitar streaming, cancelamento, 401, limite de uso, indisponibilidade, retry e proveniência com o provedor real.
- [ ] Executar `HIBI_LIVE_CONNECTOR_TEST=1 npm run test:connectors:live` por conector, em modo somente leitura.
- [ ] Exercitar uma escrita real com `HIBI_LIVE_CONNECTOR_WRITE_TEST=1` e registrar o relatório sanitizado.

#### Parâmetros dos harness

| Variável | Uso |
| --- | --- |
| `HIBI_LIVE_CONNECTOR_TEST=1` | Libera qualquer tráfego real de conector. |
| `HIBI_LIVE_CONNECTOR_ID` | `notion`, `slack`, `email` ou `remote-notifications`. |
| `HIBI_LIVE_CONNECTOR_ENDPOINT` | Base HTTPS do sandbox. |
| `HIBI_LIVE_CONNECTOR_ALLOW_HOSTS` | Hosts autorizados; o endpoint precisa estar na lista. |
| `HIBI_LIVE_CONNECTOR_TOKEN` | Credencial do sandbox; fica só em memória. |
| `HIBI_LIVE_CONNECTOR_TARGETS` | Identificadores das fontes a importar, separados por vírgula. |
| `HIBI_LIVE_CONNECTOR_WRITE_TEST=1` | Segundo opt-in, exigido para qualquer escrita real. |
| `HIBI_LIVE_CONNECTOR_WRITE_KIND` e `..._WRITE_PAYLOAD` | Ação e corpo JSON da escrita. |

O relatório traz apenas contagens, resultados e o host autorizado: nenhum título, corpo, identificador remoto ou credencial.

### Fase 4 — release e sincronização futura

- [ ] Decidir e implementar conta, nuvem e backup remoto.
- [ ] Decidir sincronização bidirecional com Google Calendar/iCloud e resolução de conflitos.
- [ ] Adicionar atualizador, assinatura, notarização, crash recovery e acessibilidade manual.
- [ ] Validar macOS com notch, sem notch, monitor externo, Spaces, tela cheia e reconexão de display.

## Critério de conclusão

O projeto só deve ser considerado completo quando as fases 1–3 tiverem evidência executável. Recursos remotos não devem ser marcados como concluídos apenas pela existência de um adaptador: é necessário teste em sandbox autorizado e relatório sem segredos.

## Comandos de verificação

```text
npm test
npx tsc --noEmit
npx vite build
npx playwright test
npm run test:providers:live
npm run test:connectors:live
```

Os dois últimos comandos devem permanecer recusando a execução, com código de saída 1, até que o opt-in e os parâmetros seguros estejam presentes.
