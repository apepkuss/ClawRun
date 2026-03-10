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

/**
 * Generic strategic merge patch on a Deployment.
 */
export async function patchDeployment(
  namespace: string,
  deploymentName: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  if (!isInCluster()) return false;

  const url = `${K8S_API}/apis/apps/v1/namespaces/${namespace}/deployments/${deploymentName}`;
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
          console.log(`[k8s] patched Deployment ${namespace}/${deploymentName}`);
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
 * Patch a Deployment to override the container command and securityContext.
 * Used to inject iptables bypass into third-party deployments (e.g., Ollama, OpenClaw).
 */
export async function patchDeploymentCommand(
  namespace: string,
  deploymentName: string,
  containerName: string,
  command: string[],
  args: string[],
  securityContext?: Record<string, unknown>,
  image?: string,
): Promise<boolean> {
  if (!isInCluster()) return false;

  const url = `${K8S_API}/apis/apps/v1/namespaces/${namespace}/deployments/${deploymentName}`;
  const containerPatch: Record<string, unknown> = { name: containerName, command, args };
  if (securityContext) {
    containerPatch.securityContext = securityContext;
  }
  if (image) {
    containerPatch.image = image;
  }
  const patch = {
    spec: { template: { spec: { containers: [containerPatch] } } },
  };

  const tmpFile = `/tmp/k8s-patch-${Date.now()}.json`;
  writeFileSync(tmpFile, JSON.stringify(patch));

  return new Promise((resolve) => {
    const cmd = `curl -s --cacert ${CA_PATH} -H "Authorization: Bearer $(cat ${TOKEN_PATH})" -H "Content-Type: application/strategic-merge-patch+json" -X PATCH -d @${tmpFile} "${url}"`;
    exec(cmd, { timeout: 15000 }, (err, stdout) => {
      try { unlinkSync(tmpFile); } catch {}
      if (err) {
        console.error('[k8s] failed to patch Deployment command:', err.message);
        resolve(false);
        return;
      }
      try {
        const obj = JSON.parse(stdout);
        if (obj.kind === 'Deployment') {
          console.log(`[k8s] patched Deployment ${namespace}/${deploymentName} command + capabilities`);
          resolve(true);
        } else {
          console.error('[k8s] patch command failed:', JSON.stringify(obj).slice(0, 300));
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
 * Label a namespace via strategic merge patch.
 */
export async function labelNamespace(
  namespace: string,
  labels: Record<string, string>,
): Promise<boolean> {
  if (!isInCluster()) return false;

  const url = `${K8S_API}/api/v1/namespaces/${namespace}`;
  const patch = JSON.stringify({ metadata: { labels } });

  return new Promise((resolve) => {
    const cmd = `curl -s --cacert ${CA_PATH} -H "Authorization: Bearer $(cat ${TOKEN_PATH})" -H "Content-Type: application/strategic-merge-patch+json" -X PATCH -d '${patch}' "${url}"`;
    exec(cmd, { timeout: 10000 }, (err, stdout) => {
      if (err) {
        console.error('[k8s] failed to label namespace:', err.message);
        resolve(false);
        return;
      }
      try {
        const obj = JSON.parse(stdout);
        resolve(obj.kind === 'Namespace');
      } catch {
        resolve(false);
      }
    });
  });
}

/**
 * Read a ConfigMap's data field.
 */
export async function getConfigMapData(
  namespace: string,
  configMapName: string,
): Promise<Record<string, string> | null> {
  if (!isInCluster()) return null;

  const url = `${K8S_API}/api/v1/namespaces/${namespace}/configmaps/${configMapName}`;

  return new Promise((resolve) => {
    const cmd = `curl -s --cacert ${CA_PATH} -H "Authorization: Bearer $(cat ${TOKEN_PATH})" "${url}"`;
    exec(cmd, { timeout: 10000 }, (err, stdout) => {
      if (err) {
        console.error('[k8s] failed to query ConfigMap:', err.message);
        resolve(null);
        return;
      }
      try {
        const obj = JSON.parse(stdout);
        if (obj.kind === 'Status') {
          resolve(null);
          return;
        }
        resolve(obj.data ?? {});
      } catch {
        console.error('[k8s] failed to parse ConfigMap response:', stdout.slice(0, 200));
        resolve(null);
      }
    });
  });
}

/**
 * Patch a ConfigMap's data field via strategic merge patch.
 */
export async function patchConfigMapData(
  namespace: string,
  configMapName: string,
  data: Record<string, string>,
): Promise<boolean> {
  if (!isInCluster()) return false;

  const url = `${K8S_API}/api/v1/namespaces/${namespace}/configmaps/${configMapName}`;
  const tmpFile = `/tmp/k8s-cm-patch-${Date.now()}.json`;
  writeFileSync(tmpFile, JSON.stringify({ data }));

  return new Promise((resolve) => {
    const cmd = `curl -s --cacert ${CA_PATH} -H "Authorization: Bearer $(cat ${TOKEN_PATH})" -H "Content-Type: application/strategic-merge-patch+json" -X PATCH -d @${tmpFile} "${url}"`;
    exec(cmd, { timeout: 15000 }, (err, stdout) => {
      try { unlinkSync(tmpFile); } catch {}
      if (err) {
        console.error('[k8s] failed to patch ConfigMap:', err.message);
        resolve(false);
        return;
      }
      try {
        const obj = JSON.parse(stdout);
        if (obj.kind === 'ConfigMap') {
          console.log(`[k8s] patched ConfigMap ${namespace}/${configMapName}`);
          resolve(true);
        } else {
          console.error('[k8s] ConfigMap patch failed:', JSON.stringify(obj).slice(0, 300));
          resolve(false);
        }
      } catch {
        console.error('[k8s] failed to parse ConfigMap patch response:', stdout.slice(0, 200));
        resolve(false);
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
