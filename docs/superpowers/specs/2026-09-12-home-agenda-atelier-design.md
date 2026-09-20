# Home e Agenda — Atelier calmo

## Objetivo

Transformar as superfícies mais usadas do Hibi em uma rotina clara e convidativa:

- **Hoje** prioriza a próxima ação, progresso do dia e foco sem virar um painel de métricas;
- **Agenda** torna visível o tempo disponível, separa foco de compromissos e fica pronta para sobrepor calendários externos quando a sincronização existir.

O desenho é original do Hibi: calmo e acolhedor como padrão, com celebrações curtas quando uma ação é concluída. Não replica a interface ou ativos de outro produto.

## Escopo

### Hoje

1. **Cartão Agora.** Mostra o bloco em curso ou o próximo bloco do dia, horário, duração, categoria e uma única ação contextual: iniciar Foco quando houver trabalho a fazer, ou abrir a Agenda quando o dia estiver vazio.
2. **Resumo gentil.** Exibe blocos concluídos/planejados, minutos planejados e a próxima janela livre calculados apenas de tarefas e blocos locais já existentes. Não introduz telemetria, rastreio de apps ou metas implícitas.
3. **Ritmo do dia.** Agrupa blocos locais em Agora, Depois e Concluído. Horários continuam sendo hora de parede local e a classificação nunca usa ISO UTC para definir o dia.
4. **Companion contextual.** Usa o componente de animação já existente, em estado idle/working/completed, apenas como reforço visual. `prefers-reduced-motion` mantém o fallback estático existente.
5. **Estado vazio.** Explica que o dia está livre e leva para a Agenda ou para a paleta, sem inventar conteúdo de exemplo.

### Agenda

1. **Resumo do horizonte.** O topo da Agenda mostra horas ocupadas, blocos de foco e a próxima janela livre no dia ou na semana visível.
2. **Disponibilidade.** Faixas livres são derivadas dos blocos locais, sem alterar a grade e sem criar novos registros. Uma janela livre é um intervalo entre blocos que não sejam pausa; a janela mínima exibida é de 30 minutos.
3. **Tipos claros.** Trabalho, foco, pausa e eventos externos futuros recebem tratamentos visuais/textuais diferentes. A informação nunca depende somente da cor.
4. **Conflitos futuros.** A tela reserva uma área de aviso para conflitos de calendário serializados pelo IPC. Enquanto esse canal não existir, não há estado falso nem botão sem efeito.
5. **Dia e semana.** Preserva a alternância atual, sua persistência em `agenda-mode` e todos os controles de criar/remover blocos existentes.

## Arquitetura

O trabalho fica no território Codex:

- novos seletores puros em `src/ui/` ou `src/domain/` para derivar prioridade, progresso e disponibilidade a partir de `StudyData`;
- componentes pequenos para o cartão Agora, resumo e faixa de disponibilidade;
- CSS local/tokens existentes, sem alterar o shell ou o contrato IPC;
- montagem mínima nas telas `HomeView` e `AgendaView`.

Quando o Claude expuser sincronização de calendário persistida, a Agenda só consumirá um estado serializável de conflitos e disponibilidade externa. Nenhum token OAuth, conteúdo remoto ou permissão macOS será lido pelo renderer.

## Interação e acessibilidade

- O primeiro controle de Hoje é o cartão Agora; a ação tem rótulo explícito e pode ser usada por teclado.
- Dia/Semana continuam sendo tabs com `aria-selected`.
- Progresso tem texto equivalente, não apenas barra visual.
- Horas livres e conflitos têm rótulos textuais e não só diferenças cromáticas.
- Movimento respeita `prefers-reduced-motion` pelo componente companion existente.

## Erros e limites

- Dados sem blocos para hoje mostram estado vazio seguro.
- Blocos inválidos ou com fim anterior ao início são ignorados pelos cálculos derivados, sem apagar dados.
- Cálculos são limitados à janela local exibida e não modificam `StudyData`.
- Sincronização externa indisponível não reduz a Agenda local nem bloqueia criação de blocos.

## Testes e evidência

1. Testes unitários para seleção da próxima ação, cálculo de progresso, janela livre e descarte de intervalos inválidos.
2. Testes de markup para estado cheio, vazio, texto equivalente de progresso e ações acessíveis.
3. E2E para abrir Hoje, iniciar foco pelo cartão contextual, alternar Dia/Semana e verificar a faixa de disponibilidade sem mutar o workspace.
4. Cada teste novo terá prova de mutação: remover o seletor ou sua condição deve fazê-lo falhar antes de restaurar a implementação.
5. A bateria roda em `America/Sao_Paulo` e `Pacific/Kiritimati`, além de tipos, build e Playwright na porta 4380.

## Fora de escopo

- Criar, editar ou publicar eventos em Google Calendar/iCloud.
- Alterar o esquema de `StudyData`.
- Novo motor de animação ou novos assets do companion.
- Recursos de pontuação, ranking, streaks ou rastreio de atividade fora do Hibi.
