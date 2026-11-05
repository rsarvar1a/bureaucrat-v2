export const title = (game: string): string => `### Archiving ${game}`;
export const reading = (messages: number, channels: number): string =>
  `Reading game: ${messages.toLocaleString('en')} messages in ${channels} channel${channels === 1 ? '' : 's'} so far.`;
export const read = (messages: number, channels: number): string =>
  `Read: ${messages.toLocaleString('en')} messages in ${channels} channel${channels === 1 ? '' : 's'}. Run \`/game offsite\` to start copying.`;
export const copying = (copied: number, messages: number): string =>
  `Copying game: ${copied.toLocaleString('en')} of ${messages.toLocaleString('en')} messages.`;
/** A copy deferred by Discord's thread limit (`games/offsite/gate.ts`). */
export const paused = (until: Date): string => `-# Rate limited until <t:${Math.ceil(until.getTime() / 1000)}:R>.`;
export const copied = (channel: bigint, messages: number): string =>
  `Copied ${messages.toLocaleString('en')} messages to <#${channel}>.`;
export const failed = (error: string): string => `**Stopped:** ${error}`;
export const unread = (names: string[]): string => `-# Could not read: ${names.join(', ')}.`;
export const waiting = 'Waiting for the archiver to pick this up.';
export const retry = 'Retry';
export const toRecord = '**Record:**';
export const toArchive = (guild: string): string => `**${guild}:**`;
export const started = (game: string): string => `**${game}** is being archived.`;
export const adopted = (game: string): string => `This channel is now on record as **${game}** and is being archived.`;
export const reflowed = (chains: { base: string; channels: number; links: number }[]): string =>
  chains
    .map(
      ({ base, channels, links }) =>
        `**${base}**: ${channels.toLocaleString('en')} channel${channels === 1 ? '' : 's'} across ${links} categor${links === 1 ? 'y' : 'ies'}.`,
    )
    .join('\n');
export const synced = (tally: {
  started: number;
  adopted: number;
  copied: number;
  skipped: number;
  unmapped: number;
}): string => {
  const parts = [`${tally.started} queued for copying`, `${tally.copied} already exported to the target archive`];
  if (tally.skipped > 0) parts.push(`${tally.skipped} skipped (running, unfinished, or belonging to another server)`);
  const unmapped =
    tally.unmapped > 0
      ? `\n-# ignored ${tally.unmapped} archive${tally.unmapped === 1 ? '' : 's'} with no mapping; see \`/archives offsite manage\`.`
      : '';
  return `Archive sync: ${parts.join(', ')}.${unmapped}`;
};
export const privateQueued = (count: number): string =>
  count === 0
    ? 'Private threads will be copied from now on.'
    : `Private threads will be copied from now on; ${count} finished cop${count === 1 ? 'y is' : 'ies are'} queued for reingestion!`;
export const manageTitle = '### Off-server archives';
export const noMappings = 'There are no archive mappings yet.';
/** A destination as links: the server, and the category in it, each opening in Discord. */
export const mappingTarget = (guild: { id: string; name: string }, category: { id: string; name: string }): string =>
  `[**${guild.name}**](https://discord.com/channels/${guild.id}) › [${category.name}](https://discord.com/channels/${guild.id}/${category.id})`;
export const familyGone = '*(an unknown category)*';
export const unmapped = (names: string[]): string => `-# Not copied: ${names.map((name) => `**${name}**`).join(', ')}.`;
export const addPlaceholder = 'Map an archive…';
export const pickPlaceholder = 'Pick a mapping to change or remove';
export const addTitle = 'Copy this archive to…';
export const change = 'Change destination';
export const remove = 'Stop copying';
export const removeConfirm = (family: string): string => `Stop copying ${family}`.slice(0, 80);
export const mappingCount = (count: number): string =>
  count === 0
    ? 'No archive is configured to export off-server yet; map them with `/archives offsite manage`.'
    : `${count} archive${count === 1 ? ' is' : 's are'} copied off-server; see \`/archives offsite manage\`.`;
