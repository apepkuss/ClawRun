import { exec } from 'child_process';

const PLUGIN_PACKAGE = '@blockrun/clawrouter';
const WALLET_DIR = '/home/node/.openclaw/blockrun';
const WALLET_KEY_FILE = `${WALLET_DIR}/wallet.key`;
const MNEMONIC_FILE = `${WALLET_DIR}/mnemonic`;
const CHAIN_FILE = `${WALLET_DIR}/payment-chain`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function kubectlExec(username: string, cmd: string, timeout = 15000): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const ns = `openclaw-${username}`;
  return new Promise((resolve) => {
    exec(
      `kubectl exec -n ${ns} deploy/openclaw -c openclaw -- ${cmd}`,
      { timeout },
      (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, stdout, stderr: stderr || err.message });
        } else {
          resolve({ ok: true, stdout, stderr });
        }
      },
    );
  });
}

function kubectlExecSh(username: string, script: string, timeout = 15000): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const ns = `openclaw-${username}`;
  const escaped = script.replace(/'/g, "'\\''");
  return new Promise((resolve) => {
    exec(
      `kubectl exec -n ${ns} deploy/openclaw -c openclaw -- sh -c '${escaped}'`,
      { timeout },
      (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, stdout, stderr: stderr || err.message });
        } else {
          resolve({ ok: true, stdout, stderr });
        }
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Plugin lifecycle
// ---------------------------------------------------------------------------

export async function getPluginStatus(username: string): Promise<{ installed: boolean }> {
  const result = await kubectlExecSh(username, `test -d /home/node/.openclaw/extensions/clawrouter && echo yes || echo no`);
  return { installed: result.ok && result.stdout.trim() === 'yes' };
}

export async function installPlugin(username: string): Promise<boolean> {
  console.log(`[clawrouter] installing plugin (ns=openclaw-${username})`);

  // Check if already installed (directory exists)
  const status = await getPluginStatus(username);
  if (status.installed) {
    console.log('[clawrouter] plugin directory already exists, ensuring dependencies');
  } else {
    const result = await kubectlExec(username, `openclaw plugins install ${PLUGIN_PACKAGE}`, 120000);
    if (!result.ok) {
      console.error('[clawrouter] install failed:', result.stderr);
      return false;
    }
    console.log('[clawrouter] plugin installed');
  }

  // Ensure npm dependencies are installed (openclaw plugins install doesn't always include them)
  const npmResult = await kubectlExecSh(
    username,
    `cd /home/node/.openclaw/extensions/clawrouter && npm install --production 2>&1 | tail -5`,
    120000,
  );
  if (!npmResult.ok) {
    console.error('[clawrouter] npm install failed:', npmResult.stderr);
    return false;
  }
  console.log('[clawrouter] dependencies ok');
  return true;
}

export async function uninstallPlugin(username: string): Promise<boolean> {
  console.log(`[clawrouter] uninstalling plugin (ns=openclaw-${username})`);
  // Use the uninstall script if it exists, otherwise fall back to plugins uninstall
  const result = await kubectlExecSh(
    username,
    `if [ -f /home/node/.openclaw/extensions/clawrouter/scripts/uninstall.sh ]; then bash /home/node/.openclaw/extensions/clawrouter/scripts/uninstall.sh; else openclaw plugins uninstall ${PLUGIN_PACKAGE}; fi`,
    30000,
  );
  if (!result.ok) {
    console.error('[clawrouter] uninstall failed:', result.stderr);
  } else {
    console.log('[clawrouter] uninstall ok');
  }
  return result.ok;
}

// ---------------------------------------------------------------------------
// Wallet info
// ---------------------------------------------------------------------------

export interface WalletInfo {
  address: string;
  chain: string;
}

export async function getWalletInfo(username: string): Promise<WalletInfo | null> {
  // Read wallet address from the proxy health endpoint (localhost, no Envoy)
  const result = await kubectlExecSh(
    username,
    `wget -q -O - http://localhost:8402/health 2>/dev/null || echo '{}'`,
    10000,
  );
  if (!result.ok) return null;
  try {
    const data = JSON.parse(result.stdout.trim());
    if (!data.wallet?.address) return null;
    const chain = await getChain(username);
    return { address: data.wallet.address, chain };
  } catch {
    return null;
  }
}

async function getChain(username: string): Promise<string> {
  const result = await kubectlExecSh(username, `cat ${CHAIN_FILE} 2>/dev/null || echo base`);
  return result.ok ? result.stdout.trim() || 'base' : 'base';
}

export async function getWalletBalance(username: string): Promise<{ balance: string; currency: string } | null> {
  // Query balance via the proxy health endpoint
  const result = await kubectlExecSh(
    username,
    `wget -q -O - http://localhost:8402/health 2>/dev/null || echo '{}'`,
    10000,
  );
  if (!result.ok) return null;
  try {
    const data = JSON.parse(result.stdout.trim());
    if (data.wallet?.balance !== undefined) {
      return { balance: String(data.wallet.balance), currency: 'USDC' };
    }
    return null;
  } catch {
    return null;
  }
}

export async function switchChain(username: string, chain: string): Promise<boolean> {
  if (chain !== 'base' && chain !== 'solana') return false;
  const result = await kubectlExecSh(username, `echo '${chain}' > ${CHAIN_FILE}`);
  return result.ok;
}

// ---------------------------------------------------------------------------
// Mnemonic (show-once-then-burn)
// ---------------------------------------------------------------------------

export async function getMnemonic(username: string): Promise<string | null> {
  const result = await kubectlExecSh(username, `cat ${MNEMONIC_FILE} 2>/dev/null`);
  if (!result.ok || !result.stdout.trim()) return null;
  return result.stdout.trim();
}

export async function isMnemonicBurned(username: string): Promise<boolean> {
  const result = await kubectlExecSh(username, `test -f ${MNEMONIC_FILE} && echo exists || echo gone`);
  return result.ok && result.stdout.trim() === 'gone';
}

export async function verifyAndBurnMnemonic(
  username: string,
  mnemonic: string,
  answers: { position: number; word: string }[],
): Promise<boolean> {
  const words = mnemonic.split(/\s+/);
  for (const a of answers) {
    if (a.position < 1 || a.position > words.length) return false;
    if (words[a.position - 1] !== a.word.trim().toLowerCase()) return false;
  }
  // Verification passed — burn the mnemonic file
  const result = await kubectlExecSh(username, `rm -f ${MNEMONIC_FILE}`);
  if (!result.ok) {
    console.error('[clawrouter] failed to burn mnemonic:', result.stderr);
  } else {
    console.log('[clawrouter] mnemonic burned successfully');
  }
  return result.ok;
}

// ---------------------------------------------------------------------------
// Wallet import (external private key)
// ---------------------------------------------------------------------------

export async function importPrivateKey(username: string, privateKey: string): Promise<boolean> {
  // Validate format: 0x + 64 hex chars
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    console.error('[clawrouter] invalid private key format');
    return false;
  }
  const result = await kubectlExecSh(
    username,
    `mkdir -p ${WALLET_DIR} && echo '${privateKey}' > ${WALLET_KEY_FILE} && chmod 600 ${WALLET_KEY_FILE}`,
  );
  if (!result.ok) {
    console.error('[clawrouter] import key failed:', result.stderr);
  } else {
    console.log('[clawrouter] private key imported');
  }
  return result.ok;
}

// ---------------------------------------------------------------------------
// Check if wallet.key exists (to determine if first-time setup)
// ---------------------------------------------------------------------------

export async function walletExists(username: string): Promise<boolean> {
  const result = await kubectlExecSh(username, `test -f ${WALLET_KEY_FILE} && echo yes || echo no`);
  return result.ok && result.stdout.trim() === 'yes';
}
