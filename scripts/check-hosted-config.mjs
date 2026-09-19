import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Verify the public auth configuration before baking it into the static site. */
export async function checkHostedConfig(env, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const configuredUrl = env.VITE_SUPABASE_URL;
  const configuredKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (configuredUrl === undefined && configuredKey === undefined) return { skipped: true };
  if (typeof configuredUrl !== 'string' || !configuredUrl.trim() || typeof configuredKey !== 'string' || !configuredKey.trim()) {
    throw new Error('Set both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, or leave both unset for the local Express build.');
  }
  let url;
  try { url = new URL(configuredUrl); } catch { throw new Error('VITE_SUPABASE_URL must be a valid HTTPS project URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== '/')) {
    throw new Error('VITE_SUPABASE_URL must be an HTTPS project URL without credentials, a path, query, or fragment.');
  }
  if (configuredUrl !== configuredUrl.trim() || configuredKey !== configuredKey.trim()) {
    throw new Error('Remove leading or trailing whitespace from the Supabase build variables.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetchImpl(new URL('/auth/v1/settings', url), {
        headers: { apikey: configuredKey, Accept: 'application/json' },
        signal: controller.signal,
        redirect: 'error',
      });
    } catch {
      throw new Error(controller.signal.aborted
        ? 'Supabase configuration check timed out. Verify the project URL and retry the build.'
        : 'Supabase configuration check could not reach the auth service. Verify the project URL and retry the build.');
    }
    if (!response.ok) {
      throw new Error('Supabase rejected the configuration check. Verify that the project URL and publishable key belong to the same active project.');
    }
    let settings;
    try { settings = await response.json(); } catch {
      throw new Error('Supabase configuration check did not receive valid auth settings. Verify the project URL.');
    }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings) || typeof settings.disable_signup !== 'boolean' || !settings.external || typeof settings.external !== 'object' || Array.isArray(settings.external)) {
      throw new Error('Supabase configuration check did not receive valid auth settings. Verify the project URL.');
    }
    return { skipped: false };
  } finally {
    clearTimeout(timer);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    // Match Vite's production .env loading, including process.env overrides
    // supplied separately to Cloudflare's Production and Preview builds.
    const { loadEnv } = await import('vite');
    const result = await checkHostedConfig(loadEnv('production', process.cwd(), 'VITE_'));
    console.log(result.skipped ? 'Supabase config: local Express build.' : 'Supabase config: auth service verified.');
  } catch (error) {
    // Never print response bodies, fetch errors, URLs, or keys.
    console.error(`Build stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
