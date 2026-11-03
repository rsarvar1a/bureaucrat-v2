import { AttachmentBuilder, ButtonStyle } from 'discord.js';
import { createView } from '../../../../../engine/discord/views/create-view';
import { dismissButton } from '../../../../../engine/discord/components/dismiss';
import {
  accent,
  text,
  separator,
  linear,
  buttonRow,
  button,
  file,
  media,
  v2,
} from '../../../../../engine/discord/elements';
import type { InteractionHandler } from '../../../../../engine/discord/views/types';
import {
  getScriptPage,
  getScriptPdfById,
  getScriptSummary,
  getScriptSummaryById,
} from '../../../../../drizzle/scripts';
import { safeName } from '../../../games/script/upload';
import { inGuild } from '../../../guards';
import { S } from '../../../../../strings';

/**
 * `script` names the row to show; null means the game's own, found from the
 * entity id. Opened by id, the pane is the only place the script is offered,
 * so the PDF rides along as a download; from a game, the Script window has it.
 */
type PreviewState = { page: number; script: string | null };

const dismiss = dismissButton<PreviewState>()({ action: 'dismiss' });

const turn =
  (by: number | 'first' | 'last'): InteractionHandler<PreviewState> =>
  async (interaction, ctx) => {
    if (!interaction.isMessageComponent()) return;
    await interaction.deferUpdate();

    const current = ctx.view.state?.page ?? 0;
    // Clamping to the real count happens at render, against what was stored.
    const page = by === 'first' ? 0 : by === 'last' ? Number.MAX_SAFE_INTEGER : Math.max(0, current + by);
    await ctx.updateState({ page });

    return { action: 'render' };
  };

// Ephemeral, one page at a time, each a row read: the pages were drawn when
// the PDF was uploaded.
export default createView<PreviewState>()({
  id: 'gscriptpreview',
  idParams: [],
  events: {},
  defaultState: { page: 0, script: null },
  // Ephemeral to whoever opened it, from a window or card that already decided who may.
  guards: { '*': [inGuild] },

  render: async (view) => {
    const script = view.state?.script
      ? await getScriptSummaryById(view.state.script)
      : await getScriptSummary(view.entityId!);
    const rendered = script ? await getScriptPage(script.id, view.state?.page ?? 0) : null;

    if (!rendered) {
      return v2(linear(text(S.errors.noScript), separator(), dismiss.row(view)).setAccentColor(accent.warning));
    }

    const { png, page, pages } = rendered;
    const name = `page-${page + 1}.png`;
    const files = [new AttachmentBuilder(Buffer.from(png), { name })];

    const download = view.state?.script ? await getScriptPdfById(view.state.script) : null;
    const downloads = [];
    if (download) {
      const attached = safeName(download.pdfName ?? '', 'script.pdf');
      files.push(new AttachmentBuilder(Buffer.from(download.pdf), { name: attached }));
      downloads.push(file(`attachment://${attached}`));
    }

    return {
      ...v2(
        linear(
          text(`### ${script?.name ?? script?.pdfName ?? 'Script'}`),
          separator(),
          ...downloads,
          media(`attachment://${name}`, `${page + 1} | ${pages}`),
          buttonRow(
            button(view.customId('first'), S.common.nudgeFaces.downBig, ButtonStyle.Secondary).setDisabled(page === 0),
            button(view.customId('back'), S.common.nudgeFaces.down, ButtonStyle.Secondary).setDisabled(page === 0),
            button(view.customId('next'), S.common.nudgeFaces.up, ButtonStyle.Primary).setDisabled(page >= pages - 1),
            button(view.customId('last'), S.common.nudgeFaces.upBig, ButtonStyle.Primary).setDisabled(
              page >= pages - 1,
            ),
          ),
          separator(),
          dismiss.row(view),
        ),
      ),
      files,
    };
  },

  interactions: {
    ...dismiss.interactions,
    first: turn('first'),
    back: turn(-1),
    next: turn(1),
    last: turn('last'),
    // The readout between the arrows: disabled, so never pressed.
    readout: async () => undefined,
  },
});
