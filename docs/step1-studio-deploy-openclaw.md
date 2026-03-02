# 步骤 1：在 Olares Studio 中部署 OpenClaw

> 目标：使用 Olares Studio 的 Docker 镜像部署功能，快速验证 OpenClaw 在 Olares 上的基本可用性。

- [步骤 1：在 Olares Studio 中部署 OpenClaw](#步骤-1在-olares-studio-中部署-openclaw)
  - [前置条件](#前置条件)
  - [OpenClaw 容器关键参数](#openclaw-容器关键参数)
  - [部署步骤](#部署步骤)
    - [1.1 创建应用](#11-创建应用)
    - [1.2 配置镜像和端口](#12-配置镜像和端口)
    - [1.3 设置实例规格](#13-设置实例规格)
    - [1.4 配置环境变量](#14-配置环境变量)
    - [1.5 配置持久化存储](#15-配置持久化存储)
    - [1.6 配置启动命令](#16-配置启动命令)
    - [1.7 部署和验证](#17-部署和验证)
  - [Studio 部署的已知限制](#studio-部署的已知限制)
  - [部署后可做的验证测试](#部署后可做的验证测试)
    - [测试 1：基本对话](#测试-1基本对话)
    - [测试 2：检查 Gateway 状态](#测试-2检查-gateway-状态)
    - [测试 3：持久化验证](#测试-3持久化验证)
  - [下一步](#下一步)

## 前置条件

- 已安装并运行 Olares OS
- 已从 Market 安装 **Studio** 应用
- OpenClaw 官方 Docker 镜像：`ghcr.io/openclaw/openclaw`
- 至少一个 LLM API Key（Anthropic / OpenAI / Gemini 等）

## OpenClaw 容器关键参数

从源码和 docker-compose 分析得出：

| 参数 | 值 |
|------|-----|
| 基础镜像 | `node:22-bookworm` |
| 运行用户 | `node` (uid 1000, 非 root) |
| 主端口 | **18789** (Gateway API) |
| 桥接端口 | 18790 (Bridge, 可选) |
| 数据目录 | `/home/node/.openclaw` |
| 工作区目录 | `/home/node/.openclaw/workspace` |
| 启动命令 | `node dist/index.js gateway --bind lan --port 18789 --allow-unconfigured` |

## 部署步骤

### 1.1 创建应用

1. 打开 **Studio**，点击 **Create a new application**
2. 输入应用名称：`openclaw`
3. 选择 **Port your own container to Olares**

### 1.2 配置镜像和端口

| 字段 | 填写 |
|------|------|
| Image | `ghcr.io/openclaw/openclaw:latest` |
| Port | `18789` |

> Studio 只需填写容器端口，外部路由由 Olares 自动管理。

### 1.3 设置实例规格

| 资源 | 建议值 | 说明 |
|------|--------|------|
| CPU | 2 cores | Gateway 常驻进程 + 偶发 AI 调用 |
| Memory | 2 Gi | 实测 1Gi 不够，容器会 OOMKilled；2Gi 稳定运行 |
| GPU | 关闭 | OpenClaw 本身不需要 GPU |

> **注意**：修改 deployment.yaml 的内存 limits/requests 后，还需同步修改 `OlaresManifest.yaml` 中的 `spec.limitedMemory` 和 `spec.requiredMemory`，否则 Olares 会拒绝应用配置。

### 1.4 配置环境变量

点击 **Environment Variables > Add**，逐一添加：

**必须配置：**

| Key | Value | 说明 |
|-----|-------|------|
| `HOME` | `/home/node` | 容器内用户目录 |
| `OPENCLAW_GATEWAY_TOKEN` | `<生成的随机 token>` | Gateway 认证令牌 |

> **⚠️ 不要添加 `NODE_OPTIONS`**：若设置 `NODE_OPTIONS=--max-old-space-size=4096`，Node.js 会尝试使用 4GB 堆内存，超出容器 2Gi 限制，导致 OOMKilled（CrashLoopBackOff）。

生成 token 的方法（在任意终端执行，将输出结果粘贴到上方 Value 中）：

```bash
openssl rand -hex 32
```

**LLM 提供者（至少配一个）：**

国际服务：

| Key | Value | 说明 |
|-----|-------|------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Anthropic Claude |
| `OPENAI_API_KEY` | `sk-...` | OpenAI |
| `GEMINI_API_KEY` | `...` | Google Gemini |

中国可用服务：

| Key | Value | 说明 |
|-----|-------|------|
| `ZAI_API_KEY` | `...` | 智谱 GLM |
| `MOONSHOT_API_KEY` | `...` | Moonshot Kimi |
| `MINIMAX_API_KEY` | `...` | MiniMax |
| `VOLCANO_ENGINE_API_KEY` | `...` | 火山引擎 / 豆包 |
| `QIANFAN_API_KEY` | `...` | 百度千帆 / ERNIE |
| `XIAOMI_API_KEY` | `...` | 小米 MiMo |

> 通义千问（Qwen）通过 OAuth 设备授权接入，无需 API Key。
> 此外，OpenClaw 支持自定义 OpenAI 兼容端点，可接入 DeepSeek 等任意兼容服务。

**可选 — 消息通道：**

中国可用通道：

| Key | Value | 说明 |
|-----|-------|------|
| `FEISHU_*` | `...` | 飞书（需配置扩展插件） |
| `TELEGRAM_BOT_TOKEN` | `...` | Telegram 机器人 |

其他通道：

| Key | Value | 说明 |
|-----|-------|------|
| `DISCORD_BOT_TOKEN` | `...` | Discord 机器人 |
| `SLACK_BOT_TOKEN` | `...` | Slack 机器人 |

> OpenClaw 还支持 WhatsApp、Signal、iMessage、Google Chat、Matrix、Microsoft Teams 等通道。

### 1.5 配置持久化存储

点击 **Storage Volume > Add**，配置以下卷映射：

**卷 1 — 配置和状态数据：**

| 字段 | 值 |
|------|-----|
| Host path | `/app/data/config` |
| Mount path | `/home/node/.openclaw` |

**卷 2 — 工作区数据：**

| 字段 | 值 |
|------|-----|
| Host path | `/app/data/workspace` |
| Mount path | `/home/node/.openclaw/workspace` |

> **存储路径选择说明：**
>
> Olares 提供三种存储路径前缀，底层实现和适用场景各不同：
>
> | 前缀 | 底层实现 | 跨节点 | 卸载后保留 | 适用场景 |
> |------|---------|--------|-----------|---------|
> | `/app/data` | JuiceFS 分布式文件系统（后端为 MinIO/S3） | 是 | 是 | 配置文件、需要持久化的应用状态 |
> | `/app/cache` | 节点本地磁盘 | 否 | 否 | 数据库、日志、高 I/O 缓存 |
> | `/app/Home` | JuiceFS（映射到用户 Home 目录） | 是 | 是 | 用户文档、共享文件 |
>
> "跨节点持久化"指的是：在多节点 Olares 集群中，`/app/data` 通过 JuiceFS 将数据存储在分布式对象存储上，
> 无论 Pod 被调度到哪个节点，都能访问同一份数据。而 `/app/cache` 使用节点本地磁盘，I/O 性能更高，
> 但数据仅存在于当前节点，Pod 迁移后数据不可用。
>
> 对于 OpenClaw，配置和会话数据选择 `/app/data` 更安全。如果是单节点部署，两者在功能上差别不大，
> 但 `/app/data` 仍有卸载后保留数据的优势。

### 1.6 配置启动命令

Studio 生成的 deployment.yaml 默认不包含 `command` 字段，容器会使用镜像内置的默认 CMD（绑定到 `127.0.0.1`）。由于 Olares 的 Envoy sidecar 使用 `ORIGINAL_DST` 策略转发流量（目标地址为 Pod IP 而非 localhost），必须显式指定启动命令让 Gateway 绑定到所有网络接口。

在 Studio 中打开 deployment.yaml，在 `openclaw` 容器的 `image` 字段下方添加：

```yaml
command:
  - node
  - dist/index.js
  - gateway
  - "--bind"
  - "lan"
  - "--port"
  - "18789"
  - "--allow-unconfigured"
```

然后执行以下命令，写入 Control UI 的访问来源配置（容器启动后一次性操作）：

```bash
kubectl exec -n <namespace> <pod-name> -c openclaw -- \
  node dist/index.js config set \
  gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback true
```

> **说明**：`--bind lan` 使 Gateway 监听 `0.0.0.0:18789`；`--allow-unconfigured` 允许在无本地配置时启动；`dangerouslyAllowHostHeaderOriginFallback` 允许通过 Host header 验证请求来源（Olares 反向代理场景下的必要配置）。

### 1.7 部署和验证

1. 点击 **Create**，等待底部状态栏显示部署成功
2. 点击 **Preview** 打开应用

**验证清单：**

- [ ] Gateway 正常启动（Preview 页面可访问）
- [ ] 能通过 WebChat 与 AI 助手对话
- [ ] 环境变量（API Key）正确生效
- [ ] 数据在重启后保持持久化

## Studio 部署的已知限制

| 限制 | 影响 | 后续解决方案 |
|------|------|-------------|
| 仅支持单容器 | 无法同时运行 gateway + cli | Gateway 单容器已够用 |
| 仅支持单端口 | 桥接端口 18790 无法暴露 | 正式打包 OAC 时解决 |
| 应用名带 `-dev` 后缀 | 仅影响显示 | 正式打包后消除 |
| 无 Provider 配置 UI | 无法直接连接 Ollama | 需手动编辑生成的 manifest 或等步骤 3 |
| 中间件仅 PG/Redis | 如需 MongoDB 等需正式打包 | OpenClaw 不依赖这些，无影响 |

## 部署后可做的验证测试

### 测试 1：基本对话

> 前提：至少配置了一个 LLM 提供者（API Key）。未配置时 Gateway 可正常启动，Web UI 可访问，但 AI 无法响应消息。

1. 点击 Studio 的 **Preview** 打开 OpenClaw Control UI
2. 首次访问时页面显示 `unauthorized: gateway token missing`，进入左侧 **Control → Overview**
3. 在 **Gateway Token** 输入框中填入 `OPENCLAW_GATEWAY_TOKEN` 的值，点击 **Connect**
4. 页面显示 `pairing required`，在容器内执行以下命令完成设备配对：

   ```bash
   # 查看待批准的设备请求，获取 Request ID
   kubectl exec -n <namespace> <pod-name> -c openclaw -- \
     node dist/index.js devices list

   # 批准设备（替换 <request-id>）
   kubectl exec -n <namespace> <pod-name> -c openclaw -- \
     node dist/index.js devices approve <request-id>
   ```

5. 回到页面点击 **Refresh**，Health 状态变为 `OK`
6. 若 AI 回复报错 `No API key found for provider "anthropic"`，说明默认 Agent 模型使用 Anthropic，需切换为已配置的提供者：

   ```bash
   kubectl exec -n <namespace> <pod-name> -c openclaw -- \
     node dist/index.js config set agents.defaults.model <provider>/<model>
   # 例如：zai/glm-4 或 openai/gpt-4o-mini
   ```

7. 通过 **Chat** 发送消息，确认 AI 响应正常

### 测试 2：检查 Gateway 状态

在 Control Hub 中找到 `openclaw-dev` 的 Pod，进入终端执行：

```bash
node dist/index.js health --token "$OPENCLAW_GATEWAY_TOKEN"
```

### 测试 3：持久化验证

1. 通过 Control Hub **Restart** 工作负载
2. 重启后检查之前的对话记录和配置是否保留

## 实测排查记录

以下问题在首次按本文档部署时实际触发，已将修复结论回写到对应章节，此处汇总备查。

| # | 现象 | 根本原因 | 修复方法 |
| --- | ------ | --------- | --------- |
| 1 | CrashLoopBackOff，重启 40+ 次，日志为空 | `NODE_OPTIONS=--max-old-space-size=4096` 声明 4GB 堆，超出容器 1Gi 限制，OOMKilled（exit code 137） | 删除 `NODE_OPTIONS` 环境变量；内存 limit/request 改为 2Gi（同步更新 OlaresManifest.yaml） |
| 2 | Preview 显示 502，端口连接失败 | Olares Envoy sidecar 使用 `ORIGINAL_DST` 策略，以 Pod IP 转发流量；OpenClaw 默认只绑定 `127.0.0.1`，拒绝连接 | 启动命令加 `--bind lan`，使 Gateway 监听 `0.0.0.0:18789` |
| 3 | Gateway 启动失败：`non-loopback Control UI requires allowedOrigins` | `--bind lan` 后 OpenClaw 要求显式配置允许的请求来源 | 执行 `config set gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback true` |
| 4 | Control UI 无法找到 Token 输入框 | Token 入口在 **Control → Overview** 页的 Gateway Token 字段，不在 Settings → Config | 进入 Overview 页输入 Token 后点 Connect |
| 5 | Connect 后显示 `pairing required` | OpenClaw 将浏览器视为新设备，需 Gateway 端显式批准 | 执行 `devices list` 获取 Request ID，再执行 `devices approve <id>` |
| 6 | AI 回复报错 `No API key found for provider "anthropic"` | Gateway 默认 Agent 模型为 `anthropic/claude-opus-4-6`，但未配置 Anthropic Key | 执行 `config set agents.defaults.model <已配置的提供者>/<模型>` |
| 7 | `config set agent.model` 报错迁移警告 | OpenClaw 新版将 `agent.*` 迁移至 `agents.defaults.*` | 改用 `agents.defaults.model` |

## 下一步

Studio 部署验证通过后，进入 [步骤 2：测试 Provider 机制](./step2-provider-test.md)，验证 OpenClaw 与 Ollama 的内部通信。
