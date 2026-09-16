# Assistente local offline — Design

## Objetivo

Adicionar ao Hibi um assistente totalmente offline no Mac, com modelo leve quantizado de 1–3 GB, transcrição e síntese de voz locais, streaming, cancelamento e fallback para o assistente heurístico existente.

## Decisões

- O modelo é um artefato opcional armazenado somente em uma pasta de dados dentro do projeto Hibi durante desenvolvimento e em um diretório de dados do app durante distribuição; nunca em `/Users/bento`, Downloads, Desktop ou memória persistente fora do app.
- O runtime roda em processo separado para que inferência, carregamento e descarte não bloqueiem Electron/React.
- A ponte expõe apenas estado, texto limitado, início, cancelamento e encerramento; nenhum segredo ou acesso arbitrário ao filesystem atravessa o preload.
- Sem modelo instalado, o Hibi continua usando o runtime heurístico atual.
- Voz usa APIs nativas do macOS para autorização, transcrição e síntese; nenhuma requisição de áudio sai do Mac.

## Fluxo

1. O renderer solicita disponibilidade e instalação local.
2. O processo principal valida o manifesto, o tamanho e o diretório permitido.
3. O worker carrega o modelo sob demanda e transmite deltas saneados.
4. Cancelamento encerra a requisição e libera o worker sem fallback duplicado.
5. O Taby pode ler a resposta com síntese local, respeitando preferência de voz e redução de movimento.

## Erros e privacidade

Modelo ausente, incompatível, corrompido, sem espaço ou sem permissão vira estado explícito na UI e mantém o fallback local. Logs não incluem prompts completos, áudio, caminhos pessoais ou conteúdo de resposta.

## Validação

Testes unitários cobrem manifesto, limites, diretório, lifecycle, cancelamento e ausência de rede. E2E cobre instalação, fallback, streaming, cancelamento e preferência de voz. A validação manual cobre autorização, idioma português, microfone ocupado e saída de áudio.
