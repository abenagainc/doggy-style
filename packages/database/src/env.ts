import { AppError } from "@doggy-style/domain";

export interface SupabaseEnvironment { url: string; anonKey: string; }

/** Validates the public configuration at process start without ever reading a service-role key. */
export function readSupabaseEnvironment(env: Record<string, string | undefined>): SupabaseEnvironment {
  const url = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new AppError("UNAVAILABLE", "Application configuration is incomplete.");
  try { new URL(url); } catch { throw new AppError("UNAVAILABLE", "Application configuration is invalid."); }
  return { url, anonKey };
}
