# 步骤 2：验证 OpenClaw 连接 Ollama

> 目标：验证在 Olares 上，OpenClaw 能通过 Ollama 外部端点调用本地模型服务。

- [步骤 2：验证 OpenClaw 连接 Ollama](#步骤-2验证-openclaw-连接-ollama)
  - [前置条件](#前置条件)
  - [背景知识](#背景知识)
    - [Olares 的网络隔离](#olares-的网络隔离)
    - [Ollama 在 Olares 中的端点](#ollama-在-olares-中的端点)
  - [验证步骤](#验证步骤)
    - [2.1 获取 Ollama 端点](#21-获取-ollama-端点)
    - [2.2 确认 Ollama 中有可用模型](#22-确认-ollama-中有可用模型)
    - [2.3 配置 OpenClaw 连接 Ollama](#23-配置-openclaw-连接-ollama)
    - [2.4 测试对话](#24-测试对话)
    - [2.5 验证检查项](#25-验证检查项)
  - [关键发现记录](#关键发现记录)
  - [下一步](#下一步)
  - [附录 A：通过 Provider 机制验证](#附录-a通过-provider-机制验证)
    - [A.1 在 Studio 中编辑 OlaresManifest](#a1-在-studio-中编辑-olaresmanifest)
    - [A.2 查看 Ollama 的 ProviderRegistry](#a2-查看-ollama-的-providerregistry)
    - [A.3 重新部署](#a3-重新部署)
    - [A.4 配置 OpenClaw 使用内部端点](#a4-配置-openclaw-使用内部端点)
    - [A.5 替代方案：直接服务发现](#a5-替代方案直接服务发现)

## 前置条件

- 步骤 1 已完成：OpenClaw 已通过 Studio 部署并正常运行
- Ollama 已从 Market 安装（Shared App）
- Ollama 中已下载至少一个模型（如 `llama3.2`、`qwen2.5`）

> **实测说明：本步骤已跳过。**
> Olares Market 中的 Ollama 安装时检查 GPU 资源，当前集群无 GPU，安装失败。
> 步骤 1 已验证 OpenClaw 可通过云端 LLM（ZAI / OpenAI）正常工作，核心部署流程通过。
> Ollama 集成验证待有 GPU 资源时补充，或在步骤 3 OAC 打包完成后通过 Studio 部署 CPU-only Ollama 镜像进行替代验证。

## 背景知识

### Olares 的网络隔离

Olares 中每个应用运行在独立的 Kubernetes 命名空间，默认**禁止跨命名空间直接通信**。OpenClaw 无法直接通过 Ollama 的内部服务地址访问其 API，必须通过以下两种方式之一：

| 方式 | 原理 | 适用场景 |
|------|------|---------|
| **Ollama 外部端点** | 通过 Olares 分配的 HTTPS 域名访问 | 快速验证、不需改 manifest |
| **Provider 机制（sysData）** | 通过 system-server 代理转发请求 | 需要权限控制的正式集成 |

当前阶段（Studio 部署）使用**外部端点**方式验证，Provider 机制的详细说明见[附录 A](#附录-a通过-provider-机制验证)。

### Ollama 在 Olares 中的端点

Ollama 安装后会获得一个外部可访问的端点：

- **格式**：`https://<routeID>.<username>.olares.com`
- **OpenAI 兼容**：在端点后追加 `/v1`
- **认证级别**：默认 Internal（局域网/VPN 内免登录）
- **查看方式**：Olares Settings > Applications > Ollama > Ollama API

## 验证步骤

### 2.1 获取 Ollama 端点

在 Olares 中进入 **Settings > Applications > Ollama**，找到 **Ollama API** 地址，格式类似：

```
https://a1b2c3d4.alice123.olares.com
```

### 2.2 确认 Ollama 中有可用模型

在 Control Hub 中找到 Ollama 的 Pod，进入终端执行。操作路径：

> **Control Hub > Workloads** > 找到 Ollama 所在的命名空间（格式为 `ollama-<username>`）> 展开 Deployment > 点击对应的 Pod > **Terminal**

在终端中执行：

```bash
ollama list            # 查看已下载的模型
ollama pull qwen2.5    # 如果没有模型，下载一个
```

### 2.3 配置 OpenClaw 连接 Ollama

在 OpenClaw 的 Pod 终端中执行。操作路径：

> **Control Hub > Workloads** > 找到 OpenClaw 所在的命名空间（格式为 `openclaw-dev-<username>`）> 展开 Deployment > 点击对应的 Pod > **Terminal**

执行以下命令：

```bash
node dist/index.js config set models.providers.ollama.baseUrl "https://a1b2c3d4.alice123.olares.com"
node dist/index.js config set models.providers.ollama.apiKey "ollama"
```

> 将 `https://a1b2c3d4.alice123.olares.com` 替换为实际的 Ollama 端点地址。
> `apiKey` 填写任意字符串即可（Ollama 不验证 API Key）。

### 2.4 测试对话

```bash
# 使用 Ollama 模型发送测试消息
node dist/index.js agent --message "Hello, what model are you?" --model ollama/qwen2.5
```

或者在 OpenClaw Web UI 中切换模型为 `ollama/qwen2.5` 后发送消息。

### 2.5 验证检查项

- [ ] OpenClaw 能列出 Ollama 中可用的模型
- [ ] 使用 Ollama 模型能正常对话
- [ ] 响应延迟在可接受范围内

## 关键发现记录

完成测试后，记录以下信息供后续步骤使用：

- [ ] Ollama 外部端点地址：`___________________________`
- [ ] Ollama 中可用的模型列表：`___________________________`
- [ ] OpenClaw 配置 Ollama 的方式是否生效：是 / 否
- [ ] 遇到的问题和解决方案：`___________________________`

## 下一步

验证通过后，进入 [步骤 3：正式打包 OpenClaw 为 OAC](./step3-oac-packaging.md)，将 Studio 部署转化为可分发的 Olares 应用包。

---

## 附录 A：通过 Provider 机制验证

> 此方案模拟正式的 Olares 应用间通信，需要修改 OlaresManifest。适合在步骤 3（OAC 打包）之后使用。

### A.1 在 Studio 中编辑 OlaresManifest

Studio 部署后会自动生成 `OlaresManifest.yaml`。在 Studio 中打开该文件，添加 `sysData` 权限声明：

```yaml
permission:
  sysData:
    - appName: ollama
      port: 11434
      version: v2
      dataType: legacy_ollama
      group: api.ollama
      ops:
        - AppApi
```

> 注意：`dataType`、`group`、`ops` 的实际值需要与 Ollama 在 Olares 中注册的 ProviderRegistry 一致。
> 可通过 Control Hub > Resource Configurations > CRDs > `sys.bytetrade.io` > `ProviderRegistry` 查看 Ollama 的实际注册信息。

### A.2 查看 Ollama 的 ProviderRegistry

在 Control Hub 终端中执行：

```bash
kubectl get providerregistry -A | grep ollama
```

记下输出中的 `dataType`、`group`、`opApis` 值，确保 A.1 中的声明匹配。

### A.3 重新部署

在 Studio 中点击 **Apply** 重新部署 OpenClaw，使新的权限声明生效。

### A.4 配置 OpenClaw 使用内部端点

> **什么是 system-server？**
>
> `system-server` 是 Olares OS 的核心系统服务，运行在每个用户的 `user-system-{username}` 命名空间中，
> 承担以下职责：
>
> ```
> ┌─────────────┐      请求 + 凭证       ┌─────────────────┐      代理转发       ┌──────────┐
> │  OpenClaw   │ ───────────────────→ │  system-server  │ ──────────────→ │  Ollama  │
> │  (消费者)    │ ←─────────────────── │  (权限网关)      │ ←────────────── │  (提供者) │
> └─────────────┘      响应结果          └─────────────────┘      响应结果      └──────────┘
> ```
>
> | 职责 | 说明 |
> |------|------|
> | **权限网关** | 所有跨应用 API 调用必须经过 system-server，由它验证调用方是否有权限访问目标应用 |
> | **凭证管理** | 应用安装时自动注入 `OS_APP_KEY` 和 `OS_APP_SECRET`，调用方用这些凭证生成临时令牌 |
> | **请求代理** | 验证通过后，system-server 将请求转发到目标应用的内部服务端点 |
> | **系统 API** | 提供应用安装/卸载（`service.appstore`）、通知、搜索、DID 等系统级操作的统一入口 |
>
> 调用流程：
>
> 1. **生成令牌**：用 `OS_APP_KEY` + 时间戳 + `OS_APP_SECRET` 做 bcrypt 哈希
> 2. **换取 access token**：`POST http://${OS_SYSTEM_SERVER}/permission/v1alpha1/access`（有效期 5 分钟）
> 3. **调用目标 API**：携带 `X-Access-Token` 请求 system-server 的代理路径

部署后，system-server 会向 OpenClaw 容器注入以下环境变量：

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `OS_SYSTEM_SERVER` | system-server 的内部地址 | `system-server.user-system-alice` |
| `OS_APP_KEY` | 当前应用的标识 | `openclaw-dev-abcd1234` |
| `OS_APP_SECRET` | 当前应用的密钥 | `(自动生成的随机字符串)` |

OpenClaw 可通过 system-server 代理调用 Ollama API：

```
http://${OS_SYSTEM_SERVER}/system-server/v1alpha1/legacy_ollama/api.ollama/v2/AppApi
```

但由于 OpenClaw 使用标准的 Ollama HTTP API（`/api/chat`、`/api/tags`），而 system-server 代理是面向 RPC 风格的接口（按 `dataType/group/version/op` 路由），两者协议不完全匹配。

**实际建议**：system-server 代理更适合应用间的结构化 RPC 调用（如安装应用、发送通知）。对于 Ollama 这类提供标准 REST API 的服务，外部端点或 Olares 内部服务直连（需要在 OAC 正式打包时通过网络策略开放）是更实用的路径。

### A.5 替代方案：直接服务发现

如果 OpenClaw 和 Ollama 的网络策略允许通信（例如通过正式 OAC 打包时配置），可以使用 Ollama 的 K8s 内部服务地址：

```
http://ollama-svc.ollama-<username>:11434
```

这需要在步骤 3（正式打包 OAC）中通过 Helm 模板和网络策略来实现。
