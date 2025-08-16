'use strict';
const { getOpenAIClient, chatCompletion } = require('../shared/openaiClient');

module.exports = async function (context, req) {
  try {
    const body = req.body || (req.rawBody ? JSON.parse(req.rawBody) : {});
    // proxy が送る形式(system_prompt, user_prompt) を受け取る
    const { system_prompt, user_prompt, temperature = 0.7, top_p = 0.9, frequency_penalty = 0, presence_penalty = 0 } = body || {};
    if (!user_prompt || typeof user_prompt !== 'string') {
      context.res = { status: 400, body: JSON.stringify({ error: 'user_prompt is required (string)' }) };
      return;
    }
    const systemPrompt = system_prompt || 'You are an AI that explains glossary terms clearly and concisely for professional documentation. Output in the requested language using markdown. Include: 1) 一言サマリ, 2) 詳細説明, 3) 例 (あれば), 4) 関連用語 (箇条書き). Keep it factual.';
    const userPrompt = user_prompt;
    const client = getOpenAIClient();
    const result = await chatCompletion(client, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { temperature });

    // user_prompt から簡易的に用語を抽出 (例: "用語: <term>" の形式)
    let extractedTerm = null;
    try {
      const m = /用語:\s*([^\n\r]+)/i.exec(userPrompt);
      if (m && m[1]) extractedTerm = m[1].trim();
    } catch (e) {
      // ignore
    }

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ term: extractedTerm, explanation: result.content, model: result.model, usage: result.usage })
    };
  } catch (err) {
    context.log.error(err);
    context.res = { status: err.status || 500, body: JSON.stringify({ error: err.message || 'internal_error' }) };
  }
};
