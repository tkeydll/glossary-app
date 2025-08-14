import { app } from '@azure/functions';
import { getOpenAIClient, chatCompletion } from '../../shared/openaiClient.js';

app.http('explainTerm', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'explainTerm',
  handler: async (request, context) => {
    try {
      const body = await request.json();
      const { term, context: extraContext = '', language = 'ja' } = body || {};
      if (!term || typeof term !== 'string') {
        return {
          status: 400,
          jsonBody: { error: 'term is required (string)' }
        };
      }
      const systemPrompt = `You are an AI that explains glossary terms clearly and concisely for professional documentation. Output in the requested language using markdown. Include: 1) 一言サマリ, 2) 詳細説明, 3) 例 (あれば), 4) 関連用語 (箇条書き). Keep it factual.`;
      const userPrompt = `用語: ${term}\n追加文脈: ${extraContext}\n出力言語: ${language}`;
      const client = getOpenAIClient();
      const result = await chatCompletion(client, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);
      return {
        status: 200,
        jsonBody: {
          term,
          explanation: result.content,
          model: result.model,
          usage: result.usage
        }
      };
    } catch (err) {
      context.error(err);
      const status = err.status || 500;
      return {
        status,
        jsonBody: { error: err.message || 'internal_error' }
      };
    }
  }
});
