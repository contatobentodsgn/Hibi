# Fundação da nova UI: HeroUI e Tailwind no Hibi (U01 a U03)

Data: 19/09/2026. Responsável: Claude. Base: `origin/main` depois do #165.

## O que entrou

| Pacote | Versão | Licença | Onde |
| --- | --- | --- | --- |
| `@heroui/react` | 3.2.6 | MIT | componentes |
| `@heroui/styles` | 3.2.6 | MIT | CSS dos componentes e tema |
| `tailwindcss` | 4.3.3 | MIT | tema e utilitários |
| `@tailwindcss/vite` | 4.3.3 | MIT | plugin do Vite (aceita Vite 8) |
| `motion` | 12.43.0 | MIT | animação (`motion/react`, usado pela navegação aprovada) |
| `lucide-react` | 0.577.0 | ISC | ícones |

- São as versões que o preview aprovado resolveu, para o componente da navegação rodar com as mesmas bibliotecas com que foi validado. Todas ficam em `devDependencies`: o Vite as empacota no bundle, e elas não entram soltas no `app.asar`.
- O npm trouxe 85 pacotes, todos novos; nenhum pacote que já existia mudou de versão. Licenças: 50 MIT, 21 Apache-2.0 (react-aria, da Adobe), 1 ISC, 1 BSD-3-Clause e 12 MPL-2.0.
- As MPL-2.0 são o `lightningcss` e os binários dele, que o Tailwind usa só na hora do build; eles não vão para o app.

**Licença do componente da navegação: não identificada.** O arquivo `adaptive-notch-navigation-bar.tsx` do preview não tem cabeçalho de licença, e nem o preview nem o manifesto registram de onde ele veio. O repositório é público: antes da U03 levar o componente para o app, o usuário precisa dizer a origem, para a licença ser conferida. As bibliotecas acima não dependem disso.

## Como a integração fica isolada

Tudo está em `src/styles/heroui.css`, importado primeiro em `src/main.tsx`. As três janelas (principal, notch e barra) usam esse CSS. Nada das telas atuais muda até ser migrado; os testes de `tests/e2e/heroui-foundation.spec.ts` seguram cada regra abaixo.

1. **Tudo em camadas.** O CSS atual não está em camada nenhuma e vence qualquer regra do HeroUI ou do Tailwind que dispute a mesma propriedade. A ordem é `theme, base, components, utilities, legacy-guard`.
2. **Sem o reset global do Tailwind (preflight).** Ele reescreveria botões, títulos e listas das telas atuais. Se uma tela nova precisar de reset, aplique-o dentro do contêiner dela.
3. **Sem detecção automática de classes.** As telas atuais usam `outline`, `filter` e `block` como nomes de classe, e o Tailwind os transformaria em utilitários: os botões `.outline` ganhariam contorno sólido. O Tailwind só lê `src/ui/redesign` e `src/ui/shell`.
   - Utilitário usado em outra pasta não é gerado.
   - Se a pasta nova tiver arquivo antigo com esses nomes, confira o CSS gerado.
4. **Toda superfície nova fica dentro de `.hibi-ui`.** Ali valem a cor do texto (`--foreground`), o `color-scheme` de cada tema e a cor de borda do HeroUI. Fora dali, a borda continua na cor do texto, como sempre foi nas telas atuais.
5. **Popovers, menus e diálogos do HeroUI precisam ser desenhados dentro de `.hibi-ui`.** Use o `UNSAFE_PortalProvider` do `react-aria`, como em `src/styles/HeroUIProbe.tsx`. Sem ele, o React Aria os desenha no `body`, fora das regras da UI nova.
6. **Classes com o mesmo nome.** `tag` e `empty-state` existem no HeroUI e nas telas atuais. Fora de `.hibi-ui`, a camada `legacy-guard` devolve essas duas ao padrão do navegador, e o CSS atual reaplica o desenho delas. Classe nova nas telas atuais não pode repetir nome de componente do HeroUI; a lista está em `node_modules/@heroui/styles/dist/components/`.
7. **Variáveis.**
   - `--accent`, `--accent-soft` e `--muted` existem nos dois, com o mesmo sentido, e o valor do Hibi vence: o acento escolhido em Ajustes pinta também os botões do HeroUI.
   - O HeroUI segue o mesmo `data-theme` da raiz para claro e escuro.
   - `--surface` era usada pelas telas atuais com reserva `#fff`, contando que não existisse. O HeroUI a define, e dentro de `.legacy-surface` ela volta a `#fff`. Uma tela migrada sai desse contêiner e usa a do HeroUI.
   - A base global do HeroUI (`base/base.css`) fica de fora; as partes dela que importam estão reescritas com escopo.

## Provas

- **Página de prova:** `?overlay=ui-probe` abre um Button, um TextField e um Popover. Nenhuma janela do app usa esse parâmetro, e o código carrega à parte. Funcionou no desenvolvimento, pelo e2e, e no app empacotado e instalado: clique contado, texto digitado, popover dentro de `.hibi-ui` e botão na cor de acento do Hibi. A galeria da U02 substitui essa página.
- **Comparação pixel a pixel:** 20 telas atuais (dock e menu Mais) mais o notch e a barra, no claro e no escuro, antes e depois. Cada tela foi capturada como janela e como página inteira com o dock oculto, num total de 80 imagens.
  - 76 ficaram idênticas.
  - As 4 restantes são a tela de Eventos, só na coluna de horários, que muda a cada execução também sem a U01.
  - A comparação achou três problemas antes do merge: o resumo de Tarefas ilegível no escuro (`--surface`), o chip "Bento" com outro desenho (`tag`) e o `⌘K` do dock (a base global do HeroUI).
- **Barra no app instalado:** o fundo continua transparente (`rgba(0, 0, 0, 0)`).
- **Desempenho no app instalado, antes e depois** (ver `performance-baseline.md`): abertura ~1,1 s, troca de tela de 10 a 33 ms e ~3% de CPU parado, sem regressão. O CSS cresceu de 54 KB para 479 KB (51 KB comprimido), porque todos os componentes do HeroUI entram. Se isso pesar, a U02 pode importar só o CSS dos componentes usados.

## O que a U02 mudou

A U02 fechou a outra direção do isolamento e deu à nova UI os tokens do preview. As regras abaixo substituem as da U01 onde elas divergem.

- **O CSS das telas atuais não entra na nova UI.**
  - O CSS atual não tem camada e vencia as camadas do HeroUI dentro de `.hibi-ui`: os botões do HeroUI ganhavam a borda das regras globais de `button`, e `.outline { color: #222 }` apagava o texto no escuro.
  - Agora, dentro de `.hibi-ui`, cada elemento descarta o CSS sem camada (`all: revert-layer`, numa regra com peso de id).
  - **Consequência:** todo CSS da nova UI vai em camada, senão é descartado também. Estilo em linha continua valendo.
- **Reset do Tailwind só na nova UI:** `src/styles/hibi-ui-preflight.css`, gerado por `scripts/scoped-preflight.mjs` dentro de `@scope (.hibi-ui)`. O teste `scripts/scoped-preflight.test.mjs` falha se a cópia divergir do Tailwind instalado. Depois de atualizar o Tailwind, rode `node scripts/scoped-preflight.mjs`.
- **Camada de proteção com cinco classes:** `tag`, `empty-state`, `block`, `filter` e `outline`. As três últimas são utilitários do Tailwind que a nova UI pode usar; a lista vem do próprio Tailwind, que as reconhece entre as classes das telas atuais.
- **`HibiUiRoot`** (`src/ui/redesign/components/HibiUiRoot.tsx): raiz de toda superfície nova. Cria `.hibi-ui` e desenha popovers, menus e diálogos dentro dela. Ela não pode ter `overflow: hidden` nem `transform`, senão os diálogos são recortados.
- **Tokens** (`src/ui/redesign/theme.css`):
  - `--hibi-*` com os valores do preview, ligados às variáveis do HeroUI;
  - as variáveis calculadas do HeroUI (hover e versões suaves) são redeclaradas dentro de `.hibi-ui`, senão seguiriam o acento laranja da raiz;
  - contraste de 4,5:1 ou mais para texto normal nos dois temas e nos cinco tons.
- **Tema antes do primeiro desenho:** o `ThemeProvider` aplica o tema num `useLayoutEffect`. Com `useEffect`, quem usa o escuro via um quadro claro ao abrir o app.
- **Galeria:** `?overlay=ui-gallery`, só no desenvolvimento, com todos os controles, estados, temas, tons, pt/en e textos longos.

## O que a U02b corrigiu (fidelidade ao preview)

A seção 0 do plano tem as decisões completas. Em resumo:
- a ação principal é o botão escuro do preview (`#242428`), e o acento fica nos detalhes;
- os tons são os quatro do preview (Lavanda, Azul, Menta e Pêssego), com a escolha antiga convertida;
- as etiquetas pastéis são o `HibiTag` (`src/ui/redesign/components/HibiTag.tsx`);
- "Mais contraste" e "Reduzir movimento" viraram preferências (`data-contrast`, `data-motion`);
- a nova UI declara `--default-font-family` para usar a fonte do sistema, e não a Inter das telas atuais;
- o cartão tem o respiro de 24 px do painel do preview;
- toda unidade visual anexa uma comparação lado a lado com as capturas do preview (regra 6 do plano).

## O que a U03 acrescentou (a navegação oficial)

A barra do preview (`src/ui/shell/AdaptiveNotchNavigation.tsx`) substituiu o dock. A seção 0 do plano tem as decisões e o `u03-assets/` tem as comparações. Regras que nasceram dela e valem para as próximas unidades:

- **Ordem das camadas.** `heroui.css` é o primeiro import de `src/main.tsx`. A primeira menção a uma camada fixa a ordem dela, e o CSS de um componente entra quando o módulo dele é avaliado: com o `App` importado antes, o `notch.css` declarava `components` e `utilities` antes de `base`, e o reset passava por cima dos utilitários (a barra e os botões da galeria perdiam o respiro lateral). Um e2e mede o respiro dos itens da barra.
- **`dark:` segue só o `data-theme` da raiz.** A variante do HeroUI tinha uma reserva pela preferência do macOS e um seletor (`&:not(...) &`) que casava com qualquer elemento dentro de outro com a mesma classe. Com o macOS no escuro e o Hibi no claro, o notch ficava cinza sobre a moldura preta. `heroui.css` redefine a variante.
- **Primitivas na raiz.** Os `--hibi-*` agora ficam em `:root` (com as variações de tema, tom, contraste e movimento), porque a moldura e a superfície da barra envolvem as telas atuais e ficam fora de `.hibi-ui`. As variáveis que o HeroUI lê continuam só dentro de `.hibi-ui`.
- **Reduzir movimento também no Motion.** `HibiUiRoot` envolve a nova UI num `MotionConfig`: as animações do Motion rodam em JavaScript e o CSS não as alcança.
- **Arrastar a janela (macOS).** O Chromium monta as regiões de arrastar na ordem da árvore, uma por caixa marcada, e a mais recente vence; o valor é herdado, e até `none` vira `no-drag`. Por isso nada acima da barra declara `-webkit-app-region`, a barra vem depois do conteúdo na árvore e os notches marcam `no-drag`. Um e2e reproduz o algoritmo, e o app real foi arrastado de verdade (pela faixa move; pelo conteúdo e pelos botões, não).
- **Telas atuais fora de `.hibi-ui`.** O conteúdo das telas atuais continua fora de `.hibi-ui` (lá dentro, ele perderia o próprio CSS). A moldura e a área de rolagem também; só a barra e a trilha do topo são `HibiUiRoot`. Uma tela nova, ao ser reconstruída, monta a própria `HibiUiRoot`.
- **Prévia da navegação.** `?overlay=ui-navigation` (com `&position=bottom`), só no desenvolvimento: o shell oficial sem as telas, para comparar com o preview e testar a posição inferior até a U04 criar a preferência.
- **Capturas escuras do preview.** As `notch-dark-*.png` congeladas foram tiradas no meio da transição de 200 ms de cor: o texto e os ícones ainda iam do claro para o escuro. As comparações escuras usam o preview servido de novo e assentado (o preview congelado, com os mesmos hashes), que confere pixel a pixel com as capturas claras e com a móvel.

