/**
 * ═══════════════════════════════════════════════════════════════════════
 *  arena.js — MindStark · The Arena (player page)
 *
 *  Built for 1,000+ simultaneous players. Design rules:
 *
 *  1. Never subscribe every client to per-player row changes. One score
 *     update would be delivered to every connected client (N updates x N
 *     clients) and blows through Supabase Realtime's message-rate and
 *     per-subscriber authorization limits. Instead:
 *       - game state (status / question / deadline) arrives as ONE small
 *         Broadcast message per change (see arena-2-hardening.sql),
 *       - the leaderboard is a server-built top-20 snapshot (pushed by the
 *         server every ~2s, or polled with jitter as a fallback),
 *       - each player asks the server for their own rank on demand.
 *  2. Every push path has a polling safety net, and every reconnect or
 *     tab-wake does a full resync, so a dropped socket can never leave a
 *     player on a stale question.
 *  3. Re-renders never touch the answer box unless the QUESTION changed,
 *     so unrelated updates can't wipe what a player is typing.
 *  4. The countdown uses a server-corrected clock, and never hard-locks
 *     input on a clock the page can't trust (the server enforces deadlines).
 *
 *  Works today against the current database (falls back to Postgres
 *  Changes + table reads) and upgrades itself automatically once the
 *  server-side script has been applied.
 * ═══════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /* ── Config (override with window.ARENA_CONFIG before this script) ── */
  const CFG = Object.assign({
    // UI hint only. The real admin check is the is_arena_admin() RPC / RLS.
    ADMIN_USER_ID: '429025f0-a2b5-41ec-a292-29e8a2241690',
    LB_LIMIT: 20,              // rows shown on the leaderboard
    POLL_FAST_MS: 5000,        // safety-net poll while push isn't confirmed
    POLL_SLOW_MS: 20000,       // safety-net poll once Broadcast is confirmed
    LB_STALE_MS: 7000,         // fetch the board ourselves if no snapshot arrived this long
    RANK_JITTER_MS: 2000,      // spread the "what's my rank" calls so 1,000 clients don't spike together
    ANSWER_TIMEOUT_MS: 12000,
    JOIN_TIMEOUT_MS: 15000,
    WRONG_COOLDOWN_MS: 700,    // gauntlet: brief pause after a wrong guess
    RENDER_THROTTLE_MS: 350,   // leaderboard/stat repaint rate limit
  }, window.ARENA_CONFIG || {});

  const PRIZE_SHARE = 0.85;                 // share of the pool paid to winners
  const PRIZE_SPLIT = [0.50, 0.30, 0.20];   // 1st / 2nd / 3rd
  const STATUS_RANK = { registering: 0, active: 1, finished: 2, canceled: 2 };

  /* ── State ────────────────────────────────────────────────────────── */
  const S = {
    user: null, wallet: null, balance: 0,
    ev: null, me: null,
    lb: [], lbTotal: 0, myRank: null, lbAt: 0, lbPushAt: 0,
    rpcBoard: null, rpcRank: null,            // null = unknown, false = not deployed
    clockOffset: 0, clockKnown: false,
    chBc: null, chPg: null, chCm: null,
    bcOk: false, chState: {}, everLive: false, wasDown: false, lastPollOk: 0,
    pollT: null, boardT: null, lastPushAt: 0,
    userAnswers: {}, locked: false,
    names: {}, nameLoading: {},
    pinFails: 0, pinLockUntil: 0, joining: false,
    speech: true, loadFailed: false,
    voiceSeen: new Set(), voiceAudio: null, voiceUnlocked: false, voiceBaseline: false, voiceBusy: false, voicePollAt: 0,
  };

  /* ── Tiny helpers ─────────────────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const sb = () => window._sb;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const now = () => Date.now() + S.clockOffset;

  function esc(str) {
    if (str === undefined || str === null) return '';
    return String(str).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function fmtUnits(n) {
    if (n === undefined || n === null || n === 0) return '0';
    if (n >= 1000) return n.toLocaleString() + 'tr';
    if (n >= 11)   return n + 'ft';
    return n + 'gt';
  }

  function isMissingFn(err) {
    return !!err && (err.code === 'PGRST202' || err.code === '42883' ||
      /could not find the function|function .* does not exist/i.test(err.message || ''));
  }
  function isNetworkErr(err) {
    return !!err && (err.code === 'CLIENT_TIMEOUT' || !err.code ||
      /failed to fetch|network|load failed|aborted/i.test(err.message || ''));
  }
  function friendlyError(msg) {
    if (/jwt|token|not authenticated|auth/i.test(msg || '')) return 'Your session expired. Please sign in again.';
    return (msg && String(msg).slice(0, 160)) || 'Something went wrong. Please try again.';
  }

  const questionKey = e => e
    ? [e.status, e.question_number, e.current_question, e.current_player_id, e.reveal_answer, e.question_deadline].join('|')
    : '';
  const currentQNum = () => Math.min(S.ev?.question_number || 1, S.ev?.total_questions || 10);

  /* ── Speech (declared before first use) ───────────────────────────── */
  const synth = window.speechSynthesis || null;
  function speak(text) {
    if (!S.speech || !synth) return;
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95; u.pitch = 1; u.volume = 1;
      synth.speak(u);
    } catch (e) { /* speech is a nicety */ }
  }

  /* ── Host voice clips (hold-to-talk) ──────────────────────────────── */
  const VOICE_MAX_AGE_MS = 40000;                    // never replay history to someone who just arrived
  // A 0-sample WAV. Playing it once inside a real tap lets later clips start on their own (iOS needs this).
  const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

  function voiceEl() {
    if (!S.voiceAudio) { S.voiceAudio = new Audio(); S.voiceAudio.preload = 'auto'; }
    return S.voiceAudio;
  }
  function voiceUrl(path) {
    try { return sb().storage.from('arena-voice').getPublicUrl(path).data.publicUrl || null; } catch (e) { return null; }
  }
  function unlockAudio() {
    if (S.voiceUnlocked) return;
    S.voiceUnlocked = true;
    try {
      const a = voiceEl();
      a.muted = true; a.src = SILENT_WAV;
      const p = a.play();
      const done = () => { try { a.pause(); } catch (e) { /* ignore */ } a.muted = false; };
      if (p && p.then) p.then(done).catch(() => { a.muted = false; S.voiceUnlocked = false; });
      else done();
    } catch (e) { S.voiceUnlocked = false; }
  }

  function hideVoiceBanner() {
    const b = $('voice-banner');
    if (!b) return;
    b.classList.remove('show');
    setTimeout(() => { if (b.parentElement) b.remove(); }, 400);
  }
  function showVoiceBanner(mode, url) {
    const old = $('voice-banner');
    if (old) old.remove();
    const b = document.createElement('div');
    b.id = 'voice-banner';
    b.className = 'host-banner';
    b.setAttribute('role', 'status');
    b.innerHTML = `
      <span style="font-size:1.1rem;flex-shrink:0;">🎙</span>
      <div>
        <div class="host-banner-label">MindStark Host · Voice</div>
        <div class="host-banner-text"></div>
      </div>
      <button class="host-banner-x" aria-label="Dismiss">✕</button>`;
    const txt = b.querySelector('.host-banner-text');
    if (mode === 'playing') {
      txt.textContent = 'The host is speaking…';
    } else {
      txt.textContent = 'The host sent a voice message. ';
      const btn = document.createElement('button');
      btn.style.cssText = 'padding:.4rem .9rem;font-size:.8rem;margin-top:.5rem;background:var(--gold);color:#1a0f05;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-family:inherit;';
      btn.textContent = '▶ Tap to hear';
      btn.addEventListener('click', () => { S.voiceUnlocked = true; playVoice(url); });   // a tap: always allowed
      txt.appendChild(document.createElement('br'));
      txt.appendChild(btn);
    }
    b.querySelector('.host-banner-x').addEventListener('click', () => { try { voiceEl().pause(); } catch (e) { /* ignore */ } hideVoiceBanner(); });
    document.body.appendChild(b);
    requestAnimationFrame(() => b.classList.add('show'));
    setTimeout(hideVoiceBanner, mode === 'playing' ? 45000 : 25000);
  }

  function playVoice(url) {
    const a = voiceEl();
    a.onended = hideVoiceBanner;
    a.onerror = hideVoiceBanner;
    a.muted = false;
    a.src = url;
    showVoiceBanner('playing', url);
    const p = a.play();
    if (p && p.catch) p.catch(() => showVoiceBanner('tap', url));      // autoplay blocked: ask for a tap
  }

  /** A clip arrived (pushed over Broadcast, or found by the polling fallback). */
  function onVoice(c) {
    if (!c || !c.id || !c.path || !S.ev || c.event_id !== S.ev.id) return;
    if (S.voiceSeen.has(c.id)) return;
    S.voiceSeen.add(c.id);
    if (S.voiceSeen.size > 50) S.voiceSeen.delete(S.voiceSeen.values().next().value);
    const age = now() - Date.parse(c.created_at);
    if (!(age < VOICE_MAX_AGE_MS)) return;
    const url = voiceUrl(c.path);
    if (!url) return;
    if (synth) synth.cancel();                                         // don't talk over the host
    if (!S.speech) { showVoiceBanner('tap', url); return; }            // sound is off: offer, don't force
    playVoice(url);
  }

  /** Fallback when Broadcast is down. The first call only records what already exists. */
  async function pollVoice() {
    if (!S.ev || S.voiceBusy || Date.now() - S.voicePollAt < 4000) return;
    S.voiceBusy = true; S.voicePollAt = Date.now();
    try {
      const id = S.ev.id;
      const { data, error } = await sb().from('arena_voice_clips')
        .select('id,event_id,path,mime,duration_ms,created_at')
        .eq('event_id', id).order('created_at', { ascending: false }).limit(1);
      if (error || S.ev?.id !== id) return;                            // table missing = voice not deployed yet
      const c = data && data[0];
      if (!S.voiceBaseline) { S.voiceBaseline = true; if (c) S.voiceSeen.add(c.id); return; }
      if (c) onVoice(c);
    } catch (e) { /* voice is a nicety */ }
    finally { S.voiceBusy = false; }
  }

  /* ── RPC with timeout (a hung request must never freeze the UI) ───── */
  async function callRpc(fn, params, ms) {
    const limit = ms || CFG.ANSWER_TIMEOUT_MS;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer;
    const timeout = new Promise(res => {
      timer = setTimeout(() => {
        if (ctl) ctl.abort();
        res({ data: null, error: { code: 'CLIENT_TIMEOUT', message: 'timeout' } });
      }, limit);
    });
    try {
      let req = sb().rpc(fn, params || {});
      if (ctl && req && typeof req.abortSignal === 'function') req = req.abortSignal(ctl.signal);
      return await Promise.race([req, timeout]);
    } catch (e) {
      return { data: null, error: { code: '', message: String((e && e.message) || e) } };
    } finally {
      clearTimeout(timer);
    }
  }

  /* ═══ INIT ═══════════════════════════════════════════════════════════ */
  let initStarted = false;
  document.addEventListener('supabase:ready', init);
  if (window._sb) init();

  async function init() {
    if (initStarted) return;
    initStarted = true;
    revealElements();
    bindStaticUI();
    setConn('connecting');

    await Promise.all([resolveUser(), syncClock()]);
    if (S.user) {
      await loadWalletBalance();
      renderNavBalance();
      maybeShowAdminLink();            // not awaited: purely cosmetic
    }
    await loadEvent();
    schedulePoll();
  }

  function revealElements() {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('visible')); return; }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.08 });
    els.forEach(el => observer.observe(el));
  }

  function bindStaticUI() {
    const speechBtn = $('speech-toggle');
    if (speechBtn) {
      speechBtn.addEventListener('click', () => {
        S.speech = !S.speech;
        speechBtn.textContent = S.speech ? '🔊 Voice' : '🔇 Voice';
        speechBtn.style.opacity = S.speech ? '1' : '.5';
        speechBtn.setAttribute('aria-pressed', String(S.speech));
        if (!S.speech && synth) synth.cancel();
        if (S.speech) unlockAudio(); else { try { voiceEl().pause(); } catch (e) { /* ignore */ } hideVoiceBanner(); }
      });
    }
    // The first tap anywhere unlocks automatic playback of host clips.
    document.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });

    $('modal-close').addEventListener('click', closePinModal);
    $('pin-modal').addEventListener('click', e => { if (e.target === $('pin-modal')) closePinModal(); });
    $('modal-confirm-btn').addEventListener('click', handlePinConfirm);
    $('pin-input').addEventListener('input', () => {
      const el = $('pin-input');
      el.value = el.value.replace(/\D/g, '').slice(0, 4);
      if (el.value.length === 4) handlePinConfirm();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePinModal(); });

    // Wake-ups: a phone coming out of the background has missed pushes.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) resync(); });
    window.addEventListener('online', () => resync());
    window.addEventListener('offline', () => recomputeConn());
  }

  /* ── User / session ───────────────────────────────────────────────── */
  async function resolveUser() {
    let user = null;
    try {
      let r = await sb().auth.getSession();           // local read: no network round-trip
      user = r.data?.session?.user || null;
      if (!user) {                                     // session may still be restoring
        await sleep(800);
        r = await sb().auth.getSession();
        user = r.data?.session?.user || null;
      }
      if (!user) {
        const u = await sb().auth.getUser();
        user = u.data?.user || null;
      }
    } catch (e) { user = null; }
    S.user = user;

    try {
      sb().auth.onAuthStateChange((_evt, session) => {
        const u = session?.user || null;
        if ((u?.id || null) === (S.user?.id || null)) return;   // token refresh etc.
        S.user = u;
        setTimeout(onUserChanged, 0);                  // never call supabase inside this callback
      });
    } catch (e) { /* older client */ }
  }

  async function onUserChanged() {
    S.me = null; S.myRank = null; S.wallet = null; S.balance = 0;
    if (S.user) { await loadWalletBalance(); }
    renderNavBalance();
    if (S.ev) { await loadParticipation(); renderAll(); }
  }

  async function maybeShowAdminLink() {
    if (!S.user || $('admin-link')) return;
    let isAdmin = false;
    const { data, error } = await callRpc('is_arena_admin', {}, 8000);
    if (!error && typeof data === 'boolean') isAdmin = data;
    else if (error) isAdmin = S.user.id === CFG.ADMIN_USER_ID;   // RPC not deployed yet: UI hint only
    if (!isAdmin) return;

    const navRight = document.querySelector('.nav-right');
    if (!navRight) return;
    let count = 0;
    try {
      const r = await sb().from('event_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      count = r.count || 0;
    } catch (e) { /* ignore */ }

    const a = document.createElement('a');
    a.id = 'admin-link';
    a.href = 'arena-admin.html';
    a.target = '_blank'; a.rel = 'noopener';
    a.style.cssText = 'font-size:.75rem;font-weight:700;color:var(--gold);text-decoration:none;background:rgba(200,150,62,.1);border:1px solid rgba(200,150,62,.4);padding:.3rem .75rem;border-radius:50px;letter-spacing:.04em;display:flex;align-items:center;';
    a.textContent = '⚡ Admin';
    if (count > 0) {
      const b = document.createElement('span');
      b.style.cssText = 'background:var(--danger);color:#fff;font-size:.6rem;padding:.1rem .35rem;border-radius:50px;margin-left:.3rem;';
      b.textContent = String(count);
      a.appendChild(b);
    }
    navRight.insertBefore(a, navRight.firstChild);
  }

  /* ── Server clock ─────────────────────────────────────────────────── */
  async function syncClock() {
    try {
      const t0 = Date.now();
      const { data, error } = await callRpc('arena_server_time', {}, 6000);
      const t1 = Date.now();
      if (error) return;
      const server = Number(data);
      if (!isFinite(server) || server <= 0) return;
      S.clockOffset = server + (t1 - t0) / 2 - t1;
      S.clockKnown = true;
    } catch (e) { /* keep the local clock */ }
  }

  /* ── Wallet ───────────────────────────────────────────────────────── */
  async function loadWalletBalance() {
    if (!S.user) return;
    try {
      const { data } = await sb().from('wallets').select('id,balance').eq('user_id', S.user.id).maybeSingle();
      S.wallet = data || null;
      S.balance = data?.balance || 0;
    } catch (e) { S.balance = 0; }
  }
  async function ensureWalletId() {
    if (S.wallet?.id) return S.wallet.id;
    await loadWalletBalance();
    return S.wallet?.id || null;
  }
  function renderNavBalance() {
    const wrap = $('nav-balance'), val = $('nav-balance-val');
    if (!wrap || !val) return;
    if (!S.user) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'flex';
    val.textContent = fmtUnits(S.balance);
  }

  /* ═══ EVENT LOADING ══════════════════════════════════════════════════ */
  async function fetchLatestEvent() {
    return sb().from('events_public').select('*')
      .in('status', ['registering', 'active', 'finished'])
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();
  }

  async function loadEvent() {
    const { data, error } = await fetchLatestEvent();
    if (error) {
      S.loadFailed = true;
      if (!S.ev) renderNoEvent(true);
      return;
    }
    S.loadFailed = false;
    S.lastPollOk = Date.now();
    if (!data) { teardownEvent(); renderNoEvent(false); return; }
    await switchToEvent(data);
  }

  function teardownEvent() {
    stopRealtime();
    stopCountdown();
    clearTimeout(S.boardT);
    S.ev = null; S.me = null; S.lb = []; S.lbTotal = 0; S.myRank = null;
  }

  async function switchToEvent(ev) {
    stopRealtime();
    stopCountdown();
    S.ev = ev;
    S.me = null; S.lb = []; S.lbTotal = 0; S.myRank = null;
    S.lbAt = 0; S.lbPushAt = 0; S.bcOk = false; S.chState = {};
    S.voiceBaseline = false; hideVoiceBanner();
    S.userAnswers = {}; S.locked = false;
    const id = ev.id;

    await Promise.all([loadParticipation(), fetchBoard()]);
    if (S.ev?.id !== id) return;                     // switched again while loading
    renderAll();
    if (ev.status === 'active' && S.me && S.me.status !== 'locked') refreshMeThenRender();
    startRealtime();
  }

  async function loadParticipation() {
    if (!S.user || !S.ev) { S.me = null; return; }
    try {
      const { data } = await sb().from('event_participants')
        .select('id,user_id,display_name,score,status,answered_at')
        .eq('event_id', S.ev.id).eq('user_id', S.user.id).maybeSingle();
      S.me = data || null;
    } catch (e) { /* keep previous */ }
  }

  async function refreshMeThenRender() {
    const key = questionKey(S.ev);
    await loadParticipation();
    if (S.ev && questionKey(S.ev) === key) { renderQuestion(); renderJoinSection(); }
  }

  /* ═══ LEADERBOARD (snapshot based) ═══════════════════════════════════ */
  async function fetchBoard() {
    const ev = S.ev;
    if (!ev) return;
    const id = ev.id;
    let board = null;

    if (S.rpcBoard !== false) {
      const { data, error } = await callRpc('arena_leaderboard', { p_event_id: id, p_limit: CFG.LB_LIMIT }, 10000);
      if (!error && data && Array.isArray(data.top)) { board = data; S.rpcBoard = true; }
      else if (error && isMissingFn(error)) S.rpcBoard = false;
      else if (error) return;                         // transient: keep the last board
    }
    if (!board) board = await fetchBoardFromTables(id);
    if (!board || S.ev?.id !== id) return;
    applyBoard(board, 'fetch');
  }

  async function fetchBoardFromTables(id) {
    try {
      const [top, cnt] = await Promise.all([
        sb().from('event_participants').select('user_id,display_name,score,answered_at')
          .eq('event_id', id)
          .order('score', { ascending: false })
          .order('answered_at', { ascending: true, nullsFirst: false })
          .limit(CFG.LB_LIMIT),
        sb().from('event_participants').select('id', { count: 'exact', head: true }).eq('event_id', id),
      ]);
      if (top.error) return null;
      const rows = top.data || [];
      const board = {
        total: typeof cnt.count === 'number' ? cnt.count : rows.length,
        top: rows.map(r => ({ user_id: r.user_id, display_name: r.display_name, score: r.score })),
        me: null,
      };
      const idx = S.user ? rows.findIndex(r => r.user_id === S.user.id) : -1;
      if (idx > -1) board.me = { rank: idx + 1, score: rows[idx].score };
      return board;
    } catch (e) { return null; }
  }

  function applyBoard(b, source) {
    S.lb = Array.isArray(b.top) ? b.top : [];
    if (typeof b.total === 'number') S.lbTotal = b.total;

    if (b.prize_pool !== undefined && b.prize_pool !== null && S.ev && b.prize_pool !== S.ev.prize_pool) {
      S.ev.prize_pool = b.prize_pool;
      scheduleRender('stats');
    }

    if (b.me && b.me.rank != null) {
      S.myRank = b.me.rank;
      if (S.me && b.me.score != null) S.me.score = b.me.score;
    } else if (S.user) {
      const idx = S.lb.findIndex(r => r.user_id === S.user.id);
      if (idx > -1) {
        S.myRank = idx + 1;
        if (S.me && S.lb[idx].score != null) S.me.score = S.lb[idx].score;
      }
    }

    S.lbAt = Date.now();
    if (source === 'push') S.lbPushAt = S.lbAt;
    scheduleRender('board');
    if (S.me) scheduleRender('join');
    // Snapshots only carry the top 20. If we are a player and don't know our rank yet, ask once.
    if (S.me && S.myRank == null && S.rpcRank !== false) queueBoardRefresh();
  }

  function onPushBoard(p) {
    if (!p || !S.ev || p.event_id !== S.ev.id) return;
    applyBoard(p, 'push');
  }

  async function fetchMyRank() {
    if (!S.user || !S.me || !S.ev || S.rpcRank === false) return;
    const id = S.ev.id;
    const { data, error } = await callRpc('arena_my_rank', { p_event_id: id }, 10000);
    if (error) { if (isMissingFn(error)) S.rpcRank = false; return; }
    if (S.ev?.id !== id || !data) return;
    S.rpcRank = true;
    if (data.rank != null) S.myRank = data.rank;
    if (S.me && data.score != null) S.me.score = data.score;
    if (data.status && S.me) S.me.status = data.status;
    scheduleRender('board', 'join');
  }

  /** Jittered so 1,000 clients never ask at the same instant. */
  function queueBoardRefresh(maxDelay) {
    clearTimeout(S.boardT);
    S.boardT = setTimeout(() => { S.boardT = null; refreshBoardSmart(); },
      Math.random() * (maxDelay === undefined ? CFG.RANK_JITTER_MS : maxDelay));
  }
  async function refreshBoardSmart() {
    if (!S.ev) return;
    const pushFresh = Date.now() - S.lbPushAt < CFG.LB_STALE_MS;
    if (pushFresh) await fetchMyRank(); else await fetchBoard();
  }

  /* ── Throttled painting of the non-critical parts ─────────────────── */
  const dirty = new Set();
  let renderT = null, lastRender = 0;
  function scheduleRender(...parts) {
    parts.forEach(p => dirty.add(p));
    if (renderT) return;
    const wait = Math.max(0, CFG.RENDER_THROTTLE_MS - (Date.now() - lastRender));
    renderT = setTimeout(flushRender, wait);
  }
  function flushRender() {
    renderT = null; lastRender = Date.now();
    const d = new Set(dirty); dirty.clear();
    if (!S.ev) return;
    if (d.has('stats')) { updateEventStats(); renderPrizeBreakdown(); }
    if (d.has('board')) { renderLeaderboard(); updateEventStats(); }
    if ((d.has('stats') || d.has('board')) && S.ev.status === 'finished') renderResults();   // podium follows the board
    if (d.has('join')) renderJoinSection();
  }

  /* ═══ REALTIME ═══════════════════════════════════════════════════════ */
  async function applyRealtimeAuth() {
    try {
      const { data } = await sb().auth.getSession();
      const tok = data?.session?.access_token;
      if (tok && sb().realtime && typeof sb().realtime.setAuth === 'function') await sb().realtime.setAuth(tok);
    } catch (e) { /* anon is fine for public reads */ }
  }

  async function startRealtime() {
    const ev = S.ev;
    if (!ev) return;
    const id = ev.id;
    await applyRealtimeAuth();
    if (S.ev?.id !== id) return;
    S.voiceBaseline = false; pollVoice();            // note which clips already exist, so only new ones play

    // 1) Broadcast — one small server-sent message per change. Scales; needs arena-2-hardening.sql.
    //    Private channel: clients may only receive, so nobody can spoof a question or leaderboard.
    const bc = sb().channel(`arena:${id}`, { config: { private: true } });
    bc.on('broadcast', { event: 'event' }, m => { if (S.chBc !== bc) return; markBroadcastOk(); onPushEvent(m && m.payload); })
      .on('broadcast', { event: 'lb' },    m => { if (S.chBc !== bc) return; markBroadcastOk(); onPushBoard(m && m.payload); })
      .on('broadcast', { event: 'voice' }, m => { if (S.chBc !== bc) return; markBroadcastOk(); onVoice(m && m.payload); });
    S.chBc = bc;
    bc.subscribe(status => onChannelStatus(bc, 'bc', status));

    // 2) Postgres Changes on the single event row — transitional. It is dropped as soon as the
    //    first Broadcast message arrives, so it never carries load once the server side is live.
    const pg = sb().channel(`arena-pg-${id}`);
    pg.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events_public', filter: `id=eq.${id}` },
      p => { if (S.chPg === pg) onPushEvent(p.new); });
    S.chPg = pg;
    pg.subscribe(status => onChannelStatus(pg, 'pg', status));

    // 3) Host commentary (rare: a handful of messages per event).
    const cm = sb().channel(`arena-comments-${id}`);
    cm.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'event_comments', filter: `event_id=eq.${id}` },
      p => { if (S.chCm === cm && p.new) showAdminComment(p.new.message); });
    S.chCm = cm;
    cm.subscribe();
  }

  function stopRealtime() {
    ['chBc', 'chPg', 'chCm'].forEach(k => {
      const ch = S[k];
      S[k] = null;
      if (ch) { try { sb().removeChannel(ch); } catch (e) { /* ignore */ } }
    });
    S.chState = {};
  }

  function onChannelStatus(ch, kind, status) {
    const cur = kind === 'bc' ? S.chBc : S.chPg;
    if (cur !== ch) return;                          // a channel we already tore down
    S.chState[kind] = status;
    if (status === 'SUBSCRIBED') {
      S.everLive = true;
      if (S.wasDown) { S.wasDown = false; resync(); }  // anything pushed while we were away is lost
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      if (S.everLive) S.wasDown = true;
    }
    recomputeConn();
  }

  function markBroadcastOk() {
    if (S.bcOk) return;
    S.bcOk = true;
    if (S.chPg) {
      const ch = S.chPg;
      S.chPg = null;
      delete S.chState.pg;
      try { sb().removeChannel(ch); } catch (e) { /* ignore */ }
    }
    schedulePoll();
    recomputeConn();
  }

  function setConn(state) {
    const el = $('conn'), label = $('conn-label');
    if (!el || !label) return;
    el.dataset.state = state;
    label.textContent = ({
      live: 'Live', polling: 'Syncing', connecting: 'Connecting…',
      reconnecting: 'Reconnecting…', offline: 'Offline — waiting for connection',
    })[state] || state;
  }
  function recomputeConn() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return setConn('offline');
    const up = S.chState.bc === 'SUBSCRIBED' || S.chState.pg === 'SUBSCRIBED';
    if (up) return setConn('live');
    if (S.lastPollOk && Date.now() - S.lastPollOk < 15000) return setConn('polling');   // push is down, polling still works
    setConn(S.everLive ? 'reconnecting' : 'connecting');
  }

  /* ═══ APPLYING EVENT UPDATES ═════════════════════════════════════════ */
  function onPushEvent(row) {
    if (!row || !S.ev || row.id !== S.ev.id) return;
    S.lastPushAt = Date.now();
    applyEvent(row, true);
  }

  function applyEvent(row, pushed) {
    const prev = S.ev;
    if (!prev) return;

    // Out-of-order protection: a late poll must never roll the game backwards.
    if (typeof row.question_number === 'number' && typeof prev.question_number === 'number' &&
        row.question_number < prev.question_number) return;
    if (STATUS_RANK[row.status] < STATUS_RANK[prev.status]) return;

    const next = { ...prev, ...row };
    S.ev = next;
    if (row.current_player_id && row.current_player_name) S.names[row.current_player_id] = row.current_player_name;

    const qChanged = questionKey(prev) !== questionKey(next);
    const statusChanged = prev.status !== next.status;

    renderStatusPill();
    renderEventInfo();
    renderPrizeBreakdown();
    renderProgress();
    if (statusChanged || prev.entry_fee !== next.entry_fee) renderJoinSection();
    if (qChanged) onQuestionChanged(prev, next, pushed);   // status is part of the question key
  }

  function onQuestionChanged(prev, next, pushed) {
    // If the device clock is badly off and the server clock RPC isn't available, infer the offset
    // from a freshly pushed question: deadline - time_limit is "when the server posted it".
    if (pushed && !S.clockKnown && next.question_deadline && next.question_time_limit &&
        next.question_deadline !== prev.question_deadline) {
      const est = (new Date(next.question_deadline).getTime() - next.question_time_limit * 1000) - Date.now();
      if (Math.abs(est) > 3000) S.clockOffset = est;
    }

    const statusChanged = prev.status !== next.status;
    renderQuestion();
    speakHotSeat(prev, next);

    if (statusChanged && next.status === 'active') refreshMeThenRender();      // registration just locked in
    if (next.status === 'finished') {
      fetchBoard();                                                              // authoritative final standings
      setTimeout(fetchBoard, 3000);
      setTimeout(() => { if (S.user) loadWalletBalance().then(renderNavBalance); }, Math.random() * 3000 + 500);
    } else {
      queueBoardRefresh();
    }
  }

  function speakHotSeat(prev, next) {
    if (next.type !== 'hot_seat') return;
    const mine = S.user && prev.current_player_id === S.user.id;   // we already announce our own result
    if (next.current_question && !prev.current_question) {
      const isMe = S.user && next.current_player_id === S.user.id;
      const name = playerName(next.current_player_id);
      speak(`${isMe ? `${name}, your question is:` : `${name}'s question:`} ${next.current_question}`);
    }
    if (next.reveal_answer && !prev.reveal_answer && !mine) {
      speak(`Wrong. The correct answer was ${next.reveal_answer}.`);
    }
    if (!next.current_question && prev.current_question && !next.reveal_answer && !mine) speak('Correct!');
  }

  /* ═══ POLLING SAFETY NET ═════════════════════════════════════════════ */
  function schedulePoll() {
    clearTimeout(S.pollT);
    const base = S.bcOk ? CFG.POLL_SLOW_MS : CFG.POLL_FAST_MS;
    const delay = base * (0.8 + Math.random() * 0.4);              // ±20% jitter
    S.pollT = setTimeout(async () => {
      try { await pollOnce(false); } catch (e) { /* next tick */ }
      schedulePoll();
    }, delay);
  }

  async function pollOnce(force) {
    if (document.hidden && !force) return;
    const started = Date.now();
    const { data, error } = await fetchLatestEvent();
    if (error) { recomputeConn(); return; }
    S.lastPollOk = Date.now();
    S.loadFailed = false;
    if (S.lastPushAt > started) { recomputeConn(); return; }       // a push landed meanwhile: it is newer

    if (!data) {
      if (S.ev) { teardownEvent(); renderNoEvent(false); }
      recomputeConn();
      return;
    }
    if (!S.ev || data.id !== S.ev.id) { await switchToEvent(data); recomputeConn(); return; }

    applyEvent(data, false);
    if (!S.bcOk) pollVoice();
    if ((S.ev.status === 'registering' || S.ev.status === 'active') && Date.now() - S.lbAt > CFG.LB_STALE_MS) {
      await refreshBoardSmart();
    }
    recomputeConn();
  }

  async function resync() {
    await syncClock();
    S.voicePollAt = 0; pollVoice();                  // a clip sent while we were offline still plays if it is fresh
    await pollOnce(true);
    if (S.user) loadWalletBalance().then(renderNavBalance);
  }

  /* ═══ RENDERING ══════════════════════════════════════════════════════ */
  function renderAll() {
    if (!S.ev) { renderNoEvent(false); return; }
    showGrid();
    renderStatusPill();
    renderEventInfo();
    renderPrizeBreakdown();
    renderQuestion();
    renderJoinSection();
    renderLeaderboard();
    renderProgress();
  }

  function showGrid() {
    const g = $('arena-grid'), n = $('no-event');
    if (g) g.hidden = false;
    if (n) n.hidden = true;
  }

  function renderNoEvent(errored) {
    stopCountdown();
    const g = $('arena-grid'), n = $('no-event');
    if (g) g.hidden = true;
    if (n) n.hidden = false;
    const t = $('no-event-title'), p = $('no-event-text');
    if (t) t.textContent = errored ? "Can't reach the Arena" : 'The Arena is Empty';
    if (p) p.textContent = errored
      ? 'We could not load the event. Retrying automatically — check your connection.'
      : 'No events are scheduled right now. MindStark will announce the next Gauntlet soon. Stay sharp.';
    const row = $('status-row');
    if (row) row.innerHTML = `
      <div class="status-pill finished"><div class="status-dot"></div>${errored ? 'Reconnecting…' : 'No Active Events'}</div>`;
  }

  function renderStatusPill() {
    const row = $('status-row'), ev = S.ev;
    if (!row || !ev) return;
    const labels = { registering: 'Registration Open', active: 'Live Now', finished: 'Event Ended', canceled: 'Canceled' };
    const pulse = ev.status === 'active' ? ' pulse' : '';
    row.innerHTML = `
      <div class="status-pill ${esc(ev.status)}">
        <div class="status-dot${pulse}"></div>
        ${esc(labels[ev.status] || ev.status)}
      </div>
      ${ev.status === 'registering' ? `<div class="status-pill registering">Min ${esc(ev.min_participants)} players</div>` : ''}
    `;
  }

  function typeLabel(t) { return t === 'gauntlet' ? 'Gauntlet' : t === 'grand_hall' ? 'Grand Hall' : 'Hot Seat'; }

  function renderEventInfo() {
    const ev = S.ev;
    if (!ev) return;
    const titleEl = $('event-title');
    if (titleEl) {
      titleEl.textContent = ev.title || 'The Arena';
      titleEl.classList.remove('skeleton');
      titleEl.removeAttribute('style');
    }
    const tagEl = $('event-type-tag');
    if (tagEl) {
      tagEl.textContent = ev.type === 'gauntlet' ? '⚔️ Gauntlet — Winner Takes Prize Pool'
        : ev.type === 'grand_hall' ? '🏛 Grand Hall — Everyone Answers'
        : '🎤 Hot Seat — One Player at a Time';
      tagEl.classList.remove('skeleton');
      tagEl.removeAttribute('style');
    }
    const badgeEl = $('event-type-badge');
    if (badgeEl) badgeEl.textContent = typeLabel(ev.type);
    updateEventStats();
  }

  function updateEventStats() {
    const ev = S.ev;
    if (!ev) return;
    const players = S.lbTotal || S.lb.length;
    const fee = $('stat-entry'), pool = $('stat-pool'), pl = $('stat-players'), lbc = $('lb-count');
    if (fee)  fee.textContent  = !ev.entry_fee ? 'Free' : fmtUnits(ev.entry_fee);
    if (pool) pool.textContent = fmtUnits(ev.prize_pool || 0);
    if (pl)   pl.textContent   = players;
    if (lbc)  lbc.textContent  = players;
    const wc = $('wait-count');
    if (wc) wc.textContent = players;
  }

  function renderPrizeBreakdown() {
    const ev = S.ev;
    if (!ev) return;
    const pool = Math.floor((ev.prize_pool || 0) * PRIZE_SHARE);
    const els = [$('prize-1st'), $('prize-2nd'), $('prize-3rd')];
    els.forEach((el, i) => { if (el) el.textContent = pool === 0 ? '—' : fmtUnits(Math.floor(pool * PRIZE_SPLIT[i])); });
  }

  function renderProgress() {
    const ev = S.ev;
    if (!ev) return;
    const wrap = $('progress-wrap'), fill = $('progress-fill'), label = $('q-progress-label'),
          text = $('progress-text'), pct = $('progress-pct');
    const total = ev.total_questions || 10;
    const qNum = Math.min(ev.question_number || 0, total);
    const perc = total > 0 ? Math.round((qNum / total) * 100) : 0;
    if (label) label.textContent = `${qNum} / ${total}`;
    if (ev.status === 'active' || ev.status === 'finished') {
      if (wrap) wrap.style.display = '';
      if (fill) fill.style.width = perc + '%';
      if (text) text.textContent = `Question ${qNum} of ${total}`;
      if (pct)  pct.textContent = perc + '%';
    } else if (wrap) wrap.style.display = 'none';
  }

  /* ── Question card ────────────────────────────────────────────────── */
  function waitingHtml(icon, title, bodyHtml) {
    return `<div class="q-waiting"><div class="q-waiting-icon">${icon}</div><h3>${title}</h3>${bodyHtml}</div>`;
  }

  function renderQuestion() {
    const body = $('question-body'), ev = S.ev;
    if (!body || !ev) return;

    stopCountdown();
    S.locked = false;

    if (ev.status === 'finished') { renderResults(); return; }
    if (ev.type === 'hot_seat') { renderHotSeat(); return; }

    if (!ev.current_question || ev.status === 'registering') {
      const registering = ev.status === 'registering';
      body.innerHTML = waitingHtml(
        registering ? '⏳' : '⚔️',
        registering ? 'Filling the Arena…' : 'Round Complete',
        registering
          ? `<p>Waiting for ${esc(ev.min_participants)} players. <span id="wait-count">${S.lbTotal || S.lb.length}</span> have joined.</p>`
          : '<p>Next question incoming. Stay sharp.</p>'
      );
      return;
    }

    const isGrandHall = ev.type === 'grand_hall';
    const isParticipant = !!(S.me && S.me.status === 'locked');
    const qNum = currentQNum();
    const total = ev.total_questions || 10;
    const answered = isGrandHall ? S.userAnswers[qNum] : null;

    let tail;
    if (isParticipant && !answered) {
      tail = `
        <div class="answer-form">
          <input type="text" class="answer-input" id="answer-input" aria-label="Your answer"
            placeholder="Type your answer…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" maxlength="200"/>
          <button class="submit-btn" id="submit-btn">Submit</button>
        </div>
        <div class="answer-feedback" id="answer-feedback"></div>
        ${isGrandHall ? '<p class="q-hint">Everyone answers independently. Submit before time runs out.</p>' : ''}`;
    } else if (isParticipant && answered) {
      tail = `
        <div class="answer-feedback ${answered.correct ? 'correct' : 'wrong'}">
          ${answered.correct ? '✓ Correct! Point awarded.' : '✗ Incorrect answer submitted.'} Waiting for next question…
        </div>`;
    } else {
      tail = `
        <div class="answer-feedback note">
          ${!S.user ? 'Sign in to participate in events.'
            : ev.status === 'active' && !S.me ? 'Registration is closed for this event. Watch the live leaderboard!'
            : 'You are watching this event.'}
        </div>`;
    }

    body.innerHTML = `
      <div class="q-number">Question ${qNum} of ${total}</div>
      ${isGrandHall && ev.question_deadline ? countdownHtml() : ''}
      <div class="q-text">${esc(ev.current_question)}</div>
      ${tail}`;

    if (isGrandHall && ev.question_deadline) startCountdown(ev.question_deadline, ev.question_time_limit || 30);
    bindAnswerForm();
  }

  function countdownHtml() {
    return `<div class="countdown-wrap">
      <div class="countdown-bar-track"><div class="countdown-bar-fill" id="countdown-fill"></div></div>
      <div class="countdown-label" id="countdown-label">—s</div>
    </div>`;
  }

  function bindAnswerForm() {
    const btn = $('submit-btn'), input = $('answer-input');
    if (!btn || !input) return;
    btn.addEventListener('click', submitAnswer);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submitAnswer(); });
    input.focus();
  }

  /* ── Hot Seat ─────────────────────────────────────────────────────── */
  function playerName(uid) {
    if (!uid) return 'Next player';
    if (S.user && uid === S.user.id) return S.me?.display_name || 'You';
    if (S.names[uid]) return S.names[uid];
    const p = S.lb.find(r => r.user_id === uid);
    if (p && p.display_name) return p.display_name;
    fetchPlayerName(uid);
    return 'Player';
  }
  function fetchPlayerName(uid) {
    if (!S.ev || S.nameLoading[uid]) return;
    S.nameLoading[uid] = true;
    const evId = S.ev.id;
    sb().from('event_participants').select('display_name').eq('event_id', evId).eq('user_id', uid).maybeSingle()
      .then(({ data }) => {
        if (data && data.display_name) {
          S.names[uid] = data.display_name;
          if (S.ev && S.ev.id === evId && S.ev.type === 'hot_seat' && S.ev.current_player_id === uid) renderQuestion();
        }
      }).catch(() => {});
  }

  function renderHotSeat() {
    const body = $('question-body'), ev = S.ev;
    if (!body || !ev) return;

    const isMyTurn = !!(S.user && ev.current_player_id === S.user.id);
    const qNum = Math.min(ev.question_number || 0, ev.total_questions || 10);
    const total = ev.total_questions || 10;

    if (!ev.current_question) {
      if (ev.reveal_answer) {
        body.innerHTML = waitingHtml('💡', 'The correct answer was:',
          `<p class="reveal-answer">${esc(ev.reveal_answer)}</p><p style="margin-top:.75rem;">Next question incoming…</p>`);
      } else {
        const registering = ev.status === 'registering';
        body.innerHTML = waitingHtml('🎤',
          registering ? 'Filling the Arena…' : 'Next question incoming…',
          registering
            ? `<p>Waiting for ${esc(ev.min_participants)} players. <span id="wait-count">${S.lbTotal || S.lb.length}</span> have joined.</p>`
            : '<p>Stay sharp. Your turn may be next.</p>');
      }
      return;
    }

    const name = playerName(ev.current_player_id);
    body.innerHTML = `
      <div class="q-number">Question ${qNum} of ${total}</div>
      <div class="hs-seat${isMyTurn ? ' me' : ''}">
        <div class="hs-avatar">${esc(name.slice(0, 2))}</div>
        <div>
          <div class="hs-label">In the Hot Seat</div>
          <div class="hs-name">${esc(name)}${isMyTurn ? " — That's You!" : ''}</div>
        </div>
        ${isMyTurn ? '<div class="hs-flag">🎯</div>' : ''}
      </div>
      ${ev.question_deadline ? countdownHtml() : ''}
      <div class="q-text">${esc(ev.current_question)}</div>
      ${isMyTurn ? `
        <div class="answer-form">
          <input type="text" class="answer-input" id="answer-input" aria-label="Your answer"
            placeholder="Your answer…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" maxlength="200"/>
          <button class="submit-btn" id="submit-btn">Submit</button>
        </div>
        <div class="answer-feedback" id="answer-feedback"></div>
        <p class="q-hint">Everyone is watching. Answer carefully.</p>
      ` : `
        <div class="answer-feedback note">👁 Watching mode — ${esc(name)} is answering.</div>
      `}`;

    if (ev.question_deadline) startCountdown(ev.question_deadline, ev.question_time_limit || 30);
    bindAnswerForm();
  }

  /* ── Countdown (server-corrected clock) ───────────────────────────── */
  let cdTimer = null;
  function stopCountdown() { if (cdTimer) { clearInterval(cdTimer); cdTimer = null; } }

  function startCountdown(deadline, totalSeconds) {
    stopCountdown();
    const fill = $('countdown-fill'), label = $('countdown-label');
    if (!fill || !label) return;
    const end = new Date(deadline).getTime();
    const tick = () => {
      const remainingMs = end - now();
      const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
      const pct = Math.max(0, Math.min(100, (remainingMs / (totalSeconds * 1000)) * 100));
      label.textContent = remaining + 's';
      fill.style.width = pct + '%';
      fill.style.background = remaining <= 5 ? 'var(--danger)' : remaining <= 10 ? 'var(--warn)' : 'var(--gold)';
      if (remainingMs <= 0) { stopCountdown(); onTimeUp(); }
    };
    tick();
    cdTimer = setInterval(tick, 250);
  }

  function onTimeUp() {
    // Only lock the UI when the clock is trustworthy. Otherwise leave it open:
    // the server is the authority on deadlines and will reject a late answer.
    if (!S.clockKnown) return;
    const input = $('answer-input'), btn = $('submit-btn'), fb = $('answer-feedback');
    if (input) input.disabled = true;
    if (btn) btn.disabled = true;
    if (fb && !fb.textContent.trim()) showFeedback(fb, 'wrong', "Time's up!");
  }

  /* ═══ ANSWERING ══════════════════════════════════════════════════════ */
  function showFeedback(el, type, msg) {
    if (!el) return;
    el.className = `answer-feedback ${type}`;
    el.textContent = msg;
  }

  async function submitAnswer() {
    const ev = S.ev;
    if (!ev || !S.user || S.locked) return;
    const input = $('answer-input'), btn = $('submit-btn'), fb = $('answer-feedback');
    if (!input || !btn) return;
    const answer = input.value.trim();
    if (!answer) { input.focus(); return; }

    const type = ev.type, qNum = currentQNum(), qKey = questionKey(ev);
    S.locked = true;
    btn.disabled = true; btn.textContent = '…'; input.disabled = true;

    let fn, params;
    if (type === 'hot_seat') {
      fn = 'submit_hot_seat_answer';
      params = { p_user_id: S.user.id, p_event_id: ev.id, p_answer: answer };
    } else if (type === 'grand_hall') {
      fn = 'submit_grand_hall_answer';
      params = { p_user_id: S.user.id, p_event_id: ev.id, p_answer: answer, p_question_num: qNum };
    } else {
      fn = 'submit_answer';
      params = { p_user_id: S.user.id, p_event_id: ev.id, p_answer: answer };
    }
    // NOTE: p_user_id is sent for compatibility with the current functions. The server must ignore it
    // and use auth.uid() — see arena-1-audit.sql / the notes in arena-2-hardening.sql.

    const { data, error } = await callRpc(fn, params);
    const r = data && typeof data === 'object' ? data : {};

    let kind, text;
    if (error) {
      if (error.code === 'CLIENT_TIMEOUT') { kind = 'network'; text = 'Slow connection — your answer may still count. Checking…'; }
      else if (isNetworkErr(error))        { kind = 'network'; text = 'Network error. Try again.'; }
      else                                 { kind = 'error';   text = friendlyError(error.message); }
    } else if (r.correct)                  { kind = 'correct'; text = '✓ Correct! Point awarded.'; }
    else if (r.error)                      { kind = 'error';   text = String(r.error); }
    else if (type === 'gauntlet' && r.message) { kind = 'info'; text = String(r.message); }
    else if (type === 'hot_seat')          { kind = 'wrong';   text = `✗ Wrong. The correct answer was: ${r.correct_answer || '—'}`; }
    else if (type === 'grand_hall')        { kind = 'wrong';   text = '✗ Incorrect. Better luck next question.'; }
    else                                   { kind = 'wrong';   text = '✗ Incorrect. Try again!'; }

    // Side effects that must happen even if the question already moved on
    if (type === 'grand_hall' && (kind === 'correct' || kind === 'wrong')) S.userAnswers[qNum] = { correct: kind === 'correct' };
    if (kind === 'correct') {
      showToast(type === 'gauntlet' ? 'Correct answer! 🎯' : 'Correct! 🎯', 'success');
      if (type === 'hot_seat') speak('Correct!');
      queueBoardRefresh(600);
    } else if (kind === 'wrong') {
      showToast('Wrong answer.', 'error');
      if (type === 'hot_seat') speak(`Wrong. The correct answer was ${r.correct_answer || 'unknown'}.`);
    }
    if (error && error.code === 'CLIENT_TIMEOUT') queueBoardRefresh(300);

    const stale = questionKey(S.ev) !== qKey || !document.body.contains(input);
    if (stale) return;                                // new question already rendered fresh

    showFeedback(fb, kind === 'correct' ? 'correct' : 'wrong', text);

    const unlock = (delay, clear) => setTimeout(() => {
      if (!document.body.contains(input) || questionKey(S.ev) !== qKey) return;
      S.locked = false;
      input.disabled = false; btn.disabled = false; btn.textContent = 'Submit';
      if (clear) input.value = '';
      input.focus();
    }, delay);

    if (type === 'gauntlet') {
      if (kind === 'wrong')                       unlock(CFG.WRONG_COOLDOWN_MS, true);
      else if (kind !== 'correct')                unlock(0, false);
      else btn.textContent = 'Submit';            // stays locked until the next question
    } else if (type === 'grand_hall') {
      if (kind === 'network')                     unlock(0, false);
      else btn.textContent = 'Submit';            // answers are final
    } else {                                      // hot seat
      if (kind === 'error' || kind === 'network') unlock(0, false);
      else btn.textContent = 'Submit';
    }
  }

  /* ═══ JOINING ════════════════════════════════════════════════════════ */
  function renderJoinSection() {
    const body = $('join-body'), ev = S.ev;
    if (!body || !ev) return;

    if (S.me) {
      const score = S.me.score || 0;
      body.innerHTML = `
        <div class="already-joined">✓ You're in the Arena. Good luck.</div>
        <div class="standing">
          <div><span class="standing-val">${S.myRank ? '#' + esc(S.myRank) : '—'}</span><span class="standing-lbl">Rank</span></div>
          <div><span class="standing-val">${esc(score)}</span><span class="standing-lbl">Point${score === 1 ? '' : 's'}</span></div>
        </div>`;
      return;
    }

    if (!S.user) {
      body.innerHTML = `
        <p class="join-desc">Sign in to compete in Arena events and win wallet units.</p>
        <button class="join-btn" id="signin-btn">Sign In to Join</button>`;
      $('signin-btn').addEventListener('click', () => { window.location.href = 'signin.html'; });
      return;
    }

    if (ev.status === 'finished' || ev.status === 'canceled') {
      body.innerHTML = `
        <p class="join-desc">This event has ended. Stay tuned for the next Gauntlet.</p>
        <button class="join-btn" disabled>Event Ended</button>`;
      return;
    }

    if (ev.status === 'active') {
      body.innerHTML = `
        <p class="join-desc">This event is live. Registration is closed. Watch and learn for next time.</p>
        <button class="join-btn" disabled>Registration Closed</button>`;
      return;
    }

    const fee = ev.entry_fee || 0;
    const canAfford = S.balance >= fee;
    body.innerHTML = `
      <p class="join-desc">
        ${fee === 0
          ? 'This event is free to enter. Join and compete for glory.'
          : `Entry costs <strong style="color:var(--gold)">${esc(fmtUnits(fee))}</strong>. Your balance: <strong style="color:var(--gold)">${esc(fmtUnits(S.balance))}</strong>.`}
      </p>
      <button class="join-btn" id="join-btn" ${!canAfford && fee > 0 ? 'disabled' : ''}>
        ${fee === 0 ? 'Join Free' : canAfford ? `Join · ${esc(fmtUnits(fee))}` : 'Insufficient Balance'}
      </button>
      ${!canAfford && fee > 0 ? '<p class="join-note">Top up your Wallet to enter.</p>' : ''}`;

    const joinBtn = $('join-btn');
    if (joinBtn && (canAfford || fee === 0)) {
      joinBtn.addEventListener('click', () => { if (fee === 0) handleFreeJoin(); else openPinModal(); });
    }
  }

  /** Join with reconciliation: a lost response must never double-charge or strand the player. */
  async function attemptJoin(walletId) {
    const ok = { ok: true };
    for (let i = 0; i < 3; i++) {
      // Current function signature. The server must derive the user/wallet from auth.uid() and
      // verify the PIN itself (see arena-2-hardening.sql notes) — never trust these parameters.
      const { data, error } = await callRpc('join_gauntlet',
        { p_user_id: S.user.id, p_event_id: S.ev.id, p_wallet_id: walletId }, CFG.JOIN_TIMEOUT_MS);

      if (!error) {
        if (data && data.success) return ok;
        await loadParticipation();
        if (S.me) return ok;
        return { ok: false, msg: (data && data.error) || 'Could not join. Try again.' };
      }
      await loadParticipation();                       // did the first attempt actually land?
      if (S.me) return ok;
      if (!isNetworkErr(error)) return { ok: false, msg: friendlyError(error.message) };
      await sleep(600 * Math.pow(2, i) + Math.random() * 400);
    }
    return { ok: false, msg: 'Network error. Please try again.' };
  }

  async function afterJoined() {
    await Promise.all([loadParticipation(), loadWalletBalance(), fetchBoard()]);
    renderNavBalance();
    renderJoinSection();
    renderPrizeBreakdown();
    renderLeaderboard();
    updateEventStats();
  }

  async function handleFreeJoin() {
    if (!S.user || !S.ev || S.joining) return;
    S.joining = true;
    const btn = $('join-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Joining…'; }
    try {
      const walletId = await ensureWalletId();
      const res = await attemptJoin(walletId);
      if (res.ok) { await afterJoined(); showToast("You're in the Arena! ⚔️", 'success'); }
      else { showToast(res.msg, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Join Free'; } }
    } catch (e) {
      showToast('Network error. Try again.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Join Free'; }
    } finally { S.joining = false; }
  }

  /* ── PIN modal ────────────────────────────────────────────────────── */
  let modalOpener = null;
  function openPinModal() {
    const ev = S.ev;
    if (!ev) return;
    const fee = ev.entry_fee || 0;
    $('modal-fee').textContent = fmtUnits(fee);
    $('modal-balance').textContent = fmtUnits(S.balance);
    $('modal-after').textContent = fmtUnits(Math.max(0, S.balance - fee));
    const pinInput = $('pin-input');
    pinInput.value = '';
    $('modal-err').textContent = '';
    $('modal-confirm-btn').disabled = false;
    $('modal-confirm-btn').textContent = 'Confirm & Join';
    modalOpener = document.activeElement;
    $('pin-modal').classList.add('open');
    $('pin-modal').setAttribute('aria-hidden', 'false');
    setTimeout(() => pinInput.focus(), 300);
  }

  function closePinModal() {
    const m = $('pin-modal');
    if (!m || !m.classList.contains('open')) return;
    m.classList.remove('open');
    m.setAttribute('aria-hidden', 'true');
    if (modalOpener && typeof modalOpener.focus === 'function') modalOpener.focus();
  }

  async function sha256(message) {
    if (!(window.crypto && crypto.subtle)) throw new Error('secure-context');
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function handlePinConfirm() {
    if (S.joining) return;
    const pinInput = $('pin-input'), errEl = $('modal-err'), confirmBtn = $('modal-confirm-btn');
    if (!pinInput || !S.user || !S.ev) return;

    const fail = (msg, clearPin) => {
      errEl.textContent = msg;
      confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm & Join';
      if (clearPin) { pinInput.value = ''; pinInput.focus(); }
    };

    if (Date.now() < S.pinLockUntil) {
      return fail(`Too many attempts. Try again in ${Math.ceil((S.pinLockUntil - Date.now()) / 1000)}s.`, true);
    }
    const pin = pinInput.value.trim();
    if (!/^\d{4}$/.test(pin)) { errEl.textContent = 'Enter a valid 4-digit PIN.'; return; }

    S.joining = true;
    confirmBtn.disabled = true; confirmBtn.textContent = 'Verifying…';
    errEl.textContent = '';

    try {
      const walletId = await ensureWalletId();
      if (!walletId) return fail('Wallet not found. Open your Wallet first.', false);

      const pinHash = await sha256(pin);
      const { data: pinValid, error: pinErr } = await callRpc('verify_transaction_pin',
        { p_wallet_id: walletId, p_pin_hash: pinHash }, 10000);
      if (pinErr) return fail(isNetworkErr(pinErr) ? 'Network error. Please try again.' : 'Could not verify your PIN. Try again.', false);
      if (!pinValid) {
        S.pinFails++;
        if (S.pinFails >= 5) { S.pinLockUntil = Date.now() + 60000; S.pinFails = 0; }
        return fail('Incorrect PIN. Please try again.', true);
      }
      S.pinFails = 0;

      confirmBtn.textContent = 'Joining…';
      const res = await attemptJoin(walletId);
      if (res.ok) {
        const fee = S.ev?.entry_fee || 0;
        closePinModal();
        await afterJoined();
        showToast(`Entered! ${fmtUnits(fee)} locked. ⚔️`, 'success');
      } else {
        fail(res.msg || 'Failed to join. Please try again.', false);
      }
    } catch (e) {
      fail(e && e.message === 'secure-context' ? 'This page must be opened over HTTPS.' : 'Network error. Please try again.', false);
    } finally { S.joining = false; }
  }

  /* ── Leaderboard ──────────────────────────────────────────────────── */
  function lbRowHtml(p, rankText, rankClass, isMe) {
    const name = p.display_name || 'Anonymous';
    return `
      <div class="lb-row${isMe ? ' is-me' : ''}">
        <span class="lb-rank ${rankClass}">${esc(rankText)}</span>
        <div class="lb-avatar">${esc(name.slice(0, 2))}</div>
        <span class="lb-name">${esc(name)}${isMe ? '<span class="you-tag">You</span>' : ''}</span>
        <span class="lb-score">${esc(p.score)}</span>
      </div>`;
  }

  function renderLeaderboard() {
    const list = $('leaderboard-list');
    if (!list) return;
    const total = S.lbTotal || S.lb.length;
    const badge = $('lb-count');
    if (badge) badge.textContent = total;

    if (!S.lb.length) { list.innerHTML = '<div class="lb-empty">No participants yet. Be the first.</div>'; return; }

    const icons = ['🥇', '🥈', '🥉'], classes = ['gold', 'silver', 'bronze'];
    const rows = S.lb.slice(0, CFG.LB_LIMIT);
    let html = rows.map((p, i) => {
      const isMe = !!(S.user && p.user_id === S.user.id);
      return lbRowHtml(p, i < 3 ? icons[i] : String(i + 1), i < 3 ? classes[i] : '', isMe);
    }).join('');

    // With 1,000 players you are rarely in the top 20 — always show where you stand.
    const inTop = S.user && rows.some(p => p.user_id === S.user.id);
    if (S.me && S.myRank && !inTop) {
      html += `<div class="lb-gap" aria-hidden="true">⋯</div>` +
        lbRowHtml({ display_name: S.me.display_name || 'You', score: S.me.score || 0 }, String(S.myRank), '', true);
    }
    if (total > rows.length) html += `<div class="lb-more">Showing top ${rows.length} of ${total} players</div>`;
    list.innerHTML = html;
  }

  /* ── Results / podium ─────────────────────────────────────────────── */
  function renderResults() {
    const body = $('question-body'), ev = S.ev;
    if (!body || !ev) return;
    const pool = (ev.prize_pool || 0) * PRIZE_SHARE;
    const top3 = S.lb.slice(0, 3);
    const order = [top3[1], top3[0], top3[2]];                 // visual order: 2nd, 1st, 3rd
    const crowns = ['🥈', '🥇', '🥉'];
    const payouts = [PRIZE_SPLIT[1], PRIZE_SPLIT[0], PRIZE_SPLIT[2]];
    // Bar height follows the SCORE, so players tied on points stand at the same height.
    // Prize order still follows rank (a tie is decided by who answered correctly first).
    const tierNames = ['first', 'second', 'third'];
    const tierOf = p => tierNames[Math.min(2, new Set(top3.filter(q => q.score > p.score).map(q => q.score)).size)];
    const hasTie = top3.some((p, i) => i > 0 && p.score === top3[i - 1].score);
    const others = (S.lbTotal || S.lb.length) - 3;

    body.innerHTML = `
      <div class="results-body">
        <div class="results-title">⚔️ The Arena Has Spoken</div>
        <div class="podium">
          ${order.map((p, i) => p ? `
            <div class="podium-place">
              <div class="podium-crown">${crowns[i]}</div>
              <div class="podium-name">${esc(p.display_name || 'Anonymous')}</div>
              <div class="podium-score">${esc(p.score)} pts</div>
              <div class="podium-bar ${tierOf(p)}">
                <div class="podium-payout">${pool > 0 ? '+' + esc(fmtUnits(Math.floor(pool * payouts[i]))) : 'Free event'}</div>
              </div>
            </div>` : `<div class="podium-place"><div class="podium-bar third" style="opacity:.35"></div></div>`).join('')}
        </div>
        ${hasTie ? `<p class="results-note">Tied on points. The faster correct answer ranks higher.</p>` : ''}
        ${others > 0 ? `<p class="results-note">${others} other participant${others === 1 ? '' : 's'} competed bravely.</p>` : ''}
        ${S.me && S.myRank ? `<p class="results-note" style="margin-top:.6rem;">You finished <strong style="color:var(--gold)">#${esc(S.myRank)}</strong> with ${esc(S.me.score || 0)} point${S.me.score === 1 ? '' : 's'}.</p>` : ''}
      </div>`;
  }

  /* ── Host commentary banner ───────────────────────────────────────── */
  function showAdminComment(message) {
    if (!message) return;
    const old = $('admin-comment-banner');
    if (old) old.remove();

    const banner = document.createElement('div');
    banner.id = 'admin-comment-banner';
    banner.className = 'host-banner';
    banner.setAttribute('role', 'status');
    banner.innerHTML = `
      <span style="font-size:1.1rem;flex-shrink:0;">🎙</span>
      <div>
        <div class="host-banner-label">MindStark Host</div>
        <div class="host-banner-text"></div>
      </div>
      <button class="host-banner-x" aria-label="Dismiss">✕</button>`;
    banner.querySelector('.host-banner-text').textContent = message;      // textContent: no HTML injection
    banner.querySelector('.host-banner-x').addEventListener('click', () => banner.remove());
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('show'));

    speak(`Host says: ${message}`);
    setTimeout(() => {
      if (!banner.parentElement) return;
      banner.classList.remove('show');
      setTimeout(() => banner.remove(), 400);
    }, 8000);
  }

  /* ── Toast ────────────────────────────────────────────────────────── */
  let toastT = null;
  function showToast(msg, type) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `toast${type ? ' ' + type : ''} show`;
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 3200);
  }

})();