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

  // Offline
  'offline.waiting': 'Ollama is offline, waiting for service to start…',
};

export default en;
