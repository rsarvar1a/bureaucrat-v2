import type { FetchedUpload } from '../../../../engine/discord/uploads';
import { S } from '../../../../strings';

const MiB = 1024 * 1024;
export const JSON_LIMIT = 1 * MiB;
export const PDF_LIMIT = 8 * MiB;
export const PDF_LIMIT_LABEL = '8 MB';

/** An attachment is referenced by name; keep to what `attachment://` resolves. */
export const safeName = (name: string, fallback: string) => name.replace(/[^\w.-]+/g, '_') || fallback;

export const refusal = (failed: Exclude<FetchedUpload, { ok: true }>, kind: string, limit: string) =>
  failed.reason === 'too-large'
    ? S.errors.uploadTooLarge(limit)
    : failed.reason === 'wrong-type'
      ? S.errors.uploadWrongType(kind)
      : S.errors.uploadUnreachable;
