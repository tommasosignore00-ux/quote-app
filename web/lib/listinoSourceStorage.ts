import { supabaseAdmin } from './supabase-server';
import type { UniversalImportSummary, UniversalParsedItem } from './listinoUniversalImport';
import type { PricingDiagnostics } from './listinoPricing';

export const LISTINO_SOURCE_BUCKET = 'listini-sources';

export type ListinoSourceMetadata = {
  version: 1;
  listinoId: string;
  profileId: string;
  fileName: string;
  mimeType: string;
  storagePath: string;
  uploadedAt: string;
  sourceText?: string;
  sourceTextPreview?: string;
  parsedSummary?: UniversalImportSummary;
  candidateItems?: UniversalParsedItem[];
  sourceDiagnostics?: Array<Record<string, unknown>>;
  pricingDiagnostics?: PricingDiagnostics | null;
  aiFeedback?: string | null;
  requiresPricingRules?: boolean;
};

function sanitizePathSegment(value: string): string {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return cleaned || 'source.pdf';
}

export function buildListinoSourcePaths(params: {
  profileId: string;
  listinoId: string;
  fileName: string;
}) {
  const safeFileName = sanitizePathSegment(params.fileName);
  return {
    filePath: `${params.profileId}/${params.listinoId}/latest-${safeFileName}`,
    metadataPath: `${params.profileId}/${params.listinoId}/metadata.json`,
  };
}

export async function ensureListinoSourceBucket() {
  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
  if (!listError && (buckets || []).some((bucket) => bucket.name === LISTINO_SOURCE_BUCKET)) {
    return;
  }

  const { error } = await supabaseAdmin.storage.createBucket(LISTINO_SOURCE_BUCKET, {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024,
    allowedMimeTypes: ['application/pdf'],
  });

  if (error && !/already exists/i.test(error.message)) {
    throw error;
  }
}

export async function uploadListinoSource(params: {
  profileId: string;
  listinoId: string;
  fileName: string;
  mimeType: string;
  fileBuffer: Buffer;
  metadata: Omit<ListinoSourceMetadata, 'version' | 'storagePath'>;
}) {
  await ensureListinoSourceBucket();

  const { filePath, metadataPath } = buildListinoSourcePaths({
    profileId: params.profileId,
    listinoId: params.listinoId,
    fileName: params.fileName,
  });

  const metadata: ListinoSourceMetadata = {
    version: 1,
    storagePath: filePath,
    ...params.metadata,
  };

  const uploadFile = await supabaseAdmin.storage
    .from(LISTINO_SOURCE_BUCKET)
    .upload(filePath, params.fileBuffer, {
      contentType: params.mimeType || 'application/pdf',
      upsert: true,
    });
  if (uploadFile.error) throw uploadFile.error;

  const uploadMeta = await supabaseAdmin.storage
    .from(LISTINO_SOURCE_BUCKET)
    .upload(metadataPath, Buffer.from(JSON.stringify(metadata), 'utf-8'), {
      contentType: 'application/json',
      upsert: true,
    });
  if (uploadMeta.error) throw uploadMeta.error;

  return metadata;
}

export async function getListinoSourceMetadata(params: {
  profileId: string;
  listinoId: string;
}) {
  await ensureListinoSourceBucket();

  const metadataPath = `${params.profileId}/${params.listinoId}/metadata.json`;
  const result = await supabaseAdmin.storage
    .from(LISTINO_SOURCE_BUCKET)
    .download(metadataPath);

  if (result.error) {
    if (/not found/i.test(result.error.message)) return null;
    throw result.error;
  }

  const raw = await result.data.text();
  if (!raw.trim()) return null;
  return JSON.parse(raw) as ListinoSourceMetadata;
}

export async function getListinoSourceSignedUrl(storagePath: string, expiresIn = 3600) {
  await ensureListinoSourceBucket();
  const result = await supabaseAdmin.storage
    .from(LISTINO_SOURCE_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (result.error) throw result.error;
  return result.data.signedUrl;
}
