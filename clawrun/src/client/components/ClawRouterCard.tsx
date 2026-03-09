import React, { useState, useEffect, useCallback } from 'react';
import { useLocale } from '../locales';
import { MnemonicDialog } from './MnemonicDialog';

interface Props {
  installed: boolean;
  openclawRunning: boolean;
  onRefresh: () => void;
}

interface PluginStatus {
  installed: boolean;
  pendingAction: 'install' | 'uninstall' | null;
  walletAddress: string | null;
  chain: string | null;
  mnemonicBurned: boolean;
  walletExists: boolean;
}

function abbreviateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function ClawRouterCard({ installed, openclawRunning, onRefresh }: Props) {
  const { t } = useLocale();
  const [pluginStatus, setPluginStatus] = useState<PluginStatus | null>(null);
  const [balanceVisible, setBalanceVisible] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importKey, setImportKey] = useState('');
  const [importError, setImportError] = useState('');
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');

  const fetchStatus = useCallback(() => {
    if (!openclawRunning) return;
    fetch('/api/openclaw/plugins/clawrouter/status')
      .then((r) => r.json())
      .then((data) => setPluginStatus(data))
      .catch(() => {});
  }, [openclawRunning]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus, installed]);

  const isInstalled = pluginStatus?.installed ?? installed;
  const hasPending = !!pluginStatus?.pendingAction;

  async function handleToggle() {
    setActionLoading(true);
    setMessage('');
    try {
      const action = isInstalled ? 'uninstall' : 'install';
      const res = await fetch(`/api/openclaw/plugins/clawrouter/${action}`, { method: 'POST' });
      if (res.ok) {
        setMessage(t('plugin.pendingRestart'));
        fetchStatus();
        onRefresh();
      }
    } catch {
      setMessage(t('plugin.actionFailed'));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCopyAddress() {
    if (!pluginStatus?.walletAddress) return;
    try {
      await navigator.clipboard.writeText(pluginStatus.walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function fetchBalance() {
    if (balanceVisible) {
      setBalanceVisible(false);
      return;
    }
    setBalanceLoading(true);
    try {
      const res = await fetch('/api/openclaw/plugins/clawrouter/balance');
      const data = await res.json();
      setBalance(data.balance ? `$${data.balance}` : t('wallet.unavailable'));
      setBalanceVisible(true);
    } catch {
      setBalance(t('wallet.unavailable'));
      setBalanceVisible(true);
    } finally {
      setBalanceLoading(false);
    }
  }

  async function handleChainSwitch(chain: string) {
    try {
      await fetch('/api/openclaw/plugins/clawrouter/chain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain }),
      });
      fetchStatus();
    } catch {}
  }

  async function handleImportKey() {
    setImportError('');
    if (!/^0x[0-9a-fA-F]{64}$/.test(importKey.trim())) {
      setImportError(t('wallet.invalidKey'));
      return;
    }
    try {
      const res = await fetch('/api/openclaw/plugins/clawrouter/import-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privateKey: importKey.trim() }),
      });
      if (res.ok) {
        setShowImport(false);
        setImportKey('');
        setMessage(t('wallet.importSuccess'));
        fetchStatus();
      } else {
        const data = await res.json();
        setImportError(data.error || t('wallet.importFailed'));
      }
    } catch {
      setImportError(t('wallet.importFailed'));
    }
  }

  // Status badge
  let badgeText = '';
  let badgeColor = '';
  if (hasPending) {
    badgeText = pluginStatus?.pendingAction === 'install' ? t('plugin.pendingInstall') : t('plugin.pendingUninstall');
    badgeColor = 'bg-amber-100 text-amber-700';
  } else if (isInstalled) {
    badgeText = t('plugin.installed');
    badgeColor = 'bg-green-100 text-green-700';
  } else {
    badgeText = t('plugin.notInstalled');
    badgeColor = 'bg-gray-200 text-gray-500';
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-gray-700">{t('plugin.clawrouter')}</h3>
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${badgeColor}`}>
            {badgeText}
          </span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={isInstalled || pluginStatus?.pendingAction === 'install'}
            onChange={handleToggle}
            disabled={actionLoading || hasPending || !openclawRunning}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-40" />
        </label>
      </div>

      <p className="text-xs text-gray-400 mb-3">{t('plugin.clawrouterDesc')}</p>

      {message && <p className="text-xs text-blue-600 mb-3">{message}</p>}

      {/* Wallet info — only when installed and wallet exists */}
      {isInstalled && pluginStatus?.walletAddress && (
        <div className="border-t pt-3 space-y-3">
          <h4 className="text-xs font-semibold text-gray-600">{t('wallet.title')}</h4>

          {/* Address */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{t('wallet.address')}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono text-gray-700">
                {abbreviateAddress(pluginStatus.walletAddress)}
              </span>
              <button
                onClick={handleCopyAddress}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title={t('wallet.copy')}
              >
                {copied ? (
                  <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                )}
              </button>
            </div>
          </div>

          {/* Balance */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{t('wallet.balance')}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono text-gray-700">
                {balanceLoading ? '...' : balanceVisible ? balance : '$\u2022\u2022\u2022\u2022'}
              </span>
              <button
                onClick={fetchBalance}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title={balanceVisible ? t('wallet.hide') : t('wallet.show')}
              >
                {balanceVisible ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                )}
              </button>
            </div>
          </div>

          {/* Chain */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{t('wallet.chain')}</span>
            <select
              value={pluginStatus.chain ?? 'base'}
              onChange={(e) => handleChainSwitch(e.target.value)}
              className="text-xs border rounded px-2 py-1 text-gray-700 focus:ring-2 focus:ring-blue-300 focus:outline-none"
            >
              <option value="base">{t('wallet.chainBase')}</option>
              <option value="solana">{t('wallet.chainSolana')}</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {!pluginStatus.mnemonicBurned && (
              <button
                onClick={() => setShowMnemonic(true)}
                className="text-xs px-3 py-1.5 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
              >
                {t('mnemonic.backup')}
              </button>
            )}
            <button
              onClick={() => setShowImport(!showImport)}
              className="text-xs px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t('wallet.importKey')}
            </button>
          </div>
        </div>
      )}

      {/* First-time setup: show wallet source selection when plugin installed but no wallet yet */}
      {isInstalled && !pluginStatus?.walletAddress && pluginStatus && !pluginStatus.walletExists && (
        <div className="border-t pt-3">
          <p className="text-xs text-gray-500 mb-2">{t('wallet.sourceDesc')}</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                // Auto-generate happens on gateway restart, just show info
                setMessage(t('wallet.autoGenerateHint'));
              }}
              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {t('wallet.autoGenerate')}
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="text-xs px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t('wallet.importKey')}
            </button>
          </div>
        </div>
      )}

      {/* Import private key form */}
      {showImport && (
        <div className="border-t pt-3 mt-3 space-y-2">
          <label className="block text-xs text-gray-500">{t('wallet.privateKeyLabel')}</label>
          <input
            type="password"
            value={importKey}
            onChange={(e) => setImportKey(e.target.value)}
            placeholder="0x..."
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-300 focus:outline-none"
          />
          {importError && <p className="text-xs text-red-500">{importError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => { setShowImport(false); setImportKey(''); setImportError(''); }}
              className="text-xs px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t('common.back')}
            </button>
            <button
              onClick={handleImportKey}
              disabled={!importKey.trim()}
              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {t('wallet.import')}
            </button>
          </div>
        </div>
      )}

      {/* Mnemonic dialog */}
      <MnemonicDialog
        open={showMnemonic}
        onClose={() => setShowMnemonic(false)}
        onBurned={() => fetchStatus()}
      />
    </div>
  );
}
