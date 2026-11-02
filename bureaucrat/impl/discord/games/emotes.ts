import { normalizeId } from './script/characters';

/** Bureaucrat's Office: the server whose emotes stand in when the game's own has none. */
export const HOME_GUILD = '1226316580280078418';

export type Emote = { id: string; name: string; animated: boolean; mention: string };

type EmojiCache = Map<string, { id: string; name: string | null; animated: boolean | null }>;

/** The slice of a discord.js client this reads, so the lookup can be tested against a plain map. */
export type EmoteSource = {
  guilds: { cache: Map<string, { id: string; emojis: { cache: EmojiCache } }> };
  /** The application's own emoji (`/admin emoji` fills them); null before the client is ready. */
  application?: { emojis: { cache: EmojiCache } } | null;
};

/**
 * Finds a custom emote by character name, matched the way script ids are
 * (lowercase, letters and digits only), so `Fortune Teller` meets
 * `:fortuneteller:` and `:FortuneTeller:` alike. Sources are searched in
 * order: the game's own server, then Bureaucrat's Office, then the
 * application's own emoji, then every other server the bot is in; the first
 * match wins, so a server's custom art overrides the official icons.
 */
export const emoteFinder = (client: EmoteSource, gameGuild: bigint | string) => {
  const front = [...new Set([String(gameGuild), HOME_GUILD])];
  const rest = [...client.guilds.cache.keys()].filter((id) => !front.includes(id));
  const ofGuild = (id: string) => client.guilds.cache.get(id)?.emojis.cache;
  const caches = [...front.map(ofGuild), client.application?.emojis.cache, ...rest.map(ofGuild)].filter(
    (cache): cache is EmojiCache => cache !== undefined && cache !== null,
  );
  const index = new Map<string, { emote: Emote; rank: number }>();

  for (const [rank, cache] of caches.entries()) {
    for (const emoji of cache.values()) {
      const key = normalizeId(emoji.name ?? '');
      if (!key || index.has(key)) continue;
      const animated = emoji.animated ?? false;
      index.set(key, {
        rank,
        emote: {
          id: emoji.id,
          name: emoji.name!,
          animated,
          mention: `<${animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`,
        },
      });
    }
  }

  // Several names are candidates in order of preference (an aligned icon, then
  // the plain one); the earliest source wins, and within a source the earlier name.
  return (names: string | string[] | null | undefined): Emote | null => {
    let best: { emote: Emote; rank: number } | null = null;
    for (const name of typeof names === 'string' ? [names] : (names ?? [])) {
      const found = index.get(normalizeId(name));
      if (found && (best === null || found.rank < best.rank)) best = found;
    }
    return best?.emote ?? null;
  };
};

export type EmoteOf = ReturnType<typeof emoteFinder>;
