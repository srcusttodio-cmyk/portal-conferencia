/* ══════════════════════════════════════════════════════
   CLIENTE GEMINI (camada de IA)
   ──────────────────────────────────────────────────────
   Este é o ÚNICO arquivo que sabe que existe uma API do Gemini.
   Todo o resto do app chama só window.askGemini(pergunta, opções).
   Se um dia trocar de modelo/provedor de IA, só mexe aqui.
══════════════════════════════════════════════════════ */
(function () {
  // Troque aqui se quiser usar outro modelo do Gemini.
  const GEMINI_MODEL = 'gemini-2.0-flash';
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

  // instrução fixa que dá "personalidade" e contexto ao assistente
  const SYSTEM_INSTRUCTION =
    'Você é o assistente de IA do Portal de Conferência de Entregas da ' +
    'Mindset7 Studio. Responda em português do Brasil, de forma direta e ' +
    'objetiva. Quando não tiver certeza de um dado, diga que não sabe em ' +
    'vez de inventar números.';

  /**
   * Envia uma pergunta para o Gemini.
   * @param {string} prompt - a mensagem do usuário
   * @param {object} opts
   *   - history: array de mensagens anteriores no formato {role, parts:[{text}]}
   *   - tools: definição de function calling (usado na Fase 3)
   */
  window.askGemini = async function (prompt, opts = {}) {
    const { history = [], tools = null } = opts;
    const apiKey = window.__GEMINI_API_KEY__;

    if (!apiKey || apiKey === 'COLE_SUA_CHAVE_AQUI') {
      return { text: '⚠️ Chave do Gemini não configurada. Edite public/js/gemini-keys.local.js.', error: true };
    }

    const contents = [...history, { role: 'user', parts: [{ text: prompt }] }];
    const body = {
      contents,
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] }
    };
    if (tools) body.tools = tools;

    try {
      const res = await fetch(`${API_BASE}${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (data.error) {
        console.warn('Erro Gemini:', data.error);
        return { text: `⚠️ Erro do Gemini: ${data.error.message || 'falha na chamada'}`, error: true };
      }

      const candidate = data.candidates && data.candidates[0];
      const parts = (candidate && candidate.content && candidate.content.parts) || [];
      const functionCallPart = parts.find(p => p.functionCall);
      const text = parts.filter(p => p.text).map(p => p.text).join('\n');

      return {
        text,
        functionCall: functionCallPart ? functionCallPart.functionCall : null,
        raw: data
      };
    } catch (e) {
      console.warn('Falha ao chamar Gemini:', e);
      return { text: '⚠️ Não consegui falar com o Gemini agora (verifique sua internet).', error: true };
    }
  };
})();
