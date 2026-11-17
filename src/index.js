/**
 * 奶酪公益站 · 闭站通知 & /v1 告别回执 Worker
 */

// ---------------- 文案配置 ----------------

/** 调用 /v1 时返回的正文 */
const RUNAWAY_TEXT =
  '对不起，我们跑路啦，推荐付费站：[【castorice】](https://castorice.shop)（https://castorice.shop）\n' +
  '聊天交流群[1136508519](https://qm.qq.com/q/g4RHN2DcEU)';

/** 所有推荐付费站合为一个模型 —— castorice（https://castorice.shop） */
const RUNAWAY_MODELS = ['castorice (https://castorice.shop)'];

const RUNAWAY_MODEL = RUNAWAY_MODELS[0];

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

function estimateTokens(text) {
  return Math.max(1, Math.ceil([...String(text)].length / 1.5));
}

function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

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
        message: { role: 'assistant', content: RUNAWAY_TEXT, refusal: null },
        logprobs: null,
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 1,
      completion_tokens: completionTokens,
      total_tokens: completionTokens + 1,
    },
    system_fingerprint: 'fp_nailao_farewell',
  };
}
