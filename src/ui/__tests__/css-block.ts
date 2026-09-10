// Parser mínimo baseado em regex para ler um único bloco `seletor { --custom-prop: valor; ... }`
// de uma folha de estilo já lida como texto. Usado pelos testes de shell.css e tokens.css para
// não duplicar a mesma lógica de extração.
export const cssBlock = (css: string, selector: string): Record<string, string> => {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`Bloco não encontrado: ${selector}`)
  const body = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1]!, match[2]!.trim()]))
}
