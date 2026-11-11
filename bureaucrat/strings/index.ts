/**
 * Every word the bot says, in one place.
 *
 * Not a localization layer: there is one language and there is never going to
 * be a second. This exists so the *voice* can be tuned in one sitting - so that
 * two refusals written months apart can be read side by side and made to sound
 * like the same bot, which is impossible when they live four hundred lines
 * apart in two different views.
 *
 * ## The rules
 *
 * **No imports.** Enforced by eslint, which puts `strings/` at the bottom of
 * the stack. A string that needs a database query is a renderer and belongs
 * where the query does. Everything here takes plain values and returns a
 * plain string.
 *
 * **Interpolation is a function, not a template exposed to callers.** Writing
 * them as functions rather than as formats with `%s` holes means the call site
 * reads as English and the compiler checks the arity.
 *
 * **Markdown belongs here, not at the call site.** The bold on a name, the
 * `-#` that makes a line small, the `*italics*` on an empty state: all of it is
 * tone, and a caller that concatenates `**` around a name has taken a piece of
 * the voice back out of this directory.
 *
 * **What is not here**: log messages, which are for operators and not users;
 * and anything assembled from live data alone, where the only fixed text is
 * the separator.
 *
 * `common` (what the framework itself says), `errors` (every refusal), `games`,
 * `help`, `my`, `offsite`, `rating`, `reveal`, `stats` and `whispers` live here so far. View and command text is still inline and migrates
 * opportunistically.
 */

import * as common from './common';
import * as errors from './errors';
import * as games from './games';
import * as help from './help';
import * as my from './my';
import * as offsite from './offsite';
import * as rating from './rating';
import * as reveal from './reveal';
import * as stats from './stats';
import * as whispers from './whispers';

/**
 * The whole vocabulary, under one letter.
 *
 * Short because it is about to appear many times and a longer name would push
 * every line it touches over the margin. The area is what carries the meaning:
 * `S.common.dismiss`.
 */
export const S = {
  common,
  errors,
  games,
  help,
  my,
  offsite,
  rating,
  reveal,
  stats,
  whispers,
} as const;
