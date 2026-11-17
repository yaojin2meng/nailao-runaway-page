/**
 * 奶酪公益站 · 闭站通知 & /v1 告别回执 Worker
 *
 * 行为约定（全部返回 HTTP 200，不校验任何 key）：
 *   - ANY  /v1                     -> OpenAI 格式 200；若请求带 Anthropic 特征则返回 a÷(Anthropic) 格式 200
 *   - POST /v1/chat/completions    -> OpenAI Chat Completions 200（支持 stream）
 *   - POST /v1/completions         -> OpenAI Legacy Completions 200（支持 stream）
 *   - POST /v1/responses           -> OpenAI Responses API 200（支持 stream）
 *   - POST /v1/messages            -> Anthropic Messages 200（支持 stream）
 *   - POST /v1/complete            -> Anthropic Legacy Complete 200
 *   - GET  /v1/models              -> 返回合并后的单个「模型」：castorice（推荐付费站）
 *   - GET  /v1/models/{id}         -> 单个模型详情 200
 *   - 其余路径                      -> 静态资源（奶酪公益站同风格闭站通知页）
 */

// ---------------- 文案配置（要改就改这几行） ----------------

/** 调用 /v1 时返回的正文 */
const RUNAWAY_TEXT =
  '对不起，我们跑路啦，推荐付费站：[【castorice】](https://castorice.shop)（https://castorice.shop）\n' +
  '聊天交流群[1136508519](https://qm.qq.com/q/g4RHN2DcEU)';

/**
 * /v1/models 里暴露的模型 id 列表。
 * 按要求：所有推荐付费站合为一个模型 —— castorice（https://castorice.shop）
 */
const RUNAWAY_MODELS = ['castorice (https://castorice.shop)'];

/** 请求体没带 model 时回填的默认值 */
const RUNAWAY_MODEL = RUNAWAY_MODELS[0];

// ----------------------------------------------------

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': '*',
  'access-control-max-age': '86400',
};

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  ...CORS_HEADERS,
};

const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-store',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
  ...CORS_HEADERS,
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

/** 粗略 token 估算，够用就行 */
function estimateTokens(text) {
  return Math.max(1, Math.ceil([...String(text)].length / 1.5));
}

function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** 安全读 body：JSON / 纯文本 / 空 body 都不报错 */
async function readBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return {};
  try {
    const text = await request.text();
    if (!text) return {};
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return { __raw: text };
    }
  } catch {
    return {};
  }
}

function pickModel(body) {
  const m = body && (body.model || body.model_id);
  return typeof m === 'string' && m.trim() ? m.trim() : RUNAWAY_MODEL;
}

function wantsStream(body, url) {
  if (body && body.stream === true) return true;
  if (url && url.searchParams.get('stream') === 'true') return true;
  return false;
}

/**
 * 是否走 Anthropic（a÷）格式：
 *   1. 路径是 /v1/messages 或 /v1/complete
 *   2. ?format=anthropic / claude
 *   3. 带 anthropic-version / anthropic-beta 头，或只有 x-api-key 没有 Authorization
 */
function isAnthropicRequest(request, path, url) {
  if (path === '/v1/messages' || path === '/messages' || path === '/v1/complete') return true;

  const fmt = (url.searchParams.get('format') || '').toLowerCase();
  if (fmt === 'anthropic' || fmt === 'claude') return true;

  const headers = request.headers;
  if (headers.has('anthropic-version') || headers.has('anthropic-beta')) return true;
  if (headers.has('x-api-key') && !headers.has('authorization')) return true;
  return false;
}

// ---------------- OpenAI 格式 ----------------

function openaiChatPayload(body) {
  const model = pickModel(body);
  const created = Math.floor(Date.now() / 1000);
  const completionTokens = estimateTokens(RUNAWAY_TEXT);

  return {
    id: uid('chatcmpl-'),
    object: 'chat.completion',
    created,
    model,
    choices: [
      {
        index: 0,
