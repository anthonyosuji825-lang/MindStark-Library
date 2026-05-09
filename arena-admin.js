/**
 * ═══════════════════════════════════════════════════════════════
 *  arena-admin.js — MindStark · Arena Control Panel
 *  Supabase-gated: only Tony's user ID can access this page.
 *  All RPCs use the anon key + user session token.
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /* ── YOUR USER ID ─────────────────────────────────────────────
     Replace this with your actual Supabase user ID.
     Find it: Supabase Dashboard → Authentication → Users → your email → copy the UUID
  ────────────────────────────────────────────────────────────── */
  const ADMIN_USER_ID = '429025f0-a2b5-41ec-a292-29e8a2241690';

  const SUPABASE_URL  = 'https://wgcpuohwyarhjlndmnlj.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnY3B1b2h3eWFyaGpsbmRtbmxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MzEzODYsImV4cCI6MjA4OTIwNzM4Nn0.W3SMmePgAdRR7v6_NWRlIoPYmo5HMF8mmTiwELkZclo';

  /* ── State ────────────────────────────────────────────────── */
  let currentEvent    = null;
  let questionQueue   = [];   // { question, answer }[]
  let leaderboard     = [];
  let realtimeChannel = null;
  let sessionToken    = null;

  /* ── DOM ──────────────────────────────────────────────────── */
  const $ = id => document.getElementById(id);

  /* ── Boot ─────────────────────────────────────────────────── */
  document.addEventListener('supabase:ready', boot);

  async function boot() {
    // 1. Check auth
    const { data: { user } } = await window._sb.auth.getUser();

    if (!user || user.id !== ADMIN_USER_ID) {
      const wall = $('access-wall');
      wall.querySelector('h2').textContent = 'Access Denied';
      wall.querySelector('p').textContent  = 'This page is restricted to MindStark administrators.';
      wall.querySelector('.icon').textContent = '🚫';
      return; // Stop everything
    }

    // 2. Get session token for RPC calls
    const { data: { session } } = await window._sb.auth.getSession();
    sessionToken = session?.access_token;

    // 3. Hide access wall
    $('access-wall').style.display = 'none';

    // 4. Load current event
    await loadCurrentEvent();

    // 5. Bind all UI events
    bindUI();

    log('Logged in as admin. Welcome, Tony.', 'info');
  }

  /* ── Load current event ───────────────────────────────────── */
  async function loadCurrentEvent() {
    const { data, error } = await window._sb
      .from('events_public')
      .select('*')
      .in('status', ['registering', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) { log('Error loading event: ' + error.message, 'err'); return; }

    currentEvent = data || null;

    if (currentEvent) {
      log(`Event loaded: "${currentEvent.title}" [${currentEvent.status}]`, 'info');
      await loadLeaderboard();
      renderActiveEvent();
      subscribeRealtime();
    } else {
      renderNoEvent();
    }
  }

  /* ── Render active event panel ────────────────────────────── */
  function renderActiveEvent() {
    if (!currentEvent) { renderNoEvent(); return; }

    const pill   = $('event-status-pill');
    const body   = $('active-body');
    const postBtn = $('post-q-btn');

    // Status pill
    const dotPulse = currentEvent.status === 'active' ? ' pulse' : '';
    pill.innerHTML = `
      <span class="pill ${currentEvent.status}">
        <span class="pill-dot${dotPulse}"></span>
        ${currentEvent.status}
      </span>`;

    // Stats
    const prizePool = currentEvent.prize_pool || 0;
    const prizePayout = Math.floor(prizePool * 0.85);

    body.innerHTML = `
      <div class="event-panel-header">
        <div>
          <div class="event-panel-title">${esc(currentEvent.title)}</div>
          <div class="event-meta">
            <span>🆔 <span style="font-family:'DM Mono',monospace;font-size:.72rem;">${currentEvent.id.slice(0,8)}…</span></span>
            <span>⚔️ ${currentEvent.type}</span>
            <span>💰 ${currentEvent.entry_fee} units entry</span>
          </div>
        </div>
      </div>

      <div class="stat-row">
        <div class="stat-cell">
          <span class="stat-val" id="s-players">${leaderboard.length}</span>
          <span class="stat-lbl">Players</span>
        </div>
        <div class="stat-cell">
          <span class="stat-val" id="s-pool">${prizePool}</span>
          <span class="stat-lbl">Pool</span>
        </div>
        <div class="stat-cell">
          <span class="stat-val" id="s-payout">${prizePayout}</span>
          <span class="stat-lbl">Payout (85%)</span>
        </div>
        <div class="stat-cell">
          <span class="stat-val" id="s-qnum">${currentEvent.question_number}/${currentEvent.total_questions}</span>
          <span class="stat-lbl">Questions</span>
        </div>
      </div>

      <div class="action-row" id="action-row">
        ${renderActionButtons()}
      </div>

      <div class="divider"></div>
      <p style="font-size:.75rem;color:var(--arena-muted);">
        Current question: <span style="color:var(--arena-text);">${currentEvent.current_question ? esc(currentEvent.current_question) : '— (none active)'}</span>
      </p>
    `;

    // Enable post button only when event is active
    if (postBtn) postBtn.disabled = currentEvent.status !== 'active';

    // Bind action buttons
    bindActionButtons();
  }

  function renderActionButtons() {
    if (!currentEvent) return '';

    if (currentEvent.status === 'registering') {
      return `
        <button class="btn btn-success" id="start-btn">▶ Start Event</button>
        <button class="btn btn-danger" id="cancel-btn">✕ Cancel Event</button>
      `;
    }

    if (currentEvent.status === 'active') {
      return `
        <button class="btn btn-danger" id="finalize-btn">🏆 Finalize & Pay Out</button>
        <button class="btn btn-danger" id="cancel-btn">✕ Cancel & Refund</button>
      `;
    }

    return `<p style="font-size:.85rem;color:var(--arena-muted);">Event has ended.</p>`;
  }

  function renderNoEvent() {
    const body = $('active-body');
    const pill = $('event-status-pill');
    const postBtn = $('post-q-btn');

    if (pill) pill.innerHTML = '—';
    if (postBtn) postBtn.disabled = true;
    if (body) {
      body.innerHTML = `<p style="color:var(--arena-muted);font-size:.88rem;">No active event. Create one using the form.</p>`;
    }
  }

  /* ── Bind action buttons (dynamic) ───────────────────────── */
  function bindActionButtons() {
    const startBtn    = $('start-btn');
    const cancelBtn   = $('cancel-btn');
    const finalizeBtn = $('finalize-btn');

    if (startBtn)    startBtn.addEventListener('click', handleStartEvent);
    if (cancelBtn)   cancelBtn.addEventListener('click', handleCancelEvent);
    if (finalizeBtn) finalizeBtn.addEventListener('click', handleFinalizeEvent);
  }

  /* ── Bind static UI ───────────────────────────────────────── */
  function bindUI() {
    $('create-btn').addEventListener('click', handleCreateEvent);
    $('add-q-btn').addEventListener('click', handleAddQuestion);
    $('post-q-btn').addEventListener('click', handlePostNextQuestion);
    $('refresh-lb-btn').addEventListener('click', async () => { await loadLeaderboard(); renderLeaderboard(); });
    $('clear-log-btn').addEventListener('click', () => { $('activity-log').innerHTML = ''; });

    // Allow Enter in answer field to add question
    $('q-answer').addEventListener('keydown', e => {
      if (e.key === 'Enter') handleAddQuestion();
    });
  }

  /* ── CREATE EVENT ─────────────────────────────────────────── */
  async function handleCreateEvent() {
    const title     = $('ev-title').value.trim();
    const fee       = parseInt($('ev-fee').value) || 0;
    const minP      = parseInt($('ev-min').value)  || 5;
    const totalQ    = parseInt($('ev-questions').value) || 10;
    const type      = $('ev-type').value;
    const timeLimit = parseInt($('ev-time-limit').value) || 30;

    if (!title) { showToast('Enter an event title.', 'err'); return; }
    if (type === 'grand_hall' && (!timeLimit || timeLimit < 5)) {
      showToast('Set a valid time limit (min 5 seconds).', 'err'); return;
    }

    const btn = $('create-btn');
    btn.disabled = true; btn.textContent = 'Creating…';

    const { data, error } = await window._sb
      .from('events_public')
      .insert({
        title, type,
        entry_fee: fee,
        min_participants: minP,
        total_questions: totalQ,
        question_time_limit: type === 'grand_hall' ? timeLimit : 0,
        status: 'registering',
      })
      .select('*')
      .single();

    btn.disabled = false; btn.textContent = '⚔️ Create Event';

    if (error) {
      log('Create event failed: ' + error.message, 'err');
      showToast('Failed to create event.', 'err');
      return;
    }

    currentEvent = data;
    log(`Event created: "${title}" [ID: ${data.id.slice(0,8)}…]`, 'ok');
    showToast('Event created! Registration is open.', 'ok');
    renderActiveEvent();
    subscribeRealtime();

    // Clear form
    $('ev-title').value = '';
  }

  /* ── START EVENT ──────────────────────────────────────────── */
  async function handleStartEvent() {
    if (!currentEvent) return;

    if (!confirm(`Start "${currentEvent.title}"? This opens the event to questions.`)) return;

    const btn = $('start-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Starting…'; }

    const res = await rpc('start_event', { p_event_id: currentEvent.id });

    if (!res.success) {
      log('Start failed: ' + (res.error || JSON.stringify(res)), 'err');
      showToast(res.error || 'Could not start event.', 'err');
      if (btn) { btn.disabled = false; btn.textContent = '▶ Start Event'; }
      return;
    }

    log(`Event started! ${res.participants} participant(s) locked in.`, 'ok');
    showToast(`Event is LIVE with ${res.participants} players!`, 'ok');
    await loadCurrentEvent();
  }

  /* ── FINALIZE EVENT ───────────────────────────────────────── */
  async function handleFinalizeEvent() {
    if (!currentEvent) return;

    if (!confirm(`Finalize "${currentEvent.title}"? This pays out winners and ends the event.`)) return;

    const btn = $('finalize-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Finalizing…'; }

    const res = await rpc('finalize_gauntlet', { p_event_id: currentEvent.id });

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
      log(`Paid out! Prize pool: ${res.prize_pool} units. Rake: ${res.rake} units.`, 'ok');
      showToast(`Done! ${res.prize_pool} units paid to top 3.`, 'ok');
    }

    await loadCurrentEvent();
  }

  /* ── CANCEL EVENT ─────────────────────────────────────────── */
  async function handleCancelEvent() {
    if (!currentEvent) return;

    if (!confirm(`Cancel "${currentEvent.title}"? All entry fees will be refunded.`)) return;

    const res = await rpc('refund_event', { p_event_id: currentEvent.id });

    // refund_event returns VOID so any response means success
    log('Event canceled. All participants refunded.', 'ok');
    showToast('Event canceled. Units refunded.', 'ok');
    currentEvent = null;
    await loadCurrentEvent();
  }

  /* ── ADD QUESTION TO QUEUE ────────────────────────────────── */
  function handleAddQuestion() {
    const qText = $('q-text').value.trim();
    const qAns  = $('q-answer').value.trim();

    if (!qText) { showToast('Enter a question.', 'err'); return; }
    if (!qAns)  { showToast('Enter the answer.', 'err'); return; }

    questionQueue.push({ question: qText, answer: qAns });

    $('q-text').value   = '';
    $('q-answer').value = '';
    $('q-text').focus();

    log(`Q${questionQueue.length} queued: "${qText.slice(0, 40)}…"`, 'ok');
    renderQueue();
    showToast('Question added to queue.', 'ok');
  }

  /* ── POST NEXT QUESTION ───────────────────────────────────── */
  async function handlePostNextQuestion() {
    if (!currentEvent || currentEvent.status !== 'active') {
      showToast('Event must be active to post questions.', 'err');
      return;
    }

    if (questionQueue.length === 0) {
      showToast('No questions in queue. Add some first.', 'err');
      return;
    }

    const next = questionQueue[0];
    const btn  = $('post-q-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Posting…'; }

    const isGrandHall = currentEvent.type === 'grand_hall';
    const fnName = isGrandHall ? 'post_grand_hall_question' : 'post_question';
    const params = isGrandHall
      ? { p_event_id: currentEvent.id, p_question: next.question, p_answer: next.answer, p_time_limit: currentEvent.question_time_limit || 30 }
      : { p_event_id: currentEvent.id, p_question: next.question, p_answer: next.answer };

    const res = await rpc(fnName, params);

    if (!res.success) {
      log('Post question failed: ' + (res.error || JSON.stringify(res)), 'err');
      showToast(res.error || 'Failed to post question.', 'err');
      if (btn) { btn.disabled = false; btn.textContent = '▶ Post Next'; }
      return;
    }

    // For Grand Hall — auto-post next question after time limit
    if (isGrandHall && res.time_limit) {
      const timeLimit = res.time_limit * 1000;
      log(`Question posted. Auto-advancing in ${res.time_limit}s…`, 'info');
      setTimeout(async () => {
        if (questionQueue.length > 0) {
          log('Time expired. Auto-posting next question…', 'info');
          handlePostNextQuestion();
        } else {
          log('All questions done. Ready to finalize.', 'info');
          showToast('All questions done. Finalize when ready.', 'ok');
        }
      }, timeLimit);
    }

    // Remove from queue
    questionQueue.shift();
    renderQueue();

    log(`Question posted: "${next.question.slice(0, 40)}…" | Answer: "${next.answer}"${isGrandHall ? ` | Time: ${currentEvent.question_time_limit}s` : ''}`, 'ok');
    showToast('Question is live!', 'ok');

    if (btn) { btn.disabled = false; btn.textContent = '▶ Post Next'; }
  }

  /* ── RENDER QUEUE ─────────────────────────────────────────── */
  function renderQueue() {
    const container = $('q-queue');
    const count     = $('queue-count');

    if (count) count.textContent = `${questionQueue.length} question${questionQueue.length === 1 ? '' : 's'}`;

    if (!questionQueue.length) {
      container.innerHTML = '<div class="q-empty">No questions queued. Add some above.</div>';
      return;
    }

    container.innerHTML = questionQueue.map((q, i) => `
      <div class="q-item">
        <span class="q-num">${i + 1}</span>
        <span class="q-text">${esc(q.question.slice(0, 60))}${q.question.length > 60 ? '…' : ''}</span>
        <span class="q-answer">→ ${esc(q.answer)}</span>
        <button class="q-remove" data-idx="${i}" title="Remove">✕</button>
      </div>
    `).join('');

    // Bind remove buttons
    container.querySelectorAll('.q-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        questionQueue.splice(idx, 1);
        renderQueue();
      });
    });
  }

  /* ── LOAD LEADERBOARD ─────────────────────────────────────── */
  async function loadLeaderboard() {
    if (!currentEvent) return;
    const { data } = await window._sb
      .from('event_participants')
      .select('*')
      .eq('event_id', currentEvent.id)
      .order('score', { ascending: false })
      .order('answered_at', { ascending: true, nullsFirst: false });
    leaderboard = data || [];
    renderLeaderboard();
  }

  /* ── RENDER LEADERBOARD ───────────────────────────────────── */
  function renderLeaderboard() {
    const container = $('admin-lb');
    if (!container) return;

    // Update stat
    const sPlayers = $('s-players');
    if (sPlayers) sPlayers.textContent = leaderboard.length;

    if (!leaderboard.length) {
      container.innerHTML = '<div class="lb-empty">No participants yet.</div>';
      return;
    }

    const ranks = ['🥇', '🥈', '🥉'];
    container.innerHTML = leaderboard.map((p, i) => `
      <div class="lb-row">
        <span class="lb-rank">${i < 3 ? ranks[i] : i + 1}</span>
        <span class="lb-name">${esc(p.display_name || 'Anonymous')}</span>
        <span class="lb-score">${p.score} pts</span>
        <span class="lb-status">${p.status}</span>
      </div>
    `).join('');
  }

  /* ── REALTIME ─────────────────────────────────────────────── */
  function subscribeRealtime() {
    if (!currentEvent) return;
    if (realtimeChannel) window._sb.removeChannel(realtimeChannel);

    realtimeChannel = window._sb
      .channel(`admin-arena-${currentEvent.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'events_public',
        filter: `id=eq.${currentEvent.id}`
      }, payload => {
        currentEvent = { ...currentEvent, ...payload.new };
        renderActiveEvent();
        log(`Event updated: status=${payload.new.status}, q=${payload.new.question_number}`, 'info');
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'event_participants',
        filter: `event_id=eq.${currentEvent.id}`
      }, async () => {
        await loadLeaderboard();
        const sPool   = $('s-pool');
        const sPayout = $('s-payout');
        if (sPool && currentEvent) {
          sPool.textContent   = currentEvent.prize_pool || 0;
          sPayout.textContent = Math.floor((currentEvent.prize_pool || 0) * 0.85);
        }
      })
      .subscribe();
  }

  /* ── RPC helper ───────────────────────────────────────────── */
  async function rpc(fnName, params) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': 'Bearer ' + sessionToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      // VOID functions return empty body
      const text = await res.text();
      if (!text) return { success: true };

      const data = JSON.parse(text);
      return data;
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /* ── Log ──────────────────────────────────────────────────── */
  function log(msg, type = '') {
    const container = $('activity-log');
    if (!container) return;
    const time = new Date().toLocaleTimeString();
    const el   = document.createElement('span');
    el.className = `log-entry ${type}`;
    el.textContent = `[${time}] ${msg}`;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  /* ── Toast ────────────────────────────────────────────────── */
  function showToast(msg, type = '') {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.className   = `toast ${type} show`;
    setTimeout(() => t.classList.remove('show'), 3000);
  }

  /* ── Escape HTML ──────────────────────────────────────────── */
  function esc(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();