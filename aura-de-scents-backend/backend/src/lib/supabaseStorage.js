const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
// Use the SERVICE ROLE key here (not the anon key) — this runs only on the
// server and needs permission to write to the storage bucket regardless of
// any row-level-security policies.
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET || 'product-images';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '\n⚠️  WARNING: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — image uploads will fail.\n'
  );
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

/**
 * Uploads a file buffer to the Supabase Storage bucket and returns its
 * public URL. Render's disk is wiped on every redeploy, so images can't be
 * saved locally — Supabase Storage is the persistent equivalent.
 */
async function uploadImage(buffer, filename, mimetype) {
  if (!supabase) throw new Error('Supabase storage is not configured on the server.');

  const { error } = await supabase.storage.from(BUCKET).upload(filename, buffer, {
    contentType: mimetype,
    upsert: false,
  });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

module.exports = { uploadImage, BUCKET };
