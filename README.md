# Gumloop 2API

将 Gumloop AI 服务转换为标准 API 格式，支持 Vercel 部署。

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

## 部署到 Vercel

### 1. Fork 或克隆仓库

### 2. 在 Vercel 创建项目

1. 导入 Git 仓库
2. 添加 Vercel KV 存储（Storage -> Create -> KV）
3. 配置环境变量

### 3. 环境变量

```env
# 管理密码
ADMIN_PASSWORD=your_admin_password

# API Key 白名单（可选，逗号分隔）
OPENAI_KEYS=key1,key2,key3

# 默认 Gummie ID（可选）
GUMLOOP_GUMMIE_ID=your_default_gummie_id

# 默认账号密码（用于 Token 刷新）
GUMLOOP_PASSWORD=your_gumloop_password
```

### 4. 部署

```bash
vercel deploy
```

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

打开 `https://your-domain.vercel.app/`，使用管理密码登录。

### 2. 添加 Gumloop 账号

- **Gumloop 登录**：输入 Gumloop 邮箱和密码自动获取 Token
- **手动添加**：直接输入 Gummie ID

### 3. 调用 API

```bash
# OpenAI 格式
curl -X POST https://your-domain.vercel.app/api/v1/chat/completions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'

# Claude 格式
curl -X POST https://your-domain.vercel.app/api/v1/messages \
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

### Gemini 格式

```json
{
  "contents": [{
    "parts": [
      {"text": "描述这张图片"},
      {
        "inline_data": {
          "mime_type": "image/jpeg",
          "data": "/9j/4AAQSkZJRg..."
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

### 相关代码

- `lib/gumloop/image.ts` - 图片上传和提取逻辑
- `lib/gumloop/types.ts` - 图片相关类型定义

## 技术栈

- Next.js 14 (App Router)
- Vercel KV (数据存储)
- WebSocket (ws 库)
- Tailwind CSS
- TypeScript + Zod

## License

MIT
