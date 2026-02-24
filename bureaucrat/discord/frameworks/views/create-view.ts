import type { Postgres } from '../../../utilities/db';
import type { EventTemplate, InteractionHandler, MessagePayload, NamedKeys, ViewDefinition, ViewRow } from './types';

type CreateViewInput<S, E extends EventTemplate, I extends Record<string, InteractionHandler<S>>> = {
  id: string;
  idParams?: readonly string[];
  events?: E;
  subscribesTo?: (keyof E & string)[];
  defaultState?: S;
  render: (view: ViewRow<S, Extract<NamedKeys<I>, string>>, db: Postgres) => Promise<MessagePayload>;
  interactions?: I;
};

/**
 * Factory function for defining a view. Enforces the type contract at definition time.
 *
 * The `render` function receives a `ViewRow` whose `customId()` method is
 * typed to only accept action strings that match explicitly-declared
 * interaction keys — catching dangling routes at compile time.
 */
export const createView = <
  S = unknown,
  E extends EventTemplate = EventTemplate,
  I extends Record<string, InteractionHandler<S>> = Record<string, InteractionHandler<S>>,
>(
  def: CreateViewInput<S, E, I>,
): ViewDefinition<S, E> => {
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
