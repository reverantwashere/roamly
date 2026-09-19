import type { SupabaseClient } from "@supabase/supabase-js";

/** Leave only this browser session; never alter the account or other sessions. */
export async function signOutAndLoadGuest<T extends { user: { isGuest: boolean } }>(
  auth: Pick<SupabaseClient["auth"], "signOut">,
  loadSession: () => Promise<T>,
): Promise<T> {
  // If remote revocation reports an error, allow browsing only when the SDK
  // actually cleared the local credentials and a guest session is confirmed.
  let signOutFailed = false;
  try {
    const { error } = await auth.signOut({ scope: "local" });
    signOutFailed = Boolean(error);
  } catch {
    signOutFailed = true;
  }
  let session: T;
  try {
    session = await loadSession();
  } catch {
    throw new Error(signOutFailed
      ? "We could not sign you out. Please try again."
      : "We could not open guest browsing. Please try again.");
  }
  if (!session.user.isGuest) throw new Error("We could not sign you out. Please try again.");
  return session;
}
