/**
 * ═══════════════════════════════════════════════════════════════════════
 *  arena-admin.js — MindStark · Arena Control Panel
 *
 *  SECURITY MODEL
 *  This page is a convenience UI, not a security boundary. Anyone can edit
 *  JavaScript in their own browser, so every table and RPC used here MUST
 *  enforce admin rights on the server (RLS policies + an is_arena_admin()
 *  check inside the functions). The gate below asks the server
 *  (is_arena_admin) and only falls back to a user-ID comparison while that
 *  function has not been deployed yet. See arena-2-hardening.sql.
 *
 *  STABILITY FOR LARGE EVENTS
 *  - All calls go through supabase-js, which refreshes the auth token
 *    automatically (the old code reused a token captured at page load,
 *    which expires after ~1 hour and would break a long event mid-game).
 *  - The leaderboard is a top-20 snapshot polled every few seconds. The old
 *    code re-downloaded every participant on every score change, which at
 *    1,000 players would hammer both the browser and the database.
 * ═══════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  const CFG = {
    ADMIN_USER_ID: '429025f0-a2b5-41ec-a292-29e8a2241690', // fallback only; the server decides
    BOARD_POLL_MS: 3000,
    LB_LIMIT: 20,
    AUTO_GRACE_MS: 1500,     // extra pause before auto-posting so last-second answers on slow links still count
    LOG_MAX: 200,
    ...(window.ARENA_ADMIN_CONFIG || {}),
  };
  const PRIZE_SHARE = 0.85;

  /* ── State ────────────────────────────────────────────────────────── */
  const S = {
    ev: null, queue: [], requests: [],
    board: { top: [], total: 0 }, rpcBoard: null,
    ch: null,
    posting: false,
    autoOn: true, autoTimer: null, autoTick: null, autoDeadline: 0,
    boardT: null, boardBusy: false, tick: 0,
  };

  const $ = id => document.getElementById(id);
  const sb = () => window._sb;

  /* ── Boot ─────────────────────────────────────────────────────────── */
  let booted = false;
  document.addEventListener('supabase:ready', boot);
  if (window._sb) boot();

  async function boot() {
    if (booted) return;
    booted = true;

    const allowed = await checkAdmin();
    if (!allowed) {
      const t = $('wall-title'), p = $('wall-text');
      if (t) t.textContent = 'Restricted Area';
      if (p) p.textContent = 'This control panel is for the MindStark Arena administrator only.';
      log('Access denied: this panel is restricted to the Arena administrator.', 'err');
      return;                                   // the wall stays up
    }
    const wall = $('access-wall');
    if (wall) wall.style.display = 'none';

    bindUI();
    syncTimeLimitField();
    await Promise.all([loadCurrentEvent(), loadRequests(), loadAnnouncements()]);
    log('Arena Control Panel ready. Welcome, Tony.', 'info');
  }

  async function checkAdmin() {
    let user = null;
    try { const r = await sb().auth.getSession(); user = r.data?.session?.user || null; } catch (e) { /* none */ }
    if (!user) return false;

    const { data, error } = await sb().rpc('is_arena_admin');
    if (!error && typeof data === 'boolean') return data;   // the server's answer wins
    return user.id === CFG.ADMIN_USER_ID;                    // function not deployed yet: UI-only fallback
  }

  /* ── Helpers ──────────────────────────────────────────────────────── */
  function esc(str) {
    if (str === undefined || str === null) return '';
    return String(str).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function clampInt(v, min, max, def) {
    const n = parseInt(v, 10);
    if (!isFinite(n)) return def;
    return Math.min(max, Math.max(min, n));
  }
  const isTimed = type => type === 'grand_hall' || type === 'hot_seat';

  /** supabase-js RPC → the {success, error, …} shape the rest of this file expects. */
  async function rpc(fn, params) {
    try {
      const { data, error } = await sb().rpc(fn, params || {});
      if (error) return { success: false, error: error.message || String(error) };
      if (data && typeof data === 'object' && !Array.isArray(data)) return data;
      return { success: true, data };            // void functions return null on success
    } catch (e) {
      return { success: false, error: (e && e.message) || String(e) };
    }
  }

  /* ── Static UI binding (all delegated: no inline handlers) ────────── */
  function bindUI() {
    $('create-btn').addEventListener('click', handleCreateEvent);
    $('ev-type').addEventListener('change', syncTimeLimitField);
    $('add-q-btn').addEventListener('click', handleAddQuestion);
    $('post-q-btn').addEventListener('click', () => handlePostNextQuestion());
    $('refresh-lb-btn').addEventListener('click', () => loadBoard(true));
    $('clear-log-btn').addEventListener('click', () => { $('activity-log').innerHTML = ''; });
    $('refresh-req-btn').addEventListener('click', loadRequests);
    $('refresh-ann-btn').addEventListener('click', loadAnnouncements);
    $('send-comment-btn').addEventListener('click', handleSendComment);
    $('post-ann-btn').addEventListener('click', handlePostAnnouncement);
    bindVoice();

    $('q-answer').addEventListener('keydown', e => { if (e.key === 'Enter') handleAddQuestion(); });
    $('comment-text').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendComment(); }
    });

    $('auto-advance').addEventListener('change', e => {
      S.autoOn = e.target.checked;
      if (!S.autoOn) clearAuto();
      updateAutoStatus();
    });

    $('active-body').addEventListener('click', e => {
      const b = e.target.closest('button[data-action]');
      if (!b) return;
      const a = b.dataset.action;
      if (a === 'start') handleStartEvent();
      else if (a === 'cancel') handleCancelEvent();
      else if (a === 'finalize') handleFinalizeEvent();
    });

    $('q-queue').addEventListener('click', e => {
      const b = e.target.closest('button[data-remove]');
      if (b) removeQuestion(b.dataset.remove);
    });

    $('requests-list').addEventListener('click', e => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const id = b.dataset.id;
      if (b.dataset.act === 'approve') setRequestStatus(id, 'approved');
      else if (b.dataset.act === 'reject') setRequestStatus(id, 'rejected');
      else if (b.dataset.act === 'use') useRequest(id);
    });

    $('announcements-list').addEventListener('click', e => {
      const b = e.target.closest('button[data-del]');
      if (b) deleteAnnouncement(b.dataset.del);
    });

    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.ev) loadBoard(true); });
  }

  /** Time limit applies to Grand Hall AND Hot Seat (the old code only handled Grand Hall). */
  function syncTimeLimitField() {
    $('time-limit-group').hidden = !isTimed($('ev-type').value);
  }

  /* ═══ EVENT LOAD / RENDER ════════════════════════════════════════════ */
  async function loadCurrentEvent() {
    const { data, error } = await sb().from('events_public').select('*')
      .in('status', ['registering', 'active'])
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();

    if (error) { log('Error loading event: ' + error.message, 'err'); return; }

    const prevId = S.ev && S.ev.id;
    S.ev = data || null;

    if (!S.ev) {
      clearAuto();
      unsubscribeRealtime();
      stopBoardPolling();
      S.board = { top: [], total: 0 };
      S.queue = [];
      renderNoEvent();
      renderQueue();
      renderBoard();
      return;
    }

    log(`Event loaded: "${S.ev.title}" [${S.ev.status}]`, 'info');
    if (prevId !== S.ev.id) S.board = { top: [], total: 0 };
    await loadQueue();
    renderActiveEvent();
    subscribeRealtime();
    startBoardPolling();
  }

  function renderNoEvent() {
    if (typeof voiceSetEnabled === 'function') voiceSetEnabled();
    const pill = $('event-status-pill'), body = $('active-body'), postBtn = $('post-q-btn');
    if (pill) pill.innerHTML = '—';
    if (postBtn) postBtn.disabled = true;
    $('auto-row').hidden = true;
    if (body) body.innerHTML = '<p class="muted">No active event. Create one using the form.</p>';
  }

  function renderActionButtons(ev) {
    if (ev.status === 'registering') {
      return `
        <button class="btn btn-success" data-action="start">▶ Start Event</button>
        <button class="btn btn-danger" data-action="cancel">✕ Cancel Event</button>`;
    }
    if (ev.status === 'active') {
      return `
        <button class="btn btn-danger" data-action="finalize">🏆 Finalize &amp; Pay Out</button>
        <button class="btn btn-danger" data-action="cancel">✕ Cancel &amp; Refund</button>`;
    }
    return '<p class="muted">Event has ended.</p>';
  }

  function renderActiveEvent() {
    if (typeof voiceSetEnabled === 'function') voiceSetEnabled();
    const ev = S.ev;
    if (!ev) { renderNoEvent(); return; }

    $('event-status-pill').innerHTML = `
      <span class="pill ${esc(ev.status)}">
        <span class="pill-dot${ev.status === 'active' ? ' pulse' : ''}"></span>
        ${esc(ev.status)}
      </span>`;

    $('active-body').innerHTML = `
      <div class="event-panel-header">
        <div>
          <div class="event-panel-title">${esc(ev.title)}</div>
          <div class="event-meta">
            <span>🆔 <span class="mono">${esc(String(ev.id).slice(0, 8))}…</span></span>
            <span>⚔️ ${esc(ev.type)}</span>
            <span>💰 ${esc(ev.entry_fee)} units entry</span>
            ${isTimed(ev.type) ? `<span>⏱ ${esc(ev.question_time_limit || 30)}s / question</span>` : ''}
          </div>
        </div>
      </div>

      <div class="stat-row">
        <div class="stat-cell"><span class="stat-val" id="s-players">0</span><span class="stat-lbl">Players</span></div>
        <div class="stat-cell"><span class="stat-val" id="s-pool">0 tr</span><span class="stat-lbl">Pool</span></div>
        <div class="stat-cell"><span class="stat-val" id="s-payout">0 tr</span><span class="stat-lbl">Payout (85%)</span></div>
        <div class="stat-cell"><span class="stat-val" id="s-qnum">0/0</span><span class="stat-lbl">Questions</span></div>
      </div>

      <div class="action-row">${renderActionButtons(ev)}</div>

      <div class="divider"></div>
      <p class="meta-note">Current question:
        <span id="s-current" style="color:var(--arena-text);"></span>
      </p>`;

    $('post-q-btn').disabled = ev.status !== 'active' || S.posting;
    $('auto-row').hidden = ev.type !== 'grand_hall';
    renderStats();
  }

  /** Cheap, targeted update — used for prize-pool / player-count changes so the panel never re-mounts. */
  function renderStats() {
    const ev = S.ev;
    if (!ev) return;
    const pool = ev.prize_pool || 0;
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set('s-players', S.board.total);
    set('s-pool', `${pool} tr`);
    set('s-payout', `${Math.floor(pool * PRIZE_SHARE)} tr`);       // keeps the " tr" suffix (was dropped on live updates)
    set('s-qnum', `${ev.question_number || 0}/${ev.total_questions}`);
    set('s-current', ev.current_question ? ev.current_question : '— (none active)');
    const tot = $('lb-total');
    if (tot) tot.textContent = S.board.total > CFG.LB_LIMIT ? `top ${CFG.LB_LIMIT} of ${S.board.total}` : `${S.board.total} player${S.board.total === 1 ? '' : 's'}`;
  }

  /* ═══ CREATE / START / FINALIZE / CANCEL ═════════════════════════════ */
  async function handleCreateEvent() {
    const title     = $('ev-title').value.trim();
    const fee       = clampInt($('ev-fee').value, 0, 10000000, 0);
    const minP      = clampInt($('ev-min').value, 1, 100000, 5);
    const totalQ    = clampInt($('ev-questions').value, 1, 50, 10);
    const type      = $('ev-type').value;
    const timeLimit = clampInt($('ev-time-limit').value, 5, 300, 30);

    if (!title) { showToast('Enter an event title.', 'err'); return; }
    if (isTimed(type) && timeLimit < 5) { showToast('Set a valid time limit (min 5 seconds).', 'err'); return; }

    if (S.ev && (S.ev.status === 'registering' || S.ev.status === 'active') &&
        !confirm(`"${S.ev.title}" is still ${S.ev.status}. Players only ever see the newest event.\n\nCreate another one anyway?`)) return;

    const btn = $('create-btn');
    btn.disabled = true; btn.textContent = 'Creating…';

    const { data, error } = await sb().from('events_public')
      .insert({
        title, type,
        entry_fee: fee,
        min_participants: minP,
        total_questions: totalQ,
        question_time_limit: isTimed(type) ? timeLimit : 0,   // Hot Seat gets its limit too
        status: 'registering',
      })
      .select('*').single();

    btn.disabled = false; btn.textContent = '⚔️ Create Event';

    if (error) {
      log('Create event failed: ' + error.message, 'err');
      showToast('Failed to create event.', 'err');
      return;
    }

    clearAuto();
    S.ev = data;
    S.board = { top: [], total: 0 };
    S.queue = [];
    log(`Event created: "${title}" [ID: ${String(data.id).slice(0, 8)}…]`, 'ok');
    showToast('Event created! Registration is open.', 'ok');
    renderActiveEvent();
    renderQueue();
    renderBoard();
    subscribeRealtime();
    startBoardPolling();
    $('ev-title').value = '';
  }

  async function handleStartEvent() {
    if (!S.ev) return;
    if (!confirm(`Start "${S.ev.title}"? This locks in registrations and opens the event to questions.`)) return;

    const btn = document.querySelector('[data-action="start"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Starting…'; }

    const fn = S.ev.type === 'hot_seat' ? 'start_hot_seat_event' : 'start_event';
    const res = await rpc(fn, { p_event_id: S.ev.id });

    if (!res.success) {
      log('Start failed: ' + (res.error || JSON.stringify(res)), 'err');
      showToast(res.error || 'Could not start event.', 'err');
      if (btn) { btn.disabled = false; btn.textContent = '▶ Start Event'; }
      return;
    }
    log(`Event started! ${res.participants ?? '?'} participant(s) locked in.`, 'ok');
    showToast(`Event is LIVE with ${res.participants ?? '?'} players!`, 'ok');
    await loadCurrentEvent();
  }

  async function handleFinalizeEvent() {
    if (!S.ev) return;
    if (!confirm(`Finalize "${S.ev.title}"? This pays out winners and ends the event.`)) return;

    clearAuto();
    const btn = document.querySelector('[data-action="finalize"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Finalizing…'; }

    const res = await rpc('finalize_gauntlet', { p_event_id: S.ev.id });

    if (!res.success) {
      log('Finalize failed: ' + (res.error || JSON.stringify(res)), 'err');
      showToast('Finalization failed.', 'err');
      if (btn) { btn.disabled = false; btn.textContent = '🏆 Finalize & Pay Out'; }
      return;
    }
    if (res.action === 'refunded') {
      log('Below threshold — all participants refunded.', 'info');
      showToast('Below threshold. Everyone refunded.', 'ok');
    } else {
      log(`Paid out! Prize pool: ${res.prize_pool} tr. Rake: ${res.rake} tr.`, 'ok');
      showToast(`Done! ${res.prize_pool} tr paid to top 3.`, 'ok');
    }
    await loadCurrentEvent();
  }

  async function handleCancelEvent() {
    if (!S.ev) return;
    if (!confirm(`Cancel "${S.ev.title}"? All entry fees will be refunded.`)) return;

    clearAuto();
    const res = await rpc('refund_event', { p_event_id: S.ev.id });

    // The old code treated ANY response as success. Now a failed refund is reported, not hidden.
    if (!res.success) {
      log('Cancel/refund failed: ' + (res.error || JSON.stringify(res)), 'err');
      showToast('Refund failed — event NOT canceled.', 'err');
      return;
    }
    log('Event canceled. All participants refunded.', 'ok');
    showToast('Event canceled. Units refunded.', 'ok');
    S.ev = null;
    await loadCurrentEvent();
  }

  /* ═══ QUESTION QUEUE ═════════════════════════════════════════════════ */
  async function loadQueue() {
    if (!S.ev) { S.queue = []; renderQueue(); return; }
    const { data, error } = await sb().from('event_question_queue')
      .select('*').eq('event_id', S.ev.id).order('position', { ascending: true });
    if (error) log('Could not load queue: ' + error.message, 'err');
    S.queue = Array.isArray(data) ? data : S.queue;
    renderQueue();
  }

  function renderQueue() {
    const container = $('q-queue'), count = $('queue-count');
    const n = S.queue.length;
    if (count) count.textContent = `${n} question${n === 1 ? '' : 's'}`;
    if (!n) { container.innerHTML = '<div class="q-empty">No questions queued. Add some above.</div>'; return; }

    container.innerHTML = S.queue.map((q, i) => `
      <div class="q-item">
        <span class="q-num">${i + 1}</span>
        <span class="q-text">${esc(String(q.question).slice(0, 80))}${String(q.question).length > 80 ? '…' : ''}</span>
        <span class="q-answer">→ ${esc(q.answer)}</span>
        <button class="icon-btn" data-remove="${esc(q.id)}" title="Remove" aria-label="Remove question ${i + 1}">✕</button>
      </div>`).join('');
  }

  async function handleAddQuestion() {
    const qText = $('q-text').value.trim();
    const qAns  = $('q-answer').value.trim();
    if (!qText) { showToast('Enter a question.', 'err'); return; }
    if (!qAns)  { showToast('Enter the answer.', 'err'); return; }
    if (!S.ev)  { showToast('Create an event first.', 'err'); return; }

    const btn = $('add-q-btn');
    btn.disabled = true; btn.textContent = 'Saving…';

    const { data: last, error: posErr } = await sb().from('event_question_queue')
      .select('position').eq('event_id', S.ev.id)
      .order('position', { ascending: false }).limit(1).maybeSingle();
    const nextPos = !posErr && last ? last.position + 1 : 0;

    const { error } = await sb().from('event_question_queue')
      .insert({ event_id: S.ev.id, question: qText, answer: qAns, position: nextPos });

    btn.disabled = false; btn.textContent = '+ Add to Queue';

    if (error) {
      log('Failed to save question: ' + error.message, 'err');
      showToast('Failed to save question.', 'err');
      return;
    }
    $('q-text').value = '';
    $('q-answer').value = '';
    $('q-text').focus();
    log('Question saved to DB queue.', 'ok');
    showToast('Question saved.', 'ok');
    await loadQueue();
  }

  async function removeQuestion(id) {
    if (!id) return;
    const { error } = await sb().from('event_question_queue').delete().eq('id', id);
    if (error) { showToast('Could not remove question.', 'err'); log('Remove failed: ' + error.message, 'err'); return; }
    S.queue = S.queue.filter(q => String(q.id) !== String(id));
    renderQueue();
  }

  /* ── Post next question ───────────────────────────────────────────── */
  async function handlePostNextQuestion(opts) {
    const auto = !!(opts && opts.auto);
    const ev = S.ev;
    if (!ev || ev.status !== 'active') { if (!auto) showToast('Event must be active to post questions.', 'err'); return false; }
    if (S.posting) return false;                         // double-click / overlapping auto-advance guard
    if (!S.queue.length) { if (!auto) showToast('No questions in queue. Add some first.', 'err'); return false; }

    clearAuto();
    S.posting = true;
    const btn = $('post-q-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Posting…'; }

    const next = S.queue[0];
    const timeLimit = ev.question_time_limit || 30;
    let fnName, params;
    if (ev.type === 'hot_seat') {
      fnName = 'post_hot_seat_question';
      params = { p_event_id: ev.id, p_question: next.question, p_answer: next.answer, p_time_limit: timeLimit };
    } else if (ev.type === 'grand_hall') {
      fnName = 'post_grand_hall_question';
      params = { p_event_id: ev.id, p_question: next.question, p_answer: next.answer, p_time_limit: timeLimit };
    } else {
      fnName = 'post_question';
      params = { p_event_id: ev.id, p_question: next.question, p_answer: next.answer };
    }

    const res = await rpc(fnName, params);
    S.posting = false;
    if (btn) { btn.disabled = !S.ev || S.ev.status !== 'active'; btn.textContent = '▶ Post Next'; }

    if (!res.success) {
      log('Post question failed: ' + (res.error || JSON.stringify(res)), 'err');
      showToast(res.error || 'Failed to post question.', 'err');
      return false;
    }

    // The question is live. Remove it from the queue; if that fails, say so loudly so it isn't posted twice.
    if (next.id) {
      const { error } = await sb().from('event_question_queue').delete().eq('id', next.id);
      if (error) {
        log('Question is LIVE but could not be removed from the queue — remove it manually to avoid a repeat: ' + error.message, 'err');
        showToast('Posted, but queue cleanup failed. Remove it manually.', 'err');
      }
    }
    S.queue.shift();
    renderQueue();

    log(`Question posted: "${String(next.question).slice(0, 40)}…" | Answer: "${next.answer}"`, 'ok');
    if (ev.type === 'hot_seat' && res.display_name) log(`🎯 Hot Seat: ${res.display_name}`, 'ok');
    showToast('Question is live!', 'ok');

    if (ev.type === 'grand_hall') scheduleAuto(res.time_limit || timeLimit);
    return true;
  }

  /* ── Grand Hall auto-advance ──────────────────────────────────────── */
  function clearAuto() {
    clearTimeout(S.autoTimer); S.autoTimer = null;
    clearInterval(S.autoTick); S.autoTick = null;
    S.autoDeadline = 0;
    updateAutoStatus();
  }

  function scheduleAuto(seconds) {
    clearAuto();
    if (!S.autoOn) return;
    const ms = seconds * 1000 + CFG.AUTO_GRACE_MS;
    S.autoDeadline = Date.now() + ms;
    S.autoTick = setInterval(updateAutoStatus, 500);
    S.autoTimer = setTimeout(async () => {
      S.autoTimer = null;
      clearInterval(S.autoTick); S.autoTick = null; S.autoDeadline = 0;
      if (!S.ev || S.ev.status !== 'active') { updateAutoStatus(); return; }
      if (!S.queue.length) {
        log('All questions done. Ready to finalize.', 'info');
        showToast('All questions done. Finalize when ready.', 'ok');
        updateAutoStatus('done');
        return;
      }
      const ok = await handlePostNextQuestion({ auto: true });
      if (!ok) log('Auto-advance stopped — post the next question manually.', 'err');
    }, ms);
    log(`Question posted. Auto-advancing in ${Math.round(ms / 1000)}s…`, 'info');
    updateAutoStatus();
  }

  function updateAutoStatus(state) {
    const el = $('auto-status');
    if (!el) return;
    if (state === 'done') { el.textContent = 'queue empty'; return; }
    if (!S.autoOn) { el.textContent = 'off'; return; }
    if (S.autoDeadline) { el.textContent = `next in ${Math.max(0, Math.ceil((S.autoDeadline - Date.now()) / 1000))}s`; return; }
    el.textContent = '';
  }

  /* ═══ COMMENTARY ═════════════════════════════════════════════════════ */
  async function handleSendComment() {
    const text = $('comment-text').value.trim();
    if (!text) { showToast('Type a comment first.', 'err'); return; }
    if (!S.ev) { showToast('No active event.', 'err'); return; }

    const btn = $('send-comment-btn');
    btn.disabled = true; btn.textContent = 'Sending…';
    const { error } = await sb().from('event_comments').insert({ event_id: S.ev.id, message: text });
    btn.disabled = false; btn.textContent = '📢 Send';

    if (error) { showToast('Failed to send comment.', 'err'); log('Comment failed: ' + error.message, 'err'); return; }
    $('comment-text').value = '';
    log(`Comment sent: "${text.slice(0, 50)}"`, 'ok');
    showToast('Comment broadcasted!', 'ok');
  }

  /* ═══ VOICE ANNOUNCEMENT (hold to talk) ══════════════════════════════ */
  const VOICE_MAX_MS = 30000, VOICE_MIN_MS = 600;
  const V = { rec: null, stream: null, chunks: [], t0: 0, maxT: null, tickT: null, token: 0, busy: false,
              ctx: null, raf: 0, mime: '' };

  function voiceStatus(msg, bad) {
    const el = $('voice-status');
    if (!el) return;
    el.textContent = msg;
    el.style.color = bad ? '#e07a6c' : '';
  }
  function voiceSetEnabled() {
    const b = $('voice-btn');
    if (!b) return;
    const ok = !!S.ev && !V.busy && !!(window.MediaRecorder && navigator.mediaDevices?.getUserMedia);
    b.disabled = !ok && !V.rec;
    if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) voiceStatus('This browser cannot record audio. Use Chrome, Edge or Safari over https.', true);
    else if (!S.ev && !V.rec) voiceStatus('Start or select an event first.');
    else if (!V.rec && !V.busy && /first\.$/.test($('voice-status').textContent)) voiceStatus('Ready. Hold the button and speak.');
  }
  function pickMime() {
    const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    return list.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) || '';
  }
  function extFor(mime) { return /mp4/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : 'webm'; }

  function bindVoice() {
    const b = $('voice-btn');
    if (!b) return;
    b.addEventListener('pointerdown', e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } voiceStart(); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => b.addEventListener(t, voiceStop));
    b.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); voiceStart(); } });
    b.addEventListener('keyup',   e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); voiceStop(); } });
    b.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('blur', voiceStop);
    voiceSetEnabled();
  }

  async function voiceStart() {
    if (V.rec || V.busy || !S.ev) return;
    const my = ++V.token;
    voiceStatus('Getting the microphone…');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      voiceStatus(e && e.name === 'NotAllowedError' ? 'Microphone blocked. Allow it in the address bar and try again.' : 'No microphone found.', true);
      return;
    }
    if (my !== V.token) { stream.getTracks().forEach(t => t.stop()); return; }     // released before the mic was ready
    V.stream = stream; V.chunks = []; V.mime = pickMime();
    let rec;
    try { rec = new MediaRecorder(stream, { ...(V.mime ? { mimeType: V.mime } : {}), audioBitsPerSecond: 32000 }); }
    catch (e) { voiceCleanup(); voiceStatus('Recording is not supported here.', true); return; }
    V.rec = rec; V.t0 = Date.now();
    rec.ondataavailable = ev => { if (ev.data && ev.data.size) V.chunks.push(ev.data); };
    rec.onstop = () => voiceFinish(my);
    rec.start(250);

    const b = $('voice-btn');
    b.classList.add('rec'); b.textContent = '🔴 Recording… release to send';
    V.maxT = setTimeout(voiceStop, VOICE_MAX_MS);
    V.tickT = setInterval(() => voiceStatus(`Recording ${Math.floor((Date.now() - V.t0) / 1000)} s of 30`), 250);
    voiceMeter(stream);
  }

  function voiceStop() {
    V.token++;                                    // cancels a start that is still waiting for the mic
    if (!V.rec) return;
    try { if (V.rec.state !== 'inactive') V.rec.stop(); } catch (e) { voiceCleanup(); }
  }

  function voiceMeter(stream) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      V.ctx = new AC();
      const src = V.ctx.createMediaStreamSource(stream), an = V.ctx.createAnalyser();
      an.fftSize = 256; src.connect(an);
      const buf = new Uint8Array(an.fftSize), fill = $('voice-meter');
      const loop = () => {
        an.getByteTimeDomainData(buf);
        let peak = 0; for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
        if (fill) fill.style.width = Math.min(100, peak / 64 * 100) + '%';
        V.raf = requestAnimationFrame(loop);
      };
      loop();
    } catch (e) { /* the meter is optional */ }
  }

  function voiceCleanup() {
    clearTimeout(V.maxT); clearInterval(V.tickT); cancelAnimationFrame(V.raf);
    if (V.stream) V.stream.getTracks().forEach(t => t.stop());
    if (V.ctx) { try { V.ctx.close(); } catch (e) { /* ignore */ } }
    V.rec = null; V.stream = null; V.ctx = null;
    const b = $('voice-btn'), f = $('voice-meter');
    if (b) { b.classList.remove('rec'); b.textContent = '🎙 Hold to talk'; }
    if (f) f.style.width = '0';
  }

  async function voiceFinish(my) {
    const ms = Date.now() - V.t0;
    const blob = new Blob(V.chunks, { type: (V.mime || 'audio/webm').split(';')[0] });
    const mime = blob.type, eventId = S.ev && S.ev.id;
    voiceCleanup();
    if (!eventId) { voiceStatus('No event selected.', true); return; }
    if (ms < VOICE_MIN_MS || blob.size < 500) { voiceStatus('Too short. Hold the button while you speak.', true); return; }

    V.busy = true; voiceSetEnabled();
    voiceStatus('Sending…');
    try {
      const path = `${eventId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extFor(mime)}`;
      const up = await sb().storage.from('arena-voice').upload(path, blob, { contentType: mime, cacheControl: '3600' });
      if (up.error) throw new Error(/bucket/i.test(up.error.message) ? 'Voice storage is not set up. Run arena-4-voice.sql.' : up.error.message);
      const ins = await sb().from('arena_voice_clips').insert({ event_id: eventId, path, mime, duration_ms: ms });
      if (ins.error) throw new Error(/arena_voice_clips/.test(ins.error.message) ? 'Voice table is missing. Run arena-4-voice.sql.' : ins.error.message);
      voiceStatus(`Sent (${(ms / 1000).toFixed(1)} s). Players hear it in a few seconds.`);
      log(`Voice announcement sent (${(ms / 1000).toFixed(1)} s)`, 'ok');
    } catch (e) {
      voiceStatus('Not sent: ' + ((e && e.message) || e), true);
      log('Voice failed: ' + ((e && e.message) || e), 'err');
    } finally {
      V.busy = false; voiceSetEnabled();
    }
  }

  /* ═══ LEADERBOARD (snapshot, polled) ═════════════════════════════════ */
  function startBoardPolling() {
    stopBoardPolling();
    const tick = async () => {
      S.boardT = setTimeout(tick, CFG.BOARD_POLL_MS);
      if (document.hidden || !S.ev) return;
      S.tick++;
      await loadBoard(false);
      if (S.tick % 3 === 0) await refreshEventRow();     // safety net in case the realtime socket dropped
    };
    loadBoard(false);
    S.boardT = setTimeout(tick, CFG.BOARD_POLL_MS);
  }
  function stopBoardPolling() { clearTimeout(S.boardT); S.boardT = null; }

  async function loadBoard(manual) {
    if (!S.ev || S.boardBusy) return;                     // single-flight: never stack requests
    S.boardBusy = true;
    const id = S.ev.id;
    try {
      let board = null;
      if (S.rpcBoard !== false) {
        const { data, error } = await sb().rpc('arena_leaderboard', { p_event_id: id, p_limit: CFG.LB_LIMIT });
        if (!error && data && Array.isArray(data.top)) { board = data; S.rpcBoard = true; }
        else if (error && /could not find the function|PGRST202|42883/i.test((error.code || '') + ' ' + (error.message || ''))) S.rpcBoard = false;
        else if (error) { if (manual) log('Leaderboard refresh failed: ' + error.message, 'err'); return; }
      }
      if (!board) board = await boardFromTables(id);
      if (!board || !S.ev || S.ev.id !== id) return;

      S.board = { top: board.top || [], total: typeof board.total === 'number' ? board.total : (board.top || []).length };
      if (board.prize_pool !== undefined && board.prize_pool !== null && board.prize_pool !== S.ev.prize_pool) {
        S.ev.prize_pool = board.prize_pool;
      }
      renderBoard();
      renderStats();
    } finally {
      S.boardBusy = false;
    }
  }

  async function boardFromTables(id) {
    const [top, cnt] = await Promise.all([
      sb().from('event_participants').select('user_id,display_name,score,status,answered_at')
        .eq('event_id', id)
        .order('score', { ascending: false })
        .order('answered_at', { ascending: true, nullsFirst: false })
        .limit(CFG.LB_LIMIT),
      sb().from('event_participants').select('id', { count: 'exact', head: true }).eq('event_id', id),
    ]);
    if (top.error) return null;
    const rows = top.data || [];
    return { top: rows, total: typeof cnt.count === 'number' ? cnt.count : rows.length };
  }

  function renderBoard() {
    const container = $('admin-lb');
    if (!container) return;
    const rows = S.board.top;
    if (!rows.length) { container.innerHTML = '<div class="lb-empty">No participants yet.</div>'; return; }
    const ranks = ['🥇', '🥈', '🥉'];
    container.innerHTML = rows.map((p, i) => `
      <div class="lb-row">
        <span class="lb-rank">${i < 3 ? ranks[i] : i + 1}</span>
        <span class="lb-name">${esc(p.display_name || 'Anonymous')}</span>
        <span class="lb-score">${esc(p.score)} pts</span>
        <span class="lb-status">${esc(p.status || '')}</span>
      </div>`).join('') +
      (S.board.total > rows.length ? `<div class="lb-more">Showing top ${rows.length} of ${S.board.total} players</div>` : '');
  }

  /* ═══ REALTIME (one subscriber, one row) ═════════════════════════════ */
  function subscribeRealtime() {
    unsubscribeRealtime();
    if (!S.ev) return;
    const id = S.ev.id;
    const ch = sb().channel(`admin-arena-${id}`);
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events_public', filter: `id=eq.${id}` },
      p => { if (S.ch === ch) onEventUpdate(p.new); });
    S.ch = ch;
    ch.subscribe();
    // Participants are intentionally NOT subscribed: at 1,000 players that is one message per score change.
  }
  function unsubscribeRealtime() {
    if (S.ch) { try { sb().removeChannel(S.ch); } catch (e) { /* ignore */ } S.ch = null; }
  }

  async function refreshEventRow() {
    if (!S.ev) return;
    const { data } = await sb().from('events_public').select('*').eq('id', S.ev.id).maybeSingle();
    if (data) onEventUpdate(data);
  }

  function onEventUpdate(row) {
    if (!row || !S.ev || row.id !== S.ev.id) return;
    const prev = S.ev;
    S.ev = { ...prev, ...row };

    if (S.ev.status !== prev.status && (S.ev.status === 'finished' || S.ev.status === 'canceled')) {
      log(`Event ${S.ev.status}.`, 'info');
      loadCurrentEvent();
      return;
    }
    const structural = prev.status !== S.ev.status || prev.question_number !== S.ev.question_number ||
                       prev.current_question !== S.ev.current_question;
    if (structural) {
      log(`Event updated: status=${S.ev.status}, q=${S.ev.question_number}`, 'info');
      renderActiveEvent();
    } else {
      renderStats();            // e.g. prize pool moved because someone joined
    }
  }

  /* ═══ EVENT REQUESTS ═════════════════════════════════════════════════ */
  async function loadRequests() {
    const { data, error } = await sb().from('event_requests')
      .select('*').order('created_at', { ascending: false }).limit(50);
    if (error) { log('Could not load requests: ' + error.message, 'err'); return; }
    S.requests = Array.isArray(data) ? data : [];
    renderRequests();
  }

  function renderRequests() {
    const container = $('requests-list'), countEl = $('req-count');
    const pending = S.requests.filter(r => r.status === 'pending');
    if (countEl) countEl.textContent = `${pending.length} pending`;
    if (!S.requests.length) { container.innerHTML = '<div class="lb-empty">No event requests yet.</div>'; return; }

    // No inline handlers and no values spliced into JS strings: titles with quotes/apostrophes are safe.
    container.innerHTML = S.requests.map(r => `
      <div class="req-card">
        <div class="req-header">
          <div class="req-title">${esc(r.event_title)}</div>
          <span class="req-status ${esc(r.status)}">${esc(r.status)}</span>
        </div>
        <div class="req-meta">
          <span>👤 ${esc(r.display_name || 'Anonymous')}</span>
          <span>✉️ ${esc(r.email || '—')}</span>
          <span>💰 Entry: ${esc(r.entry_fee)} tr</span>
          <span>🏆 Prize: ${esc(r.prize_pool)} tr</span>
          <span>🕐 ${esc(new Date(r.created_at).toLocaleDateString())}</span>
        </div>
        <div class="req-topic">${esc(r.event_topic)}</div>
        ${r.notes ? `<div class="req-notes">📝 ${esc(r.notes)}</div>` : ''}
        ${r.status === 'pending' ? `
          <div class="req-actions">
            <button class="btn btn-success btn-sm" data-act="approve" data-id="${esc(r.id)}">✓ Approve</button>
            <button class="btn btn-danger btn-sm" data-act="reject" data-id="${esc(r.id)}">✕ Reject</button>
            <button class="btn btn-outline btn-sm" data-act="use" data-id="${esc(r.id)}">⚔️ Use as Event</button>
          </div>` : ''}
      </div>`).join('');
  }

  async function setRequestStatus(id, status) {
    const { error } = await sb().from('event_requests').update({ status }).eq('id', id);
    if (error) { log(`Could not mark request ${status}: ${error.message}`, 'err'); showToast('Update failed.', 'err'); return; }
    log(`Request ${status}.`, status === 'approved' ? 'ok' : 'info');
    showToast(`Request ${status}.`, 'ok');
    await loadRequests();
  }

  function useRequest(id) {
    const r = S.requests.find(x => String(x.id) === String(id));
    if (!r) return;
    $('ev-title').value = r.event_title || '';
    $('ev-fee').value = r.entry_fee || 0;
    $('create-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Request loaded into Create Event form.', 'ok');
    log(`Request "${r.event_title}" loaded into form.`, 'info');
  }

  /* ═══ ANNOUNCEMENTS ══════════════════════════════════════════════════ */
  async function handlePostAnnouncement() {
    const title = $('ann-title').value.trim();
    const desc  = $('ann-desc').value.trim();
    const type  = $('ann-type').value;
    const date  = $('ann-date').value;
    const fee   = clampInt($('ann-fee').value, 0, 10000000, 0);

    if (!title) { showToast('Enter an event title.', 'err'); return; }
    if (!date)  { showToast('Set an event date.', 'err'); return; }

    const btn = $('post-ann-btn');
    btn.disabled = true; btn.textContent = 'Posting…';
    const { error } = await sb().from('event_announcements').insert({
      title, description: desc || null, event_type: type,
      event_date: new Date(date).toISOString(), entry_fee: fee, status: 'upcoming',
    });
    btn.disabled = false; btn.textContent = '📢 Post Announcement';

    if (error) { showToast('Failed to post announcement.', 'err'); log('Announcement failed: ' + error.message, 'err'); return; }
    $('ann-title').value = ''; $('ann-desc').value = ''; $('ann-date').value = '';
    log(`Announcement posted: "${title}"`, 'ok');
    showToast('Announcement posted!', 'ok');
    await loadAnnouncements();
  }

  async function loadAnnouncements() {
    const container = $('announcements-list');
    const { data, error } = await sb().from('event_announcements')
      .select('*').order('event_date', { ascending: true }).limit(10);
    if (error) { log('Could not load announcements: ' + error.message, 'err'); return; }
    if (!data || !data.length) { container.innerHTML = '<p class="meta-note">No announcements yet.</p>'; return; }

    const icons = { gauntlet: '⚔️', grand_hall: '🏛', hot_seat: '🎤', tournament: '🏆' };
    container.innerHTML = data.map(a => `
      <div class="ann-item">
        <div style="flex:1;min-width:0;">
          <div class="ann-title">${icons[a.event_type] || '⚔️'} ${esc(a.title)}</div>
          <div class="ann-meta">${a.event_date ? esc(new Date(a.event_date).toLocaleString()) : '—'} · ${a.entry_fee > 0 ? esc(a.entry_fee) + 'tr entry' : 'Free'}</div>
        </div>
        <button class="icon-btn" data-del="${esc(a.id)}" title="Delete" aria-label="Delete announcement">✕</button>
      </div>`).join('');
  }

  async function deleteAnnouncement(id) {
    const { error } = await sb().from('event_announcements').delete().eq('id', id);
    if (error) { showToast('Could not delete announcement.', 'err'); log('Delete failed: ' + error.message, 'err'); return; }
    log('Announcement deleted.', 'info');
    showToast('Announcement removed.', 'ok');
    await loadAnnouncements();
  }

  /* ═══ LOG / TOAST ════════════════════════════════════════════════════ */
  function log(msg, type) {
    const container = $('activity-log');
    if (!container) return;
    const el = document.createElement('span');
    el.className = `log-entry ${type || ''}`;
    el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    container.appendChild(el);
    while (container.childElementCount > CFG.LOG_MAX) container.removeChild(container.firstElementChild);
    container.scrollTop = container.scrollHeight;
  }

  let toastT = null;
  function showToast(msg, type) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `toast ${type || ''} show`;
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 3000);
  }

})();