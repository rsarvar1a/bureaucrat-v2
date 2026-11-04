export const title = (game: string): string => `### Archiving ${game}`;
export const reading = (messages: number, channels: number): string =>
  `Reading… ${messages.toLocaleString('en')} messages in ${channels} channel${channels === 1 ? '' : 's'} so far.`;
export const read = (messages: number, channels: number): string =>
  `Read: ${messages.toLocaleString('en')} messages in ${channels} channel${channels === 1 ? '' : 's'}. Run \`/game offsite\` to copy them.`;
export const copying = (copied: number, messages: number): string =>
  `Copying… ${copied.toLocaleString('en')} of ${messages.toLocaleString('en')} messages.`;
export const copied = (channel: bigint, messages: number): string =>
  `Copied ${messages.toLocaleString('en')} messages to <#${channel}>.`;
export const failed = (error: string): string => `**Stopped:** ${error}`;
export const unread = (names: string[]): string => `-# Could not read: ${names.join(', ')}.`;
export const waiting = 'Waiting for the archiver to pick this up.';
export const retry = 'Retry';
export const started = (game: string): string =>
  `**${game}** is being archived. The card in its channel follows along.`;
export const offsiteSet = (guild: string, category: string): string =>
  `Ended games will be copied into **${category}** on **${guild}**.`;
export const adopted = (game: string): string =>
  `This channel is now on record as **${game}** and is being archived. The card in it follows along.`;
export const reflowed = (chains: { base: string; channels: number; links: number }[]): string =>
  chains
    .map(
      ({ base, channels, links }) =>
        `**${base}**: ${channels.toLocaleString('en')} channel${channels === 1 ? '' : 's'} across ${links} categor${links === 1 ? 'y' : 'ies'}, newest first.`,
    )
    .join('\n');
