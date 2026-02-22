import type { LifecycleEventHandler } from './index';
import { LifecycleEvent } from '../types';
import { injectCustomId } from '../custom-id';
import { destroyView } from '../lifecycle';
import { logger } from '../../../../utilities/logger';

export const destroyHandler: LifecycleEventHandler = {
  event: LifecycleEvent.Destroy,
  async execute({ view, def, client }) {
    try {
      if (def.destroy) {
        await def.destroy(injectCustomId(view), client);
      }
    } catch (error) {
      logger.error({ message: `Failed to destroy view ${view.route} with ID ${view.id}.`, error });
    } finally {
      await destroyView(view.id);
    }
  },
};
