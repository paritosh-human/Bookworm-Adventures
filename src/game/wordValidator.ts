import words from '../assets/dictionary/words.json';

const DICTIONARY: Set<string> = new Set(words as string[]);

export function isValidWord(word: string): boolean {
  return word.length >= 2 && DICTIONARY.has(word.toLowerCase());
}
