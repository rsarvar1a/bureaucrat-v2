import { AttachmentBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createView } from '../../../../../engine/discord/views/create-view';
import { deleteViewMessage } from '../../../../../engine/discord/views/lifecycle';
import { modal, field } from '../../../../../engine/discord/components/modal';
import {
  accent,
  text,
  separator,
  linear,
  buttonRow,
  button,
  file,
  select,
  selectRow,
  v2,
} from '../../../../../engine/discord/elements';
import { toast } from '../../../../../engine/discord/reply';
import { fetchUpload } from '../../../../../engine/discord/uploads';
import type { InteractionHandler } from '../../../../../engine/discord/views/types';
import { deleteScriptPages, getScript, replaceScriptPages, upsertScript } from '../../../../../drizzle/scripts';
import { inGuild } from '../../../guards';
import { storytells } from '../../../guards/game';
import { parseNights } from '../../../games/script/night';
import { isJsonUpload, isPdfUpload, parseScript } from '../../../games/script/parse';
import { renderAllPages } from '../../../games/script/pdf';
import { JSON_LIMIT, PDF_LIMIT, refusal, safeName } from '../../../games/script/upload';
import { GameEvents } from '../events';
import { getGame } from '../../../../../drizzle/games';
import { getOrCreateGameSettings, updateGameSettings } from '../../../../../drizzle/game-settings';
import { placeScriptCard, replaceScriptCard } from '../../../games/script-card';
import { S } from '../../../../../strings';

type Kind = 'pdf' | 'json' | 'nights';

/** The thread select's value for no public card; a planned thread is `t:<name>`. */
const NOWHERE = 'none';

const KINDS: readonly Kind[] = ['pdf', 'json', 'nights'];

type ScriptState = { kind: Kind | null };

const KIND_LABEL: Record<Kind, string> = { pdf: 'PDF', json: 'JSON file', nights: 'Night order (JSON)' };

const details = modal<ScriptState>()({
  action: 'details',
  title: 'Script details',
  fields: {
    name: field.short('Name', { required: false, maxLength: 100 }),
    link: field.short('Link', { required: false, maxLength: 500, placeholder: 'https://…' }),
  },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    const link = values['link']?.trim() || null;
    if (link && !/^https?:\/\//i.test(link)) {
      await toast.followUp(interaction, 'A link starts with http:// or https://.', { accent: accent.warning });
      return;
    }

    await upsertScript(ctx.view.entityId!, { name: values['name']?.trim() || null, link });
    await ctx.notify(GameEvents.Changed);
    await replaceScriptCard(interaction.client, ctx.view.entityId!);

    return { action: 'render' };
  },
});

const json = modal<ScriptState>()({
  action: 'json',
  title: 'Upload the script JSON',
  fields: { file: field.file('Script JSON', { accept: ['application/json'], maxFiles: 1 }) },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    const upload = values['file'][0];
    if (!upload || !isJsonUpload(upload)) {
      await toast.followUp(interaction, S.errors.uploadWrongType('JSON file'), { accent: accent.warning });
      return;
    }

    const fetched = await fetchUpload(upload, { maxBytes: JSON_LIMIT });
    if (!fetched.ok) {
      await toast.followUp(interaction, refusal(fetched, 'JSON file', '1 MB'), { accent: accent.warning });
      return;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(fetched.bytes.toString('utf8'));
    } catch {
      await toast.followUp(interaction, S.errors.scriptInvalid('not valid JSON.'), { accent: accent.warning });
      return;
    }

    const parsed = parseScript(raw);
    if (!parsed.ok) {
      await toast.followUp(interaction, S.errors.scriptInvalid(parsed.reason), { accent: accent.warning });
      return;
    }

    const current = await getScript(ctx.view.entityId!);
    await upsertScript(ctx.view.entityId!, {
      json: raw,
      jsonName: upload.name,
      name: current?.name ?? parsed.script.name,
      author: current?.author ?? parsed.script.author,
    });
    await ctx.notify(GameEvents.Changed);
    await replaceScriptCard(interaction.client, ctx.view.entityId!);

    return { action: 'render' };
  },
});

// For a script whose night order cannot be derived: homebrew mixed with
// official characters, or homebrew without priorities. The official night
// sheet's shape, so that file itself is a valid upload.
const nights = modal<ScriptState>()({
  action: 'nights',
  title: 'Upload the night order',
  fields: { file: field.file('Night order JSON', { accept: ['application/json'], maxFiles: 1 }) },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    const upload = values['file'][0];
    if (!upload || !isJsonUpload(upload)) {
      await toast.followUp(interaction, S.errors.uploadWrongType('JSON file'), { accent: accent.warning });
      return;
    }

    const fetched = await fetchUpload(upload, { maxBytes: JSON_LIMIT });
    if (!fetched.ok) {
      await toast.followUp(interaction, refusal(fetched, 'JSON file', '1 MB'), { accent: accent.warning });
      return;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(fetched.bytes.toString('utf8'));
    } catch {
      await toast.followUp(interaction, S.errors.nightsInvalid('not valid JSON.'), { accent: accent.warning });
      return;
    }

    const parsed = parseNights(raw);
    if (!parsed.ok) {
      await toast.followUp(interaction, S.errors.nightsInvalid(parsed.reason), { accent: accent.warning });
      return;
    }

    await upsertScript(ctx.view.entityId!, { nights: raw, nightsName: upload.name });
    await ctx.notify(GameEvents.Changed);
    await replaceScriptCard(interaction.client, ctx.view.entityId!);

    return { action: 'render' };
  },
});

const pdf = modal<ScriptState>()({
  action: 'pdf',
  title: 'Upload the script PDF',
  fields: { file: field.file('Script PDF', { accept: ['application/pdf'], maxFiles: 1 }) },
  async onSubmit(values, interaction, ctx) {
    await interaction.deferUpdate();

    const upload = values['file'][0];
    if (!upload || !isPdfUpload(upload)) {
      await toast.followUp(interaction, S.errors.uploadWrongType('PDF'), { accent: accent.warning });
      return;
    }

    const fetched = await fetchUpload(upload, { maxBytes: PDF_LIMIT });
    if (!fetched.ok) {
      await toast.followUp(interaction, refusal(fetched, 'PDF', '8 MB'), { accent: accent.warning });
      return;
    }

    // Rasterised here, once, so Preview is a row read per page. An unreadable
    // PDF is still kept for /game script; it just has nothing to preview.
    const pages = renderAllPages(fetched.bytes) ?? [];
    const row = await upsertScript(ctx.view.entityId!, { pdf: fetched.bytes, pdfName: upload.name });
    await replaceScriptPages(row.id, pages);
    await ctx.notify(GameEvents.Changed);
    await replaceScriptCard(interaction.client, ctx.view.entityId!);

    if (pages.length === 0) {
      await toast.followUp(interaction, S.errors.pdfNoPages, { accent: accent.warning });
    }

    return { action: 'render' };
  },
});

const kindOf = (view: { state: ScriptState | null }): Kind | null => KINDS.find((k) => k === view.state?.kind) ?? null;

const openDetails: InteractionHandler<ScriptState> = async (interaction, ctx) => {
  if (!interaction.isMessageComponent()) return;

  const current = await getScript(ctx.view.entityId!);
  await details.show(interaction, ctx, { values: { name: current?.name ?? '', link: current?.link ?? '' } });
};

// Window C. It carries the files themselves, so it does not re-render on the
// game's `Changed`: every seat edit would re-upload the PDF. Its own handlers
// are the only writers of the Script row, and they re-render it directly.
export default createView<ScriptState>()({
  id: 'gscript',
  idParams: [],
  events: {},
  defaultState: { kind: null },
  subscribesTo: { destroy: [GameEvents.Ended] },
  guards: { '*': [inGuild, storytells] },

  destroy: async (view, client) => {
    await deleteViewMessage(view, client);
  },

  render: async (view) => {
    const [script, settings] = await Promise.all([getScript(view.entityId!), getOrCreateGameSettings(view.entityId!)]);
    const parsed = script?.json ? parseScript(script.json) : null;
    const kind = kindOf(view);
    // A thread dropped from the plan since it was picked means no card.
    const bound =
      settings.scriptThread && settings.plannedThreads.includes(settings.scriptThread) ? settings.scriptThread : null;

    const name = script?.name ?? (parsed?.ok ? parsed.script.name : null) ?? 'Script';
    const title = script?.link ? `### [${name}](${script.link})` : `### ${name}`;

    const lines: string[] = [];
    const author = script?.author ?? (parsed?.ok ? parsed.script.author : null);
    if (author) lines.push(`*by ${author}*`);
    if (script?.nights) lines.push(`Night order from **${script.nightsName ?? 'a file'}**.`);
    if (lines.length === 0 && !script?.link && !script?.json && !script?.pdf) {
      lines.push('*No script yet.*');
    }

    const files: AttachmentBuilder[] = [];
    const cards: ReturnType<typeof file>[] = [];
    if (script?.json) {
      const attached = safeName(script.jsonName ?? '', 'script.json');
      files.push(new AttachmentBuilder(Buffer.from(JSON.stringify(script.json, null, 2)), { name: attached }));
      cards.push(file(`attachment://${attached}`));
    }
    if (script?.pdf) {
      const attached = safeName(script.pdfName ?? '', 'script.pdf');
      files.push(new AttachmentBuilder(Buffer.from(script.pdf), { name: attached }));
      cards.push(file(`attachment://${attached}`));
    }

    const stored: Record<Kind, string | null> = {
      pdf: script?.pdf ? (script.pdfName ?? 'script.pdf') : null,
      json: script?.json ? (script.jsonName ?? 'script.json') : null,
      nights: script?.nights ? (script.nightsName ?? 'nights.json') : null,
    };

    return {
      ...v2(
        linear(
          text(title),
          ...(lines.length > 0 ? [text(lines.join('\n'))] : []),
          ...cards,
          separator(),
          selectRow(
            select(view.customId('kind'), 'Add a PDF, JSON or night order file…').addOptions(
              KINDS.map((k) => ({
                label: KIND_LABEL[k],
                description: stored[k] ? `attached: ${stored[k]}` : 'not attached',
                value: k,
                default: k === kind,
              })),
            ),
          ),
          selectRow(
            select(view.customId('thread'), 'Where the script is shown to players').addOptions(
              { label: 'Nowhere', value: NOWHERE, default: bound === null },
              ...settings.plannedThreads.slice(0, 24).map((name) => ({
                label: name,
                description: 'planned public thread',
                value: `t:${name}`,
                default: name === bound,
              })),
            ),
          ),
          buttonRow(
            button(view.customId('details'), 'Edit description', ButtonStyle.Primary),
            button(
              view.customId('upload'),
              kind ? `Upload ${KIND_LABEL[kind]}` : 'Upload',
              ButtonStyle.Secondary,
            ).setDisabled(!kind),
            button(view.customId('remove'), 'Remove', ButtonStyle.Danger).setDisabled(!kind || !stored[kind]),
            button(view.customId('preview'), 'Preview', ButtonStyle.Secondary).setDisabled(!script?.pdf),
          ),
        ),
      ),
      files,
    };
  },

  interactions: {
    ...details.interactions,
    ...json.interactions,
    ...nights.interactions,
    ...pdf.interactions,

    details: openDetails,

    // The public card goes where this says: at Start, or at once mid-game.
    thread: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();

      const picked = interaction.values[0] ?? NOWHERE;
      await updateGameSettings(ctx.view.entityId!, { scriptThread: picked.startsWith('t:') ? picked.slice(2) : null });

      const game = await getGame(ctx.view.entityId!);
      if (game && game.state === 'running') {
        const placed = await placeScriptCard(interaction.client, game);
        if (placed === 'no-thread') {
          await toast.followUp(interaction, S.errors.noSuchThread, { accent: accent.warning });
        }
      }

      await ctx.notify(GameEvents.Changed);
      return { action: 'render' };
    },

    kind: async (interaction, ctx) => {
      if (!interaction.isStringSelectMenu()) return;
      await interaction.deferUpdate();
      const picked = interaction.values[0];
      await ctx.updateState({ kind: KINDS.find((k) => k === picked) ?? null });
      return { action: 'render' };
    },

    upload: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      const kind = kindOf(ctx.view);
      if (!kind) {
        await interaction.deferUpdate();
        return { action: 'render' };
      }

      await { pdf, json, nights }[kind].show(interaction, ctx);
    },

    preview: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;

      // Rendering a page can outlast Discord's three seconds; defer, and the
      // spawn edits the deferred reply.
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      await ctx.spawnView('gscriptpreview', { interaction }, { visibility: 'ephemeral' });
    },

    remove: async (interaction, ctx) => {
      if (!interaction.isMessageComponent()) return;
      await interaction.deferUpdate();

      const kind = kindOf(ctx.view);
      if (kind) {
        const cleared = {
          pdf: { pdf: null, pdfName: null },
          json: { json: null, jsonName: null },
          nights: { nights: null, nightsName: null },
        }[kind];
        const row = await upsertScript(ctx.view.entityId!, cleared);
        if (kind === 'pdf') await deleteScriptPages(row.id);
        await ctx.notify(GameEvents.Changed);
        await replaceScriptCard(interaction.client, ctx.view.entityId!);
      }

      return { action: 'render' };
    },
  },
});
