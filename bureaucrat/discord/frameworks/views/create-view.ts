import type { Postgres } from '../../../utilities/db';
import type { EventTemplate, InteractionHandler, MessagePayload, ViewDefinition, ViewRow } from './types';

type CreateViewInput<S, E extends EventTemplate, I extends string> = {
  id: string;
  idParams?: readonly string[];
  events?: E;
  subscribesTo?: (keyof E & string)[];
  defaultState?: S;
  render: (view: ViewRow<S, I>, db: Postgres) => Promise<MessagePayload>;
  interactions?: Record<I, InteractionHandler<S>>;
};

/**
 * Factory function for defining a view. Enforces the type contract at definition time.
 *
 * Curried so that `S` and `E` can be provided explicitly while `I` is inferred
 * from the `interactions` object — catching dangling routes at compile time.
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
      subscribesTo: def.subscribesTo ?? [],
      defaultState: def.defaultState,
      render: def.render as ViewDefinition<S, E>['render'],
      interactions: def.interactions ?? {},
    };
  };
