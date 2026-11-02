/** The winners select of `/game end` when nobody with a Discord account is seated. */
export const noPlayersSeated = 'No players seated';
/** The ephemeral member peek of a game nobody has joined. */
export const nobodyInGame = '*Nobody is in the game yet.*';
/** Pinged into the game channel whenever a day's nominations open; `where` is the bound thread, when there is one. */
export const nominationsOpen = (players: string, where: string | null) =>
  `${players} nominations are open!${where ? ` See ${where}.` : ''}`;
/** `/signups withdraw` on a pending application. */
export const withdrawn = (game: string) => `Your signup for **${game}** has been withdrawn.`;
/** `/signups withdraw` by a member not yet seated. */
export const left = (game: string, role: string) => `You have left **${game}**; you were a ${role}.`;

/** The clocktower.live upload: what it took from the grimoire. */
export const liveApplied = (n: number) =>
  n === 0
    ? 'No seat was matched to a player, so nothing changed.'
    : `Copied ${n} ${n === 1 ? 'seat' : 'seats'} from the grimoire.`;
export const liveNothingMatched = 'Match at least one seat to a player.';
