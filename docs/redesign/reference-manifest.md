# Manifesto da referência visual aprovada

Data: 19/09/2026

## Artefato congelado

- Arquivo: `/Volumes/Games/Projetos/Hibi/Hibi-preview-adaptive-notch-validado-2026-09-18.zip`
- Tamanho observado: aproximadamente 80 KiB.
- SHA-256: `df48278a2da3ca6f744cc8db7297c2ca15e79abd4ee02087cb3648ec78bf3f24`
- Integridade: `unzip -t` terminou com “No errors detected”.
- Conteúdo: 30 entradas, código, assets e testes do preview; não inclui `node_modules`, caches ou build gerado.

O ZIP é a referência estável. O diretório `preview-web` permanece editável e não deve ser tratado como prova congelada sem comparar os hashes abaixo.

## Arquivos centrais do preview observado

| Arquivo | SHA-256 |
| --- | --- |
| `src/components/ui/adaptive-notch-navigation-bar.tsx` | `5079dd003e2c4a1d9c55b07b50998733722821f1c0ed61999048d9338c9bc369` |
| `src/App.tsx` | `d658a79b4a9916354fcdf02fe30c7e463770158acae929aef838316c2c363370` |
| `src/styles.css` | `df20c993917e360a77277018be9149903bc390af026a59f7ea675f014d4057d1` |
| `package.json` | `df89f7a164b7f309bf8704351da341b60dbfba76acb6f7572c353d6f9bcc8bf8` |
| `package-lock.json` | `878ee0b854b3d31689eaf9748ebd2fd04053604920407f97e7b2c488d64887dd` |
| `public/assets/taby-idle.mp4` | `f07392965326ac9c95240e169a88045baba737b750ce7620452aef4cb80a8cd5` |

## Decisões aprovadas

- Adaptive Notch Navigation Bar é a navegação oficial da janela.
- A silhueta inclui asas SVG, notch conectado à moldura e encontros curvos entre moldura e barra.
- Menu com posição superior ou inferior, configurável em Ajustes.
- Claro, escuro e seguir sistema usam o tema atual do Hibi; a referência aprova as versões claras e escuras.
- Destinos principais: Hoje, Agenda, Tarefas, Notas e Taby.
- Ajustes fica separado do conjunto diário, mas permanece visível e encontrável.
- Em janela estreita o componente aprovado usa modo compacto acessível.
- A versão híbrida e a sidebar permanecem apenas como comparativos históricos.

## Capturas locais de referência

O diretório editável contém as seguintes capturas já produzidas:

- `.impeccable/review/notch-light-top.png`
- `.impeccable/review/notch-light-bottom.png`
- `.impeccable/review/notch-dark-top.png`
- `.impeccable/review/notch-dark-bottom.png`
- `.impeccable/review/notch-mobile.png`

Elas servem para comparação visual, enquanto os hashes do ZIP e do componente definem a referência reproduzível. As imagens anexadas originalmente pelo usuário permanecem referências de intenção, mas arquivos temporários de anexos não são uma dependência do produto.

## Dependências usadas pelo preview

| Pacote | Versão do preview |
| --- | --- |
| `@heroui/react` | `3.2.6` |
| `@heroui/styles` | `3.2.6` |
| `motion` | `^12.35.0` |
| `lucide-react` | `^0.577.0` |
| `tailwindcss` | `^4.2.1` |
| React/ReactDOM | `^19.2.0` |

Essas versões descrevem a referência. A aplicação principal só deve adotá-las depois da validação de compatibilidade e do PR do responsável por `package.json`/lockfile. O componente usa `motion/react`, Lucide e utilitários Tailwind; a portabilidade deve preservar a geometria mesmo que o mecanismo de estilos precise de adaptação.

## Critérios geométricos

- As asas laterais e de canto vêm dos quatro componentes SVG do arquivo oficial.
- Não substituir a forma por blocos retos, pseudo-elementos quadrados ou um único `border-radius`.
- Verificar em 1× e Retina para emendas de 1 px.
- Superior e inferior devem ser espelhamentos coerentes, não dois layouts separados que divergem.
- A moldura deve continuar em volta do conteúdo; a barra não pode parecer uma pílula solta sobre a página.
- No modo compacto, itens e menu continuam navegáveis por teclado e leitor de tela.

## Uso durante a implementação

1. Conferir o hash do ZIP antes de extrair.
2. Extrair para diretório temporário; não sobrescrever o app ou o preview editável.
3. Comparar componente, CSS e capturas com este manifesto.
4. Registrar qualquer alteração deliberada de geometria no PR e mostrar comparação ampliada.
5. Manter o ZIP fora do bundle de produção.

O manifesto não transfere automaticamente licença de terceiros. Antes de levar o componente ao app distribuído, U01 precisa registrar origem e licença do prompt/componente anexado.
