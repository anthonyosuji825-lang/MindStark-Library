(function () {
  const SUPABASE_FUNCTION_URL =
    "https://wgcpuohwyarhjlndmnlj.supabase.co/functions/v1/archer";

  const style = document.createElement("style");
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500&display=swap');

    #archer-wrap { position: fixed; inset: 0; pointer-events: none; z-index: 99999; }

    #archer-overlay {
      position: absolute; inset: 0;
      background: rgba(20,10,5,0.35);
      opacity: 0;
      transition: opacity 0.35s ease;
      pointer-events: none;
      backdrop-filter: blur(2px);
    }
    #archer-overlay.open { opacity: 1; pointer-events: all; }

    #archer-sidebar {
      position: absolute;
      top: 0; right: 0; bottom: 0;
      width: 400px;
      background: rgba(245,240,232,0.15);
      backdrop-filter: blur(28px) saturate(1.8);
      -webkit-backdrop-filter: blur(28px) saturate(1.8);
      border-left: 1px solid rgba(200,150,62,0.2);
      box-shadow: -20px 0 60px rgba(59,42,26,0.25);
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.4s cubic-bezier(0.4,0,0.2,1);
      pointer-events: all;
      overflow: hidden;
    }
    #archer-sidebar::before {
      content: '';
      position: absolute; inset: 0;
      background: linear-gradient(160deg, rgba(245,240,232,0.55) 0%, rgba(237,229,213,0.35) 100%);
      pointer-events: none;
      z-index: 0;
    }
    #archer-sidebar.open { transform: translateX(0); }

    #archer-header {
      position: relative; z-index: 1;
      padding: 20px 18px 16px;
      border-bottom: 1px solid rgba(200,150,62,0.15);
      display: flex; align-items: center; gap: 13px;
      background: rgba(59,42,26,0.9);
    }

    #archer-sigil {
      width: 42px; height: 42px; border-radius: 50%;
      background: rgba(200,150,62,0.15);
      border: 1.5px solid rgba(200,150,62,0.45);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; position: relative;
    }
    #archer-sigil svg { width: 21px; height: 21px; }
    #archer-dot {
      position: absolute; bottom: 1px; right: 1px;
      width: 9px; height: 9px; border-radius: 50%;
      background: #6ab04c;
      border: 2px solid #3b2a1a;
      box-shadow: 0 0 6px rgba(106,176,76,0.6);
    }

    #archer-titles { flex: 1; }
    #archer-titles strong {
      display: block;
      font-family: 'Playfair Display', serif;
      font-size: 14px; font-weight: 700;
      color: #f5f0e8;
      letter-spacing: 0.08em; text-transform: uppercase;
    }
    #archer-titles span {
      font-size: 10.5px; color: rgba(200,150,62,0.75);
      font-family: 'DM Sans', sans-serif;
      letter-spacing: 0.1em; text-transform: uppercase;
    }

    #archer-close-btn {
      width: 30px; height: 30px; border-radius: 50%;
      background: rgba(245,240,232,0.07);
      border: 1px solid rgba(245,240,232,0.12);
      color: rgba(245,240,232,0.5);
      font-size: 15px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.2s; font-family: 'DM Sans', sans-serif;
    }
    #archer-close-btn:hover { background: rgba(245,240,232,0.15); color: #f5f0e8; }

    #archer-messages {
      position: relative; z-index: 1;
      flex: 1; overflow-y: auto;
      padding: 18px 15px;
      display: flex; flex-direction: column; gap: 13px;
      scrollbar-width: thin;
      scrollbar-color: rgba(200,150,62,0.2) transparent;
    }

    .archer-msg { display: flex; gap: 9px; align-items: flex-start; }
    .archer-msg.user { flex-direction: row-reverse; }

    .archer-av {
      width: 28px; height: 28px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; font-size: 10px; font-weight: 500;
      font-family: 'DM Sans', sans-serif;
    }
    .archer-msg.archer .archer-av {
      background: rgba(59,42,26,0.85); color: #c8963e;
      font-family: 'Playfair Display', serif; font-size: 12px; font-weight: 700;
      border: 1px solid rgba(200,150,62,0.3);
    }
    .archer-msg.user .archer-av {
      background: rgba(59,42,26,0.1); color: #7a6652;
      border: 1px solid rgba(59,42,26,0.1);
    }

    .archer-bubble-msg {
      max-width: 80%; padding: 10px 14px; border-radius: 16px;
      font-size: 13.5px; line-height: 1.65;
      font-family: 'DM Sans', sans-serif;
    }
    .archer-msg.archer .archer-bubble-msg {
      background: rgba(255,255,255,0.72);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(200,150,62,0.14);
      color: #2c1e0f; border-top-left-radius: 4px;
    }
    .archer-msg.user .archer-bubble-msg {
      background: rgba(59,42,26,0.84);
      backdrop-filter: blur(10px);
      color: #f5f0e8; border-top-right-radius: 4px;
    }

    .archer-typing { display: flex; gap: 5px; align-items: center; padding: 3px 0; }
    .archer-typing span {
      width: 6px; height: 6px; border-radius: 50%; background: #c8963e;
      animation: archer-bounce 1.3s infinite;
    }
    .archer-typing span:nth-child(2) { animation-delay: 0.18s; }
    .archer-typing span:nth-child(3) { animation-delay: 0.36s; }
    @keyframes archer-bounce {
      0%,80%,100% { transform: translateY(0); opacity: 0.6; }
      40% { transform: translateY(-7px); opacity: 1; }
    }

    #archer-chips {
      position: relative; z-index: 1;
      display: flex; flex-wrap: wrap; gap: 7px;
      padding: 0 15px 12px;
    }
    .archer-chip {
      font-size: 11.5px; padding: 5px 12px; border-radius: 20px;
      border: 1px solid rgba(200,150,62,0.28);
      background: rgba(255,255,255,0.4);
      backdrop-filter: blur(8px);
      color: #5a3e28; cursor: pointer;
      font-family: 'DM Sans', sans-serif;
      transition: all 0.2s; white-space: nowrap;
    }
    .archer-chip:hover {
      background: rgba(200,150,62,0.15);
      border-color: rgba(200,150,62,0.5); color: #3b2a1a;
    }

    #archer-input-row {
      position: relative; z-index: 1;
      display: flex; gap: 9px;
      padding: 13px 15px 16px;
      border-top: 1px solid rgba(200,150,62,0.12);
      background: rgba(59,42,26,0.05);
      align-items: flex-end;
    }
    #archer-input {
      flex: 1; resize: none;
      border: 1px solid rgba(200,150,62,0.22);
      border-radius: 14px; padding: 10px 13px;
      font-size: 13.5px; font-family: 'DM Sans', sans-serif;
      background: rgba(255,255,255,0.65);
      backdrop-filter: blur(10px);
      color: #2c1e0f; outline: none;
      min-height: 40px; max-height: 100px; line-height: 1.5;
      transition: border-color 0.2s, background 0.2s;
    }
    #archer-input:focus {
      border-color: rgba(200,150,62,0.55);
      background: rgba(255,255,255,0.85);
    }
    #archer-input::placeholder { color: #a08060; }

    #archer-send {
      width: 40px; height: 40px; border-radius: 50%;
      background: #3b2a1a;
      border: 1.5px solid rgba(200,150,62,0.4);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: all 0.2s;
    }
    #archer-send:hover { background: #c8963e; border-color: #c8963e; transform: scale(1.06); }
    #archer-send svg { width: 15px; height: 15px; }

    #archer-footer {
      position: relative; z-index: 1;
      text-align: center; font-size: 10px;
      color: rgba(59,42,26,0.35);
      padding: 0 0 10px;
      font-family: 'DM Sans', sans-serif;
      letter-spacing: 0.06em;
      background: rgba(59,42,26,0.03);
    }

    #archer-fab {
      position: fixed; bottom: 28px; right: 28px;
      width: 56px; height: 56px; border-radius: 50%;
      background: #3b2a1a;
      border: 2px solid rgba(200,150,62,0.5);
      cursor: pointer; z-index: 99998;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 8px 28px rgba(59,42,26,0.4);
      transition: transform 0.25s cubic-bezier(.34,1.56,.64,1), box-shadow 0.25s;
      pointer-events: all;
      animation: archer-pulse-fab 3s ease-in-out infinite;
    }
    #archer-fab:hover {
      transform: scale(1.1);
      box-shadow: 0 12px 40px rgba(59,42,26,0.5);
    }
    @keyframes archer-pulse-fab {
      0%,100% { box-shadow: 0 8px 28px rgba(59,42,26,0.4), 0 0 0 0 rgba(200,150,62,0.25); }
      50% { box-shadow: 0 8px 28px rgba(59,42,26,0.4), 0 0 0 12px rgba(200,150,62,0); }
    }
    #archer-fab svg { width: 25px; height: 25px; }

    #archer-tooltip {
      position: fixed; bottom: 94px; right: 28px;
      background: rgba(59,42,26,0.92);
      backdrop-filter: blur(12px);
      color: #f5f0e8; font-size: 12px;
      font-family: 'DM Sans', sans-serif;
      padding: 7px 14px; border-radius: 20px;
      border: 1px solid rgba(200,150,62,0.3);
      white-space: nowrap; opacity: 0;
      transform: translateY(6px);
      transition: all 0.3s; pointer-events: none; z-index: 99997;
    }
    #archer-tooltip.show { opacity: 1; transform: translateY(0); }

    @media (max-width: 480px) {
      #archer-sidebar { width: 100%; border-left: none; }
      #archer-fab { bottom: 18px; right: 18px; }
      #archer-tooltip { right: 18px; }
    }
  `;
  document.head.appendChild(style);

  const wrap = document.createElement("div");
  wrap.id = "archer-wrap";
  wrap.innerHTML = `
    <div id="archer-overlay"></div>
    <div id="archer-sidebar">
      <div id="archer-header">
        <div id="archer-sigil">
          <svg viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M11 2L13.5 8.5H20.5L15 12.5L17.5 19.5L11 15.5L4.5 19.5L7 12.5L1.5 8.5H8.5L11 2Z" fill="#c8963e" stroke="rgba(200,150,62,0.3)" stroke-width="0.5"/>
            <circle cx="11" cy="11" r="2.5" fill="rgba(245,240,232,0.65)"/>
          </svg>
          <div id="archer-dot"></div>
        </div>
        <div id="archer-titles">
          <strong>ARCHER</strong>
          <span>MindStark Library AI</span>
        </div>
        <button id="archer-close-btn">✕</button>
      </div>
      <div id="archer-messages"></div>
      <div id="archer-chips">
        <div class="archer-chip" onclick="archerChip(this)">Recommend a book</div>
        <div class="archer-chip" onclick="archerChip(this)">Summarize 1984</div>
        <div class="archer-chip" onclick="archerChip(this)">Best philosophy reads</div>
        <div class="archer-chip" onclick="archerChip(this)">Compare authors</div>
      </div>
      <div id="archer-input-row">
        <textarea id="archer-input" placeholder="Ask ARCHER anything..." rows="1"></textarea>
        <button id="archer-send">
          <svg viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 7.5H13M13 7.5L8.5 3M13 7.5L8.5 12" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
      <div id="archer-footer">Powered by ARCHER · MindStark Library</div>
    </div>
    <div id="archer-tooltip">Ask ARCHER anything about books</div>
  `;
  document.body.appendChild(wrap);

  const fab = document.createElement("button");
  fab.id = "archer-fab";
  fab.setAttribute("aria-label", "Open ARCHER");
  fab.innerHTML = `<svg viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.5 2L15.5 9.5H23L17.5 13L19.5 20.5L12.5 16.5L5.5 20.5L7.5 13L2 9.5H9.5L12.5 2Z" fill="#c8963e" stroke="rgba(200,150,62,0.3)" stroke-width="0.5"/>
    <circle cx="12.5" cy="12.5" r="3" fill="rgba(245,240,232,0.6)"/>
  </svg>`;
  document.body.appendChild(fab);

  const sidebar  = document.getElementById("archer-sidebar");
  const overlay  = document.getElementById("archer-overlay");
  const closeBtn = document.getElementById("archer-close-btn");
  const messages = document.getElementById("archer-messages");
  const input    = document.getElementById("archer-input");
  const sendBtn  = document.getElementById("archer-send");
  const chips    = document.getElementById("archer-chips");
  const tooltip  = document.getElementById("archer-tooltip");

  let isOpen = false, isTyping = false, greeted = false, history = [];

  setTimeout(() => tooltip.classList.add("show"), 2000);
  setTimeout(() => tooltip.classList.remove("show"), 5500);

  function openSidebar() {
    isOpen = true;
    sidebar.classList.add("open");
    overlay.classList.add("open");
    tooltip.classList.remove("show");
    document.body.style.overflow = "hidden";
    if (!greeted) {
      greeted = true;
      setTimeout(() => addMsg("archer",
        "Welcome to <strong>MindStark Library</strong>. I am ARCHER — your guide through our vast collection of knowledge. Ask me about any book, author, genre, or idea. What shall we explore today?"
      ), 350);
    }
    setTimeout(() => input.focus(), 400);
  }

  function closeSidebar() {
    isOpen = false;
    sidebar.classList.remove("open");
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  fab.addEventListener("click", openSidebar);
  closeBtn.addEventListener("click", closeSidebar);
  overlay.addEventListener("click", closeSidebar);

  window.archerChip = function(el) {
    input.value = el.textContent;
    chips.style.display = "none";
    sendMessage();
  };

  function addMsg(role, text, loading = false) {
    const div = document.createElement("div");
    div.className = "archer-msg " + role;
    const av = document.createElement("div");
    av.className = "archer-av";
    av.textContent = role === "user" ? "You" : "A";
    const bub = document.createElement("div");
    bub.className = "archer-bubble-msg";
    if (loading) {
      bub.innerHTML = '<div class="archer-typing"><span></span><span></span><span></span></div>';
      div.id = "archer-typing-el";
    } else {
      bub.innerHTML = text.replace(/\n/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    }
    div.appendChild(av);
    div.appendChild(bub);
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || isTyping) return;
    isTyping = true;
    input.value = "";
    input.style.height = "auto";
    chips.style.display = "none";
    addMsg("user", text);
    history.push({ role: "user", content: text });
    const typingEl = addMsg("archer", "", true);
    try {
      const res = await fetch(SUPABASE_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          currentDateTime: new Date().toLocaleString("en-NG", {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
            hour: "2-digit", minute: "2-digit", second: "2-digit",
            timeZoneName: "short"
          })
        }),
      });
      const data = await res.json();
      typingEl.remove();
      const reply = data.reply || "I encountered an issue. Please try again.";
      history.push({ role: "assistant", content: reply });
      addMsg("archer", reply);
    } catch {
      typingEl.remove();
      addMsg("archer", "Connection interrupted. Please check your network and try again.");
    }
    isTyping = false;
    input.focus();
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 100) + "px";
  });
  sendBtn.addEventListener("click", sendMessage);
})();