import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Returns a query builder scoped to the `erp` Postgres schema.
 * Requires 'erp' to be added under Project Settings > API > Exposed
 * schemas in the Supabase dashboard, or queries will fail.
 */
export async function erpSchema() {
  const supabase = await createServerSupabaseClient();
  return supabase.schema("erp");
}
