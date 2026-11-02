/**
 * Whether a record belongs to the guild an interaction came from.
 *
 * Its own module, with no imports, so it can be tested without reaching the
 * database.
 *
 * What the actor is told when it does not is `S.errors.notHere`, which is
 * deliberately the same as "gone".
 *
 * Why this exists at all: a `customId` carries a view's uuid, and the view row
 * carries the queue. Nothing in that chain mentions a guild, so a custom id
 * lifted from one server and replayed in another would resolve perfectly well -
 * and the ACL is keyed by the interaction's guild, so a server-wide grant over
 * there would authorise an edit over here. Uuids being hard to guess is not a
 * comfortable answer once the bot is in more than one server.
 */
export const inSameGuild = (record: bigint, interactionGuild: string | null | undefined): boolean =>
  !!interactionGuild && record === BigInt(interactionGuild);
