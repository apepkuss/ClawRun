const zh: Record<string, string> = {
  // Common
  'common.back': '返回',
  'common.save': '保存',
  'common.saving': '保存中…',
  'common.saved': '✓ 已保存',
  'common.install': '安装',
  'common.uninstall': '卸载',
  'common.open': '打开',
  'common.loading': '加载中…',

  // Status
  'status.running': '运行中',
  'status.stopped': '已停止',
  'status.starting': '启动中…',
  'status.stopping': '停止中…',
  'status.restarting': '重启中…',
  'status.offline': '离线',
  'status.pending': '等待中…',
  'status.downloading': '下载中…',
  'status.installing': '安装中…',
  'status.initializing': '初始化中…',
  'status.downloadFailed': '下载失败',
  'status.installFailed': '安装失败',
  'status.uninstalling': '卸载中…',
  'status.resuming': '恢复中…',
  'status.suspending': '暂停中…',
  'status.upgrading': '升级中…',
  'status.deploying': '部署中…',

  // App
  'app.tabs.status': '应用状态',
  'app.tabs.config': '配置',
  'app.confirmInstall': '确认安装 {{name}}？',
  'app.confirmUninstall': '确认卸载 {{name}}？',
  'app.installFailed': '安装 {{name}} 失败 ({{status}}): {{detail}}',
  'app.installError': '安装 {{name}} 请求异常: {{detail}}',
  'app.uninstallFailed': '卸载 {{name}} 失败 ({{status}}): {{detail}}',
  'app.uninstallError': '卸载 {{name}} 请求异常: {{detail}}',
  'app.openclawConfig': 'OpenClaw 配置',
  'app.openclawConnection': 'OpenClaw 连接',
  'app.healthEndpoint': '健康检查端点（内网）',
  'app.gatewayToken': 'Gateway Token',
  'app.gatewayTokenPlaceholder': 'OPENCLAW_GATEWAY_TOKEN 的值',
  'app.uiUrl': 'Web UI 地址（外网）',
  'app.failedCheckMarket': '{{state}}，请检查 Olares 应用市场确认状态',

  // OpenClaw Manager
  'manager.title': 'OpenClaw 管理',
  'manager.containerState': '容器状态',
  'manager.openUI': '打开 OpenClaw UI',
  'manager.start': '启动',
  'manager.stop': '停止',
  'manager.restart': '重启',
  'manager.configUnavailable': 'OpenClaw 未运行，配置不可用。请先启动容器。',
  'manager.modelServices': '模型服务',
  'manager.defaultModel': '默认模型',
  'manager.messageChannels': '消息通道',
  'manager.saveConfig': '保存配置',
  'manager.configSaved': '配置已保存。点击"重启"使配置生效。',
  'manager.configWriteFailed': '配置写入失败: {{status}}',

  // Providers
  'providers.cloudProviders': '云端服务商',
  'providers.cloudDisabledHint': '已启用本地 Ollama，如需使用云端服务商请先关闭 Ollama 开关。',
  'providers.cloudHint': '输入 API Key 后保存，点击重启使配置生效。',
  'providers.pendingSave': '待保存',
  'providers.configured': '已配置',
  'providers.configuredPlaceholder': '已配置（留空保持不变）',
  'providers.enterApiKey': '输入 {{name}} API Key',
  'providers.localModel': '本地模型 (Ollama)',
  'providers.enabled': '已启用',
  'providers.disabled': '未启用',
  'providers.ollamaStatus': 'Ollama 状态：{{status}}',
  'providers.ollamaNotRunning': 'Ollama 未运行。如需使用本地模型，请先从 Dashboard 安装 Ollama。',
  'providers.ollamaBaseUrl': 'Ollama Base URL',
  'providers.ollamaBaseUrlHint': 'OpenClaw 将通过此地址访问 Ollama，使用内网地址即可。',
  'providers.ollamaApiKey': 'API Key（可选）',
  'providers.ollamaHint': 'Ollama 已运行，开启上方开关即可使用本地模型。',

  // Default Model
  'model.description': '选择 OpenClaw 默认使用的 AI 模型。',
  'model.ollamaHint': '已启用 Ollama，请输入已下载的模型标识。',
  'model.ollamaExample': '请确保已在 Ollama 应用中下载对应模型，例如 ollama/qwen3:0.6b',
  'model.modelId': '模型标识',
  'model.noProviders': '暂无已配置的模型服务商。请返回上一步配置 API Key，或跳过此步骤。',
  'model.customModel': '或输入自定义模型标识',

  // Channels
  'channels.description': '配置消息通道后，你可以通过 Telegram、飞书等平台与 OpenClaw 交互。所有通道均为可选配置。',
  'channels.comingSoon': '{{name}}（即将支持）',
  'channels.configured': '已配置',
  'channels.enterField': '输入 {{label}}',

  // Provider names
  'provider.anthropic': 'Anthropic (Claude)',
  'provider.openai': 'OpenAI (GPT)',
  'provider.zhipu': '智谱 (GLM)',
  'provider.google': 'Google (Gemini)',
  'provider.moonshot': 'Moonshot (Kimi)',
  'provider.minimax': 'MiniMax',
  'provider.volcano': '火山引擎 (豆包)',

  // OpenClaw 管理 — 插件
  'manager.plugins': '插件',

  // 插件: ClawRouter
  'plugin.clawrouter': 'ClawRouter',
  'plugin.clawrouterDesc': '去中心化 AI 模型路由器 — 智能路由 40+ 大模型，USDC 微支付。',
  'plugin.installed': '已安装',
  'plugin.notInstalled': '未安装',
  'plugin.pendingInstall': '待安装（需重启）',
  'plugin.pendingUninstall': '待卸载（需重启）',
  'plugin.pendingRestart': '操作已存储，点击"重启"使其生效。',
  'plugin.actionFailed': '插件操作失败。',

  // 钱包
  'wallet.title': '钱包',
  'wallet.address': '地址',
  'wallet.balance': '余额',
  'wallet.chain': '链',
  'wallet.chainBase': 'Base (EVM)',
  'wallet.chainSolana': 'Solana',
  'wallet.copy': '复制地址',
  'wallet.show': '显示余额',
  'wallet.hide': '隐藏余额',
  'wallet.unavailable': '不可用',
  'wallet.sourceDesc': '选择钱包设置方式：',
  'wallet.autoGenerate': '自动生成钱包',
  'wallet.autoGenerateHint': '钱包将在下次重启时生成，请点击"重启"继续。',
  'wallet.importKey': '导入私钥',
  'wallet.privateKeyLabel': 'EVM 私钥 (0x...)',
  'wallet.import': '导入',
  'wallet.importSuccess': '私钥导入成功。',
  'wallet.importFailed': '导入私钥失败。',
  'wallet.invalidKey': '格式无效，需要 0x + 64 位十六进制字符。',

  // 助记词（阅后即焚）
  'mnemonic.backup': '备份助记词',
  'mnemonic.title': '助记词',
  'mnemonic.warning': '请按顺序抄写以下单词。这是唯一一次展示，此后将无法恢复。',
  'mnemonic.continue': '我已抄写完毕',
  'mnemonic.verifyTitle': '验证助记词',
  'mnemonic.verifyDesc': '请输入以下位置对应的单词，确认你已正确备份。',
  'mnemonic.wordN': '第 {{n}} 个单词',
  'mnemonic.verify': '验证并确认',
  'mnemonic.verifyFailed': '验证失败，请检查输入的单词后重试。',
  'mnemonic.burned': '助记词已安全删除，请妥善保管你的备份。',

  // 模型服务 — ClawRouter
  'providers.clawrouter': '去中心化 (ClawRouter)',
  'providers.clawrouterNotInstalled': '请先在上方插件区域启用 ClawRouter 插件，才能使用去中心化模型路由。',
  'providers.clawrouterHint': 'ClawRouter 已激活，模型请求将通过去中心化网络路由。',
  'providers.clawrouterEnableHint': '开启开关即可使用 ClawRouter 作为模型服务。',

  // 默认模型 — ClawRouter
  'model.clawrouterHint': '选择路由配置，ClawRouter 会自动为每个请求选择最优模型。',

  // Channel names
  'channel.telegram': 'Telegram',
  'channel.feishu': '飞书 (Feishu)',
  'channel.slack': 'Slack',
  'channel.discord': 'Discord',
};

export default zh;
