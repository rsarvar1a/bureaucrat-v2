import { ButtonStyle, type Client } from 'discord.js';
import { createView } from '../../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../../engine/discord/views/lifecycle';
import { accent, text, separator, linear, buttonRow, button, v2 } from '../../../../../engine/discord/elements';
import { listExportsOfGame, type GameExportRow } from '../../../../../drizzle/game-exports';
import { getDestination } from '../../../../../drizzle/offsite';
import { getGame } from '../../../../../drizzle/games';
import { inGuild } from '../../../guards';
import { storytells } from '../../../guards/game';
import { retryExport } from '../../../games/offsite/start';
import { OffsiteEvents } from './events';
import { S } from '../../../../../strings';

type Empty = Record<string, never>;

const stateLine = (exp: GameExportRow): string =>
  exp.state === 'reading'
    ? exp.channels === 0
      ? S.offsite.waiting
      : S.offsite.reading(exp.messages, exp.channels)
    : exp.state === 'read'
      ? S.offsite.read(exp.messages, exp.channels)
      : exp.state === 'copying'
        ? S.offsite.copying(exp.copied, exp.messages) +
          (exp.notBefore && exp.notBefore > new Date() ? `\n${S.offsite.paused(exp.notBefore)}` : '')
        : exp.state === 'copied'
          ? S.offsite.copied(exp.channel!, exp.copied)
          : S.offsite.failed(exp.error ?? 'unknown error');

/** Which archive an export goes to, by its server's name; the record alone for a read-only one. */
const labelOf = async (client: Client, exp: GameExportRow): Promise<string> => {
  if (exp.destination === null) return S.offsite.toRecord;
  const row = await getDestination(exp.destination);
  const guild = row ? client.guilds.cache.get(String(row.destGuild)) : undefined;
  return S.offsite.toArchive(guild?.name ?? String(row?.destGuild ?? '?'));
};

/**
 * The progress card of a game's offsite archive, public at the bottom of
 * the game channel and parentless: it belongs to the game, not to a window.
 * One line per destination the game is copied to. The engine redraws it
 * as the counts move; Retry puts every stopped job back.
 */
export default createView<Empty>()({
  id: 'goffsite',
  idParams: [],
  events: {},
  defaultState: {},
  subscribesTo: { render: [OffsiteEvents.Changed] },
  guards: { '*': [inGuild], retry: [storytells] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view, _db, client) => {
    const [game, exports] = await Promise.all([getGame(view.entityId!), listExportsOfGame(view.entityId!)]);
    if (!game || exports.length === 0) return v2(linear(text(S.errors.nothingExported)).setAccentColor(accent.neutral));

    // One line per destination; the label only once there is more than one to tell apart.
    const lines = await Promise.all(
      exports.map(async (exp) => {
        const line = stateLine(exp);
        const unread = exp.unread.length > 0 ? `\n${S.offsite.unread(exp.unread)}` : '';
        return exports.length > 1 ? `${await labelOf(client, exp)} ${line}${unread}` : `${line}${unread}`;
      }),
    );
    const failed = exports.some((exp) => exp.state === 'failed');
    const done = exports.every((exp) => exp.state === 'copied' || exp.state === 'read');
    const tone = failed ? accent.danger : done ? accent.success : accent.brand;

    return {
      ...v2(
        linear(
          text(`${S.offsite.title(game.name)}\n${lines.join('\n')}`),
          ...(failed
            ? [separator(), buttonRow(button(view.customId('retry'), S.offsite.retry, ButtonStyle.Primary))]
            : []),
        ).setAccentColor(tone),
      ),
      allowedMentions: { parse: [] },
    };
  },

  interactions: {
    retry: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();
      for (const exp of await listExportsOfGame(ctx.view.entityId!)) await retryExport(exp);
      return { action: 'render' };
    },
  },
});
