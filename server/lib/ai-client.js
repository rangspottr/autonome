/**
 * Shared AI client — routes calls to Anthropic or OpenAI based on provider.
 * All AI call sites should use this module instead of inline fetch() calls.
 */

export const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-4-20250514';
export const OPENAI_DEFAULT_MODEL = 'gpt-4o';

/**
 * Call the configured AI provider.
 *
 * @param {Object} params
 * @param {string} params.provider     - 'anthropic' | 'openai'
 * @param {string} params.apiKey       - The provider API key
 * @param {string} params.model        - The model identifier
 * @param {string} params.system       - System prompt
 * @param {Array}  params.messages     - Message array [{ role, content }]
 * @param {number} [params.maxTokens=2048] - Max tokens for the response
 * @returns {Promise<{ text: string|null, inputTokens: number|null, provider: string|null }>}
 */
export async function callAI({ provider, apiKey, model, system, messages, maxTokens = 2048 }) {
  if (!provider || !apiKey) return { text: null, inputTokens: null, provider: null };

  try {
    if (provider === 'anthropic') {
      return await callAnthropic({ apiKey, model: model || ANTHROPIC_DEFAULT_MODEL, system, messages, maxTokens });
    }
    if (provider === 'openai') {
      return await callOpenAI({ apiKey, model: model || OPENAI_DEFAULT_MODEL, system, messages, maxTokens });
    }
    console.error('[AI] Unknown provider:', provider);
    return { text: null, inputTokens: null, provider: null };
  } catch (err) {
    console.error(`[AI] ${provider} call error:`, err.message);
    return { text: null, inputTokens: null, provider: null };
  }
}

async function callAnthropic({ apiKey, model, system, messages, maxTokens }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
  });

  if (!res.ok) {
    console.error('[AI] Anthropic API error:', res.status);
    return { text: null, inputTokens: null, provider: 'anthropic' };
  }

  const data = await res.json();
  return {
    text: data.content?.[0]?.text || null,
    inputTokens: data.usage?.input_tokens ?? null,
    provider: 'anthropic',
  };
}

async function callOpenAI({ apiKey, model, system, messages, maxTokens }) {
  const openaiMessages = [
    { role: 'system', content: system },
    ...messages,
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages: openaiMessages, max_tokens: maxTokens }),
  });

  if (!res.ok) {
    console.error('[AI] OpenAI API error:', res.status);
    return { text: null, inputTokens: null, provider: 'openai' };
  }

  const data = await res.json();
  return {
    text: data.choices?.[0]?.message?.content || null,
    inputTokens: data.usage?.prompt_tokens ?? null,
    provider: 'openai',
  };
}
