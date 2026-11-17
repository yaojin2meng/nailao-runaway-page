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
