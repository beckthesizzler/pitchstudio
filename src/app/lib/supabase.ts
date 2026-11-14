import { createClient } from "@supabase/supabase-js"
import { projectId, publicAnonKey } from "../../../utils/supabase/info"
import type { Database } from "./database.types"

const _sbKey = `sb-client-${projectId}`
// @ts-expect-error global singleton to survive HMR re-execution
export const supabase: ReturnType<typeof createClient<Database>> = (globalThis[_sbKey] ??= createClient<Database>(`https://${projectId}.supabase.co`, publicAnonKey))
