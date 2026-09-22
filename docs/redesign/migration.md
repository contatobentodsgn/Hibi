# U28 — Migração e reversão

## Regra de remoção

Cada view antiga só pode ser removida depois de `rg` confirmar que não há consumidores em App, testes, renderers auxiliares ou rotas secundárias. Nesta etapa, `SettingsView`, `StatsView` e os painéis de integrações ainda são consumidores reais da lógica de domínio e permanecem como adaptadores internos.

## Estado da oficialização

- A montagem normal usa as superfícies redesign para Hoje, Agenda, Tarefas, Notas, Taby, Hábitos, Metas, Estatísticas e Ajustes.
- A paleta e a navegação principal continuam sendo o acesso oficial às rotas secundárias.
- `legacy-surface` permanece somente nas telas ainda não migradas visualmente, evitando uma remoção ampla sem evidência.
- A galeria técnica não foi adicionada ao menu diário.

## Reversão

Reverter o commit da unidade correspondente, sem restaurar banco antigo sobre dados recentes. O último ponto funcional anterior a U21–U28 é o commit `603f5d4`.
