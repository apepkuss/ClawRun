const zh: Record<string, string> = {
  // App
  'app.detecting': '检测中…',
  'app.running': '运行中',
  'app.offline': '离线',

  // Model list
  'models.installed': '已安装模型',
  'models.empty': '暂无模型',
  'models.delete': '删除',
  'models.deleteTitle': '删除模型',
  'models.confirmDelete': '确认删除模型 {{name}}？',
  'models.deleted': '{{name}} 已删除',
  'models.deleteFailed': '删除 {{name}} 失败',

  // Model selection
  'pull.selectModel': '选择模型',
  'pull.searchPlaceholder': '搜索或输入模型名称，如 qwen2.5',
  'pull.selectTag': '选择版本（Tag）',
  'pull.selectModelFirst': '请先选择模型',
  'pull.loadingTags': '加载 tag 列表…',
  'pull.noTags': '未找到 tag 列表，将拉取默认版本（latest）',
  'pull.downloadLatest': '下载 latest',
  'pull.selectTag.placeholder': '点击选择 tag',
  'pull.download': '下载 {{name}}',
  'pull.downloading': '下载中…',
  'pull.preparing': '准备中…',

  // Pull result
  'pull.completed': '{{name}} 拉取完成',
  'pull.failed': '拉取失败：{{error}}',
  'pull.checkName': '请检查模型名称',
  'pull.taskNotFound': '任务不存在',
  'pull.pollFailed': '轮询失败',
  'pull.incomplete': '拉取未完成',
  'pull.serverError': '服务端错误',

  // Offline
  'offline.waiting': 'Ollama 离线，等待服务启动…',
};

export default zh;
