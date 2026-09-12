import { translate, type DictionaryKey } from './dictionary'
import type { Locale } from './format'

// `after 1 minutes` é o defeito do app original, apontado nas auditorias da 0.2.2 e da 0.2.3 e ainda
// presente na segunda. Pluralizar de verdade custa uma função: a chave `.one` vale só para exatamente
// 1, e todo o resto — inclusive 0 — usa `.other`, que é o certo em pt e en ("0 minutos", "0 minutes").
//
// O número entra por substituição com função para que um `$&` no valor nunca seja reinterpretado,
// pelo mesmo motivo que `SettingsView.fillTemplate` já fazia isso.
export const pluralize = (locale: Locale, count: number, one: DictionaryKey, other: DictionaryKey): string =>
  translate(locale, count === 1 ? one : other).replace('{count}', () => String(count))
