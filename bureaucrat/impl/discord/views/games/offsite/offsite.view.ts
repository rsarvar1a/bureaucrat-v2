import { ButtonStyle } from 'discord.js';
import { createView } from '../../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../../engine/discord/views/lifecycle';
import { accent, text, separator, linear, buttonRow, button, v2 } from '../../../../../engine/discord/elements';
import { getExportOfGame } from '../../../../../drizzle/game-exports';
import { getGame } from '../../../../../drizzle/games';
import { inGuild } from '../../../guards';
import { storytells } from '../../../guards/game';
import { retryExport } from '../../../games/offsite/start';
import { OffsiteEvents } from './events';
import { S } from '../../../../../strings';

type Empty = Record<string, never>;

/**
 * The progress card of a game's offsite archive, public at the bottom of
 * the game channel and parentless: it belongs to the game, not to a window.
 * The engine redraws it as the counts move; Retry puts a stopped job back.
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

  render: async (view) => {
    const [game, exp] = await Promise.all([getGame(view.entityId!), getExportOfGame(view.entityId!)]);
    if (!game || !exp) return v2(linear(text(S.errors.nothingExported)).setAccentColor(accent.neutral));

    const line =
      exp.state === 'reading'
        ? exp.channels === 0
          ? S.offsite.waiting
          : S.offsite.reading(exp.messages, exp.channels)
        : exp.state === 'read'
          ? S.offsite.read(exp.messages, exp.channels)
          : exp.state === 'copying'
            ? S.offsite.copying(exp.copied, exp.messages)
            : exp.state === 'copied'
              ? S.offsite.copied(exp.channel!, exp.copied)
              : S.offsite.failed(exp.error ?? 'unknown error');
    const tone = exp.state === 'copied' ? accent.success : exp.state === 'failed' ? accent.danger : accent.brand;

    return {
      ...v2(
        linear(
          text(
            `${S.offsite.title(game.name)}\n${line}${exp.unread.length > 0 ? `\n${S.offsite.unread(exp.unread)}` : ''}`,
          ),
          ...(exp.state === 'failed'
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
      const exp = await getExportOfGame(ctx.view.entityId!);
      if (exp) await retryExport(exp);
      return { action: 'render' };
    },
  },
});
