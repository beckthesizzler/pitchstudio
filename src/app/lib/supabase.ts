import { createClient } from "@supabase/supabase-js"
import { projectId, publicAnonKey } from "../../../utils/supabase/info"

const _sbKey = `sb-client-${projectId}`
// @ts-expect-error global singleton to survive HMR re-execution
export const supabase: ReturnType<typeof createClient> = (globalThis[_sbKey] ??= createClient(`https://${projectId}.supabase.co`, publicAnonKey))
