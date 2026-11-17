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
// __CONTINUE__
