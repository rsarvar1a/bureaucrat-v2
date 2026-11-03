import { WebhookClient, type Client, type GuildTextBasedChannel } from 'discord.js';
import type { LifecycleEventHandler } from '.';
import { LifecycleEvent, type ViewRow } from '../types';
import { injectCustomId } from '../custom-id';
import { destroyView } from '../lifecycle';
import { db } from '../../../../utilities/db';
import { logger } from '../../../../utilities/logger';
import { writable } from '../threads';

/** Edits the view's own message where it lives: the channel for a public view, the webhook for an ephemeral. */
const editInPlace = async (view: ViewRow, client: Client, payload: unknown): Promise<void> => {
  if (view.visibility === 'public') {
    const channel = (await client.channels.fetch(String(view.channel))) as GuildTextBasedChannel | null;
    if (!channel) throw new Error(`Channel ${view.channel} not found.`);
    // Wake an archived thread before editing. Without this the edit throws,
    // the view is destroyed, and the team is left with a dead console on
    // screen and no way to bring it back.
    await writable(channel);
    await channel.messages.edit(String(view.message), payload as never);
  } else if (view.webhookToken) {
    const webhook = new WebhookClient({ id: client.application!.id, token: view.webhookToken });
    await webhook.editMessage(String(view.message), payload as never);
  }
};

/**
 * Whether answering the interaction edits the view's message: a press on it,
 * or a modal opened from it. A modal a slash command opened has no message
 * behind it, and editing "the reply" would edit nothing or the wrong thing.
 */
const cameFromView = (
  interaction: NonNullable<Parameters<LifecycleEventHandler['execute']>[0]['interaction']>,
  view: ViewRow,
) =>
  interaction.isModalSubmit()
    ? interaction.isFromMessage() && interaction.message.id === String(view.message)
    : interaction.message.id === String(view.message);

export const renderHandler: LifecycleEventHandler = {
  event: LifecycleEvent.Render,
  async execute({ view, def, client, interaction }) {
    const rendered = await def.render(injectCustomId(view), db, client);

    // Editing keeps existing attachments unless told otherwise. A render is a
    // complete description of the message, so previous attachments are always
    // dropped - otherwise a view that stops shipping a file (a thumbnail being
    // removed, say) would leave the stale image dangling on the message.
    const payload = { ...rendered, attachments: [] };

    if (interaction && cameFromView(interaction, view)) {
      // Dispatch path: defer + edit via interaction
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
      }
      await interaction.editReply(payload as never);
      return;
    }

    if (interaction) {
      // Dispatch path from elsewhere (a command's modal): the view's message is
      // edited directly, and a failure is the dispatcher's to judge.
      if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
      await editInPlace(view, client, payload);
      return;
    }

    // Notify path: edit via channel or webhook
    try {
      await editInPlace(view, client, payload);
    } catch (error) {
      logger.error({ message: `Failed to re-render view ${view.id}, destroying.`, error });
      await destroyView(view.id);
    }
  },
};
