import type { Client } from 'discord.js';
import type { Postgres } from '../../../utilities/db';
import type {
  EventTemplate,
  InteractionHandler,
  LifecycleAction,
  MessagePayload,
  ViewDefinition,
  ViewGuards,
  ViewRow,
} from './types';

type CreateViewInput<S, E extends EventTemplate, I extends string> = {
  id: string;
  idParams?: readonly string[];
  events?: E;
  subscribesTo?: Partial<Record<LifecycleAction, string[]>>;
  // NoInfer keeps the `'*'` key out of the inferred action union `I`, which is
  // otherwise picked up here and then demanded as a handler in `interactions`.
  guards?: ViewGuards<NoInfer<I>>;
  defaultState?: S;
  destroy?: (view: ViewRow<S>, client: Client) => Promise<void>;
  render: (view: ViewRow<S, I>, db: Postgres, client: Client) => Promise<MessagePayload>;
  interactions?: Record<I, InteractionHandler<S>>;
};

/**
 * Factory function for defining a view. Enforces the type contract at definition time.
 *
 * Curried so that `S` and `E` can be provided explicitly while `I` is inferred
 * from the `interactions` object - catching dangling routes at compile time.
 *
 * Usage: `createView<MyState, typeof MyEvents>()({ id: '...', ... })`
 */
export const createView =
  <S = unknown, E extends EventTemplate = EventTemplate>() =>
  <I extends string = string>(def: CreateViewInput<S, E, I>): ViewDefinition<S, E> => {
    if (!def.id || def.id.trim() === '') {
      throw new Error('View definition must have a non-empty id.');
    }

    if (!def.render) {
      throw new Error(`View "${def.id}" must provide a render function.`);
    }

    return {
      id: def.id,
      idParams: def.idParams ?? [],
      events: def.events ?? ({} as E),
      subscribesTo: def.subscribesTo ?? {},
      guards: def.guards ?? {},
      defaultState: def.defaultState,
      destroy: def.destroy as ViewDefinition<S, E>['destroy'],
      render: def.render as ViewDefinition<S, E>['render'],
      interactions: def.interactions ?? {},
    };
  };
