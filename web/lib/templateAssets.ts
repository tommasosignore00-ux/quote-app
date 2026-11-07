import crypto from 'crypto';
import { supabaseAdmin } from './supabase-server';

/**
 * Pictures of quote templates (logos) are stored as public files: Gmail and other mail
 * apps do not show images embedded as data: URLs, so a template with an inline logo
 * would reach clients without it.
 */
export const TEMPLATE_ASSETS_BUCKET = 'template-assets';
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
};

let bucketReady: Promise<void> | null = null;

function ensureBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data } = await supabaseAdmin.storage.getBucket(TEMPLATE_ASSETS_BUCKET);
      if (data) return;
      const { error } = await supabaseAdmin.storage.createBucket(TEMPLATE_ASSETS_BUCKET, {
        public: true,
        fileSizeLimit: MAX_IMAGE_BYTES,
        allowedMimeTypes: ALLOWED_TYPES,
      });
      if (error && !/already exists/i.test(error.message)) throw error;
    })().catch((error) => {
      bucketReady = null;
      throw error;
    });
  }
  return bucketReady;
}

/** Replaces inline images with hosted copies; on any failure the inline image stays. */
export async function hostTemplateImages(userId: string, html: string): Promise<string> {
  const matches = Array.from(
    html.matchAll(/data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]+)/g)
  );
  if (!matches.length) return html;

  try {
    await ensureBucket();
  } catch (error) {
    console.warn('Template assets bucket unavailable, keeping inline images:', error);
    return html;
  }

  let out = html;
  const done = new Map<string, string>();
  for (const match of matches) {
    const [dataUrl, mime, base64] = match;
    if (done.has(dataUrl) || !ALLOWED_TYPES.includes(mime)) continue;
    const bytes = Buffer.from(base64, 'base64');
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) continue;

    // Same picture, same file: re-saving a template does not pile up copies.
    const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32);
    const path = `${userId}/${hash}.${EXTENSIONS[mime]}`;
    const { error } = await supabaseAdmin.storage
      .from(TEMPLATE_ASSETS_BUCKET)
      .upload(path, bytes, { contentType: mime, upsert: true, cacheControl: '31536000' });
    if (error) {
      console.warn('Template image not hosted, keeping it inline:', error.message);
      continue;
    }
    const url = supabaseAdmin.storage.from(TEMPLATE_ASSETS_BUCKET).getPublicUrl(path)
      .data.publicUrl;
    done.set(dataUrl, url);
  }

  for (const [dataUrl, url] of done) out = out.split(dataUrl).join(url);
  return out;
}
