const MAX_LENGTH = 100;

export type ParsedCustomId = {
  path: string;
  action: string;
  ids: string[];
};

/**
 * Builds a customId string in structured path format.
 *
 * Format: `<path>::<action>::<id1>[:<id2>]`
 *
 * For view interactions, path is `view::<viewId>` and action is the interaction key.
 * Example: `view::counter::increment::a3f2b1c0`
 */
export const buildCustomId = (path: string, action: string, ...ids: string[]): string => {
  const parts = [path, '::', action];
  if (ids.length > 0) parts.push('::', ids.join(':'));

  const id = parts.join('');

  if (id.length > MAX_LENGTH) {
    throw new Error(`customId exceeds ${MAX_LENGTH} characters: "${id}" (${id.length} chars)`);
  }

  return id;
};

/**
 * Parses a customId string back into its components.
 *
 * Returns `null` if the string doesn't match the expected format.
 */
export const parseCustomId = (id: string): ParsedCustomId | null => {
  // Split on '::' to get segments
  const segments = id.split('::');

  // Minimum: path, action, ids — e.g., ['view', 'counter', 'increment', 'a3f2b1c0']
  if (segments.length < 3) return null;

  // Last segment may contain IDs (colon-separated)
  // Second-to-last is the action
  // Everything before is the path
  const lastSegment = segments[segments.length - 1]!;
  const action = segments[segments.length - 2]!;
  const pathSegments = segments.slice(0, -2);
  const path = pathSegments.join('::');

  // IDs are in the last segment, split by ':'
  const ids = lastSegment.split(':');

  return { path, action, ids };
};
