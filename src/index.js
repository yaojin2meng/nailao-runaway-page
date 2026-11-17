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
 *   - GET  /v1/models              -> 返回单个「模型」：castorice（推荐付费站）
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
 * 所有推荐付费站合为一个模型 —— castorice（https://castorice.shop）
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
