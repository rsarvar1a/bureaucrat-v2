import type {
  APIEmbed,
  ActionRowBuilder,
  Client,
  MessageActionRowComponentBuilder,
  MessageComponentInteraction,
  MessageFlags,
  ModalSubmitInteraction,
  TopLevelComponentData,
} from 'discord.js';
import type { JSONEncodable, APIMessageTopLevelComponent } from 'discord.js';
import type { View } from '../../../schema/abc/views.sql';
import type { Postgres } from '../../../utilities/db';
import type { SpawnTarget, SpawnOptions } from './lifecycle';

/**
 * The lifecycle event constants and action type.
 */
export const LifecycleEvent = { Destroy: 'destroy', Render: 'render' } as const;

export type LifecycleAction = (typeof LifecycleEvent)[keyof typeof LifecycleEvent];

/**
 * A record where values contain `${placeholder}` patterns.
 * e.g., `{ Votes: 'nomination::${nomination}::votes' }`
 */
export type EventTemplate = Record<string, string>;

/**
 * The DB row for a View with its state typed.
 *
 * The `A` parameter constrains which action strings `customId()` accepts.
 * In `render`, `A` is inferred from the view's interaction keys, catching
 * dangling routes at compile time. Components and handlers default to `string`.
 */
export type ViewRow<S = unknown, A extends string = string> = typeof View.$inferSelect & {
  state: S;
  customId(action: A, ...extraIds: string[]): string;
};

/**
 * The Discord message payload that `render()` produces.
 *
 * Supports both classic (embeds + action rows) and Components V2
 * (containers, text displays, etc.). When using V2 components,
 * set `flags: MessageFlags.IsComponentsV2`.
 */
export type MessagePayload = {
  embeds?: APIEmbed[];
  components?: (
    | ActionRowBuilder<MessageActionRowComponentBuilder>
    | JSONEncodable<APIMessageTopLevelComponent>
    | TopLevelComponentData
  )[];
  content?: string;
  flags?: MessageFlags.SuppressEmbeds | MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
};

/**
 * Result returned by an interaction handler.
 */
export type HandlerResult = { action: 'render' } | { action: 'destroy' } | { action: 'noop' } | void;

/**
 * The union of interaction types that view handlers receive.
 */
export type ViewInteraction = MessageComponentInteraction | ModalSubmitInteraction;

/**
 * An interaction handler for a view. Handlers receive the broad union;
 * narrow with `.isButton()`, `.isModalSubmit()`, etc. as needed.
 */
export type InteractionHandler<S, I extends ViewInteraction = ViewInteraction> = (
  interaction: I,
  ctx: ViewContext<S>,
) => Promise<HandlerResult>;

/**
 * Context passed to interaction handlers.
 *
 * `notify` and `mutateAndNotify` accept event template *values*
 * (e.g., `CounterEvents.ValueUpdated`). The framework resolves the
 * `${placeholder}` patterns against the ids it already holds.
 */
export type ViewContext<S> = {
  view: ViewRow<S>;
  ids: Record<string, string>;
  updateState(patch: Partial<S>): Promise<void>;
  notify(...eventTemplates: string[]): Promise<void>;
  notifyAll(...eventTemplates: string[]): Promise<void>;
  mutateAndNotify(patch: Partial<S>, ...eventTemplates: string[]): Promise<void>;
  spawnView(viewId: string, target: SpawnTarget, options?: SpawnOptions): Promise<ViewRow>;
};

/**
 * The shape of a view definition returned by `createView()`.
 */
export type ViewDefinition<S = unknown, E extends EventTemplate = EventTemplate> = {
  id: string;
  idParams: readonly string[];
  events: E;
  subscribesTo: Partial<Record<LifecycleAction, string[]>>;
  defaultState?: S;
  destroy?: (view: ViewRow<S>, client: Client) => Promise<void>;
  render: (view: ViewRow<S>, db: Postgres) => Promise<MessagePayload>;
  interactions: Record<string, InteractionHandler<S>>;
};
