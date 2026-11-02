import {
  MARKERS,
  nightOrder,
  type Night,
  type NightsJson,
  type RolesInPlay,
  type Scope,
} from '../../games/script/night';
import type { ParsedScript } from '../../games/script/parse';
import { roleTag, type RoleLook } from './seating/render';

/** Discord's text budget for one message, with room for the rest of the window. */
const BUDGET = 3700;

/**
 * The night order as a numbered list, `n. <emote> reminder`, or the one line that says
 * why there is none: the Storyteller reads this on every Night in the Phases window.
 */
export const nightOrderText = (
  script: ParsedScript | null,
  nights: NightsJson | null,
  night: Night,
  look: RoleLook,
  scope: Scope = 'all',
  inPlay: RolesInPlay = { trueRoles: [], apparentRoles: [] },
): string => {
  if (!script) return '*Upload the script JSON to see the night order here.*';

  const order = nightOrder(script, nights, night, scope, inPlay);
  if (!order.ok) {
    return order.reason === 'mixed'
      ? '*This script mixes official and homebrew characters; upload a night order file to see the order here.*'
      : '*A homebrew character on this script has no night priority; upload a night order file to see the order here.*';
  }
  if (order.entries.length === 0) return '*Nobody acts tonight.*';
  if (scope !== 'all' && order.entries.every((entry) => entry.id in MARKERS)) {
    return `${order.entries.map((e, i) => `${i + 1}. ${roleTag(e.emote ?? e.name, look)} ${e.reminder}`).join('\n')}\n*No role in play acts tonight.*`;
  }

  const lines = order.entries.map(
    (entry, index) =>
      `${index + 1}. ${roleTag(entry.emote ?? entry.name, look)} ${entry.reminder || `**${entry.name}**`}`,
  );
  let out = '';
  for (const line of lines) {
    if (out.length + line.length + 1 > BUDGET) return `${out}\n*…and ${lines.length - out.split('\n').length} more.*`;
    out += (out ? '\n' : '') + line;
  }
  return out;
};
