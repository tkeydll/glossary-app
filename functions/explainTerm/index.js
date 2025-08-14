'use strict';
const { getOpenAIClient, chatCompletion } = require('../shared/openaiClient');

module.exports = async function (context, req) {
  try {
    const body = req.body || (req.rawBody ? JSON.parse(req.rawBody) : {});
    const { term, context: extraContext = '', language = 'ja' } = body || {};
    if (!term || typeof term !== 'string') {
      context.res = { status: 400, body: JSON.stringify({ error: 'term is required (string)' }) };
      return;
    }
    const systemPrompt = 'You are an AI that explains glossary terms clearly and concisely for professional documentation. Output in the requested language using markdown. Include: 1) 一言サマリ, 2) 詳細説明, 3) 例 (あれば), 4) 関連用語 (箇条書き). Keep it factual.';
    const userPrompt = `用語: ${term}\n追加文脈: ${extraContext}\n出力言語: ${language}`;
    const client = getOpenAIClient();
    const result = await chatCompletion(client, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ term, explanation: result.content, model: result.model, usage: result.usage })
    };
  } catch (err) {
    context.log.error(err);
    context.res = { status: err.status || 500, body: JSON.stringify({ error: err.message || 'internal_error' }) };
  }
};
