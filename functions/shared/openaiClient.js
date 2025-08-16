const { OpenAIClient, AzureKeyCredential } = require('@azure/openai');
const { DefaultAzureCredential } = require('@azure/identity');

const endpoint = process.env.OPENAI_ENDPOINT;
const deployment = process.env.OPENAI_DEPLOYMENT;
const apiKey = process.env.OPENAI_API_KEY;

let cachedClient;

function getOpenAIClient() {
  if (cachedClient) return cachedClient;
  if (!endpoint) {
    throw new Error('OPENAI_ENDPOINT not set');
  }
  if (apiKey && apiKey !== 'SET_KEY') {
    cachedClient = new OpenAIClient(endpoint, new AzureKeyCredential(apiKey));
  } else {
    const scope = `${endpoint.replace(/\/$/, '')}/.default`;
    const credential = new DefaultAzureCredential();
    // getBearerTokenProvider for future streaming; simple client still uses keyless via token fetch per call
    cachedClient = new OpenAIClient(endpoint, credential);
  }
  return cachedClient;
}

// Simple chat completion wrapper with retry
async function chatCompletion(client, messages, { maxRetries = 3, temperature = 0.4 } = {}) {
  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  let attempt = 0;
  let lastErr;
  while (attempt < maxRetries) {
    try {
      const resp = await client.getChatCompletions(deployment, messages, { temperature });
      const choice = resp.choices?.[0];
      return {
        content: choice?.message?.content || '',
        model: resp.model || deployment,
        usage: resp.usage
      };
    } catch (e) {
      lastErr = e;
      if (e.statusCode && [429, 500, 503].includes(e.statusCode)) {
        await delay(500 * Math.pow(2, attempt));
        attempt++;
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

module.exports = { getOpenAIClient, chatCompletion };
