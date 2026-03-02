# 步骤 3：正式打包 OpenClaw 为 OAC

> 目标：将步骤 1（Studio 部署）的验证成果转化为可分发的 Olares Application Chart（OAC），消除 Studio 部署的限制，并支持通过 Olares Market 或本地自定义安装进行部署。

- [步骤 3：正式打包 OpenClaw 为 OAC](#步骤-3正式打包-openclaw-为-oac)
  - [前置条件](#前置条件)
  - [背景知识](#背景知识)
    - [什么是 OAC](#什么是-oac)
    - [OAC 与 Studio 部署的区别](#oac-与-studio-部署的区别)
  - [OAC 目录结构](#oac-目录结构)
  - [打包步骤](#打包步骤)
    - [3.1 创建项目骨架](#31-创建项目骨架)
    - [3.2 编写 Chart.yaml](#32-编写-chartyaml)
    - [3.3 编写 OlaresManifest.yaml](#33-编写-olaresmanifestyaml)
    - [3.4 编写 values.yaml](#34-编写-valuesyaml)
    - [3.5 编写 Deployment 模板](#35-编写-deployment-模板)
    - [3.6 编写 Service 模板](#36-编写-service-模板)
    - [3.7 配置 Ollama 网络访问](#37-配置-ollama-网络访问)
  - [安装与测试](#安装与测试)
    - [3.8 本地自定义安装](#38-本地自定义安装)
    - [3.9 验证检查项](#39-验证检查项)
  - [关键发现记录](#关键发现记录)
  - [下一步](#下一步)
  - [附录 B：提交到 Olares Market](#附录-b提交到-olares-market)
    - [B.1 准备资源文件](#b1-准备资源文件)
    - [B.2 创建 owners 文件](#b2-创建-owners-文件)
    - [B.3 提交 PR](#b3-提交-pr)

## 前置条件

- 步骤 1、2 已完成：OpenClaw Studio 部署和 Ollama 连接验证通过
- 步骤 2 中记录的关键信息（Ollama 端点、可用模型、配置方式）
- 熟悉基本的 Helm Chart 概念（模板变量、values）

## 背景知识

### 什么是 OAC

**OAC（Olares Application Chart）** 是 Olares 的应用打包格式，在标准 Helm Chart 基础上增加了 `OlaresManifest.yaml`，用于声明 Olares 特有的功能：

| Helm Chart 标准部分 | OAC 扩展部分（OlaresManifest.yaml） |
|---------------------|--------------------------------------|
| Chart.yaml — 元数据 | metadata — 应用信息、图标、分类 |
| values.yaml — 参数 | entrances — 入口声明（端口、域名、认证级别） |
| templates/ — K8s 资源 | permission — 存储和跨应用通信权限 |
| | middleware — 托管中间件（PostgreSQL、Redis） |
| | spec — 资源限制、截图、描述 |
| | options — 依赖、网络策略、安装选项 |

### OAC 与 Studio 部署的区别

| 对比项 | Studio 部署 | OAC 正式打包 |
|--------|-------------|--------------|
| 容器数量 | 仅单容器 | 支持多容器（Deployment + Sidecar） |
| 端口暴露 | 仅单端口 | 多入口，每个可独立配置认证级别 |
| 应用名 | 带 `-dev` 后缀 | 正式名称 |
| 环境变量 | 手动逐一填写 | 可通过 `envs` 声明安装时用户配置 |
| 存储 | 手动选择挂载路径 | 使用系统变量自动适配 |
| 跨应用通信 | 无法声明 | 通过 `permission.sysData` / `provider` 声明 |
| 网络策略 | 默认隔离 | 可按需开放端口和跨应用访问 |
| 分发方式 | 仅本机 | 可提交 Market 或本地自定义安装 |

## OAC 目录结构

```
openclaw/
├── Chart.yaml               # Helm 元数据（必须）
├── OlaresManifest.yaml       # Olares 应用声明（必须）
├── values.yaml               # Helm 参数
├── owners                    # 维护者列表（提交 Market 时必须）
├── .helmignore               # 忽略文件
├── i18n/                     # 国际化（可选）
│   ├── en-US/
│   │   └── OlaresManifest.yaml
│   └── zh-CN/
│       └── OlaresManifest.yaml
└── templates/                # Kubernetes 资源模板
    ├── deployment.yaml       # Deployment + 容器定义
    └── service.yaml          # Service 定义
```

## 打包步骤

### 3.1 创建项目骨架

```bash
mkdir -p openclaw/templates openclaw/i18n/en-US openclaw/i18n/zh-CN
touch openclaw/Chart.yaml
touch openclaw/OlaresManifest.yaml
touch openclaw/values.yaml
touch openclaw/owners
touch openclaw/.helmignore
touch openclaw/templates/deployment.yaml
touch openclaw/templates/service.yaml
```

### 3.2 编写 Chart.yaml

```yaml
apiVersion: v2
name: openclaw
description: OpenClaw - Personal AI Assistant on Olares
type: application
version: '0.1.0'          # OAC 包版本，必须与 OlaresManifest 中的 metadata.version 一致
appVersion: "latest"       # 对应 OpenClaw 上游版本
```

> **重要**：`version` 字段必须与 `OlaresManifest.yaml` 中 `metadata.version` 完全一致。每次更新 OAC 都需要递增此版本号。

### 3.3 编写 OlaresManifest.yaml

```yaml
olaresManifest.version: '0.10.0'
olaresManifest.type: app

metadata:
  name: openclaw
  description: Personal AI assistant with multi-model support
  icon: https://raw.githubusercontent.com/anthropics/anthropic-cookbook/main/misc/favicon.png  # 替换为实际图标
  appid: openclaw
  version: '0.1.0'
  title: OpenClaw
  categories:
    - Productivity

entrances:
  - name: openclaw-gateway
    port: 18789
    host: openclaw-svc
    title: OpenClaw
    icon: https://raw.githubusercontent.com/anthropics/anthropic-cookbook/main/misc/favicon.png
    authLevel: private        # 内外网均需认证
    openMethod: window

permission:
  appData: true               # 持久化配置和会话数据（/app/data，JuiceFS）
  appCache: true              # 本地缓存（/app/cache，本地磁盘）

spec:
  versionName: 'latest'
  fullDescription: |
    OpenClaw 是一个个人 AI 助手，支持多模型提供者（Anthropic、OpenAI、Ollama 等），
    可通过 Web UI、Telegram、Discord 等多种渠道进行对话。
  developer: OpenClaw
  submitter: OpenClaw
  locale:
    - en-US
    - zh-CN
  requiredMemory: 256Mi
  limitedMemory: 2Gi
  requiredDisk: 128Mi
  limitedDisk: 5Gi
  requiredCpu: 0.2
  limitedCpu: 2
  supportArch:
    - amd64
    - arm64

# 安装时由用户填写的环境变量
envs:
  - envName: OPENCLAW_GATEWAY_TOKEN
    type: password
    required: true
    editable: false
    description: "Gateway 认证令牌，建议使用 openssl rand -hex 32 生成"

  - envName: ANTHROPIC_API_KEY
    type: password
    required: false
    editable: true
    description: "Anthropic Claude API Key（可选）"

  - envName: OPENAI_API_KEY
    type: password
    required: false
    editable: true
    description: "OpenAI API Key（可选）"

  - envName: GEMINI_API_KEY
    type: password
    required: false
    editable: true
    description: "Google Gemini API Key（可选）"

options:
  dependencies:
    - name: olares
      type: system
      version: '>=1.10.1-0'
```

> **关键改进**：
>
> - `envs` 声明使 API Key 可在安装时通过 UI 配置，无需手动进入 Pod 设置环境变量
> - `OPENCLAW_GATEWAY_TOKEN` 设为 `editable: false`，安装后不可更改，避免令牌泄露
> - `authLevel: private` 确保 Web UI 必须经过 Olares 认证才能访问

### 3.4 编写 values.yaml

```yaml
# Olares 系统会自动注入以下变量（无需手动配置）：
#   .Values.userspace.appData   — 持久化数据路径
#   .Values.userspace.appCache  — 本地缓存路径
#   .Values.bfl.username        — 当前用户名
#   .Values.olaresEnv.*         — envs 中声明的用户配置
```

> `values.yaml` 可以为空或只包含注释。Olares 系统会在安装时自动注入 `.Values.userspace.*`、`.Values.bfl.*`、`.Values.olaresEnv.*` 等变量，无需手动定义。

### 3.5 编写 Deployment 模板

`templates/deployment.yaml`：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}
  namespace: {{ .Release.Namespace }}
  labels:
    app: openclaw
spec:
  replicas: 1
  selector:
    matchLabels:
      app: openclaw
  strategy:
    type: Recreate             # 有状态应用使用 Recreate 避免双实例冲突
  template:
    metadata:
      labels:
        app: openclaw
    spec:
      initContainers:
        # OpenClaw 容器以 node 用户（uid 1000）运行，需确保数据目录权限正确
        - name: init-permissions
          image: "docker.io/beclab/aboveos-busybox:1.37.0"
          command:
            - sh
            - '-c'
            - |
              mkdir -p /data/config /data/workspace
              chown -R 1000:1000 /data/config /data/workspace
          volumeMounts:
            - name: config-data
              mountPath: /data/config
            - name: workspace-data
              mountPath: /data/workspace
          securityContext:
            runAsUser: 0
        # init-config：写入必要的 gateway 配置，并根据可用 API Key 自动选择默认模型
        - name: init-config
          image: "ghcr.io/openclaw/openclaw:latest"
          command:
            - sh
            - '-c'
            - |
              node dist/index.js config set \
                gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback true

              if [ -n "$ZAI_API_KEY" ]; then
                node dist/index.js config set agents.defaults.model zai/glm-4
              elif [ -n "$OPENAI_API_KEY" ]; then
                node dist/index.js config set agents.defaults.model openai/gpt-4o
              fi
          env:
            - name: HOME
              value: "/home/node"
            - name: ANTHROPIC_API_KEY
              value: "{{ .Values.olaresEnv.ANTHROPIC_API_KEY }}"
            - name: OPENAI_API_KEY
              value: "{{ .Values.olaresEnv.OPENAI_API_KEY }}"
            - name: ZAI_API_KEY
              value: "{{ .Values.olaresEnv.ZAI_API_KEY }}"
          volumeMounts:
            - name: config-data
              mountPath: /home/node/.openclaw
      containers:
        - name: openclaw
          image: "ghcr.io/openclaw/openclaw:latest"
          command:
            - node
            - dist/index.js
            - gateway
            - "--bind"
            - "lan"
            - "--port"
            - "18789"
          ports:
            - containerPort: 18789
              name: gateway
          env:
            - name: HOME
              value: "/home/node"
            - name: TERM
              value: "xterm-256color"
            - name: OPENCLAW_GATEWAY_TOKEN
              value: "{{ .Values.olaresEnv.OPENCLAW_GATEWAY_TOKEN }}"
            - name: ANTHROPIC_API_KEY
              value: "{{ .Values.olaresEnv.ANTHROPIC_API_KEY }}"
            - name: OPENAI_API_KEY
              value: "{{ .Values.olaresEnv.OPENAI_API_KEY }}"
            - name: GEMINI_API_KEY
              value: "{{ .Values.olaresEnv.GEMINI_API_KEY }}"
          resources:
            requests:
              cpu: 200m
              memory: 256Mi
            limits:
              cpu: 2000m
              memory: 2Gi
          volumeMounts:
            - name: config-data
              mountPath: /home/node/.openclaw
            - name: workspace-data
              mountPath: /home/node/.openclaw/workspace
      volumes:
        - name: config-data
          hostPath:
            path: "{{ .Values.userspace.appData }}/config"
            type: DirectoryOrCreate
        - name: workspace-data
          hostPath:
            path: "{{ .Values.userspace.appData }}/workspace"
            type: DirectoryOrCreate
```

> **与 Studio 部署的对应关系**：
>
> | Studio 手动配置 | OAC 模板实现 |
> |----------------|-------------|
> | Image: `ghcr.io/openclaw/openclaw:latest` | `containers[].image` |
> | Port: `18789` | `containers[].ports[].containerPort` |
> | 环境变量逐一填写 | `env` 引用 `.Values.olaresEnv.*` |
> | Storage Volume: `/app/data/config` → `/home/node/.openclaw` | `hostPath` 使用 `.Values.userspace.appData` |
> | Storage Volume: `/app/data/workspace` → `/home/node/.openclaw/workspace` | 同上 |

### 3.6 编写 Service 模板

`templates/service.yaml`：

```yaml
apiVersion: v1
kind: Service
metadata:
  name: openclaw-svc              # 必须与 OlaresManifest entrances[].host 一致
  namespace: {{ .Release.Namespace }}
spec:
  type: ClusterIP
  selector:
    app: openclaw
  ports:
    - protocol: TCP
      name: gateway
      port: 18789                 # 必须与 OlaresManifest entrances[].port 一致
      targetPort: 18789
```

> **Service 名称 `openclaw-svc`** 是连接 OlaresManifest 入口声明和 Kubernetes 网络的桥梁：
>
> ```
> 用户浏览器 → Olares 网关 → Service(openclaw-svc:18789) → Pod(openclaw:18789)
>                              ↑
>                  OlaresManifest.entrances[].host + port
> ```

### 3.7 配置 Ollama 网络访问

在步骤 2 中，我们通过 Ollama 的外部端点（HTTPS 域名）验证了连接。正式打包时有两种方案：

**方案 1：继续使用外部端点（推荐，与步骤 2 一致）**

无需修改 OlaresManifest，用户安装后在 OpenClaw 中手动配置 Ollama 端点地址。优点是简单，无额外权限声明。

**方案 2：通过 K8s 内部服务直连**

在 `OlaresManifest.yaml` 中添加 Provider 权限声明，允许 OpenClaw 直接访问 Ollama 的内部服务：

```yaml
# 在 OlaresManifest.yaml 的 permission 部分添加：
permission:
  appData: true
  appCache: true
  sysData:
    - dataType: legacy_ollama
      appName: ollama
      svc: ollama
      port: 11434
      group: api.ollama
      version: v2
      ops:
        - All
```

> **方案选择建议**：当前阶段推荐方案 1。方案 2 的 `sysData` 值（`dataType`、`group`、`ops`）需要与 Ollama 在 Olares 中的 ProviderRegistry 完全匹配，具体值可参考[步骤 2 附录 A](./step2-provider-test.md#附录-a通过-provider-机制验证) 中的查看方法。

## 安装与测试

### 3.8 本地自定义安装

OAC 打包完成后，可通过 Olares Market 的 **上传自定义 Chart** 功能在本地测试，无需提交到 Market。

#### 第一步：打包 OAC 目录为压缩包

```bash
# 在项目根目录执行（格式支持 .zip / .tgz / .tar / .gz）
tar -czf openclaw-0.1.0.tgz openclaw/
```

> 如已安装 helm，也可使用 `helm package openclaw/`，效果相同。

#### 第二步：上传到 Olares Market

1. 打开 Olares **Market** 应用
2. 点击左侧边栏底部的 **我的 Olares**
3. 点击右上角的 **上传自定义 Chart**，选择 `openclaw-0.1.0.tgz` 文件
4. 系统弹出环境变量配置窗口，填写以下内容：
   - `OPENCLAW_GATEWAY_TOKEN`（必填）— 用 `openssl rand -hex 32` 生成
   - `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `ZAI_API_KEY`（可选）
5. 点击继续安装，等待状态变为 Running

> 已上传的自定义应用可在 **我的 Olares → 上传** 页签查看和管理。

安装后，OpenClaw 将以正式应用身份运行（不带 `-dev` 后缀），命名空间格式为 `openclaw-<username>`。

### 3.9 验证检查项

- [x] 应用安装成功，状态为 Running
- [x] 通过入口域名访问 OpenClaw Web UI（需 Olares 认证）
- [x] `OPENCLAW_GATEWAY_TOKEN` 等环境变量正确注入
- [x] 使用已配置的 LLM 提供者正常对话
- [ ] 数据在 Pod 重启后保持持久化
- [ ] （可选）通过 Ollama 端点调用本地模型正常

## 关键发现记录

- [x] OAC 包版本号：`0.1.0`
- [x] `envs` 机制是否正常（安装时 UI 提示填写环境变量）：**是**，仅提示必填项（`required: true`），可选项不弹窗
- [x] 与 Studio 部署相比新发现的差异：见下方实测排查记录

### 实测排查记录

| # | 现象 | 原因 | 解决方案 |
| --- | --- | --- | --- |
| 1 | 安装时环境变量窗口只出现 `OPENCLAW_GATEWAY_TOKEN` | `required: false` 的 env 不强制弹窗，需安装后手动注入 | ✅ 已自动化：`init-config` 读取 env var 自动切换默认模型 |
| 2 | Chat 提示 "no api key for anthropic" | 默认模型为 `anthropic/claude-opus-4-6`，未配置 Anthropic Key | ✅ 已自动化：`init-config` 按优先级 ZAI → OpenAI → Anthropic 自动选模型 |
| 3 | `config set` 提示需重启网关 | OpenClaw 配置变更不热加载 | ✅ 已自动化：配置在 init container 写入，主容器启动时即生效 |
| 4 | Pod 重启后需重新完成 Token 配对 | OpenClaw 安全设计，设备需显式授权 | ⚠️ 无法消除：每次重启后需 Control → Overview Connect，再 `devices approve` |

## 下一步

OAC 打包验证通过后，进入 [步骤 4：开发 ClawRun Web UI 应用](./step4-clawrun-webui.md)，构建统一管理 OpenClaw 和 Ollama 的 Web 界面。

---

## 附录 B：提交到 Olares Market

> 当 OAC 在本地测试稳定后，可以提交到 Olares Market 供其他用户安装。

### B.1 准备资源文件

提交 Market 需要准备以下资源：

| 资源 | 格式 | 尺寸 | 大小限制 |
|------|------|------|----------|
| 应用图标 | PNG / WEBP | 256×256 px | 512 KB |
| 截图（至少 2 张） | JPEG / PNG / WEBP | 1440×900 px | 8 MB / 张 |
| 封面图 | JPEG / PNG / WEBP | 1440×900 px | 8 MB |

将图标和截图 URL 填入 `OlaresManifest.yaml` 的 `metadata.icon`、`spec.featuredImage`、`spec.promoteImage` 字段。

### B.2 创建 owners 文件

```yaml
owners:
  - 'your-github-username'
```

列出有权限提交此应用的 GitHub 用户名。

### B.3 提交 PR

1. Fork [beclab/apps](https://github.com/beclab/apps) 仓库
2. 将 `openclaw/` 目录放到仓库根目录
3. 创建 **Draft PR**，标题格式：`[NEW][openclaw][0.1.0]OpenClaw - Personal AI Assistant`
4. GitBot 自动验证 PR，根据反馈修复问题
5. 所有检查通过后 PR 自动合并，应用上架 Market

> **注意事项**：
>
> - 每个应用同一时间只能有一个未合并的 PR
> - 提交者必须在 `owners` 文件中
> - `Chart.yaml` 和 `OlaresManifest.yaml` 中的版本号必须一致
> - 后续更新使用 `[UPDATE][openclaw][0.2.0]` 格式的 PR 标题
