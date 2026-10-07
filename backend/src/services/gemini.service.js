const { AppError } = require('../errors');

const GEMINI_SYSTEM_INSTRUCTION = `You are ParkSpot Copilot, an expert AI Operations Assistant for a B2B Smart Parking Infrastructure Platform.
You assist facility operators with questions about their assigned parking facility operations, live occupancy, bookings, pricing, demand forecasts, overstays, and optimization recommendations.

STRICT OPERATIONAL DIRECTIVES:
1. CONTEXT SCOPE: You are provided with real, verified operational data for the operator's authorized facility context. Answer questions using ONLY this operational data.
2. ACCURACY & NO HALLUCINATION: Never invent or estimate numerical values, facility names, or metrics not grounded in the context. If specific statistics or data are unavailable, clearly and politely state that the data is currently unavailable.
3. READ-ONLY AUTHORITY: You are strictly an advisory and synthesis assistant. You have NO capability to create, update, or cancel bookings, change prices, modify slots, or alter user permissions.
4. ROLE & TONE: Professional, direct, concise, and helpful. Answer the user's specific question directly without regurgitating generic disclaimer intros or repetitive status slogans.
5. CONVERSATION FLOW: If the user asks a follow-up question (e.g. "Why?", "What about tomorrow?"), interpret it in the context of the previous conversation turns.`;

/**
 * Call Google Gemini REST API
 */
async function callGemini({ apiKey, model = process.env.GEMINI_MODEL || 'gemini-3.6-flash', messages = [], operationalContext, question }) {
  if (!apiKey) {
    throw new AppError(500, 'COPILOT_LLM_ERROR', 'GEMINI_API_KEY is not configured in backend .env');
  }

  // Format conversation history ensuring strict alternation (user -> model -> user -> model)
  const contents = [];
  let lastRole = null;

  if (Array.isArray(messages) && messages.length > 0) {
    for (const msg of messages.slice(-8)) {
      if (!msg.content) continue;
      const role = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';

      // Gemini requires the first turn to be 'user'
      if (contents.length === 0 && role === 'model') continue;

      if (role === lastRole) {
        contents[contents.length - 1].parts[0].text += `\n${msg.content}`;
      } else {
        contents.push({
          role,
          parts: [{ text: String(msg.content) }]
        });
        lastRole = role;
      }
    }
  }

  // Current turn with grounded operational context
  const contextString = typeof operationalContext === 'string'
    ? operationalContext
    : JSON.stringify(operationalContext, null, 2);

  const promptText = `OPERATIONAL CONTEXT (AUTHORIZED FACILITY DATA):
${contextString}

OPERATOR QUESTION:
"${question}"

Provide a direct, helpful, and concise operational answer based strictly on the above operational context.`;

  if (lastRole === 'user') {
    contents[contents.length - 1].parts[0].text += `\n\n${promptText}`;
  } else {
    contents.push({
      role: 'user',
      parts: [{ text: promptText }]
    });
  }

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

  const candidateModels = Array.from(new Set([
    model,
    process.env.GEMINI_MODEL,
    'gemini-flash-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.6-flash'
  ].filter(Boolean)));

  let lastError = null;

  for (const candidate of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent?key=${apiKey}`;
    console.log(`[GeminiService] Sending request to Gemini (${candidate}) with ${contents.length} turns...`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: payload,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error?.message || `Gemini API HTTP ${res.status}`;
        console.warn(`[GeminiService] Candidate model ${candidate} failed (${res.status}): ${errMsg}`);
        lastError = new AppError(502, 'COPILOT_LLM_ERROR', errMsg);
        // If 503 (high demand) or 404 (model sunset), try next candidate
        if (res.status === 503 || res.status === 404 || res.status === 429) {
          continue;
        }
        throw lastError;
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        console.warn(`[GeminiService] Empty candidate response from ${candidate}:`, JSON.stringify(data));
        lastError = new AppError(502, 'COPILOT_LLM_ERROR', 'Gemini returned an empty text response.');
        continue;
      }

      console.log(`[GeminiService] Successfully received reply from Gemini model ${candidate} (${text.length} chars).`);
      return text.trim();
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        console.warn(`[GeminiService] Candidate ${candidate} timed out after 25s.`);
        lastError = new AppError(504, 'COPILOT_LLM_ERROR', 'Gemini API request timed out after 25 seconds.');
        continue;
      }
      if (err instanceof AppError && (err.status !== 502 || !err.message.includes('503'))) {
        throw err;
      }
      lastError = err;
    }
  }

  console.error('[GeminiService] All Gemini candidate models failed. Final error:', lastError?.message);
  throw lastError || new AppError(502, 'COPILOT_LLM_ERROR', 'Gemini LLM generation failed across all models.');
}

module.exports = {
  callGemini,
  GEMINI_SYSTEM_INSTRUCTION
};
