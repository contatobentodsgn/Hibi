# Decisão estrutural: fronteira de interação do notch

## Contexto

Os estados visuais do mascote ocupam o notch físico/virtual e devem permanecer
discretos, passivos e compatíveis com o uso de qualquer aplicativo. Os prints de
referência mostram que botões e decisões aparecem em uma faixa separada abaixo do
mascote. Misturar controles no host visual cria risco de foco roubado, cliques
interceptados e inconsistência com a área física do notch.

## Decisão

O notch do mascote será exclusivamente uma superfície visual. Toda interação será
renderizada fora dele, em uma superfície de ação independente.

### Contratos

- `NotchVisualHost` exibe animação, estado e mensagem curta.
- `NotchVisualHost` não recebe foco, não captura mouse/teclado e não expõe ações
  interativas à acessibilidade.
- `ActionSurface` exibe confirmações, botões, navegação e qualquer controle que
  exija decisão do usuário.
- `ActionSurface` é posicionada abaixo do notch e pode receber foco, teclado e
  VoiceOver.
- `CompanionRouter` classifica cada apresentação: conteúdo sem ações pode ir para
  o host visual; conteúdo com ações deve ir somente para a superfície de ação.
- Uma apresentação interativa nunca será enviada ao host visual. Essa condição
  será validada em runtime e por testes.

## Fluxo

1. Um evento do app gera uma apresentação do companion.
2. O router verifica se existem ações ou interação de captura.
3. Apresentações passivas são enviadas ao `NotchVisualHost`.
4. Apresentações com ações são enviadas ao `ActionSurface` abaixo do notch.
5. Apenas a superfície de ação resolve a ação e devolve o resultado ao runtime.
6. Ao encerrar, a superfície de ação libera foco e o notch volta ao estado passivo.

## Fallback e estados de erro

Se a superfície nativa não estiver disponível, o fallback Electron preservará a
mesma fronteira: o host visual continuará passivo e o painel interativo continuará
separado. Se o posicionamento abaixo do notch não puder ser calculado, a ação será
mantida em uma janela acessível e visível, sem transformar o mascote em controle.

## Verificação

- Teste de contrato: apresentação com ações não chega ao host visual.
- Teste de contrato: apresentação passiva permanece click-through e sem foco.
- Teste de posicionamento: superfície de ação fica abaixo do notch em telas com e
  sem câmera, inclusive monitor externo.
- Teste de acessibilidade: somente a superfície de ação aparece como diálogo e
  recebe foco/VoiceOver.
- Teste de regressão: confirmação, cancelamento, Escape e retorno ao estado passivo.

## Fora de escopo

Esta decisão não define novos assets, animações, sincronização externa ou mudanças
no conteúdo das mensagens. Ela define apenas a responsabilidade espacial e
interativa das superfícies.
