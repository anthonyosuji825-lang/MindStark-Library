/* ═══════════════════════════════════════════════════════
   ARCHER Smart Search — MindStark Library
   Add before </body> in browse.html:
   <script src="archer-search.js"></script>
═══════════════════════════════════════════════════════ */

(function () {
  var SUPABASE_FUNCTION_URL =
    "https://wgcpuohwyarhjlndmnlj.supabase.co/functions/v1/archer";

  var style = document.createElement("style");
  style.textContent = `

    /* ── Toggle button ────────────────────────────────
       Sits inline inside .search-inner on desktop.
       On mobile the search-inner stacks, so we style
       the button to match the Search button width.    */
    #as-toggle-btn {
      display: inline-flex; align-items: center; gap: 7px;
      background: var(--brown); color: var(--cream);
      border: none; border-radius: 50px;
      padding: 0 1.4rem; height: 44px;
      font-family: 'DM Sans', sans-serif;
      font-size: .88rem; font-weight: 500;
      cursor: pointer; white-space: nowrap; flex-shrink: 0;
      transition: background .2s, transform .15s;
    }
    #as-toggle-btn:hover { background: var(--gold); transform: translateY(-1px); }
    #as-toggle-btn.active { background: var(--gold); }
    #as-toggle-btn svg { width: 14px; height: 14px; flex-shrink: 0; }

    /* On narrow screens the search-inner becomes a column —
       make the button full-width like the Search button   */
    @media (max-width: 640px) {
      #as-toggle-btn {
        width: 100%; justify-content: center; height: 46px;
      }
    }

    /* ── Collapsible panel ─────────────────────────── */
    #as-panel {
      background: var(--warm);
      border-bottom: 1px solid var(--border);
      max-height: 0; overflow: hidden; opacity: 0;
      transition: max-height .4s cubic-bezier(.4,0,.2,1), opacity .3s ease;
    }
    #as-panel.open {
      max-height: 680px; /* enough for all content */
      opacity: 1;
    }

    #as-panel-inner {
      max-width: 1360px; margin: 0 auto;
      padding: 1.25rem 2.5rem;
    }
    @media (max-width: 860px) { #as-panel-inner { padding: 1.1rem 1.5rem; } }
    @media (max-width: 560px) { #as-panel-inner { padding: 1rem 1.1rem; } }

    /* ARCHER label row */
    #as-hdr {
      display: flex; align-items: center; gap: 9px;
      margin-bottom: .9rem;
    }
    #as-avatar {
      width: 28px; height: 28px; border-radius: 50%;
      background: var(--brown);
      border: 1.5px solid rgba(200,150,62,.45);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    #as-avatar svg { width: 14px; height: 14px; }
    #as-hdr-title {
      font-family: 'Playfair Display', serif;
      font-size: 12.5px; font-weight: 700;
      color: var(--brown); letter-spacing: .06em; text-transform: uppercase;
    }
    #as-hdr-sub {
      font-size: 11px; color: var(--muted);
      font-style: italic; margin-left: auto;
    }
    @media (max-width: 480px) { #as-hdr-sub { display: none; } }

    /* Chips — horizontal scroll on mobile, wrap on desktop */
    #as-chips {
      display: flex; flex-wrap: wrap; gap: 6px;
      margin-bottom: .9rem;
    }
    @media (max-width: 640px) {
      #as-chips {
        flex-wrap: nowrap;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        padding-bottom: 4px;
      }
      #as-chips::-webkit-scrollbar { display: none; }
    }
    .as-chip {
      font-size: 11.5px; padding: 5px 13px;
      border-radius: 20px; border: 1px solid var(--border);
      background: var(--white); color: var(--muted);
      cursor: pointer; font-family: 'DM Sans', sans-serif;
      transition: all .2s; white-space: nowrap; flex-shrink: 0;
    }
    .as-chip:hover, .as-chip:active {
      border-color: var(--gold); color: var(--gold);
      background: rgba(200,150,62,.07);
    }

    /* Input row */
    #as-input-row {
      display: flex; gap: 9px; align-items: center;
      margin-bottom: .9rem;
    }
    #as-input {
      flex: 1; padding: 10px 16px;
      border: 1.5px solid var(--border); border-radius: 50px;
      background: var(--white); font-family: 'DM Sans', sans-serif;
      font-size: .9rem; color: var(--text); outline: none;
      min-width: 0; /* flex fix */
      transition: border-color .2s, box-shadow .2s;
    }
    #as-input:focus {
      border-color: var(--gold);
      box-shadow: 0 0 0 3px rgba(200,150,62,.12);
    }
    #as-input::placeholder { color: var(--muted); }

    #as-ask-btn {
      background: var(--gold); color: var(--white);
      border: none; padding: 10px 20px; border-radius: 50px;
      font-family: 'DM Sans', sans-serif;
      font-size: .85rem; font-weight: 500;
      cursor: pointer; white-space: nowrap; flex-shrink: 0;
      transition: background .2s, transform .15s;
    }
    #as-ask-btn:hover { background: var(--rust); transform: translateY(-1px); }
    #as-ask-btn:disabled { opacity: .5; cursor: default; transform: none; }

    @media (max-width: 480px) {
      #as-input-row { flex-direction: column; gap: 8px; }
      #as-ask-btn { width: 100%; text-align: center; padding: 11px 20px; }
    }

    /* Response box — scrollable, max-height on mobile */
    #as-response {
      background: var(--white); border: 1px solid var(--border);
      border-radius: 14px; overflow: hidden;
      display: none;
    }
    #as-response.show { display: block; }

    #as-resp-header {
      display: flex; align-items: center; gap: 8px;
      padding: .85rem 1.2rem;
      border-bottom: 1px solid var(--border);
      background: var(--white);
      position: sticky; top: 0; z-index: 1;
    }
    #as-resp-av {
      width: 24px; height: 24px; border-radius: 50%;
      background: var(--brown);
      display: flex; align-items: center; justify-content: center;
      font-family: 'Playfair Display', serif;
      font-size: 10px; font-weight: 700; color: var(--gold);
      flex-shrink: 0;
    }
    #as-resp-label {
      font-size: 12px; font-weight: 600;
      color: var(--brown); font-family: 'Playfair Display', serif;
      letter-spacing: .04em;
    }
    #as-resp-close {
      margin-left: auto; background: none; border: none;
      cursor: pointer; color: var(--muted); font-size: 16px;
      line-height: 1; padding: 2px 6px; border-radius: 6px;
      transition: color .2s; flex-shrink: 0;
    }
    #as-resp-close:hover { color: var(--brown); }

    /* Scrollable body */
    #as-resp-body {
      padding: 1rem 1.2rem;
      max-height: 220px;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(200,150,62,.3) transparent;
    }
    @media (max-width: 560px) {
      #as-resp-body { max-height: 180px; }
    }
    #as-resp-body::-webkit-scrollbar { width: 4px; }
    #as-resp-body::-webkit-scrollbar-thumb {
      background: rgba(200,150,62,.3); border-radius: 4px;
    }

    #as-typing {
      display: none; gap: 5px; align-items: center; padding: 2px 0;
    }
    #as-typing.show { display: flex; }
    #as-typing span {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--gold); animation: as-dot 1.3s infinite;
    }
    #as-typing span:nth-child(2) { animation-delay: .18s; }
    #as-typing span:nth-child(3) { animation-delay: .36s; }
    @keyframes as-dot {
      0%,80%,100% { transform: translateY(0); opacity: .5; }
      40% { transform: translateY(-6px); opacity: 1; }
    }

    #as-resp-text {
      font-size: .875rem; line-height: 1.75;
      color: var(--text); font-family: 'DM Sans', sans-serif;
    }
  `;
  document.head.appendChild(style);

  var isOpen = false;
  var isAsking = false;

  function togglePanel() {
    isOpen = !isOpen;
    var panel = document.getElementById("as-panel");
    var btn   = document.getElementById("as-toggle-btn");
    if (!panel || !btn) return;
    panel.classList.toggle("open", isOpen);
    btn.classList.toggle("active", isOpen);
    btn.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) {
      setTimeout(function () {
        var inp = document.getElementById("as-input");
        if (inp) inp.focus();
      }, 420);
    }
  }

  /* Inject button into .search-inner */
  function injectBtn() {
    var si = document.querySelector(".search-inner");
    if (!si) { setTimeout(injectBtn, 200); return; }
    if (document.getElementById("as-toggle-btn")) return;
    var btn = document.createElement("button");
    btn.id = "as-toggle-btn";
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = `
      <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7 1L8.8 5.2H13.4L9.7 7.8L11 12.5L7 9.8L3 12.5L4.3 7.8L0.6 5.2H5.2L7 1Z"
              fill="currentColor" opacity=".9"/>
      </svg>
      <span>Ask ARCHER</span>
    `;
    btn.addEventListener("click", togglePanel);
    si.appendChild(btn);
  }

  /* Build panel between search-section and toolbar */
  function buildPanel() {
    var toolbar = document.querySelector(".toolbar");
    if (!toolbar) { setTimeout(buildPanel, 200); return; }
    if (document.getElementById("as-panel")) return;

    var panel = document.createElement("div");
    panel.id = "as-panel";
    panel.innerHTML = `
      <div id="as-panel-inner">
        <div id="as-hdr">
          <div id="as-avatar">
            <svg viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7.5 1L9.5 6H14.5L10.5 9L12 14L7.5 11L3 14L4.5 9L0.5 6H5.5L7.5 1Z"
                    fill="#c8963e" stroke="rgba(200,150,62,.3)" stroke-width=".3"/>
              <circle cx="7.5" cy="7.5" r="2" fill="rgba(245,240,232,.7)"/>
            </svg>
          </div>
          <span id="as-hdr-title">ARCHER</span>
          <span id="as-hdr-sub">Describe what you're in the mood for…</span>
        </div>

        <div id="as-chips">
          <div class="as-chip" data-q="Something dark and psychological set in Nigeria">Dark Nigerian fiction</div>
          <div class="as-chip" data-q="Classic science fiction from the 1800s">Classic Sci-Fi</div>
          <div class="as-chip" data-q="Philosophy books for beginners">Philosophy for beginners</div>
          <div class="as-chip" data-q="Thrilling mystery with strong female leads">Mystery — female leads</div>
          <div class="as-chip" data-q="Books about resilience and overcoming adversity">Resilience &amp; strength</div>
          <div class="as-chip" data-q="Tell me about MindStark Original books">MindStark Originals</div>
          <div class="as-chip" data-q="Books about cosmology and space exploration">Cosmology &amp; Space</div>
          <div class="as-chip" data-q="Short novels I can finish in one sitting">Quick reads</div>
        </div>

        <div id="as-input-row">
          <input type="text" id="as-input"
            placeholder="e.g. 'A dark thriller set in Africa'…"/>
          <button id="as-ask-btn">Ask ARCHER</button>
        </div>

        <div id="as-response">
          <div id="as-resp-header">
            <div id="as-resp-av">A</div>
            <span id="as-resp-label">ARCHER's Recommendation</span>
            <button id="as-resp-close" title="Dismiss">&#x2715;</button>
          </div>
          <div id="as-resp-body">
            <div id="as-typing"><span></span><span></span><span></span></div>
            <div id="as-resp-text"></div>
          </div>
        </div>
      </div>
    `;

    toolbar.parentNode.insertBefore(panel, toolbar);
    bindEvents();
  }

  function bindEvents() {
    var inp     = document.getElementById("as-input");
    var askBtn  = document.getElementById("as-ask-btn");
    var closeBtn = document.getElementById("as-resp-close");

    if (inp) {
      inp.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); ask(inp.value.trim()); }
      });
    }
    if (askBtn) {
      askBtn.addEventListener("click", function () {
        var i = document.getElementById("as-input");
        if (i) ask(i.value.trim());
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        var r = document.getElementById("as-response");
        if (r) r.classList.remove("show");
      });
    }
    document.querySelectorAll(".as-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var q = chip.getAttribute("data-q");
        var i = document.getElementById("as-input");
        if (i) i.value = q;
        ask(q);
      });
    });
  }

  function fmt(t) {
    return t
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/\n/g, "<br>");
  }

  async function ask(query) {
    if (!query || isAsking) return;
    isAsking = true;

    var resp     = document.getElementById("as-response");
    var typing   = document.getElementById("as-typing");
    var respText = document.getElementById("as-resp-text");
    var respBody = document.getElementById("as-resp-body");
    var askBtn   = document.getElementById("as-ask-btn");
    if (!resp || !typing || !respText || !askBtn) { isAsking = false; return; }

    respText.innerHTML = "";
    resp.classList.add("show");
    typing.classList.add("show");
    askBtn.disabled = true;

    var currentUser = null;
    try {
      var raw = sessionStorage.getItem("ms_current_user");
      currentUser = raw ? JSON.parse(raw) : null;
    } catch (e) {}

    var prompt = "I am browsing MindStark Library and looking for book recommendations. " +
      query +
      ". Please suggest 3-5 specific books that match this description. For each book give the title, author, and one sentence on why it fits. If any MindStark Originals match — Margaret by Onaraku Valeria (psychological thriller, Nigerian), or Survival's Rage by Anthony C. C. Osuji (conspiracy thriller) — list them first and note they are exclusively available on MindStark Library.";

    try {
      var res = await fetch(SUPABASE_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          currentDateTime: new Date().toLocaleString("en-NG", {
            weekday: "long", year: "numeric", month: "long",
            day: "numeric", hour: "2-digit", minute: "2-digit",
            timeZoneName: "short"
          }),
          currentUser: (currentUser && !currentUser.guest)
            ? { name: currentUser.name, membership: currentUser.membership
                ? currentUser.membership.planName : "Free" }
            : null
        })
      });

      var data = await res.json();
      typing.classList.remove("show");
      var reply = data.reply || "I encountered an issue. Please try again.";
      respText.innerHTML = fmt(reply);
      if (respBody) respBody.scrollTop = 0;

    } catch (e) {
      typing.classList.remove("show");
      respText.innerHTML = "Connection interrupted. Please try again in a moment.";
    }

    askBtn.disabled = false;
    isAsking = false;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      injectBtn(); buildPanel();
    });
  } else {
    injectBtn(); buildPanel();
  }
})();