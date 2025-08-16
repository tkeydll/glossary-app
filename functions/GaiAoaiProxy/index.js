'use strict';
const { getOpenAIClient, chatCompletion } = require('../shared/openaiClient');

// Markdownや装飾を除去してプレーンテキスト化する簡易サニタイズ
function toPlain(text = '') {
  if (!text) return '';
  return String(text)
    // 見出し #, ##, ### を除去
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    // 箇条書きの先頭記号 -, * を除去
    .replace(/^\s*[-*]\s+/gm, '')
    // 太字/斜体 **text** __text__ *text* _text_ を中身に置換
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // インラインコード/コードブロック `text` ```text``` を中身に置換
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    // リンク [text](url) を text に
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    // テーブル/パイプの装飾を軽く除去
    .replace(/^\|.*\|$/gm, (m) => m.replace(/\|/g, ' ').trim())
    // 連続空行を1つに
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = async function (context, req) {
  try {
    const body = req.body || (req.rawBody ? JSON.parse(req.rawBody) : {});
    // proxy が送る形式(system_prompt, user_prompt) を受け取る
    const { system_prompt, user_prompt, temperature = 0.7, top_p = 0.9, frequency_penalty = 0, presence_penalty = 0 } = body || {};
    if (!user_prompt || typeof user_prompt !== 'string') {
      context.res = { status: 400, body: JSON.stringify({ error: 'user_prompt is required (string)' }) };
      return;
    }
  const systemPrompt = system_prompt || 'あなたは用語集の説明を行うアシスタントです。出力は必ず日本語の平文のみで、Markdown、箇条書き、装飾記号は使用しないでください。対象はIT用語（ソフトウェア、ハードウェア、ネットワーク、データベース、セキュリティ、クラウド、AI、プログラミング、開発運用など）に限定します。入力がIT用語でない場合は「この用語はIT用語ではないため登録できません」とだけ返してください。IT用語の場合は事実ベースで簡潔に、次の順で説明してください。1) 一言サマリ（1文）、2) 詳細説明（2〜4文）、3) 代表例（必要時1〜2例）、4) 関連するIT用語（必要時数語）。見出しや記号は付けず、各項目は改行で区切ってください。';
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

    const plain = toPlain(result.content || '');
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ term: extractedTerm, explanation: plain, model: result.model, usage: result.usage })
    };
  } catch (err) {
    context.log.error(err);
    context.res = { status: err.status || 500, body: JSON.stringify({ error: err.message || 'internal_error' }) };
  }
};
