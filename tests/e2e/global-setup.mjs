// Production-safety guard for the browser tests. The signed-in tests use the synthetic STAGING accounts, so before
// anything runs, the builds being served are checked: with E2E_STAGING=1 both must talk to the staging project and
// must not contain the production project reference. Without E2E_STAGING only the signed-out tests run.
const STAGING_REF = 'ahkgvuewgbjyahbiehrx';
const PRODUCTION_REF = 'mgreapakfchcxcrauheq';

async function bundleText(origin) {
  const html = await (await fetch(origin)).text();
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => new URL(m[1], origin).href);
  if (scripts.length === 0) throw new Error(`no scripts found at ${origin}`);
  return (await Promise.all(scripts.map(async (u) => (await fetch(u)).text()))).join('\n');
}

export default async function globalSetup(config) {
  process.env.E2E_RUN_START ??= String(Date.now());   // read by global-teardown.mjs (test-traffic clean-up)
  if (process.env.E2E_STAGING !== '1') return;
  if ((process.env.STAGING_SUPABASE_URL || '').includes(PRODUCTION_REF)) {
    throw new Error('Refusing to run: STAGING_SUPABASE_URL points at production.');
  }
  for (const project of config.projects) {
    const origin = project.use?.baseURL;
    if (!origin) continue;
    const js = await bundleText(origin);
    if (js.includes(PRODUCTION_REF)) {
      throw new Error(`Refusing to run signed-in tests: the build at ${origin} (${project.name}) references the PRODUCTION project.`);
    }
    if (!js.includes(STAGING_REF)) {
      throw new Error(`Refusing to run signed-in tests: the build at ${origin} (${project.name}) is not a staging build.`);
    }
  }
}
