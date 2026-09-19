import type { StudyData } from '../domain/models';

/** O reconhecedor da Apple aceita até 100 termos a favorecer; mais que isso, ele ignora o excedente. */
export const VOICE_VOCABULARY_LIMIT = 100;
const MAX_TERM_LENGTH = 40;
const MAX_PHRASE_WORDS = 4;

const FOLDER_WEIGHT = 3;
const NAME_WEIGHT = 2;
const TITLE_WEIGHT = 1;

const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
const bareWord = (token: string) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
/** Nome próprio, sigla ou mistura de caixa: "Kabrito", "DAS", "iCloud". Número puro não é nome. */
const looksLikeName = (word: string) => word.length >= 2 && /\p{L}/u.test(word) && /\p{Lu}/u.test(word) && (word.length >= 3 || word === word.toUpperCase());

/**
 * Os termos que o reconhecedor de voz deve favorecer, tirados do que já está no Hibi: nomes de pasta,
 * nomes próprios e siglas dos títulos, e os títulos curtos inteiros. É o que faz "Kabrito" sair
 * "Kabrito", e não "Cabrito".
 *
 * Só entram títulos e nomes de pasta — nunca o conteúdo de uma nota nem a descrição de uma tarefa. A lista
 * vai apenas para o reconhecedor, que roda neste Mac.
 *
 * A primeira palavra de um título costuma ser um verbo ou uma palavra comum ("Ligar", "Reunião"), que o
 * reconhecedor já conhece; ela só conta como nome se vier seguida de outra maiúscula ("Kabrito Post 01"),
 * se aparecer com maiúscula no meio de algum título ou se estiver num nome de pasta. O que se repete sobe na lista, e o teto é o que a Apple aceita.
 */
export function voiceVocabulary(data: Pick<StudyData, 'tasks' | 'notes' | 'reminders' | 'habits' | 'goals' | 'blocks'>, limit = VOICE_VOCABULARY_LIMIT): string[] {
  const terms = new Map<string, { text: string; score: number; order: number }>();
  const add = (raw: string, weight: number) => {
    const text = clean(raw);
    if (text.length < 2 || text.length > MAX_TERM_LENGTH || !/\p{L}/u.test(text)) return;
    const key = text.toLocaleLowerCase('pt-BR');
    const current = terms.get(key);
    if (current) current.score += weight;
    else terms.set(key, { text, score: weight, order: terms.size });
  };

  const folders = [...data.tasks.map((task) => task.folder), ...data.notes.map((note) => note.folder)].filter((folder): folder is string => typeof folder === 'string');
  const titles = [...data.tasks, ...data.notes, ...data.reminders, ...data.habits, ...data.goals, ...data.blocks].map((item) => clean(item.title ?? '')).filter(Boolean);

  const knownNames = new Set<string>();
  for (const folder of folders) for (const word of clean(folder).split(' ').map(bareWord)) if (looksLikeName(word)) knownNames.add(word);
  for (const title of titles) {
    const words = title.split(' ').map(bareWord);
    words.forEach((word, index) => {
      // No começo do título, só é nome se vier seguido de outra maiúscula ("Kabrito Post", "Kabrito OS").
      const startsNameRun = index === 0 && looksLikeName(words[1] ?? '');
      if (looksLikeName(word) && (index > 0 || startsNameRun || word === word.toUpperCase() || word[0] !== word[0].toUpperCase())) knownNames.add(word);
    });
  }

  for (const folder of folders) {
    add(folder, FOLDER_WEIGHT);
    for (const word of clean(folder).split(' ').map(bareWord)) if (knownNames.has(word)) add(word, NAME_WEIGHT);
  }
  for (const title of titles) {
    if (title.split(' ').length <= MAX_PHRASE_WORDS) add(title, TITLE_WEIGHT);
    for (const word of title.split(' ').map(bareWord)) if (knownNames.has(word)) add(word, NAME_WEIGHT);
  }

  return [...terms.values()]
    .sort((first, second) => second.score - first.score || first.order - second.order)
    .slice(0, Math.max(0, limit))
    .map((term) => term.text);
}

/**
 * Como um nome soa em português, para comparar o que o reconhecedor escreveu com o que está no Hibi:
 * "Cabrito", "cabritos" e "Kabrito" soam igual. Não é fonética de verdade — só as trocas de grafia que
 * o reconhecedor costuma fazer com nomes que não conhece.
 */
export function soundKey(word: string): string {
  let key = word.toLocaleLowerCase('pt-BR').replace(/ç/g, 's').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]/g, '');
  key = key.replace(/ph/g, 'f').replace(/[cs]h/g, 'x').replace(/qu/g, 'k').replace(/c(?=[ei])/g, 's').replace(/c/g, 'k')
    .replace(/z/g, 's').replace(/y/g, 'i').replace(/w/g, 'v').replace(/h/g, '').replace(/(.)\1+/g, '$1');
  // O plural e o "s" solto no fim ("Cabritos") não mudam de quem se fala.
  return key.length > 3 ? key.replace(/s$/, '') : key;
}

const WORD = /[\p{L}\p{N}]+/gu;
const MAX_TERM_WORDS = 3;

/**
 * Troca no texto reconhecido o que soa como um nome do vocabulário pelo nome escrito como no Hibi:
 * "revisar o post da cabrito" vira "revisar o post da Kabrito". O reconhecedor de sempre só favorece os
 * nomes, e ainda erra às vezes; o novo, do macOS 26, nem aceita vocabulário. Corrigir aqui, depois, vale
 * para os dois.
 *
 * Só entram nomes com maiúscula e de até 3 palavras. Siglas curtas só entram depois de um artigo
 * masculino: "DAS" soa como "das", e trocar toda preposição por sigla estragaria o texto. Diferença só de
 * maiúscula também fica como está —
 * "post" não vira "Post" no meio da frase.
 */
export function correctToVocabulary(text: string, vocabulary: readonly string[]): string {
  const terms = vocabulary
    .map((term) => ({ term, keys: term.match(WORD)?.map(soundKey) ?? [] }))
    .filter(({ term, keys }) => /\p{Lu}/u.test(term) && keys.length > 0 && keys.length <= MAX_TERM_WORDS && !(term === term.toUpperCase() && term.replace(/\s/g, '').length <= 3))
    .sort((first, second) => second.keys.length - first.keys.length);
  if (terms.length === 0 && !vocabulary.some((term) => /^\p{Lu}{2,3}$/u.test(term))) return text;
  const words = [...text.matchAll(WORD)].map((match) => ({ text: match[0], start: match.index ?? 0, key: soundKey(match[0]) }));
  const replacements: { start: number; end: number; term: string }[] = [];
  for (let index = 0; index < words.length;) {
    const found = terms.find(({ keys }) => keys.every((key, offset) => words[index + offset]?.key === key));
    if (!found) { index += 1; continue; }
    const first = words[index];
    const last = words[index + found.keys.length - 1];
    const spoken = text.slice(first.start, last.start + last.text.length);
    if (spoken.toLocaleLowerCase('pt-BR') !== found.term.toLocaleLowerCase('pt-BR')) replacements.push({ start: first.start, end: last.start + last.text.length, term: found.term });
    index += found.keys.length;
  }
  // Uma sigla curta que soa como palavra comum ("DAS" e "das") só é trocada depois de um artigo masculino:
  // "pagar o das" não é português, "pagar o DAS" é. "Revisar o post das clientes" fica como está.
  for (const acronym of vocabulary.filter((term) => /^\p{Lu}{2,3}$/u.test(term))) {
    const key = soundKey(acronym);
    words.forEach((word, index) => {
      if (index === 0 || word.key !== key || word.text === acronym) return;
      if (!/^(?:o|do|no|ao|pelo|um|meu|seu)$/iu.test(words[index - 1]!.text)) return;
      if (replacements.some((item) => word.start >= item.start && word.start < item.end)) return;
      replacements.push({ start: word.start, end: word.start + word.text.length, term: acronym });
    });
  }
  replacements.sort((first, second) => first.start - second.start);
  return replacements.reduceRight((result, { start, end, term }) => result.slice(0, start) + term + result.slice(end), text);
}
