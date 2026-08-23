import { createClient } from "@supabase/supabase-js";
import { readSupabaseEnvironment } from "@doggy-style/database";

const config = readSupabaseEnvironment(import.meta.env as Record<string, string | undefined>);
export const supabase = createClient(config.url, config.anonKey);

/** Photo object keys are stable and match the database/storage authorization policy. */
export function dogPhotoPath(ownerId: string, dogId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${ownerId}/${dogId}/${crypto.randomUUID()}-${safeName}`;
}
