export interface WizardState {
  providers: Record<string, string>;               // providerId -> apiKey
  defaultModel: string;                            // "provider/model"
  useOllama: boolean;                              // user opted to use local Ollama
  ollama: { baseUrl: string; apiKey: string };
  useClawRouter: boolean;                          // user opted to use ClawRouter
  channels: Record<string, Record<string, string>>; // channelId -> { field -> value }
}

export const initialWizardState: WizardState = {
  providers: {},
  defaultModel: '',
  useOllama: false,
  ollama: { baseUrl: '', apiKey: '' },
  useClawRouter: false,
  channels: {},
};
