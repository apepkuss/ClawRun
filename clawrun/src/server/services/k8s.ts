import { exec } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';

const TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';
const K8S_API = 'https://kubernetes.default.svc';

function isInCluster(): boolean {
  try {
    readFileSync(TOKEN_PATH, 'utf8');
    return true;
  } catch {
    return false;
  }
}

export interface AppManagerInfo {
  state: string | null;
  progress: string | null; // e.g. "6.71", "100.00"
}

/**
 * Get the state and progress of an ApplicationManager CRD.
 */
/**
 * Read an environment variable from a Deployment's first container.
 */
export async function getDeploymentEnvVar(
  namespace: string,
  deploymentName: string,
  envName: string,
): Promise<string | null> {
  if (!isInCluster()) return null;

  const url = `${K8S_API}/apis/apps/v1/namespaces/${namespace}/deployments/${deploymentName}`;

  return new Promise((resolve) => {
    const cmd = `curl -s --cacert ${CA_PATH} -H "Authorization: Bearer $(cat ${TOKEN_PATH})" "${url}"`;
    exec(cmd, { timeout: 10000 }, (err, stdout) => {
      if (err) {
        console.error('[k8s] failed to query Deployment:', err.message);
        resolve(null);
        return;
      }
      try {
        const obj = JSON.parse(stdout);
        if (obj.kind === 'Status' && obj.code === 404) {
          resolve(null);
          return;
        }
        const containers = obj?.spec?.template?.spec?.containers ?? [];
        if (containers.length === 0) {
          resolve(null);
          return;
        }
        const envArray: { name: string; value?: string }[] = containers[0].env ?? [];
        const envVar = envArray.find((e) => e.name === envName);
        resolve(envVar?.value ?? null); // 小写 value
      } catch {
        console.error('[k8s] failed to parse Deployment response:', stdout.slice(0, 200));
        resolve(null);
      }
    });
  });
}

/**
 * Read all env vars from a specific container in a Deployment.
 */
export async function getDeploymentEnvVars(
  namespace: string,
  deploymentName: string,
  containerName: string,
): Promise<Record<string, string> | null> {
  if (!isInCluster()) return null;

  const url = `${K8S_API}/apis/apps/v1/namespaces/${namespace}/deployments/${deploymentName}`;

  return new Promise((resolve) => {
    const cmd = `curl -s --cacert ${CA_PATH} -H "Authorization: Bearer $(cat ${TOKEN_PATH})" "${url}"`;
    exec(cmd, { timeout: 10000 }, (err, stdout) => {
      if (err) {
        console.error('[k8s] failed to query Deployment:', err.message);
        resolve(null);
        return;
      }
      try {
        const obj = JSON.parse(stdout);
        if (obj.kind === 'Status') {
          resolve(null);
          return;
        }
        const containers = obj?.spec?.template?.spec?.containers ?? [];
        const container = containers.find((c: any) => c.name === containerName);
        if (!container) {
          resolve(null);
          return;
        }
        const envArray: { name: string; value?: string }[] = container.env ?? [];
        const result: Record<string, string> = {};
        for (const e of envArray) {
          if (e.value !== undefined) result[e.name] = e.value;
        }
        resolve(result);
      } catch {
        console.error('[k8s] failed to parse Deployment response:', stdout.slice(0, 200));
        resolve(null);
      }
    });
  });
}

/**
 * Patch env vars on a specific container using strategic merge patch.
 * Merges by env var name — existing vars not in the patch are preserved.
 */
export async function patchDeploymentEnvVars(
  namespace: string,
  deploymentName: string,
  containerName: string,
  envs: Record<string, string>,
): Promise<boolean> {
  if (!isInCluster()) return false;

  const url = `${K8S_API}/apis/apps/v1/namespaces/${namespace}/deployments/${deploymentName}`;
  const envArray = Object.entries(envs).map(([name, value]) => ({ name, value }));
  const patch = {
    spec: {
      template: {
        spec: {
          containers: [{ name: containerName, env: envArray }],
        },
      },
    },
  };

  const tmpFile = `/tmp/k8s-patch-${Date.now()}.json`;
  writeFileSync(tmpFile, JSON.stringify(patch));

  return new Promise((resolve) => {
    const cmd = `curl -s --cacert ${CA_PATH} -H "Authorization: Bearer $(cat ${TOKEN_PATH})" -H "Content-Type: application/strategic-merge-patch+json" -X PATCH -d @${tmpFile} "${url}"`;
    exec(cmd, { timeout: 15000 }, (err, stdout) => {
      try { unlinkSync(tmpFile); } catch {}
      if (err) {
        console.error('[k8s] failed to patch Deployment:', err.message);
        resolve(false);
        return;
      }
      try {
        const obj = JSON.parse(stdout);
        if (obj.kind === 'Deployment') {
          console.log(`[k8s] patched Deployment ${namespace}/${deploymentName} env vars`);
          resolve(true);
        } else {
          console.error('[k8s] patch failed:', JSON.stringify(obj).slice(0, 300));
          resolve(false);
        }
      } catch {
        console.error('[k8s] failed to parse patch response:', stdout.slice(0, 200));
        resolve(false);
      }
    });
  });
}

/**
 * Patch env vars on BOTH a container and an initContainer in one atomic patch.
 * Useful when the initContainer reads the same env vars to configure the app.
 */
export async function patchDeploymentEnvVarsBoth(
  namespace: string,
  deploymentName: string,
  containerName: string,
  initContainerName: string,
  envs: Record<string, string>,
): Promise<boolean> {
  if (!isInCluster()) return false;

  const url = `${K8S_API}/apis/apps/v1/namespaces/${namespace}/deployments/${deploymentName}`;
  const envArray = Object.entries(envs).map(([name, value]) => ({ name, value }));
  const patch = {
    spec: {
      template: {
        spec: {
          initContainers: [{ name: initContainerName, env: envArray }],
          containers: [{ name: containerName, env: envArray }],
        },
      },
    },
  };

  const tmpFile = `/tmp/k8s-patch-${Date.now()}.json`;
  writeFileSync(tmpFile, JSON.stringify(patch));

  return new Promise((resolve) => {
    const cmd = `curl -s --cacert ${CA_PATH} -H "Authorization: Bearer $(cat ${TOKEN_PATH})" -H "Content-Type: application/strategic-merge-patch+json" -X PATCH -d @${tmpFile} "${url}"`;
    exec(cmd, { timeout: 15000 }, (err, stdout) => {
      try { unlinkSync(tmpFile); } catch {}
      if (err) {
        console.error('[k8s] failed to patch Deployment:', err.message);
        resolve(false);
        return;
      }
      try {
        const obj = JSON.parse(stdout);
        if (obj.kind === 'Deployment') {
          console.log(`[k8s] patched Deployment ${namespace}/${deploymentName} env vars (container+initContainer)`);
          resolve(true);
        } else {
          console.error('[k8s] patch failed:', JSON.stringify(obj).slice(0, 300));
          resolve(false);
        }
      } catch {
        console.error('[k8s] failed to parse patch response:', stdout.slice(0, 200));
        resolve(false);
      }
    });
  });
}

/**
 * Find the external host for a Service by querying Ingress resources in a namespace.
 * Returns full URL (https://host) or null if not found.
 */
export async function getIngressHost(
  namespace: string,
  serviceName: string,
): Promise<string | null> {
  if (!isInCluster()) return null;

  const url = `${K8S_API}/apis/networking.k8s.io/v1/namespaces/${namespace}/ingresses`;

  return new Promise((resolve) => {
    const cmd = `curl -s --cacert ${CA_PATH} -H "Authorization: Bearer $(cat ${TOKEN_PATH})" "${url}"`;
    exec(cmd, { timeout: 10000 }, (err, stdout) => {
      if (err) {
        console.error('[k8s] failed to list Ingresses:', err.message);
        resolve(null);
        return;
      }
      try {
        const obj = JSON.parse(stdout);
        if (obj.kind !== 'IngressList' || !obj.items) {
          resolve(null);
          return;
        }
        for (const ingress of obj.items) {
          const hasTls = ingress.spec?.tls?.length > 0;
          for (const rule of ingress.spec?.rules ?? []) {
            for (const p of rule.http?.paths ?? []) {
              if (p.backend?.service?.name === serviceName) {
                const host = rule.host;
                if (host) {
                  resolve(hasTls ? `https://${host}` : `http://${host}`);
                  return;
                }
              }
            }
          }
        }
        resolve(null);
      } catch {
        console.error('[k8s] failed to parse Ingress response:', stdout.slice(0, 200));
        resolve(null);
      }
    });
  });
}

export async function getAppManagerState(appName: string, username: string): Promise<AppManagerInfo> {
  if (!isInCluster()) return { state: null, progress: null };

  const crName = `${appName}-${username}-${appName}`;
  const url = `${K8S_API}/apis/app.bytetrade.io/v1alpha1/applicationmanagers/${crName}`;

  return new Promise((resolve) => {
    const cmd = `curl -s --cacert ${CA_PATH} -H "Authorization: Bearer $(cat ${TOKEN_PATH})" "${url}"`;
    exec(cmd, { timeout: 10000 }, (err, stdout) => {
      if (err) {
        console.error('[k8s] failed to query ApplicationManager:', err.message);
        resolve({ state: null, progress: null });
        return;
      }
      try {
        const obj = JSON.parse(stdout);
        if (obj.kind === 'Status' && obj.code === 404) {
          resolve({ state: null, progress: null });
          return;
        }
        const state = obj?.status?.state ?? obj?.spec?.state ?? null;
        const progress = obj?.status?.progress ?? null;
        resolve({ state, progress });
      } catch {
        console.error('[k8s] failed to parse ApplicationManager response:', stdout.slice(0, 200));
        resolve({ state: null, progress: null });
      }
    });
  });
}
