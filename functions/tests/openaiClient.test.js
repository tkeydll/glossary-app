import assert from 'node:assert/strict';
import { chatCompletion } from '../shared/openaiClient.js';

// Basic shape test by mocking client
class MockClient {
  async getChatCompletions(deployment, messages, options) {
    return {
      model: deployment,
      choices: [ { message: { content: '説明: テスト' } } ],
      usage: { promptTokens: 10, completionTokens: 5 }
    };
  }
}

(async () => {
  const client = new MockClient();
  const result = await chatCompletion(client, [ { role: 'user', content: 'Hi'} ]);
  assert.equal(result.content.startsWith('説明'), true);
  assert.equal(result.model, 'glossary-model');
  console.log('openaiClient.test passed');
})();
