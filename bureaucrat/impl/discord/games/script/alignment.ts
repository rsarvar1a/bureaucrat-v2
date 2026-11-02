import { normalizeId, OFFICIAL, type Character, type Team } from './characters';

export type Alignment = 'good' | 'evil';

export const ALIGNMENT_LABEL: Record<Alignment, string> = { good: 'Good', evil: 'Evil' };

/** The team a role name belongs to, on this script or among the official characters. */
export type TeamOf = (role: string | null | undefined) => Team | 'unknown' | null;

export const teamLookup =
  (characters: Character[] | null | undefined): TeamOf =>
  (role) => {
    if (!role) return null;
    const key = normalizeId(role);
    const onScript = characters?.find((c) => c.id === key || normalizeId(c.name) === key);
    return onScript?.team ?? OFFICIAL[key]?.team ?? null;
  };

/** What a role is until the Storyteller says otherwise: travelers and the rest start unaligned. */
export const defaultAlignment = (team: Team | 'unknown' | null | undefined): Alignment | null =>
  team === 'townsfolk' || team === 'outsider' ? 'good' : team === 'minion' || team === 'demon' ? 'evil' : null;

/**
 * A seat's override cycles default, good, evil. It belongs to the slot rather
 * than the role: set to evil, every character offered is the evil one and a
 * pick keeps it.
 */
export const nextAlignment = (stored: Alignment | null): Alignment | null =>
  stored === null ? 'good' : stored === 'good' ? 'evil' : null;

/**
 * The emote names that show a role, best first: the release icons are `<id>_g` and
 * `<id>_e` for aligned characters and plain `<id>` for the unaligned ones, so an
 * aligned role tries its variant before the plain name.
 */
export const roleEmoteNames = (role: string, alignment: Alignment | null): string[] => {
  const key = normalizeId(role);
  return alignment ? [`${key}_${alignment === 'good' ? 'g' : 'e'}`, key] : [key];
};
