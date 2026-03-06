# ClawRun

ClawRun 是一个运行在 [Olares OS](https://olares.com) 上的统一管理界面，用于一站式安装、配置和管理 [OpenClaw](https://github.com/anthropics/openClaw) 与 [Ollama](https://ollama.com)。

## 功能

- **应用生命周期管理** — 一键安装 / 卸载 OpenClaw 和 Ollama，实时显示部署进度
- **配置向导** — 引导式设置 LLM Provider（API Key、Ollama 连接、默认模型等），配置自动写入 OpenClaw
- **Ollama 模型管理** — 查看已拉取的模型列表，直接在界面中拉取或删除模型
- **健康状态监控** — 持续轮询 OpenClaw 和 Ollama 的运行状态，异常时即时反馈
- **连接配置** — 手动指定服务端点和外网 UI 地址，适配不同的网络环境

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 18 + TypeScript + Tailwind CSS（Vite 构建） |
| 后端 | Express (Node.js) + TypeScript |
| 部署 | OAC (Olares Application Chart) — Helm Chart + OlaresManifest |
| 集群交互 | Kubernetes API (kubectl) — 部署管理、配置注入、跨命名空间通信 |

## 部署

ClawRun 以 OAC 包的形式部署到 Olares OS：

1. 构建 Docker 镜像（`--platform linux/arm64`，适用于 Apple Silicon）
2. 打包 OAC Chart（`clawrun/oac/`）
3. 通过 Olares Market 或自定义 Chart Server 安装

## 许可证

MIT
