import path from 'node:path';
import { loadViews } from '../../../engine/discord/views/loader';

/**
 * Every view this bot defines.
 *
 * This module is where the framework meets the implementation: it is the impl
 * side that knows where its own views live, so it says so rather than letting
 * the loader guess.
 */
export const { viewHandlers, viewDefinitions } = await loadViews(path.join(import.meta.dir, '..', 'views'));
