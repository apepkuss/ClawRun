import { randomBytes } from 'crypto';
import { callAppService } from '../auth/system-server';

// Derive username from OS_SYSTEM_SERVER = "system-server.user-system-{username}"
export function getOlaresUsername(): string {
  const systemServer = process.env.OS_SYSTEM_SERVER ?? '';
  return systemServer.split('user-system-')[1] ?? 'unknown';
}

// Returns the Helm repo base URL (app-service fetches index.yaml from here)
function getSelfChartRepoUrl(): string {
  return `http://clawrun-svc.clawrun-${getOlaresUsername()}:3001`;
}

// Required env vars for each app (auto-generated during install)
const APP_REQUIRED_ENVS: Record<string, () => Record<string, string>> = {
  openclaw: () => ({
    OPENCLAW_GATEWAY_TOKEN: randomBytes(32).toString('hex'),
  }),
  litellm: () => ({
    LITELLM_MASTER_KEY: randomBytes(32).toString('hex'),
  }),
};

export async function installApp(
  appName: string,
  _repoUrl: string,
  bflUser: string,
  accessToken: string | null
): Promise<{ result: unknown; generatedEnvs: Record<string, string> }> {
  const repoUrl = getSelfChartRepoUrl();
  const generatedEnvs = APP_REQUIRED_ENVS[appName]?.() ?? {};

  console.log('[install] repo URL:', repoUrl, '| envKeys:', Object.keys(generatedEnvs).join(','));

  const body: Record<string, unknown> = {
    repoUrl,
    source: 'custom',
  };

  // Pass required env values as envs array (Olares app-service format)
  const envEntries = Object.entries(generatedEnvs);
  if (envEntries.length > 0) {
    body.envs = envEntries.map(([k, v]) => ({ envName: k, value: v }));
  }

  const result = await callAppService(
    bflUser,
    `/app-service/v1/apps/${appName}/install`,
    'POST',
    body,
    accessToken,
  );

  return { result, generatedEnvs };
}

export async function uninstallApp(
  appName: string,
  bflUser: string,
  accessToken: string | null
): Promise<unknown> {
  return callAppService(bflUser, `/app-service/v1/apps/${appName}/uninstall`, 'POST', undefined, accessToken);
}
