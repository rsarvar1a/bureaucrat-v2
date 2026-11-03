import type {
  APIEmbed,
  ActionRowBuilder,
  AttachmentBuilder,
  AttachmentPayload,
  Client,
  MessageActionRowComponentBuilder,
  MessageComponentInteraction,
  MessageFlags,
  MessageMentionOptions,
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
 * e.g., `{ MembersChanged: 'instance::${instance}::members' }`
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
  /**
   * Files attached to the message, referenced from components as
   * `attachment://<name>`. On the edit path the framework also sends an empty
   * `attachments` array, so a re-render replaces the previous upload instead
   * of accumulating copies.
   */
  files?: (AttachmentBuilder | AttachmentPayload)[];
  /** Who a mention in the message may notify; `{ parse: [] }` names without pinging. */
  allowedMentions?: MessageMentionOptions;
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
  /**
   * The action that was dispatched.
   *
   * Meaningful chiefly to a `'*'` fallback handler, which is invoked for
   * actions the view could not enumerate at definition time - content-defined
   * buttons on an item or a fixture, for instance.
   */
  action: string;
  ids: Record<string, string>;
  updateState(patch: Partial<S>): Promise<void>;
  notify(...eventTemplates: string[]): Promise<void>;
  notifyAll(...eventTemplates: string[]): Promise<void>;
  mutateAndNotify(patch: Partial<S>, ...eventTemplates: string[]): Promise<void>;
  spawnView(viewId: string, target: SpawnTarget, options?: SpawnOptions): Promise<ViewRow>;
};

/**
 * An authorization check run before an interaction handler.
 *
 * Returns `true` to allow, or a denial reason shown to the actor as an
 * ephemeral reply. Guards run after the view context is built, so they can
 * consult view state, ancestry ids, and the database.
 */
export type ViewGuard = (interaction: ViewInteraction, ctx: ViewContext<unknown>) => Promise<true | string>;

/**
 * Guards keyed by action, with `'*'` applying to every action on the view.
 *
 * Keying by action rather than wrapping each handler keeps the action union
 * that `createView` infers intact, and per-action granularity is required in
 * practice - a panel is often visible to everyone while one of its buttons is
 * restricted to the owner.
 */
export type ViewGuards<I extends string = string> = { '*'?: ViewGuard[] } & Partial<Record<I, ViewGuard[]>>;

/**
 * The shape of a view definition returned by `createView()`.
 */
export type ViewDefinition<S = unknown, E extends EventTemplate = EventTemplate> = {
  id: string;
  idParams: readonly string[];
  events: E;
  subscribesTo: Partial<Record<LifecycleAction, string[]>>;
  guards: ViewGuards;
  defaultState?: S;
  destroy?: (view: ViewRow<S>, client: Client) => Promise<void>;
  render: (view: ViewRow<S>, db: Postgres, client: Client) => Promise<MessagePayload>;
  interactions: Record<string, InteractionHandler<S>>;
};
