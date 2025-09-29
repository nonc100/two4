const fetch = require('node-fetch');

const USE_LLM = String(process.env.USE_LLM || '').toLowerCase() === 'true';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

function isEnabled() {
  return USE_LLM && OPENAI_API_KEY;
}

async function rewriteForecast({ narrative, context = {} }) {
  if (!isEnabled()) {
    return null;
  }

  const cleanNarrative = String(narrative || '').trim();
  if (!cleanNarrative) {
    return null;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 180,
        messages: [
          {
            role: 'system',
            content: '너는 암호화폐 시장을 기상 비유로 전달하는 한국어 캐스터야. 주어진 문장을 자연스럽고 유머러스하게 다듬되 과장하지 말고 두 문장 이내로 유지해.',
          },
          {
            role: 'user',
            content: `기본 멘트: ${cleanNarrative}\n맥락: ${JSON.stringify(context)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('[LLM] rewrite failed:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    return text.split('\n').map(line => line.trim()).join(' ');
  } catch (error) {
    console.warn('[LLM] rewrite error:', error.message);
    return null;
  }
}

module.exports = {
  rewriteForecast,
  isEnabled,
};
