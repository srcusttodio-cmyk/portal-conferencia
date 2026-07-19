/* ══════════════════════════════════════════════════════
   ASSISTENTE GEMINI — WIDGET DE CHAT (Fase 2)
   ──────────────────────────────────────────────────────
   Painel de chat flutuante, acessível em qualquer página do
   portal (botão ✨ no cabeçalho). Nesta fase ele conversa
   livremente, mas ainda não consulta os dados reais do portal
   — isso entra na Fase 3 (function calling).
══════════════════════════════════════════════════════ */
let _geminiHistory = [];
let _geminiOpen = false;

function toggleGeminiPanel() {
  _geminiOpen = !_geminiOpen;
  const panel = document.getElementById('geminiPanel');
  if (!panel) return;
  panel.classList.toggle('open', _geminiOpen);
  if (_geminiOpen && !_geminiHistory.length) {
    appendGeminiBubble('assistant', '👋 Oi! Sou o assistente do portal. Ainda estou na primeira fase de integração, então por enquanto só converso — em breve vou conseguir consultar seus dados de verdade.');
  }
  if (_geminiOpen) setTimeout(() => document.getElementById('geminiInput')?.focus(), 150);
}

async function sendGeminiMessage() {
  const input = document.getElementById('geminiInput');
  if (!input) return;
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  input.disabled = true;

  appendGeminiBubble('user', msg);
  appendGeminiBubble('assistant', '⏳ pensando...', true);

  const historyForCall = [..._geminiHistory];
  const result = await askGemini(msg, { history: historyForCall });

  removeGeminiTyping();
  input.disabled = false;
  input.focus();

  if (result.text) {
    appendGeminiBubble('assistant', result.text);
    _geminiHistory.push({ role: 'user', parts: [{ text: msg }] });
    _geminiHistory.push({ role: 'model', parts: [{ text: result.text }] });
  } else if (result.error) {
    appendGeminiBubble('assistant', result.text || '⚠️ Algo deu errado.');
  }
}

function appendGeminiBubble(who, text, typing) {
  const box = document.getElementById('geminiMessages');
  if (!box) return;
  const div = document.createElement('div');
  div.className = 'gemini-bubble ' + who + (typing ? ' typing' : '');
  div.textContent = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function removeGeminiTyping() {
  document.querySelectorAll('.gemini-bubble.typing').forEach(el => el.remove());
}
