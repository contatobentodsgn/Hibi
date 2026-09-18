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
