import type { Postgres } from '../../../utilities/db';
import type { EventTemplate, InteractionHandler, MessagePayload, ViewDefinition, ViewRow } from './types';

type CreateViewInput<S, E extends EventTemplate> = {
  id: string;
  idParams?: readonly string[];
  events?: E;
  subscribesTo?: (keyof E & string)[];
  defaultState?: S;
  render: (view: ViewRow<S>, db: Postgres) => Promise<MessagePayload>;
  interactions?: Record<string, InteractionHandler<S>>;
};

/**
 * Factory function for defining a view. Enforces the type contract at definition time.
 */
export const createView = <S = unknown, E extends EventTemplate = EventTemplate>(
  def: CreateViewInput<S, E>,
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
    render: def.render,
    interactions: def.interactions ?? {},
  };
};
