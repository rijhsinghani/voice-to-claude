/**
 * Supabase client singleton for the Slack bridge.
 *
 * Loads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from process.env.
 *
 * If credentials are missing, the client is null and isSupabaseConfigured() returns false.
 * The bridge still starts normally -- Supabase-dependent features are disabled gracefully.
 *
 * This is an OPTIONAL module. The bridge works without Supabase.
 * Supabase enables: delivery queries, SLA alerts, and pipeline status.
 */
import pino from "pino";

const logger = pino({ name: "supabase-client" });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _supabase: any = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    _supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    logger.info({ project: SUPABASE_URL }, "Supabase client initialized");
  } catch {
    logger.info(
      "Supabase client library not installed - Supabase features disabled. Install with: npm install @supabase/supabase-js",
    );
  }
} else {
  logger.info(
    "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set - Supabase features disabled",
  );
}

/** Supabase client singleton. Null if credentials are not configured. */
export const supabase = _supabase;

/** Returns true if the Supabase client is configured and ready to use. */
export function isSupabaseConfigured(): boolean {
  return _supabase !== null;
}
