import { callAppService } from '../auth/system-server';

// Derive username from OS_SYSTEM_SERVER = "system-server.user-system-{username}"
// Returns the Helm repo base URL (app-service fetches index.yaml from here)
function getSelfChartRepoUrl(): string {
  const systemServer = process.env.OS_SYSTEM_SERVER ?? '';
  const username = systemServer.split('user-system-')[1] ?? 'unknown';
  return `http://clawrun-svc.clawrun-${username}:3001`;
}

export async function installApp(
  appName: string,
  _repoUrl: string,
  bflUser: string,
  accessToken: string | null
): Promise<unknown> {
  const repoUrl = getSelfChartRepoUrl();
  console.log('[install] repo URL:', repoUrl);
  return callAppService(bflUser, `/app-service/v1/apps/${appName}/install`, 'POST', {
    repoUrl,
    source: 'custom',
  }, accessToken);
}

export async function uninstallApp(
  appName: string,
  bflUser: string,
  accessToken: string | null
): Promise<unknown> {
  return callAppService(bflUser, `/app-service/v1/apps/${appName}`, 'DELETE', undefined, accessToken);
}
