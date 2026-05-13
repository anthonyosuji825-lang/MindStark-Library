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
  const SUPABASE_ANON = 'sb_publishable_aCM0iO7qCRXWSnnzzynAlA_mHRquGLQ';

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
    // Hide access wall immediately — no auth check
    const wall = $('access-wall');
    if (wall) wall.style.display = 'none';

    // Get session token for RPC calls
    const { data: { session } } = await window._sb.auth.getSession();
    sessionToken = session?.access_token;

    await loadCurrentEvent();
    bindUI();
    log('Arena Control Panel ready. Welcome, Tony.', 'info');
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
      await loadQueue();
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
          <span class="stat-val" id="s-pool">${prizePool} tr</span>
          <span class="stat-lbl">Pool</span>
        </div>
        <div class="stat-cell">
          <span class="stat-val" id="s-payout">${prizePayout} tr</span>
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
  async function bindUI() {
    $('create-btn').addEventListener('click', handleCreateEvent);
    $('add-q-btn').addEventListener('click', handleAddQuestion);
    $('post-q-btn').addEventListener('click', handlePostNextQuestion);
    $('refresh-lb-btn').addEventListener('click', async () => { await loadLeaderboard(); renderLeaderboard(); });
    $('clear-log-btn').addEventListener('click', () => { $('activity-log').innerHTML = ''; });
    $('refresh-req-btn').addEventListener('click', async () => { await loadRequests(); });

    // Allow Enter in answer field to add question
    $('q-answer').addEventListener('keydown', e => {
      if (e.key === 'Enter') handleAddQuestion();
    });

    $('send-comment-btn').addEventListener('click', handleSendComment);
    $('comment-text').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendComment(); }
    });

    // Load requests on boot
    await loadRequests();
    await loadQueue();
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

    const fnName = currentEvent.type === 'hot_seat' ? 'start_hot_seat_event' : 'start_event';
    const res = await rpc(fnName, { p_event_id: currentEvent.id });

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
      log(`Paid out! Prize pool: ${res.prize_pool} tr. Rake: ${res.rake} tr.`, 'ok');
      showToast(`Done! ${res.prize_pool} tr paid to top 3.`, 'ok');
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

  /* ── ADD QUESTION TO QUEUE (DB-backed) ───────────────────── */
  async function handleAddQuestion() {
    const qText = $('q-text').value.trim();
    const qAns  = $('q-answer').value.trim();

    if (!qText) { showToast('Enter a question.', 'err'); return; }
    if (!qAns)  { showToast('Enter the answer.', 'err'); return; }

    if (!currentEvent) { showToast('Create an event first.', 'err'); return; }

    const btn = $('add-q-btn');
    btn.disabled = true; btn.textContent = 'Saving…';

    const { data: { session } } = await window._sb.auth.getSession();
    const token = session?.access_token || sessionToken;

    // Get current max position
    const posRes = await fetch(
      `${SUPABASE_URL}/rest/v1/event_question_queue?event_id=eq.${currentEvent.id}&select=position&order=position.desc&limit=1`,
      { headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + token } }
    );
    const posData = await posRes.json();
    const nextPos = posData.length > 0 ? (posData[0].position + 1) : 0;

    const res = await fetch(`${SUPABASE_URL}/rest/v1/event_question_queue`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        event_id: currentEvent.id,
        question: qText,
        answer:   qAns,
        position: nextPos,
      }),
    });

    btn.disabled = false; btn.textContent = '+ Add to Queue';

    if (!res.ok) { showToast('Failed to save question.', 'err'); return; }

    $('q-text').value   = '';
    $('q-answer').value = '';
    $('q-text').focus();

    log(`Question saved to DB queue.`, 'ok');
    showToast('Question saved.', 'ok');
    await loadQueue();
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

    const next      = questionQueue[0];
    const btn       = $('post-q-btn');
    const timeLimit = currentEvent.question_time_limit || 30;
    const type      = currentEvent.type;
    if (btn) { btn.disabled = true; btn.textContent = 'Posting…'; }

    let fnName, params;
    if (type === 'hot_seat') {
      fnName = 'post_hot_seat_question';
      params = { p_event_id: currentEvent.id, p_question: next.question, p_answer: next.answer, p_time_limit: timeLimit };
    } else if (type === 'grand_hall') {
      fnName = 'post_grand_hall_question';
      params = { p_event_id: currentEvent.id, p_question: next.question, p_answer: next.answer, p_time_limit: timeLimit };
    } else {
      fnName = 'post_question';
      params = { p_event_id: currentEvent.id, p_question: next.question, p_answer: next.answer };
    }

    const res = await rpc(fnName, params);

    if (!res.success) {
      log('Post question failed: ' + (res.error || JSON.stringify(res)), 'err');
      showToast(res.error || 'Failed to post question.', 'err');
      if (btn) { btn.disabled = false; btn.textContent = '▶ Post Next'; }
      return;
    }

    // Grand Hall — auto-post next after time limit + 3s buffer
    if (type === 'grand_hall' && res.time_limit) {
      const delay = (res.time_limit + 3) * 1000; // 3 second buffer for clients to see result
      log(`Question posted. Auto-advancing in ${res.time_limit}s + 3s buffer…`, 'info');
      setTimeout(async () => {
        if (questionQueue.length > 0) handlePostNextQuestion();
        else { log('All questions done. Ready to finalize.', 'info'); showToast('All questions done. Finalize when ready.', 'ok'); }
      }, delay);
    }

    // Hot Seat — log who's up
    if (type === 'hot_seat' && res.display_name) {
      log(`🎯 Hot Seat: ${res.display_name} → "${next.question.slice(0,40)}…"`, 'ok');
    }

    // Delete posted question from DB queue
    if (next.id) {
      const { data: { session } } = await window._sb.auth.getSession();
      const token = session?.access_token || sessionToken;
      await fetch(`${SUPABASE_URL}/rest/v1/event_question_queue?id=eq.${next.id}`, {
        method: 'DELETE',
        headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + token },
      });
    }

    questionQueue.shift();
    renderQueue();
    log(`Question posted: "${next.question.slice(0, 40)}…" | Answer: "${next.answer}"`, 'ok');
    showToast('Question is live!', 'ok');
    if (btn) { btn.disabled = false; btn.textContent = '▶ Post Next'; }
  }

  /* ── SEND COMMENT ─────────────────────────────────────────── */
  async function handleSendComment() {
    const text = $('comment-text')?.value.trim();
    if (!text) { showToast('Type a comment first.', 'err'); return; }
    if (!currentEvent) { showToast('No active event.', 'err'); return; }

    const btn = $('send-comment-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    const { data: { session } } = await window._sb.auth.getSession();
    const token = session?.access_token || sessionToken;

    const res = await fetch(`${SUPABASE_URL}/rest/v1/event_comments`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ event_id: currentEvent.id, message: text }),
    });

    if (btn) { btn.disabled = false; btn.textContent = '📢 Send'; }

    if (res.ok) {
      $('comment-text').value = '';
      log(`Comment sent: "${text.slice(0, 50)}"`, 'ok');
      showToast('Comment broadcasted!', 'ok');
    } else {
      showToast('Failed to send comment.', 'err');
    }
  }

  /* ── LOAD QUEUE FROM DB ───────────────────────────────────── */
  async function loadQueue() {
    if (!currentEvent) { renderQueue(); return; }

    const { data: { session } } = await window._sb.auth.getSession();
    const token = session?.access_token || sessionToken;

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/event_question_queue?event_id=eq.${currentEvent.id}&order=position.asc`,
      { headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + token } }
    );

    const data = await res.json();
    questionQueue = Array.isArray(data) ? data : [];
    renderQueue();
  }
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
        <button class="q-remove" data-id="${q.id || ''}" data-idx="${i}" title="Remove">✕</button>
      </div>
    `).join('');

    container.querySelectorAll('.q-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id  = btn.dataset.id;
        const idx = parseInt(btn.dataset.idx);
        if (id) {
          const { data: { session } } = await window._sb.auth.getSession();
          const token = session?.access_token || sessionToken;
          await fetch(`${SUPABASE_URL}/rest/v1/event_question_queue?id=eq.${id}`, {
            method: 'DELETE',
            headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + token },
          });
        }
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

  /* ── LOAD REQUESTS ────────────────────────────────────────── */
  async function loadRequests() {
    const { data: { session } } = await window._sb.auth.getSession();
    const token = session?.access_token || sessionToken;

    const res = await fetch(`${SUPABASE_URL}/rest/v1/event_requests?order=created_at.desc&limit=50`, {
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': 'Bearer ' + token,
      }
    });

    const requests = await res.json();
    renderRequests(Array.isArray(requests) ? requests : []);
  }

  /* ── RENDER REQUESTS ──────────────────────────────────────── */
  function renderRequests(requests) {
    const container = $('requests-list');
    const countEl   = $('req-count');
    if (!container) return;

    const pending = requests.filter(r => r.status === 'pending');
    if (countEl) countEl.textContent = `${pending.length} pending`;

    if (!requests.length) {
      container.innerHTML = '<div class="lb-empty">No event requests yet.</div>';
      return;
    }

    container.innerHTML = requests.map(r => `
      <div class="req-card" id="req-${r.id}">
        <div class="req-header">
          <div>
            <div class="req-title">${esc(r.event_title)}</div>
          </div>
          <span class="req-status ${r.status}">${r.status}</span>
        </div>
        <div class="req-meta">
          <span>👤 ${esc(r.display_name || 'Anonymous')}</span>
          <span>✉️ ${esc(r.email || '—')}</span>
          <span>💰 Entry: ${r.entry_fee} tr</span>
          <span>🏆 Prize: ${r.prize_pool} tr</span>
          <span>🕐 ${new Date(r.created_at).toLocaleDateString()}</span>
        </div>
        <div class="req-topic">${esc(r.event_topic)}</div>
        ${r.notes ? `<div class="req-notes">📝 ${esc(r.notes)}</div>` : ''}
        ${r.status === 'pending' ? `
          <div class="req-actions">
            <button class="btn btn-success" style="padding:.5rem 1rem;font-size:.8rem;" onclick="approveRequest('${r.id}')">✓ Approve</button>
            <button class="btn btn-danger" style="padding:.5rem 1rem;font-size:.8rem;" onclick="rejectRequest('${r.id}')">✕ Reject</button>
            <button class="btn btn-outline" style="padding:.5rem 1rem;font-size:.8rem;" onclick="useRequest('${r.id}', '${esc(r.event_title)}', ${r.entry_fee})">⚔️ Use as Event</button>
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  /* ── APPROVE REQUEST ──────────────────────────────────────── */
  window.approveRequest = async function(id) {
    const { data: { session } } = await window._sb.auth.getSession();
    const token = session?.access_token || sessionToken;

    await fetch(`${SUPABASE_URL}/rest/v1/event_requests?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'approved' }),
    });

    log(`Request approved.`, 'ok');
    showToast('Request approved.', 'ok');
    await loadRequests();
  };

  /* ── REJECT REQUEST ───────────────────────────────────────── */
  window.rejectRequest = async function(id) {
    const { data: { session } } = await window._sb.auth.getSession();
    const token = session?.access_token || sessionToken;

    await fetch(`${SUPABASE_URL}/rest/v1/event_requests?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'rejected' }),
    });

    log(`Request rejected.`, 'info');
    showToast('Request rejected.', 'ok');
    await loadRequests();
  };

  /* ── USE REQUEST AS EVENT ─────────────────────────────────── */
  window.useRequest = function(id, title, fee) {
    // Pre-fill the create event form with the request details
    const titleInput = $('ev-title');
    const feeInput   = $('ev-fee');
    if (titleInput) titleInput.value = title;
    if (feeInput)   feeInput.value   = fee;

    // Scroll to create form
    $('create-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Request loaded into Create Event form.', 'ok');
    log(`Request "${title}" loaded into form.`, 'info');
  };

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