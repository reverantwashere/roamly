import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// This client is intentionally optional so local Express development continues
// to work until a Supabase project has been configured.
export const supabase = url && key
  ? createClient(url, key, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: true,
        experimental: { passkey: true },
      },
    })
  : null;

export const supabaseEnabled = Boolean(supabase);
