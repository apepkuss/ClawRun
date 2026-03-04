export interface ProviderDef {
  id: string;
  name: string;
  configKey: string; // e.g. "models.providers.anthropic.apiKey"
  envVar: string;    // K8s Deployment env var name
}

export interface ModelDef {
  label: string; // display name
  value: string; // "provider/model"
}

export interface ChannelField {
  key: string;
  label: string;
  configKey: string;
  type?: 'password';
}

export interface ChannelDef {
  id: string;
  name: string;
  fields: ChannelField[];
}

export const PROVIDERS: ProviderDef[] = [
  { id: 'anthropic', name: 'Anthropic (Claude)', configKey: 'models.providers.anthropic.apiKey', envVar: 'ANTHROPIC_API_KEY' },
  { id: 'openai', name: 'OpenAI (GPT)', configKey: 'models.providers.openai.apiKey', envVar: 'OPENAI_API_KEY' },
  { id: 'zhipu', name: '智谱 (GLM)', configKey: 'models.providers.zhipu.apiKey', envVar: 'ZAI_API_KEY' },
  { id: 'google', name: 'Google (Gemini)', configKey: 'models.providers.google.apiKey', envVar: 'GEMINI_API_KEY' },
  { id: 'moonshot', name: 'Moonshot (Kimi)', configKey: 'models.providers.moonshot.apiKey', envVar: 'MOONSHOT_API_KEY' },
  { id: 'minimax', name: 'MiniMax', configKey: 'models.providers.minimax.apiKey', envVar: 'MINIMAX_API_KEY' },
  { id: 'volcano', name: '火山引擎 (豆包)', configKey: 'models.providers.volcano.apiKey', envVar: 'VOLCANO_ENGINE_API_KEY' },
];

export const POPULAR_MODELS: Record<string, ModelDef[]> = {
  anthropic: [
    { label: 'Claude Sonnet 4', value: 'anthropic/claude-sonnet-4-20250514' },
    { label: 'Claude Haiku 3.5', value: 'anthropic/claude-3.5-haiku-20241022' },
  ],
  openai: [
    { label: 'GPT-4o', value: 'openai/gpt-4o' },
    { label: 'GPT-4o Mini', value: 'openai/gpt-4o-mini' },
  ],
  zhipu: [
    { label: 'GLM-4 Flash', value: 'zai/glm-4.7-flash' },
    { label: 'GLM-4', value: 'zai/glm-4' },
  ],
  google: [
    { label: 'Gemini 2.0 Flash', value: 'google/gemini-2.0-flash' },
    { label: 'Gemini 2.0 Pro', value: 'google/gemini-2.0-pro' },
  ],
  moonshot: [
    { label: 'Moonshot v1 8K', value: 'moonshot/moonshot-v1-8k' },
  ],
  minimax: [
    { label: 'abab6.5s Chat', value: 'minimax/abab6.5s-chat' },
  ],
  volcano: [
    { label: '豆包 Pro 32K', value: 'volcano/doubao-pro-32k' },
  ],
};

export const CHANNELS: ChannelDef[] = [
  {
    id: 'telegram',
    name: 'Telegram',
    fields: [
      { key: 'botToken', label: 'Bot Token', configKey: 'channels.telegram.botToken', type: 'password' },
    ],
  },
  {
    id: 'feishu',
    name: '飞书 (Feishu)',
    fields: [
      { key: 'appId', label: 'App ID', configKey: 'channels.feishu.appId' },
      { key: 'appSecret', label: 'App Secret', configKey: 'channels.feishu.appSecret', type: 'password' },
      { key: 'verificationToken', label: 'Verification Token', configKey: 'channels.feishu.verificationToken' },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    fields: [
      { key: 'botToken', label: 'Bot Token', configKey: 'channels.slack.botToken', type: 'password' },
    ],
  },
  {
    id: 'discord',
    name: 'Discord',
    fields: [
      { key: 'botToken', label: 'Bot Token', configKey: 'channels.discord.botToken', type: 'password' },
    ],
  },
];

export const WIZARD_STEPS = [
  { label: '模型服务', description: '配置云端服务商和本地 Ollama' },
  { label: '默认模型', description: '选择默认使用的 AI 模型' },
  { label: '消息通道', description: '配置 Telegram、飞书等消息通道' },
] as const;
