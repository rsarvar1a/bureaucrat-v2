import type { Client } from 'discord.js';
import { logger } from '../../../utilities/logger';
import { HOME_GUILD } from './emotes';

/** The Pandemonium Institute's release repository: the official character icons, under the Community Created Content Policy. */
const RELEASE_REPO = 'ThePandemoniumInstitute/botc-release';
const ICON_PREFIX = 'resources/characters/';

export type SyncReport = { total: number; uploaded: number; skipped: number; failed: string[] };

export type Progress = (report: SyncReport) => Promise<void> | void;

type Source = { name: string; fetch: () => Promise<{ bytes: Uint8Array; type: string } | null> };

/** An emoji name as Discord takes it: 2 to 32 letters, digits and underscores. */
export const emojiName = (path: string): string | null => {
  const stem = path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
  return /^\w{2,32}$/.test(stem) ? stem : null;
};

/** Every character icon in the release repository, by path; the name is the file's stem (`imp`, `imp_e`, `townsfolk`). */
export const officialIconPaths = async (): Promise<string[]> => {
  const response = await fetch(`https://api.github.com/repos/${RELEASE_REPO}/git/trees/main?recursive=1`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'bureaucrat' },
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for the release tree.`);
  const tree = (await response.json()) as { tree: { path: string; type: string }[] };
  return tree.tree
    .filter((entry) => entry.type === 'blob' && entry.path.startsWith(ICON_PREFIX) && entry.path.endsWith('.webp'))
    .map((entry) => entry.path);
};

const download = async (url: string, type: string) => {
  const response = await fetch(url);
  if (!response.ok) return null;
  return { bytes: new Uint8Array(await response.arrayBuffer()), type };
};

const asDataUri = ({ bytes, type }: { bytes: Uint8Array; type: string }) =>
  `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;

/**
 * Fills the application's emoji set (2000 slots) with the official character
 * icons, regular and aligned variants alike, and whatever Bureaucrat's Office
 * holds (the alive, dead and no-vote marks). Names already taken are skipped,
 * so a rerun only adds what is new. Sequential, so the REST rate limiter paces
 * it; a failure is reported, never fatal.
 */
export const syncApplicationEmojis = async (client: Client<true>, onProgress?: Progress): Promise<SyncReport> => {
  const existing = new Set((await client.application.emojis.fetch()).map((emoji) => emoji.name));

  const sources: Source[] = [];
  for (const path of await officialIconPaths()) {
    const name = emojiName(path);
    if (!name) continue;
    sources.push({
      name,
      fetch: () => download(`https://raw.githubusercontent.com/${RELEASE_REPO}/main/${path}`, 'image/webp'),
    });
  }
  const office = client.guilds.cache.get(HOME_GUILD);
  for (const emoji of office?.emojis.cache.values() ?? []) {
    if (!emoji.name || !/^\w{2,32}$/.test(emoji.name)) continue;
    sources.push({
      name: emoji.name,
      fetch: () =>
        download(
          emoji.imageURL({ extension: emoji.animated ? 'gif' : 'png', size: 128 }),
          emoji.animated ? 'image/gif' : 'image/png',
        ),
    });
  }

  const report: SyncReport = { total: sources.length, uploaded: 0, skipped: 0, failed: [] };
  const seen = new Set<string>();
  for (const [index, source] of sources.entries()) {
    if (existing.has(source.name) || seen.has(source.name)) {
      report.skipped += 1;
    } else {
      seen.add(source.name);
      try {
        const image = await source.fetch();
        if (!image) throw new Error('download failed');
        await client.application.emojis.create({ attachment: asDataUri(image), name: source.name });
        report.uploaded += 1;
      } catch (error) {
        logger.warn({ message: `Could not add application emoji "${source.name}".`, error });
        report.failed.push(source.name);
      }
    }
    if (onProgress && (index + 1) % 25 === 0) await onProgress(report);
  }

  return report;
};
