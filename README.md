# 奶酪公益站 · 跑路页 + 假 /v1 接口

Cloudflare Workers 单页跑路站：页面是奶酪公益站（nailao.biz）同款奶油黄主题的闭站跑路通知，
所有 `/v1` 接口永远返回 **HTTP 200**，内容统一为跑路文案。

接口逻辑在 `src/index.js`，页面在 `public/index.html`，两者互不影响 —— 改页面不会动接口。

## 文件结构

```
.
├── wrangler.toml        # Worker + 静态资源配置
├── package.json         # wrangler 依赖与脚本
├── src/index.js         # Worker 路由与全部 API 假响应
└── public/
    ├── index.html       # 跑路页（同风格，深浅色自适应，纯静态无构建）
    └── logo.png         # 站点 logo（128×128）
```

## 页面结构

从上到下：导航 → Hero（状态徽标 / 标题 / 建站·营业天数·赞助统计 / 挂着的 CLOSED 招牌插图）
→ 告别信 → 推荐付费站卡片 → API 现状面板 → 页脚。

API 面板里两个按钮会当场请求本站接口并把原始 JSON 打在终端风输出框里，用来「证明它真的只会回这一句」：

- **试一下 /v1**：`POST /v1`，OpenAI Chat 格式
- **拉取 /v1/models**：`GET /v1/models`，4 个「模型」

另外 Base URL 会按当前域名自动填充并可一键复制，两条接口文案也各带一个复制按钮。

页面特性：

- 零依赖、无构建、单文件内联样式与脚本，Workers 静态资源直接可跑
- 奶油黄主题，跟随系统深浅色（`prefers-color-scheme`）
- 断点 560 / 800px，320px～1600px 实测无横向溢出
- 尊重 `prefers-reduced-motion`，关闭全部动画

## 接口行为

| 请求 | 返回 |
| --- | --- |
| `GET/POST /v1` | OpenAI Chat 格式 200；带 Anthropic 特征时返回 a÷（Anthropic）格式 200 |
| `POST /v1/chat/completions` | OpenAI Chat 200（`stream` 走 SSE） |
| `POST /v1/completions` | OpenAI Legacy Completions 200（`stream` 走 SSE） |
| `POST /v1/responses` | OpenAI Responses API 200（`stream` 走 SSE） |
| `POST /v1/messages` | Anthropic Messages 200（`stream` 走 SSE） |
| `POST /v1/complete` | Anthropic Legacy Complete 200 |
| `POST .../count_tokens` | `{ input_tokens: 1, output_tokens: 0 }` |
| `GET /v1/models` | 4 个「模型」，id 为那句话按逗号切开的各段 |
| `GET /v1/models/{id}` | 单个模型详情 200 |
| `OPTIONS *` | 204 + 全开 CORS |
| `GET /health` | 探活 JSON |

**`/v1/models` 里的 4 个模型 id：**

1. `对不起`
2. `我们跑路了`
3. `推荐付费站`
4. `https://castorice.shop`

**`/v1` 正文统一为：**

```
对不起，我们跑路啦，推荐付费站：[【castorice】](https://castorice.shop)（https://castorice.shop）
```

## 本地开发 / 部署

```bash
npm install        # 安装 wrangler
npm run dev        # 本地预览（wrangler dev）
npm run deploy     # 部署到 Cloudflare Workers
npm run tail       # 实时日志
```

## 改文案

只改 `src/index.js` 顶部两处即可：

```js
const RUNAWAY_TEXT = '...';            // /v1 返回的正文
const RUNAWAY_MODEL_SENTENCE = '...';  // /v1/models 的那句，按逗号自动切成多个模型
```

## 说明

- 不校验任何 API Key，Authorization / x-api-key 随便填。
- 全部接口固定 200，客户端不会因错误码重试或报错。
- 页面 `noindex, nofollow`，不影响 SEO 收录。
