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
// __CONTINUE__
