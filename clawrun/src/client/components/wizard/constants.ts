export interface ProviderDef {
  id: string;
  configKey: string; // e.g. "models.providers.anthropic.apiKey"
  envVar: string;    // K8s Deployment env var name
}

export interface ModelDef {
  label: string; // display name (brand name, not translated)
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
  fields: ChannelField[];
}

export const PROVIDERS: ProviderDef[] = [
  { id: 'anthropic', configKey: 'models.providers.anthropic.apiKey', envVar: 'ANTHROPIC_API_KEY' },
  { id: 'openai', configKey: 'models.providers.openai.apiKey', envVar: 'OPENAI_API_KEY' },
  { id: 'zhipu', configKey: 'models.providers.zhipu.apiKey', envVar: 'ZAI_API_KEY' },
  { id: 'google', configKey: 'models.providers.google.apiKey', envVar: 'GEMINI_API_KEY' },
  { id: 'moonshot', configKey: 'models.providers.moonshot.apiKey', envVar: 'MOONSHOT_API_KEY' },
  { id: 'minimax', configKey: 'models.providers.minimax.apiKey', envVar: 'MINIMAX_API_KEY' },
  { id: 'volcano', configKey: 'models.providers.volcano.apiKey', envVar: 'VOLCANO_ENGINE_API_KEY' },
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
    { label: 'Doubao Pro 32K', value: 'volcano/doubao-pro-32k' },
  ],
};

export const CLAWROUTER_MODELS: ModelDef[] = [
  { label: 'Auto (Balanced)', value: 'blockrun/auto' },
  { label: 'Eco (Cheapest)', value: 'blockrun/eco' },
  { label: 'Premium (Best Quality)', value: 'blockrun/premium' },
  { label: 'Free', value: 'blockrun/free' },
];

export const CHANNELS: ChannelDef[] = [
  {
    id: 'telegram',
    fields: [
      { key: 'botToken', label: 'Bot Token', configKey: 'channels.telegram.botToken', type: 'password' },
    ],
  },
  {
    id: 'feishu',
    fields: [
      { key: 'appId', label: 'App ID', configKey: 'channels.feishu.appId' },
      { key: 'appSecret', label: 'App Secret', configKey: 'channels.feishu.appSecret', type: 'password' },
      { key: 'verificationToken', label: 'Verification Token', configKey: 'channels.feishu.verificationToken' },
    ],
  },
  {
    id: 'slack',
    fields: [
      { key: 'botToken', label: 'Bot Token', configKey: 'channels.slack.botToken', type: 'password' },
    ],
  },
  {
    id: 'discord',
    fields: [
      { key: 'botToken', label: 'Bot Token', configKey: 'channels.discord.botToken', type: 'password' },
    ],
  },
];
