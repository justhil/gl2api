# Gumloop 2API

将 Gumloop AI 服务转换为标准 API 格式，支持 Deno Deploy 部署。

## 支持的 API 格式

| 端点 | 格式 |
|------|------|
| `POST /api/v1/messages` | Anthropic Claude |
| `POST /api/v1/chat/completions` | OpenAI Chat |
| `POST /api/v1/responses` | OpenAI Responses |
| `POST /api/v1beta/models/{model}:generateContent` | Gemini |
| `POST /api/v1beta/models/{model}:streamGenerateContent` | Gemini Stream |

## 功能支持

| 功能 | 状态 |
|------|------|
| 流式响应 | ✅ |
| 工具调用 (Tool Use) | ✅ |
| 思维链 (Thinking) | ✅ |
| 多账号管理 | ✅ |
| 前端管理界面 | ✅ |
| 图片传入 | ✅ |
| 文件上传 (txt/pdf/docx) | ✅ |
| 请求统计 (日/周/月) | ✅ |
| 多账号额度汇总 | ✅ |

## 部署到 Deno Deploy

### 1. Fork 或克隆仓库

### 2. 配置 GitHub Actions

在仓库 Settings -> Secrets and variables -> Actions 中添加：

- `DENO_DEPLOY_TOKEN`: Deno Deploy 访问令牌

### 3. 环境变量

在 Deno Deploy 项目设置中配置：

```env
# 管理密码
ADMIN_PASSWORD=your_admin_password

# API Key 白名单（可选，逗号分隔）
OPENAI_KEYS=key1,key2,key3
```

### 4. 部署

推送到 main 分支会自动触发 GitHub Actions 部署。

## 本地开发

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local

# 启动开发服务器
npm run dev
```

## 使用方法

### 1. 访问管理界面

打开 `https://your-domain.deno.dev/`，使用管理密码登录。

### 2. 添加 Gumloop 账号

输入 Refresh Token 添加账号，系统会自动：
- 删除账号内已有的所有 Agent
- 为每个支持的模型创建对应的 Agent

#### 获取 Refresh Token

1. 打开 https://www.gumloop.com 并登录
2. 按 `F12` 打开开发者工具
3. 切换到 **Network** (网络) 标签
4. 在筛选框输入 `securetoken.googleapis.com`
5. 随便进行一次对话，触发请求
6. 点击该请求，在 **Response** (响应) 中找到 `refresh_token` 字段
7. 复制该值即为 Refresh Token

### 3. 管理界面功能

- **总额度显示**：汇总所有账号的剩余额度
- **各账号额度**：单独显示每个账号的额度
- **请求统计**：按日/周/月查看各模型的请求次数和 token 消耗
- **全局 System Prompt**：设置后同步到所有 Agent
- **账号管理**：启用/禁用/删除账号
- **Agent 管理**：查看和删除账号下的 Agent

### 4. 调用 API

```bash
# OpenAI 格式
curl -X POST https://your-domain.deno.dev/api/v1/chat/completions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'

# Claude 格式
curl -X POST https://your-domain.deno.dev/api/v1/messages \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 1024
  }'
```

## 图片支持

支持通过各种 API 格式传入图片，图片会自动上传到 Gumloop 并在对话中使用。

### Claude 格式

```json
{
  "model": "claude-sonnet-4-5",
  "messages": [{
    "role": "user",
    "content": [
      {"type": "text", "text": "描述这张图片"},
      {
        "type": "image",
        "source": {
          "type": "base64",
          "media_type": "image/jpeg",
          "data": "/9j/4AAQSkZJRg..."
        }
      }
    ]
  }],
  "max_tokens": 1024
}
```

### OpenAI 格式

```json
{
  "model": "gpt-4-vision-preview",
  "messages": [{
    "role": "user",
    "content": [
      {"type": "text", "text": "描述这张图片"},
      {
        "type": "image_url",
        "image_url": {
          "url": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
        }
      }
    ]
  }]
}
```

### 支持的图片格式

- `image/jpeg`
- `image/png`
- `image/gif`
- `image/webp`

## 文件上传支持

支持上传文档文件，系统会自动提取文本内容：

- `.txt` - 纯文本
- `.pdf` - PDF 文档
- `.docx` - Word 文档
- `.md` - Markdown
- `.json` - JSON 文件

## 技术栈

- Next.js 14 (App Router)
- Deno KV (数据存储)
- WebSocket (ws 库)
- Tailwind CSS
- TypeScript + Zod

## License

MIT
