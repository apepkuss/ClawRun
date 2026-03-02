import { callSystemServer } from '../auth/system-server';

export async function installApp(appName: string, repoUrl: string): Promise<unknown> {
  return callSystemServer('app', 'service.appstore', 'v1', 'InstallDevApp', {
    appName,
    repoUrl,
    source: 'custom',
  });
}

export async function uninstallApp(appName: string): Promise<unknown> {
  return callSystemServer('app', 'service.appstore', 'v1', 'UninstallDevApp', {
    name: appName,
  });
}
