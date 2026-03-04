export interface WizardState {
  providers: Record<string, string>;               // providerId -> apiKey
  defaultModel: string;                            // "provider/model"
  ollama: { baseUrl: string; apiKey: string };
  channels: Record<string, Record<string, string>>; // channelId -> { field -> value }
}

export const initialWizardState: WizardState = {
  providers: {},
  defaultModel: '',
  ollama: { baseUrl: '', apiKey: '' },
  channels: {},
};
