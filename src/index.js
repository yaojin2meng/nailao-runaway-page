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
 *   - GET  /v1/models              -> 把那句话按逗号切成多个「模型」返回（4 个）
 *   - GET  /v1/models/{id}         -> 单个模型详情 200
 *   - 其余路径                      -> 静态资源（奶酪公益站同风格闭站通知页）
 */

// ---------------- 文案配置（要改就改这几行） ----------------

/** 调用 /v1 时返回的正文 */
const RUNAWAY_TEXT =
  '对不起，我们跑路啦，推荐付费站：[【castorice】](https://castorice.shop)（https://castorice.shop）';

/** 整句跑路话：/v1/models 里按逗号切开，每一段就是一个模型 */
const RUNAWAY_MODEL_SENTENCE = '对不起,我们跑路了,推荐付费站,https://castorice.shop';

/** 逗号分割出的多个模型 id */
const RUNAWAY_MODELS = RUNAWAY_MODEL_SENTENCE.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

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

function openaiChatStreamResponse(body) {
  const model = pickModel(body);
  const created = Math.floor(Date.now() / 1000);
  const id = uid('chatcmpl-');
  const completionTokens = estimateTokens(RUNAWAY_TEXT);
  const includeUsage = Boolean(body && body.stream_options && body.stream_options.include_usage);

  const chunk = (delta, finish = null) =>
    `data: ${JSON.stringify({
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta, logprobs: null, finish_reason: finish }],
    })}\n\n`;

  const parts = [
    chunk({ role: 'assistant', content: '' }),
    chunk({ content: RUNAWAY_TEXT }),
    chunk({}, 'stop'),
  ];

  if (includeUsage) {
    parts.push(
      `data: ${JSON.stringify({
        id,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [],
        usage: {
          prompt_tokens: 1,
          completion_tokens: completionTokens,
          total_tokens: completionTokens + 1,
        },
      })}\n\n`,
    );
  }

  parts.push('data: [DONE]\n\n');
  return new Response(parts.join(''), { status: 200, headers: SSE_HEADERS });
}

function openaiTextPayload(body) {
  const model = pickModel(body);
  const created = Math.floor(Date.now() / 1000);
  const completionTokens = estimateTokens(RUNAWAY_TEXT);

  return {
    id: uid('cmpl-'),
    object: 'text_completion',
    created,
    model,
    choices: [{ text: RUNAWAY_TEXT, index: 0, logprobs: null, finish_reason: 'stop' }],
    usage: {
      prompt_tokens: 1,
      completion_tokens: completionTokens,
      total_tokens: completionTokens + 1,
    },
  };
}

function openaiTextStreamResponse(body) {
  const model = pickModel(body);
  const created = Math.floor(Date.now() / 1000);
  const id = uid('cmpl-');

  const parts = [
    `data: ${JSON.stringify({
      id,
      object: 'text_completion',
      created,
      model,
      choices: [{ text: RUNAWAY_TEXT, index: 0, logprobs: null, finish_reason: null }],
    })}\n\n`,
    `data: ${JSON.stringify({
      id,
      object: 'text_completion',
      created,
      model,
      choices: [{ text: '', index: 0, logprobs: null, finish_reason: 'stop' }],
    })}\n\n`,
    'data: [DONE]\n\n',
  ];

  return new Response(parts.join(''), { status: 200, headers: SSE_HEADERS });
}

// ---------------- OpenAI Responses API ----------------

function responsesPayload(body) {
  const model = pickModel(body);
  const outTokens = estimateTokens(RUNAWAY_TEXT);

  return {
    id: uid('resp_'),
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    model,
    output: [
      {
        type: 'message',
        id: uid('msg_'),
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: RUNAWAY_TEXT, annotations: [] }],
      },
    ],
    output_text: RUNAWAY_TEXT,
    usage: {
      input_tokens: 1,
      output_tokens: outTokens,
      total_tokens: outTokens + 1,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  };
}

function responsesStreamResponse(body) {
  const full = responsesPayload(body);
  const item = full.output[0];
  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;

  const payload = [
    ev('response.created', { response: { ...full, status: 'in_progress', output: [] } }),
    ev('response.output_item.added', { output_index: 0, item: { ...item, content: [] } }),
    ev('response.output_text.delta', {
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      delta: RUNAWAY_TEXT,
    }),
    ev('response.output_text.done', {
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      text: RUNAWAY_TEXT,
    }),
    ev('response.completed', { response: full }),
  ].join('');

  return new Response(payload, { status: 200, headers: SSE_HEADERS });
}

// ---------------- Anthropic（a÷）格式 ----------------

function anthropicPayload(body) {
  const model = pickModel(body);

  return {
    id: uid('msg_'),
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text: RUNAWAY_TEXT }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 1,
      output_tokens: estimateTokens(RUNAWAY_TEXT),
    },
  };
}

function anthropicStreamResponse(body) {
  const model = pickModel(body);
  const id = uid('msg_');
  const outTokens = estimateTokens(RUNAWAY_TEXT);

  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;

  const payload = [
    ev('message_start', {
      message: {
        id,
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 0 },
      },
    }),
    ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }),
    ev('ping', {}),
    ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: RUNAWAY_TEXT } }),
    ev('content_block_stop', { index: 0 }),
    ev('message_delta', {
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: outTokens },
    }),
    ev('message_stop', {}),
  ].join('');

  return new Response(payload, { status: 200, headers: SSE_HEADERS });
}

function anthropicLegacyPayload(body) {
  return {
    type: 'completion',
    id: uid('compl_'),
    completion: RUNAWAY_TEXT,
    stop_reason: 'stop_sequence',
    model: pickModel(body),
  };
}

// ---------------- /v1/models ----------------

function buildModelItem(id) {
  return {
    id,
    object: 'model',
    type: 'model',
    created: 1786924800,
    created_at: '2026-08-17T00:00:00Z',
    owned_by: 'nailao',
    display_name: id,
    permission: [],
    root: id,
    parent: null,
  };
}

function modelsPayload() {
  const data = RUNAWAY_MODELS.map((id) => buildModelItem(id));

  return {
    object: 'list',
    data,
    has_more: false,
    first_id: data[0].id,
    last_id: data[data.length - 1].id,
  };
}

// ---------------- 路由分发 ----------------

async function handleApi(request, url) {
  // 折掉重复的 /v1 前缀和末尾斜杠，兼容各种客户端奇葩拼接
  const trimmed = url.pathname.replace(/\/+$/, '') || '/';
  const path = trimmed.replace(/^(\/v1)+(?=\/|$)/, '/v1');
  const method = request.method.toUpperCase();

  const isApiRoute =
    path === '/v1' ||
    path.startsWith('/v1/') ||
    path === '/models' ||
    path.startsWith('/models/') ||
    path === '/chat/completions' ||
    path === '/completions' ||
    path === '/messages' ||
    path === '/responses' ||
    path === '/embeddings';

  if (!isApiRoute) return null;

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // 1. /v1/models
  if (path === '/v1/models' || path === '/models') {
    return json(modelsPayload());
  }

  if (path.startsWith('/v1/models/') || path.startsWith('/models/')) {
    const rawId = path.replace(/^\/(?:v1\/)?models\//, '');
    let id = rawId;
    try {
      id = decodeURIComponent(rawId);
    } catch {
      id = rawId;
    }
    return json(buildModelItem(id || RUNAWAY_MODEL));
  }

  const body = await readBody(request);
  const stream = wantsStream(body, url);

  // 2. Anthropic token 计数探针
  if (path.endsWith('/count_tokens')) {
    return json({ input_tokens: 1, output_tokens: 0 });
  }

  // 3. Anthropic legacy complete
  if (path === '/v1/complete') {
    return json(anthropicLegacyPayload(body));
  }

  // 4. Anthropic Messages（a÷ 格式）
  if (isAnthropicRequest(request, path, url)) {
    return stream ? anthropicStreamResponse(body) : json(anthropicPayload(body));
  }

  // 5. OpenAI Responses
  if (path === '/v1/responses' || path === '/responses') {
    return stream ? responsesStreamResponse(body) : json(responsesPayload(body));
  }

  // 6. OpenAI Legacy Completions
  if (path === '/v1/completions' || path === '/completions') {
    return stream ? openaiTextStreamResponse(body) : json(openaiTextPayload(body));
  }

  // 7. Embeddings 兜底 200
  if (path.endsWith('/embeddings')) {
    return json({
      object: 'list',
      data: [{ object: 'embedding', index: 0, embedding: [0] }],
      model: pickModel(body),
      usage: { prompt_tokens: 1, total_tokens: 1 },
    });
  }

  // 8. 其余 /v1、/v1/chat/completions 等一律 OpenAI Chat 200
  return stream ? openaiChatStreamResponse(body) : json(openaiChatPayload(body));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 探活
    if (url.pathname === '/health' || url.pathname === '/healthz' || url.pathname === '/ping') {
      return json({
        status: 'ok',
        closed: true,
        message: RUNAWAY_TEXT,
        models: RUNAWAY_MODELS,
      });
    }

    const apiResponse = await handleApi(request, url);
    if (apiResponse) return apiResponse;

    // 其它请求交给静态资源（闭站通知页）
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response(
      `<!DOCTYPE html><html lang="zh-CN"><meta charset="utf-8"><title>奶酪公益站 · 闭站通知</title>` +
        `<body style="font-family:system-ui;background:#faf4de;color:#311911;padding:48px;line-height:1.7">` +
        `<h1>奶酪公益站 · 闭站通知</h1><p>${RUNAWAY_TEXT}</p></body></html>`,
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...CORS_HEADERS } },
    );
  },
};
