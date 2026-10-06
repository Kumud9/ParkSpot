const https = require('https');

const GEMINI_SYSTEM_INSTRUCTION = `You are ParkSpot Copilot, an expert AI Operations Assistant for a B2B Smart Parking Infrastructure Platform.
You assist facility operators with questions about their parking operations, occupancy, bookings, pricing, demand forecasts, overstays, and optimization recommendations.

STRICT OPERATIONAL DIRECTIVES:
1. CONTEXT SCOPE: You are provided with real, verified operational data for the operator's authorized facility context. Answer questions using ONLY this operational data.
2. ACCURACY & NO HALLUCINATION: Never invent or estimate numerical values, facility names, or metrics not grounded in the context. If specific statistics or data are unavailable, clearly and politely state that the data is currently unavailable.
3. READ-ONLY AUTHORITY: You are strictly an advisory and synthesis assistant. You have NO capability to create, update, or cancel bookings, change prices, modify slots, or alter user permissions.
4. ROLE & TONE: Professional, concise, operator-ready, and analytical. Use clear bullet points or short paragraphs when explaining multi-step insights or recommendations.`;

/**
 * Call Google Gemini REST API
 */
async function callGemini({ apiKey, model = 'gemini-1.5-flash', messages = [], operationalContext, question }) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const contents = [];

  // Add prior messages from conversation history (convert 'assistant' to 'model')
  if (Array.isArray(messages) && messages.length > 0) {
    for (const msg of messages.slice(-6)) {
      if (!msg.content) continue;
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(msg.content) }]
      });
    }
  }

  // Current turn with grounded operational context
  const contextString = typeof operationalContext === 'string'
    ? operationalContext
    : JSON.stringify(operationalContext, null, 2);

  const promptText = `OPERATIONAL CONTEXT (AUTHORIZED OPERATOR DATA):
${contextString}

OPERATOR QUESTION:
"${question}"

Provide a direct, helpful, and concise operational answer based strictly on the above operational context.`;

  contents.push({
    role: 'user',
    parts: [{ text: promptText }]
  });

  const payload = JSON.stringify({
    system_instruction: {
      parts: [{ text: GEMINI_SYSTEM_INSTRUCTION }]
    },
    contents,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1024
    }
  });

  return new Promise((resolve, reject) => {
    const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`);

    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 12000
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                resolve(text.trim());
              } else {
                reject(new Error('Empty response from Gemini'));
              }
            } else {
              reject(new Error(data.error?.message || `Gemini API error (Status ${res.statusCode})`));
            }
          } catch (err) {
            reject(new Error(`Failed to parse Gemini response: ${err.message}`));
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Gemini API request timed out'));
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = {
  callGemini,
  GEMINI_SYSTEM_INSTRUCTION
};
