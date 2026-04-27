/* ═══════════════════════════════════════════════════
   ARCHER — MindStark Library AI Assistant
   Drop this file in your project folder, then add:
   <script src="archer-bubble.js"></script>
   before </body> on every HTML page.
═══════════════════════════════════════════════════ */

(function () {
  const SUPABASE_FUNCTION_URL =
    "https://wgcpuohwyarhjlndmnlj.supabase.co/functions/v1/archer";

  /* ── Inject Styles ── */
  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400&family=DM+Sans:wght@300;400;500&display=swap');

    #archer-wrap * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'DM Sans', sans-serif; }

    /* Bubble Button */
    #archer-bubble {
      position: fixed;
      bottom: 28px;
      right: 28px;
      width: 62px;
      height: 62px;
      border-radius: 50%;
      background: #3b2a1a;
      border: 2.5px solid #c8963e;
      cursor: pointer;
      z-index: 9998;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 28px rgba(59,42,26,0.35);
      transition: transform 0.25s cubic-bezier(.34,1.56,.64,1), box-shadow 0.25s;
    }
    #archer-bubble:hover {
      transform: scale(1.1);
      box-shadow: 0 12px 36px rgba(59,42,26,0.45);
    }
    #archer-bubble svg { width: 28px; height: 28px; }

    /* Pulse ring */
    #archer-bubble::before {
      content: '';
      position: absolute;
      inset: -6px;
      border-radius: 50%;
      border: 2px solid rgba(200,150,62,0.4);
      animation: archer-pulse 2.4s ease-out infinite;
    }
    @keyframes archer-pulse {
      0%   { transform: scale(1);   opacity: 1; }
      100% { transform: scale(1.5); opacity: 0; }
    }

    /* Chat Panel */
    #archer-panel {
      position: fixed;
      bottom: 104px;
      right: 28px;
      width: 360px;
      max-height: 520px;
      background: #f5f0e8;
      border-radius: 20px;
      border: 1.5px solid rgba(200,150,62,0.25);
      box-shadow: 0 20px 60px rgba(59,42,26,0.22);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.85) translateY(20px);
      transform-origin: bottom right;
      opacity: 0;
      pointer-events: none;
      transition: transform 0.3s cubic-bezier(.34,1.56,.64,1), opacity 0.25s ease;
    }
    #archer-panel.open {
      transform: scale(1) translateY(0);
      opacity: 1;
      pointer-events: all;
    }

    /* Panel Header */
    #archer-header {
      background: #3b2a1a;
      padding: 14px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }
    #archer-avatar {
      width: 40px; height: 40px;
      border-radius: 50%;
      background: #c8963e;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      position: relative;
    }
    #archer-avatar svg { width: 22px; height: 22px; }
    #archer-online {
      position: absolute;
      bottom: 1px; right: 1px;
      width: 9px; height: 9px;
      border-radius: 50%;
      background: #6a9b5e;
      border: 2px solid #3b2a1a;
    }
    #archer-title { flex: 1; }
    #archer-title strong {
      display: block;
      font-family: 'Playfair Display', serif;
      font-size: 14px;
      font-weight: 700;
      color: #f5f0e8;
      letter-spacing: 0.03em;
    }
    #archer-title span {
      font-size: 11px;
      color: rgba(200,150,62,0.85);
      letter-spacing: 0.04em;
    }
    #archer-close {
      background: none;
      border: none;
      cursor: pointer;
      color: rgba(245,240,232,0.5);
      font-size: 20px;
      line-height: 1;
      padding: 2px 6px;
      border-radius: 6px;
      transition: color 0.2s, background 0.2s;
    }
    #archer-close:hover { color: #f5f0e8; background: rgba(245,240,232,0.1); }

    /* Messages */
    #archer-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      scrollbar-width: thin;
      scrollbar-color: rgba(200,150,62,0.2) transparent;
    }
    .archer-msg { display: flex; gap: 8px; align-items: flex-start; }
    .archer-msg.user { flex-direction: row-reverse; }

    .archer-msg-av {
      width: 28px; height: 28px;
      border-radius: 50%;
      background: #3b2a1a;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      font-family: 'Playfair Display', serif;
      font-size: 11px;
      font-weight: 700;
      color: #c8963e;
    }
    .archer-msg.user .archer-msg-av {
      background: #ede5d5;
      color: #7a6652;
      font-family: 'DM Sans', sans-serif;
      font-size: 10px;
    }

    .archer-bubble-msg {
      max-width: 78%;
      padding: 9px 13px;
      border-radius: 14px;
      font-size: 13.5px;
      line-height: 1.6;
      color: #2c1e0f;
      background: #ffffff;
      border: 1px solid rgba(200,150,62,0.15);
      border-left: 2.5px solid #c8963e;
    }
    .archer-msg.user .archer-bubble-msg {
      background: #3b2a1a;
      color: #f5f0e8;
      border: none;
      border-left: none;
      border-right: 2.5px solid #c8963e;
    }

    /* Typing dots */
    .archer-typing { display: flex; gap: 4px; align-items: center; padding: 2px 0; }
    .archer-typing span {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #c8963e;
      animation: archer-bounce 1.2s infinite;
    }
    .archer-typing span:nth-child(2) { animation-delay: 0.2s; }
    .archer-typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes archer-bounce {
      0%,80%,100% { transform: translateY(0); }
      40%          { transform: translateY(-6px); }
    }

    /* Input */
    #archer-input-row {
      display: flex;
      gap: 8px;
      padding: 12px 14px;
      border-top: 1px solid rgba(200,150,62,0.15);
      background: #ede5d5;
      flex-shrink: 0;
      align-items: flex-end;
    }
    #archer-input {
      flex: 1;
      resize: none;
      border: 1px solid rgba(200,150,62,0.25);
      border-radius: 12px;
      padding: 8px 12px;
      font-size: 13.5px;
      font-family: 'DM Sans', sans-serif;
      background: #f5f0e8;
      color: #2c1e0f;
      outline: none;
      min-height: 36px;
      max-height: 90px;
      line-height: 1.5;
      transition: border-color 0.2s;
    }
    #archer-input:focus { border-color: #c8963e; }
    #archer-input::placeholder { color: #7a6652; }

    #archer-send {
      width: 36px; height: 36px;
      border-radius: 50%;
      background: #c8963e;
      border: none;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      transition: background 0.2s, transform 0.15s;
    }
    #archer-send:hover { background: #3b2a1a; transform: scale(1.05); }
    #archer-send svg { width: 15px; height: 15px; }

    /* Footer tag */
    #archer-tag {
      text-align: center;
      font-size: 10px;
      color: #7a6652;
      padding: 5px 0 8px;
      background: #ede5d5;
      letter-spacing: 0.04em;
      flex-shrink: 0;
    }

    /* Mobile */
    @media (max-width: 480px) {
      #archer-panel {
        right: 12px; left: 12px;
        width: auto;
        bottom: 90px;
      }
      #archer-bubble { bottom: 18px; right: 18px; }
    }
  `;
  document.head.appendChild(style);

  /* ── Build HTML ── */
  const wrap = document.createElement("div");
  wrap.id = "archer-wrap";
  wrap.innerHTML = `
    <!-- Floating Bubble -->
    <button id="archer-bubble" aria-label="Chat with ARCHER">
      <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 3L17 10H24L18.5 14.5L21 22L14 17.5L7 22L9.5 14.5L4 10H11L14 3Z"
              fill="#c8963e" stroke="#f5f0e8" stroke-width="0.5"/>
        <circle cx="14" cy="14" r="3.5" fill="#f5f0e8" opacity="0.6"/>
      </svg>
    </button>

    <!-- Chat Panel -->
    <div id="archer-panel" role="dialog" aria-label="ARCHER Library Assistant">
      <div id="archer-header">
        <div id="archer-avatar">
          <svg viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M11 2L13.5 8H20L15 12L17 19L11 15L5 19L7 12L2 8H8.5L11 2Z"
                  fill="#f5f0e8" stroke="rgba(245,240,232,0.4)" stroke-width="0.5"/>
          </svg>
          <div id="archer-online"></div>
        </div>
        <div id="archer-title">
          <strong>ARCHER</strong>
          <span>MindStark Library AI</span>
        </div>
        <button id="archer-close" aria-label="Close">✕</button>
      </div>

      <div id="archer-messages"></div>

      <div id="archer-input-row">
        <textarea id="archer-input" placeholder="Ask ARCHER anything..." rows="1"></textarea>
        <button id="archer-send" aria-label="Send">
          <svg viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 7.5H13M13 7.5L8.5 3M13 7.5L8.5 12"
                  stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
      <div id="archer-tag">Powered by ARCHER · MindStark Library</div>
    </div>
  `;
  document.body.appendChild(wrap);

  /* ── State ── */
  const panel    = document.getElementById("archer-panel");
  const bubble   = document.getElementById("archer-bubble");
  const closeBtn = document.getElementById("archer-close");
  const messages = document.getElementById("archer-messages");
  const input    = document.getElementById("archer-input");
  const sendBtn  = document.getElementById("archer-send");

  let isOpen     = false;
  let isTyping   = false;
  let history    = [];
  let greeted    = false;

  /* ── Toggle Panel ── */
  function togglePanel() {
    isOpen = !isOpen;
    panel.classList.toggle("open", isOpen);
    if (isOpen && !greeted) {
      greeted = true;
      setTimeout(() => addMessage("archer",
        "Welcome to MindStark Library. I am <strong>ARCHER</strong> — your guide through our vast collection. Ask me about any book, author, genre, or idea. What would you like to explore today?"
      ), 300);
    }
    if (isOpen) input.focus();
  }

  bubble.addEventListener("click", togglePanel);
  closeBtn.addEventListener("click", togglePanel);

  /* ── Add Message ── */
  function addMessage(role, text, isLoading = false) {
    const div = document.createElement("div");
    div.className = "archer-msg " + (role === "user" ? "user" : "archer");

    const av = document.createElement("div");
    av.className = "archer-msg-av";
    av.textContent = role === "user" ? "You" : "A";

    const bub = document.createElement("div");
    bub.className = "archer-bubble-msg";
    if (isLoading) {
      bub.innerHTML = '<div class="archer-typing"><span></span><span></span><span></span></div>';
      div.id = "archer-typing-indicator";
    } else {
      bub.innerHTML = text.replace(/\n/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    }

    div.appendChild(av);
    div.appendChild(bub);
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  /* ── Send Message ── */
  async function sendMessage() {
    const text = input.value.trim();
    if (!text || isTyping) return;

    isTyping = true;
    input.value = "";
    input.style.height = "auto";

    addMessage("user", text);
    history.push({ role: "user", content: text });

    const typingEl = addMessage("archer", "", true);

    try {
      const res = await fetch(SUPABASE_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      const data = await res.json();
      typingEl.remove();

      const reply = data.reply || "I encountered an issue. Please try again.";
      history.push({ role: "assistant", content: reply });
      addMessage("archer", reply);
    } catch (err) {
      typingEl.remove();
      addMessage("archer", "Connection interrupted. Please check your network and try again.");
    }

    isTyping = false;
    input.focus();
  }

  /* ── Input Handlers ── */
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 90) + "px";
  });

  sendBtn.addEventListener("click", sendMessage);

})();
