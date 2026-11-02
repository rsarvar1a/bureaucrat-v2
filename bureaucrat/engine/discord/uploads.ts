import type { UploadedFile } from './components/modal';

export type UploadLimits = {
  maxBytes: number;
  /** MIME types matched as prefixes, since Discord appends `; charset=…`. */
  types?: string[];
  /** Lowercase extensions with the dot, checked against the file name. */
  extensions?: string[];
};

export type FetchedUpload =
  | { ok: true; bytes: Buffer }
  | { ok: false; reason: 'too-large' | 'wrong-type' | 'unreachable' };

/**
 * A modal's `accept` is advisory and its URL is signed and short-lived, so
 * every upload is checked here and read at once. The size is checked before
 * the download: Discord reports it, and a refusal should cost nothing.
 */
export const fetchUpload = async (file: UploadedFile, limits: UploadLimits): Promise<FetchedUpload> => {
  if (file.size > limits.maxBytes) return { ok: false, reason: 'too-large' };
  if (!acceptable(file, limits)) return { ok: false, reason: 'wrong-type' };

  try {
    const response = await fetch(file.url);
    if (!response.ok) return { ok: false, reason: 'unreachable' };

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > limits.maxBytes) return { ok: false, reason: 'too-large' };

    return { ok: true, bytes };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
};

export const acceptable = (
  file: Pick<UploadedFile, 'name' | 'contentType'>,
  limits: Omit<UploadLimits, 'maxBytes'>,
) => {
  const byType = limits.types?.some((type) => file.contentType?.toLowerCase().startsWith(type.toLowerCase())) ?? false;
  const byName = limits.extensions?.some((ext) => file.name.toLowerCase().endsWith(ext.toLowerCase())) ?? false;
  if (!limits.types && !limits.extensions) return true;
  return byType || byName;
};
