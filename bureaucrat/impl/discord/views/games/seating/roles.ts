import type { Character } from '../../../games/script/characters';
import { byTeam, pageCount, pageOf, parseScript } from '../../../games/script/parse';

/** The script's characters in select order, or null when there is no usable script. */
export const characterChoices = (json: unknown): Character[] | null => {
  if (json == null) return null;
  const parsed = parseScript(json);
  return parsed.ok && parsed.script.characters.length > 0 ? byTeam(parsed.script.characters) : null;
};

export const pageOfCharacters = (characters: Character[], page: number) => ({
  items: pageOf(characters, page),
  page: Math.min(Math.max(0, page), pageCount(characters.length) - 1),
  pages: pageCount(characters.length),
});
