import type { LifecycleEventHandler } from '.';
import { LifecycleEvent } from '../types';
import { detachViewMessage, destroyView } from '../lifecycle';
import { destroyHandler } from './destroy';

/**
 * Leaves a public view's message as the record, controls stripped, and drops
 * its row; the view's own `destroy` hook is not run, since that is what would
 * delete the message. An ephemeral view is destroyed as usual.
 */
export const detachHandler: LifecycleEventHandler = {
  event: LifecycleEvent.Detach,
  async execute(params) {
    if (params.view.visibility !== 'public') return destroyHandler.execute(params);

    try {
      await detachViewMessage(params.view, params.client);
    } finally {
      await destroyView(params.view.id);
    }
  },
};
