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

  // Model parameters
  'params.settings': '设置',
  'params.title': '模型参数',
  'params.loading': '加载参数中…',
  'params.loadFailed': '加载参数失败',
  'params.num_ctx': '上下文窗口 (num_ctx)',
  'params.num_ctx.hint': '模型能处理的最大 token 数。默认通常为 2048 或 4096。值越大占用内存越多。',
  'params.num_gpu': 'GPU 层数 (num_gpu)',
  'params.num_gpu.hint': '卸载到 GPU 的层数。0 = 仅使用 CPU。',
  'params.temperature': '温度 (Temperature)',
  'params.temperature.hint': '控制随机性。越低越确定，越高越有创意。默认：0.8',
  'params.top_p': 'Top P',
  'params.top_p.hint': '核采样阈值。默认：0.9',
  'params.top_k': 'Top K',
  'params.top_k.hint': '限制 token 选择范围为前 K 个候选。默认：40',
  'params.repeat_penalty': '重复惩罚 (Repeat Penalty)',
  'params.repeat_penalty.hint': '惩罚重复 token。默认：1.1',
  'params.save': '保存',
  'params.saving': '保存中…',
  'params.saved': '{{name}} 参数已保存',
  'params.saveFailed': '保存参数失败：{{error}}',
  'params.notSet': '未设置',

  // Offline
  'offline.waiting': 'Ollama 离线，等待服务启动…',
};

export default zh;
