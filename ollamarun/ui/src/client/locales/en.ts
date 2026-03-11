const en: Record<string, string> = {
  // App
  'app.detecting': 'Detecting…',
  'app.running': 'Running',
  'app.offline': 'Offline',

  // Model list
  'models.installed': 'Installed Models',
  'models.empty': 'No models installed',
  'models.delete': 'Delete',
  'models.deleteTitle': 'Delete model',
  'models.confirmDelete': 'Confirm delete model {{name}}?',
  'models.deleted': '{{name}} deleted',
  'models.deleteFailed': 'Delete {{name}} failed',

  // Model selection
  'pull.selectModel': 'Select Model',
  'pull.searchPlaceholder': 'Search or enter model name, e.g. qwen2.5',
  'pull.selectTag': 'Select Version (Tag)',
  'pull.selectModelFirst': 'Select a model first',
  'pull.loadingTags': 'Loading tags…',
  'pull.noTags': 'No tags found, will pull default version (latest)',
  'pull.downloadLatest': 'Download latest',
  'pull.selectTag.placeholder': 'Click to select tag',
  'pull.download': 'Download {{name}}',
  'pull.downloading': 'Downloading…',
  'pull.preparing': 'Preparing…',

  // Pull result
  'pull.completed': '{{name}} pull completed',
  'pull.failed': 'Pull failed: {{error}}',
  'pull.checkName': 'Please check model name',
  'pull.taskNotFound': 'Task not found',
  'pull.pollFailed': 'Poll failed',
  'pull.incomplete': 'Pull incomplete',
  'pull.serverError': 'Server error',

  // Model parameters
  'params.settings': 'Settings',
  'params.title': 'Model Parameters',
  'params.loading': 'Loading parameters…',
  'params.loadFailed': 'Failed to load parameters',
  'params.num_ctx': 'Context Window (num_ctx)',
  'params.num_ctx.hint': 'Maximum number of tokens the model can process. Default is usually 2048 or 4096. Larger values use more memory.',
  'params.num_gpu': 'GPU Layers (num_gpu)',
  'params.num_gpu.hint': 'Number of layers to offload to GPU. 0 = CPU only.',
  'params.temperature': 'Temperature',
  'params.temperature.hint': 'Controls randomness. Lower = more deterministic, higher = more creative. Default: 0.8',
  'params.top_p': 'Top P',
  'params.top_p.hint': 'Nucleus sampling threshold. Default: 0.9',
  'params.top_k': 'Top K',
  'params.top_k.hint': 'Limits token selection to top K candidates. Default: 40',
  'params.repeat_penalty': 'Repeat Penalty',
  'params.repeat_penalty.hint': 'Penalizes repeated tokens. Default: 1.1',
  'params.save': 'Save',
  'params.saving': 'Saving…',
  'params.saved': 'Parameters saved for {{name}}',
  'params.saveFailed': 'Failed to save parameters: {{error}}',
  'params.notSet': 'not set',

  // Offline
  'offline.waiting': 'Ollama is offline, waiting for service to start…',
};

export default en;
