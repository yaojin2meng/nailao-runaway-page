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
        `<h1>奶酪公益站 · 闭站通知</h1><p>对不起，我们跑路啦，推荐付费站：<a href="https://castorice.shop">【castorice】（https://castorice.shop）</a></p>` +
        `<p>聊天交流群 <a href="https://qm.qq.com/q/g4RHN2DcEU">1136508519</a></p></body></html>`,
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...CORS_HEADERS } },
    );
  },
};
