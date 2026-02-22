import { WebhookClient, type MessagePayload, type TextChannel } from 'discord.js';
import type { LifecycleEventHandler } from './index';
import { LifecycleEvent } from '../types';
import { injectCustomId } from '../custom-id';
import { destroyView } from '../lifecycle';
import { db } from '../../../../utilities/db';
import { logger } from '../../../../utilities/logger';

export const renderHandler: LifecycleEventHandler = {
  event: LifecycleEvent.Render,
  async execute({ view, def, client, interaction }) {
    const payload = (await def.render(injectCustomId(view), db)) as MessagePayload;

    if (interaction) {
      // Dispatch path: defer + edit via interaction
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
      }
      await interaction.editReply(payload);
    } else {
      // Notify path: edit via channel or webhook
      try {
        if (view.visibility === 'public') {
          const channel = (await client.channels.fetch(String(view.channel))) as TextChannel | null;
          if (!channel) {
            logger.warn({ message: `Channel ${view.channel} not found, destroying view ${view.id}.` });
            await destroyView(view.id);
            return;
          }
          await channel.messages.edit(String(view.message), payload);
        } else if (view.webhookToken) {
          const webhook = new WebhookClient({ id: client.application!.id, token: view.webhookToken });
          await webhook.editMessage(String(view.message), payload);
        }
      } catch (error) {
        logger.error({ message: `Failed to re-render view ${view.id}, destroying.`, error });
        await destroyView(view.id);
      }
    }
  },
};
