import { createClient } from "@supabase/supabase-js";

// Use the service-role key for server-side storage operations so uploads
// bypass RLS. Falls back to the publishable key for local dev without a
// service-role key configured.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// Singleton — reuse across requests in the same Node.js process.
let _client: ReturnType<typeof createClient> | null = null;
function getClient() {
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseServiceKey);
  }
  return _client;
}

export const CATEGORY_IMAGES_BUCKET = "category-images";
export const PRODUCT_IMAGES_BUCKET = "product-images";

/** Allowed MIME types for images */
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
/** Max file size: 2 MB */
const MAX_BYTES = 2 * 1024 * 1024;

export interface UploadResult {
  url: string;
  path: string;
}

/**
 * Validate and upload a category image to Supabase Storage.
 * Returns the public URL and the storage path (needed for deletion).
 */
export async function uploadCategoryImage(
  file: File
): Promise<UploadResult> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error(
      `Invalid file type "${file.type}". Allowed: jpeg, png, webp, gif.`
    );
  }
  if (file.size > MAX_BYTES) {
    throw new Error(
      `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 2 MB.`
    );
  }

  const ext = file.name.split(".").pop() ?? "jpg";
  // Use a timestamp + random suffix to avoid collisions
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const supabase = getClient();
  const { error } = await supabase.storage
    .from(CATEGORY_IMAGES_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data } = supabase.storage
    .from(CATEGORY_IMAGES_BUCKET)
    .getPublicUrl(path);

  return { url: data.publicUrl, path };
}

/**
 * Delete a category image from Supabase Storage by its public URL.
 * Silently ignores errors (e.g. file already deleted).
 */
export async function deleteCategoryImage(publicUrl: string): Promise<void> {
  try {
    const supabase = getClient();
    // Extract the storage path from the public URL
    // URL format: <supabaseUrl>/storage/v1/object/public/<bucket>/<path>
    const marker = `/object/public/${CATEGORY_IMAGES_BUCKET}/`;
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return; // not a storage URL we manage

    const path = publicUrl.slice(idx + marker.length);
    await supabase.storage.from(CATEGORY_IMAGES_BUCKET).remove([path]);
  } catch {
    // Non-fatal — log but don't throw
    console.warn("[storage] Failed to delete category image:", publicUrl);
  }
}

/**
 * Upload a single product image to Supabase Storage.
 * Returns the public URL and the storage path.
 */
export async function uploadProductImage(file: File): Promise<UploadResult> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error(
      `Invalid file type "${file.type}". Allowed: jpeg, png, webp, gif.`
    );
  }
  if (file.size > MAX_BYTES) {
    throw new Error(
      `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 2 MB.`
    );
  }

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const supabase = getClient();
  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data } = supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(path);

  return { url: data.publicUrl, path };
}

/**
 * Upload multiple product images concurrently.
 * Returns an array of UploadResult in the same order as the input files.
 */
export async function uploadProductImages(
  files: File[]
): Promise<UploadResult[]> {
  return Promise.all(files.map((f) => uploadProductImage(f)));
}

/**
 * Delete a product image from Supabase Storage by its public URL.
 * Silently ignores errors.
 */
export async function deleteProductImage(publicUrl: string): Promise<void> {
  try {
    const supabase = getClient();
    const marker = `/object/public/${PRODUCT_IMAGES_BUCKET}/`;
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return;

    const path = publicUrl.slice(idx + marker.length);
    await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);
  } catch {
    console.warn("[storage] Failed to delete product image:", publicUrl);
  }
}
