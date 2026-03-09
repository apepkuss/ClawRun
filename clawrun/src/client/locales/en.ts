const en: Record<string, string> = {
  // Common
  'common.back': 'Back',
  'common.save': 'Save',
  'common.saving': 'Saving…',
  'common.saved': '✓ Saved',
  'common.install': 'Install',
  'common.uninstall': 'Uninstall',
  'common.open': 'Open',
  'common.loading': 'Loading…',

  // Status
  'status.running': 'Running',
  'status.stopped': 'Stopped',
  'status.starting': 'Starting…',
  'status.stopping': 'Stopping…',
  'status.restarting': 'Restarting…',
  'status.offline': 'Offline',
  'status.pending': 'Pending…',
  'status.downloading': 'Downloading…',
  'status.installing': 'Installing…',
  'status.initializing': 'Initializing…',
  'status.downloadFailed': 'Download Failed',
  'status.installFailed': 'Install Failed',
  'status.uninstalling': 'Uninstalling…',
  'status.resuming': 'Resuming…',
  'status.suspending': 'Suspending…',
  'status.upgrading': 'Upgrading…',
  'status.deploying': 'Deploying…',

  // App
  'app.tabs.status': 'App Status',
  'app.tabs.config': 'Settings',
  'app.confirmInstall': 'Confirm install {{name}}?',
  'app.confirmUninstall': 'Confirm uninstall {{name}}?',
  'app.installFailed': 'Install {{name}} failed ({{status}}): {{detail}}',
  'app.installError': 'Install {{name}} error: {{detail}}',
  'app.uninstallFailed': 'Uninstall {{name}} failed ({{status}}): {{detail}}',
  'app.uninstallError': 'Uninstall {{name}} error: {{detail}}',
  'app.openclawConfig': 'OpenClaw Settings',
  'app.openclawConnection': 'OpenClaw Connection',
  'app.healthEndpoint': 'Health Endpoint (Internal)',
  'app.gatewayToken': 'Gateway Token',
  'app.gatewayTokenPlaceholder': 'Value of OPENCLAW_GATEWAY_TOKEN',
  'app.uiUrl': 'Web UI URL (External)',
  'app.failedCheckMarket': '{{state}}, please check Olares Market for status',

  // OpenClaw Manager
  'manager.title': 'OpenClaw Management',
  'manager.containerState': 'Container Status',
  'manager.openUI': 'Open OpenClaw UI',
  'manager.start': 'Start',
  'manager.stop': 'Stop',
  'manager.restart': 'Restart',
  'manager.configUnavailable': 'OpenClaw is not running. Configuration is unavailable. Please start the container first.',
  'manager.modelServices': 'Model Services',
  'manager.defaultModel': 'Default Model',
  'manager.messageChannels': 'Message Channels',
  'manager.saveConfig': 'Save Configuration',
  'manager.configSaved': 'Configuration saved. Click "Restart" to apply.',
  'manager.configWriteFailed': 'Config write failed: {{status}}',

  // Providers
  'providers.cloudProviders': 'Cloud Providers',
  'providers.cloudDisabledHint': 'Local Ollama is enabled. To use cloud providers, disable the Ollama toggle first.',
  'providers.cloudHint': 'Enter API Key and save, then click Restart to apply.',
  'providers.pendingSave': 'Pending',
  'providers.configured': 'Configured',
  'providers.configuredPlaceholder': 'Configured (leave empty to keep)',
  'providers.enterApiKey': 'Enter {{name}} API Key',
  'providers.localModel': 'Ollama Local Service',
  'providers.enabled': 'Enabled',
  'providers.disabled': 'Disabled',
  'providers.ollamaStatus': 'Ollama Status: {{status}}',
  'providers.ollamaNotRunning': 'Ollama is not running. To use local models, install Ollama from the Dashboard first.',
  'providers.ollamaBaseUrl': 'Ollama Base URL',
  'providers.ollamaBaseUrlHint': 'OpenClaw will access Ollama via this address. Use the internal network address.',
  'providers.ollamaApiKey': 'API Key (Optional)',
  'providers.ollamaHint': 'Ollama is running. Enable the toggle above to use local models.',

  // Default Model
  'model.description': 'Select the default AI model for OpenClaw.',
  'model.ollamaHint': 'Ollama is enabled. Enter the identifier of a downloaded model.',
  'model.ollamaExample': 'Make sure the model is downloaded in the Ollama app, e.g. ollama/qwen3:0.6b',
  'model.modelId': 'Model ID',
  'model.noProviders': 'No model providers configured. Go back to configure API Keys, or skip this step.',
  'model.customModel': 'Or enter a custom model ID',

  // Channels
  'channels.description': 'Configure messaging channels to interact with OpenClaw via Telegram, Feishu, and more. All channels are optional.',
  'channels.comingSoon': '{{name}} (Coming Soon)',
  'channels.configured': 'Configured',
  'channels.enterField': 'Enter {{label}}',

  // Provider names
  'provider.anthropic': 'Anthropic (Claude)',
  'provider.openai': 'OpenAI (GPT)',
  'provider.zhipu': 'Zhipu (GLM)',
  'provider.google': 'Google (Gemini)',
  'provider.moonshot': 'Moonshot (Kimi)',
  'provider.minimax': 'MiniMax',
  'provider.volcano': 'Volcano Engine (Doubao)',

  // OpenClaw Manager — Plugins
  'manager.plugins': 'Plugins',

  // Plugin: ClawRouter
  'plugin.clawrouter': 'ClawRouter',
  'plugin.clawrouterDesc': 'Decentralized AI model router — smart routing across 40+ LLMs with USDC micropayments.',
  'plugin.installed': 'Installed',
  'plugin.notInstalled': 'Not Installed',
  'plugin.pendingInstall': 'Pending Install (restart required)',
  'plugin.pendingUninstall': 'Pending Uninstall (restart required)',
  'plugin.pendingRestart': 'Action stored. Click "Restart" to apply.',
  'plugin.actionFailed': 'Plugin action failed.',

  // Wallet
  'wallet.title': 'Wallet',
  'wallet.address': 'Address',
  'wallet.balance': 'Balance',
  'wallet.chain': 'Chain',
  'wallet.chainBase': 'Base (EVM)',
  'wallet.chainSolana': 'Solana',
  'wallet.copy': 'Copy address',
  'wallet.show': 'Show balance',
  'wallet.hide': 'Hide balance',
  'wallet.unavailable': 'Unavailable',
  'wallet.sourceDesc': 'Choose how to set up your wallet:',
  'wallet.autoGenerate': 'Auto-generate Wallet',
  'wallet.autoGenerateHint': 'Wallet will be generated on next restart. Click "Restart" to proceed.',
  'wallet.importKey': 'Import Private Key',
  'wallet.privateKeyLabel': 'EVM Private Key (0x...)',
  'wallet.import': 'Import',
  'wallet.importSuccess': 'Private key imported successfully.',
  'wallet.importFailed': 'Failed to import private key.',
  'wallet.invalidKey': 'Invalid format. Expected 0x + 64 hex characters.',

  // Mnemonic (show-once-then-burn)
  'mnemonic.backup': 'Backup Recovery Phrase',
  'mnemonic.title': 'Recovery Phrase',
  'mnemonic.warning': 'Write down these words in order. This is the ONLY time they will be shown. They cannot be recovered after this step.',
  'mnemonic.continue': 'I have written them down',
  'mnemonic.verifyTitle': 'Verify Recovery Phrase',
  'mnemonic.verifyDesc': 'Enter the words at the following positions to confirm your backup.',
  'mnemonic.wordN': 'Word #{{n}}',
  'mnemonic.verify': 'Verify & Confirm',
  'mnemonic.verifyFailed': 'Verification failed. Please check your words and try again.',
  'mnemonic.burned': 'Recovery phrase has been securely deleted. Keep your backup safe.',

  // Providers — ClawRouter
  'providers.clawrouter': 'ClawRouter Service',
  'providers.clawrouterNotInstalled': 'Enable ClawRouter plugin in the Plugins section above to use decentralized model routing.',
  'providers.clawrouterHint': 'ClawRouter is active. Models will be routed through the decentralized network.',
  'providers.clawrouterEnableHint': 'Enable the toggle to use ClawRouter as your model service.',

  // Default Model — ClawRouter
  'model.clawrouterHint': 'Select a routing profile. ClawRouter will automatically pick the best model for each request.',

  // Channel names
  'channel.telegram': 'Telegram',
  'channel.feishu': 'Feishu',
  'channel.slack': 'Slack',
  'channel.discord': 'Discord',
};

export default en;
