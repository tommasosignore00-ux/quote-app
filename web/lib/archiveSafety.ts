import JSZip from 'jszip';

/** Inflated size that a real price list or Word template never reaches. */
const MAX_INFLATED_BYTES = 300 * 1024 * 1024;
const MAX_ENTRIES = 20_000;
const MAX_RATIO = 200;

export const MAX_PARSE_BYTES = 50 * 1024 * 1024;

const startsWith = (data: Uint8Array, bytes: number[]) =>
  bytes.every((b, i) => data[i] === b);

/** Checks the real file type: extensions and MIME types come from the client. */
export function hasExpectedSignature(
  data: ArrayBuffer | Uint8Array,
  ext: string
): boolean {
  const view = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (ext === 'xlsx' || ext === 'docx') return startsWith(view, [0x50, 0x4b, 0x03, 0x04]);
  if (ext === 'xls' || ext === 'doc') {
    return startsWith(view, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  }
  if (ext === 'pdf') return startsWith(view, [0x25, 0x50, 0x44, 0x46]);
  return true;
}

/**
 * Rejects archives built to explode when inflated. JSZip reads only the central
 * directory here: nothing is decompressed.
 */
export async function assertSafeArchive(data: ArrayBuffer | Buffer): Promise<void> {
  if (data.byteLength > MAX_PARSE_BYTES) throw new Error('File troppo grande');
  const zip = await JSZip.loadAsync(data);
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ENTRIES) throw new Error('File non valido');

  let inflated = 0;
  for (const entry of entries) {
    const size = (
      entry as unknown as {
        _data?: { uncompressedSize?: number; compressedSize?: number };
      }
    )._data;
    const uncompressed = size?.uncompressedSize ?? 0;
    const compressed = size?.compressedSize ?? 0;
    inflated += uncompressed;
    if (
      compressed > 0 &&
      uncompressed > 1024 * 1024 &&
      uncompressed / compressed > MAX_RATIO
    ) {
      throw new Error('File non valido');
    }
  }
  if (inflated > MAX_INFLATED_BYTES) throw new Error('File troppo grande');
}
