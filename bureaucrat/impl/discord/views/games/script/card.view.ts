import { AttachmentBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createView } from '../../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../../engine/discord/views/lifecycle';
import { dismissButton } from '../../../../../engine/discord/components/dismiss';
import {
  accent,
  text,
  separator,
  linear,
  buttonRow,
  button,
  file,
  linkButton,
  v2,
} from '../../../../../engine/discord/elements';
import { countScriptPages, getScript } from '../../../../../drizzle/scripts';
import { inGuild } from '../../../guards';
import { parseScript } from '../../../games/script/parse';
import { GameEvents } from '../events';
import { S } from '../../../../../strings';

type CardState = Record<string, never>;

const dismiss = dismissButton<CardState>()({ action: 'dismiss' });

const safeName = (name: string, fallback: string) => name.replace(/[^\w.-]+/g, '_') || fallback;

// The script's files and link, and a Preview to thumb through the PDF: what
// `/game script` hands a player ephemerally, and what Configuration > Script
// posts publicly in a thread. Rendered once, so the attachments are not
// re-sent on anything; the public copy is re-placed when the script changes.
export default createView<CardState>()({
  id: 'gscriptcard',
  idParams: [],
  events: {},
  defaultState: {},
  subscribesTo: { detach: [GameEvents.Ended] },
  guards: { '*': [inGuild] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view) => {
    const script = await getScript(view.entityId!);
    if (!script || (!script.link && !script.json && !script.pdf)) {
      return v2(linear(text(S.errors.noScript), separator(), dismiss.row(view)).setAccentColor(accent.neutral));
    }

    const pages = script.pdf ? await countScriptPages(script.id) : 0;
    const parsed = script.json ? parseScript(script.json) : null;

    const name = script.name ?? (parsed?.ok ? parsed.script.name : null) ?? 'Script';
    const title = script.link ? `### [${name}](${script.link})` : `### ${name}`;

    const lines: string[] = [];
    const author = script.author ?? (parsed?.ok ? parsed.script.author : null);
    if (author) lines.push(`by ${author}`);

    const files: AttachmentBuilder[] = [];
    const cards: ReturnType<typeof file>[] = [];
    if (script.json) {
      const attached = safeName(script.jsonName ?? '', 'script.json');
      files.push(new AttachmentBuilder(Buffer.from(JSON.stringify(script.json, null, 2)), { name: attached }));
      cards.push(file(`attachment://${attached}`));
    }
    if (script.pdf) {
      const attached = safeName(script.pdfName ?? '', 'script.pdf');
      files.push(new AttachmentBuilder(Buffer.from(script.pdf), { name: attached }));
      cards.push(file(`attachment://${attached}`));
    }

    return {
      ...v2(
        linear(
          text(title),
          ...(lines.length > 0 ? [text(lines.join('\n'))] : []),
          ...cards,
          separator(),
          buttonRow(
            ...(script.link ? [linkButton('Open script', script.link)] : []),
            button(view.customId('preview'), 'Preview', ButtonStyle.Primary).setDisabled(pages === 0),
          ),
          ...(view.visibility === 'ephemeral' ? [dismiss.row(view)] : []),
        ).setAccentColor(accent.brand),
      ),
      files,
    };
  },

  interactions: {
    ...dismiss.interactions,

    preview: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      await ctx.spawnView('gscriptpreview', { interaction }, { visibility: 'ephemeral' });
    },
  },
});
