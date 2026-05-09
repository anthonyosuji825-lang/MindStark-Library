/**
 * ═══════════════════════════════════════════════════════════════
 *  arena.js — MindStark · The Arena
 *  Vanilla JS game engine. Handles:
 *    - Realtime event + leaderboard subscriptions
 *    - Join Gauntlet flow with PIN modal
 *    - Answer submission
 *    - Live UI state machine
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /* ── Config ───────────────────────────────────────────────── */
  const SUPABASE_URL  = 'https://wgcpuohwyarhjlndmnlj.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnY3B1b2h3eWFyaGpsbmRtbmxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MzEzODYsImV4cCI6MjA4OTIwNzM4Nn0.W3SMmePgAdRR7v6_NWRlIoPYmo5HMF8mmTiwELkZclo';

  /* ── State ────────────────────────────────────────────────── */
  let currentUser     = null;
  let currentEvent    = null;
  let participation   = null;
  let leaderboard     = [];
  let walletBalance   = 0;
  let realtimeChannel = null;
  let answerLocked    = false;
  let userAnswers     = {};  // { [questionNum]: { correct: bool } } for Grand Hall

  /* ── DOM refs ─────────────────────────────────────────────── */
  const $ = id => document.getElementById(id);

  /* ── Init ─────────────────────────────────────────────────── */
  document.addEventListener('supabase:ready', init);

  async function init() {
    revealElements();

    const { data: { user } } = await window._sb.auth.getUser();
    currentUser = user;

    if (currentUser) {
      await loadWalletBalance();
      renderNavBalance();
    }

    await loadEvent();
  }

  /* ── Reveal scroll animations ─────────────────────────────── */
  function revealElements() {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.08 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  }

  /* ── Wallet balance ───────────────────────────────────────── */
  async function loadWalletBalance() {
    if (!currentUser || !window._sb) return;
    try {
      const { data } = await window._sb
        .from('wallets')
        .select('balance')
        .eq('user_id', currentUser.id)
        .single();
      walletBalance = data?.balance || 0;
    } catch (e) { walletBalance = 0; }
  }

  function renderNavBalance() {
    const wrap = $('nav-balance');
    const val  = $('nav-balance-val');
    if (!wrap || !val || !currentUser) return;
    wrap.style.display = 'flex';
    val.textContent = fmtUnits(walletBalance);
  }

  /* ── Load event ───────────────────────────────────────────── */
  async function loadEvent() {
    if (!window._sb) return;

    const { data, error } = await window._sb
      .from('events_public')
      .select('*')
      .in('status', ['registering', 'active', 'finished'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      renderNoEvent();
      return;
    }

    currentEvent = data;
    userAnswers  = {};

    if (currentUser) {
      await loadParticipation();
    }

    await loadLeaderboard();
    renderEvent();
    subscribeRealtime();
  }

  /* ── Load user participation ──────────────────────────────── */
  async function loadParticipation() {
    if (!currentUser || !currentEvent) return;
    const { data } = await window._sb
      .from('event_participants')
      .select('*')
      .eq('event_id', currentEvent.id)
      .eq('user_id', currentUser.id)
      .maybeSingle();
    participation = data || null;
  }

  /* ── Load leaderboard ─────────────────────────────────────── */
  async function loadLeaderboard() {
    if (!currentEvent) return;
    const { data } = await window._sb
      .from('event_participants')
      .select('*')
      .eq('event_id', currentEvent.id)
      .order('score', { ascending: false })
      .order('answered_at', { ascending: true, nullsFirst: false })
      .limit(50);
    leaderboard = data || [];
  }

  /* ── Realtime subscription ────────────────────────────────── */
  function subscribeRealtime() {
    if (!currentEvent || !window._sb) return;
    if (realtimeChannel) window._sb.removeChannel(realtimeChannel);

    realtimeChannel = window._sb
      .channel(`arena-${currentEvent.id}`)
      // Listen to event_public changes (question, status, prize_pool)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'events_public',
        filter: `id=eq.${currentEvent.id}`
      }, payload => {
        currentEvent = { ...currentEvent, ...payload.new };
        renderEvent();
      })
      // Listen to participant inserts (new joins)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'event_participants',
        filter: `event_id=eq.${currentEvent.id}`
      }, payload => {
        const existing = leaderboard.find(p => p.id === payload.new.id);
        if (!existing) leaderboard.push(payload.new);
        renderLeaderboard();
        updateEventStats();
      })
      // Listen to participant updates (score changes)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'event_participants',
        filter: `event_id=eq.${currentEvent.id}`
      }, payload => {
        const idx = leaderboard.findIndex(p => p.id === payload.new.id);
        if (idx > -1) leaderboard[idx] = payload.new;
        else leaderboard.push(payload.new);

        // Update own participation if it's us
        if (currentUser && payload.new.user_id === currentUser.id) {
          participation = payload.new;
        }

        // Sort: score desc, answered_at asc
        leaderboard.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (!a.answered_at) return 1;
          if (!b.answered_at) return -1;
          return new Date(a.answered_at) - new Date(b.answered_at);
        });

        renderLeaderboard();
        renderQuestionFeedback(payload.new);
      })
      .subscribe();
  }

  /* ── Master render ────────────────────────────────────────── */
  function renderEvent() {
    if (!currentEvent) { renderNoEvent(); return; }

    renderStatusPill();
    renderEventInfo();
    renderPrizeBreakdown();
    renderQuestion();
    renderJoinSection();
    renderLeaderboard();
    renderProgress();
  }

  /* ── Status pill ──────────────────────────────────────────── */
  function renderStatusPill() {
    const row = $('status-row');
    if (!row || !currentEvent) return;

    const labels = {
      registering: 'Registration Open',
      active: 'Live Now',
      finished: 'Event Ended',
      canceled: 'Canceled',
    };

    const pulse = currentEvent.status === 'active' ? ' pulse' : '';
    row.innerHTML = `
      <div class="status-pill ${currentEvent.status}">
        <div class="status-dot${pulse}"></div>
        ${labels[currentEvent.status] || currentEvent.status}
      </div>
      ${currentEvent.status === 'registering' ? `<div class="status-pill registering">Min ${currentEvent.min_participants} players</div>` : ''}
    `;
  }

  /* ── Event info ───────────────────────────────────────────── */
  function renderEventInfo() {
    if (!currentEvent) return;

    // Title + type
    const titleEl = $('event-title');
    if (titleEl) {
      titleEl.textContent = currentEvent.title || 'The Arena';
      titleEl.classList.remove('skeleton');
      titleEl.style = '';
    }
    const tagEl = $('event-type-tag');
    if (tagEl) {
      tagEl.textContent = currentEvent.type === 'gauntlet' ? '⚔️ Gauntlet — Winner Takes Prize Pool' : '🏛 Grand Hall';
      tagEl.classList.remove('skeleton');
      tagEl.style = '';
    }
    const badgeEl = $('event-type-badge');
    if (badgeEl) badgeEl.textContent = currentEvent.type === 'gauntlet' ? 'Gauntlet' : 'Grand Hall';

    updateEventStats();
  }

  function updateEventStats() {
    const fee    = $('stat-entry');
    const pool   = $('stat-pool');
    const players = $('stat-players');

    if (fee)    fee.textContent    = currentEvent.entry_fee === 0 ? 'Free' : fmtUnits(currentEvent.entry_fee);
    if (pool)   pool.textContent   = fmtUnits(currentEvent.prize_pool || 0);
    if (players) players.textContent = leaderboard.length;

    // lb count badge
    const lbCount = $('lb-count');
    if (lbCount) lbCount.textContent = leaderboard.length;
  }

  /* ── Prize breakdown ──────────────────────────────────────── */
  function renderPrizeBreakdown() {
    if (!currentEvent) return;
    const pool = (currentEvent.prize_pool || 0) * 0.85; // after 15% rake

    const p1 = $('prize-1st');
    const p2 = $('prize-2nd');
    const p3 = $('prize-3rd');

    if (p1) p1.textContent = fmtUnits(Math.floor(pool * 0.50)) + ' units';
    if (p2) p2.textContent = fmtUnits(Math.floor(pool * 0.30)) + ' units';
    if (p3) p3.textContent = fmtUnits(Math.floor(pool * 0.20)) + ' units';
  }

  /* ── Question render ──────────────────────────────────────── */
  function renderQuestion() {
    const body = $('question-body');
    if (!body || !currentEvent) return;

    answerLocked = false;

    if (currentEvent.status === 'finished') {
      renderResults();
      return;
    }

    if (!currentEvent.current_question || currentEvent.status === 'registering') {
      body.innerHTML = `
        <div class="q-waiting">
          <div class="q-waiting-icon">${currentEvent.status === 'registering' ? '⏳' : '⚔️'}</div>
          <h3>${currentEvent.status === 'registering' ? 'Filling the Arena…' : 'Round Complete'}</h3>
          <p>${currentEvent.status === 'registering'
            ? `Waiting for ${currentEvent.min_participants} players. ${leaderboard.length} have joined.`
            : 'Next question incoming. Stay sharp.'
          }</p>
        </div>`;
      return;
    }

    const isGrandHall   = currentEvent.type === 'grand_hall';
    const isParticipant = participation && participation.status === 'locked';
    const qNum  = currentEvent.question_number || 1;
    const total = currentEvent.total_questions || 10;
    const alreadyAnswered = isGrandHall && userAnswers[qNum];

    body.innerHTML = `
      <div class="q-number">Question ${qNum} of ${total}</div>
      ${isGrandHall && currentEvent.question_deadline ? `
        <div class="countdown-wrap">
          <div class="countdown-bar-track">
            <div class="countdown-bar-fill" id="countdown-fill"></div>
          </div>
          <div class="countdown-label" id="countdown-label">—s</div>
        </div>
      ` : ''}
      <div class="q-text">${escHtml(currentEvent.current_question)}</div>
      ${isParticipant && !alreadyAnswered ? `
        <div class="answer-form">
          <input
            type="text" class="answer-input" id="answer-input"
            placeholder="Type your answer…"
            autocomplete="off" autocorrect="off" spellcheck="false"
          />
          <button class="submit-btn" id="submit-btn">Submit</button>
        </div>
        <div class="answer-feedback" id="answer-feedback"></div>
        ${isGrandHall ? `<p style="font-size:.75rem;color:var(--arena-muted);margin-top:.6rem;">Everyone answers independently. Submit before time runs out.</p>` : ''}
      ` : isParticipant && alreadyAnswered ? `
        <div class="answer-feedback ${alreadyAnswered.correct ? 'correct' : 'wrong'}" style="display:block">
          ${alreadyAnswered.correct ? '✓ Correct! Point awarded.' : '✗ Incorrect answer submitted.'}
          Waiting for next question…
        </div>
      ` : `
        <div class="answer-feedback wrong" style="display:block">
          ${!currentUser
            ? 'Sign in to participate in events.'
            : currentEvent.status === 'active' && !participation
            ? 'Registration is closed for this event. Watch the live leaderboard!'
            : 'You are watching this event.'
          }
        </div>
      `}
    `;

    // Start countdown for Grand Hall
    if (isGrandHall && currentEvent.question_deadline) {
      startCountdown(currentEvent.question_deadline, currentEvent.question_time_limit || 30);
    }

    // Bind submit
    const submitBtn  = $('submit-btn');
    const answerInput = $('answer-input');
    if (submitBtn && answerInput) {
      submitBtn.addEventListener('click', () => isGrandHall ? handleGrandHallAnswer(qNum) : handleSubmitAnswer());
      answerInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') isGrandHall ? handleGrandHallAnswer(qNum) : handleSubmitAnswer();
      });
      answerInput.focus();
    }
  }

  /* ── Countdown timer (Grand Hall) ─────────────────────────── */
  let countdownInterval = null;

  function startCountdown(deadline, totalSeconds) {
    if (countdownInterval) clearInterval(countdownInterval);

    const fill  = $('countdown-fill');
    const label = $('countdown-label');
    if (!fill || !label) return;

    function tick() {
      const now       = Date.now();
      const end       = new Date(deadline).getTime();
      const remaining = Math.max(0, Math.floor((end - now) / 1000));
      const pct       = Math.min(100, (remaining / totalSeconds) * 100);

      if (label) label.textContent = remaining + 's';
      if (fill) {
        fill.style.width = pct + '%';
        fill.style.background = remaining <= 5
          ? 'var(--danger)'
          : remaining <= 10
          ? '#e0a020'
          : 'var(--gold)';
      }

      if (remaining <= 0) {
        clearInterval(countdownInterval);
        // Lock input when time is up
        const input = $('answer-input');
        const btn   = $('submit-btn');
        const fb    = $('answer-feedback');
        if (input) input.disabled = true;
        if (btn)   btn.disabled   = true;
        if (fb && fb.style.display === 'none' || !fb?.textContent) {
          showFeedback(fb, 'wrong', 'Time is up!');
        }
      }
    }

    tick();
    countdownInterval = setInterval(tick, 500);
  }

  /* ── Grand Hall answer submit ─────────────────────────────── */
  async function handleGrandHallAnswer(qNum) {
    const input = $('answer-input');
    const btn   = $('submit-btn');
    const fb    = $('answer-feedback');
    if (!input || !btn || !currentEvent || !currentUser) return;

    const answer = input.value.trim();
    if (!answer) { input.focus(); return; }

    btn.disabled  = true;
    btn.textContent = '…';
    input.disabled = true;

    try {
      const session = await window._sb.auth.getSession();
      const token   = session?.data?.session?.access_token;

      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_grand_hall_answer`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_user_id:    currentUser.id,
          p_event_id:   currentEvent.id,
          p_answer:     answer,
          p_question_num: qNum,
        }),
      });

      const result = await res.json();

      if (result.correct) {
        userAnswers[qNum] = { correct: true };
        showFeedback(fb, 'correct', '✓ Correct! Point awarded.');
        showToast('Correct! 🎯', 'success');
      } else if (result.error) {
        showFeedback(fb, 'wrong', result.error);
      } else {
        userAnswers[qNum] = { correct: false };
        showFeedback(fb, 'wrong', '✗ Incorrect. Better luck next question.');
        showToast('Wrong answer.', 'error');
      }

      // Lock after submission — answer is final
      if (btn) btn.disabled = true;
      if (input) input.disabled = true;

    } catch (err) {
      showFeedback(fb, 'wrong', 'Network error. Try again.');
      if (btn) { btn.disabled = false; btn.textContent = 'Submit'; }
      if (input) input.disabled = false;
    }
  }

  /* ── Handle answer submit ─────────────────────────────────── */
  async function handleSubmitAnswer() {
    if (answerLocked) return;

    const input = $('answer-input');
    const btn   = $('submit-btn');
    const fb    = $('answer-feedback');
    if (!input || !btn || !currentEvent || !currentUser) return;

    const answer = input.value.trim();
    if (!answer) { input.focus(); return; }

    answerLocked = true;
    btn.disabled = true;
    btn.textContent = '…';
    input.disabled = true;

    try {
      const session = await window._sb.auth.getSession();
      const token   = session?.data?.session?.access_token;

      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_answer`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_user_id: currentUser.id,
          p_event_id: currentEvent.id,
          p_answer: answer,
        }),
      });

      const result = await res.json();

      if (result.correct) {
        showFeedback(fb, 'correct', '✓ Correct! Point awarded.');
        showToast('Correct answer! 🎯', 'success');
        answerLocked = true; // stay locked until next question
      } else if (result.message) {
        // Question already answered by someone else
        showFeedback(fb, 'wrong', result.message);
        answerLocked = false;
        input.disabled = false;
        btn.disabled = false;
        btn.textContent = 'Submit';
      } else {
        showFeedback(fb, 'wrong', '✗ Incorrect. Try again!');
        answerLocked = false;
        input.disabled = false;
        btn.disabled = false;
        btn.textContent = 'Submit';
        input.value = '';
        input.focus();
      }
    } catch (err) {
      showFeedback(fb, 'wrong', 'Network error. Try again.');
      answerLocked = false;
      input.disabled = false;
      btn.disabled = false;
      btn.textContent = 'Submit';
    }
  }

  function showFeedback(el, type, msg) {
    if (!el) return;
    el.className = `answer-feedback ${type}`;
    el.textContent = msg;
    el.style.display = 'block';
  }

  function renderQuestionFeedback(updatedParticipant) {
    // Re-render question area only if it's a new question state
    if (!currentEvent?.current_question) renderQuestion();
  }

  /* ── Join section ─────────────────────────────────────────── */
  function renderJoinSection() {
    const body = $('join-body');
    if (!body || !currentEvent) return;

    // Already joined
    if (participation) {
      body.innerHTML = `
        <div class="already-joined">
          ✓ You're in the Arena. Good luck.
        </div>
        <p style="font-size:.78rem;color:var(--arena-muted);margin-top:.75rem;text-align:center;">
          Score: <strong style="color:var(--gold)">${participation.score || 0}</strong> point${participation.score === 1 ? '' : 's'}
        </p>
      `;
      return;
    }

    // Not logged in
    if (!currentUser) {
      body.innerHTML = `
        <p class="join-desc">Sign in to compete in Arena events and win wallet units.</p>
        <button class="join-btn" onclick="window.location.href='signin.html'">Sign In to Join</button>
      `;
      return;
    }

    // Event finished or canceled
    if (currentEvent.status === 'finished' || currentEvent.status === 'canceled') {
      body.innerHTML = `
        <p class="join-desc">This event has ended. Stay tuned for the next Gauntlet.</p>
        <button class="join-btn" disabled>Event Ended</button>
      `;
      return;
    }

    // Event active — registration closed
    if (currentEvent.status === 'active') {
      body.innerHTML = `
        <p class="join-desc">This event is live. Registration is closed. Watch and learn for next time.</p>
        <button class="join-btn" disabled>Registration Closed</button>
      `;
      return;
    }

    // Registration open
    const fee = currentEvent.entry_fee;
    const canAfford = walletBalance >= fee;

    body.innerHTML = `
      <p class="join-desc">
        ${fee === 0
          ? 'This event is free to enter. Join and compete for glory.'
          : `Entry costs <strong style="color:var(--gold)">${fmtUnits(fee)} units</strong>. Your balance: <strong style="color:var(--gold)">${fmtUnits(walletBalance)} units</strong>.`
        }
      </p>
      <button class="join-btn" id="join-btn" ${!canAfford && fee > 0 ? 'disabled' : ''}>
        ${fee === 0 ? 'Join Free' : canAfford ? `Join · ${fmtUnits(fee)} units` : 'Insufficient Balance'}
      </button>
      ${!canAfford && fee > 0 ? '<p style="font-size:.75rem;color:var(--arena-muted);margin-top:.5rem;text-align:center;">Top up your Wallet to enter.</p>' : ''}
    `;

    const joinBtn = $('join-btn');
    if (joinBtn && (canAfford || fee === 0)) {
      joinBtn.addEventListener('click', () => {
        if (fee === 0) handleFreeJoin();
        else openPinModal();
      });
    }
  }

  /* ── Free join (no PIN needed) ────────────────────────────── */
  async function handleFreeJoin() {
    if (!currentUser || !currentEvent) return;
    const btn = $('join-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Joining…'; }

    try {
      const session = await window._sb.auth.getSession();
      const token   = session?.data?.session?.access_token;

      // For free events — get wallet id first
      const { data: wallet } = await window._sb
        .from('wallets').select('id').eq('user_id', currentUser.id).single();

      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/join_gauntlet`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_user_id: currentUser.id,
          p_event_id: currentEvent.id,
          p_wallet_id: wallet?.id,
        }),
      });

      const result = await res.json();
      if (result.success) {
        await loadParticipation();
        renderJoinSection();
        showToast('You\'re in the Arena! ⚔️', 'success');
      } else {
        showToast(result.error || 'Could not join. Try again.', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Join Free'; }
      }
    } catch (e) {
      showToast('Network error. Try again.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Join Free'; }
    }
  }

  /* ── PIN Modal ────────────────────────────────────────────── */
  function openPinModal() {
    if (!currentEvent) return;

    const fee         = currentEvent.entry_fee;
    const afterBal    = walletBalance - fee;

    const mFee    = $('modal-fee');
    const mBal    = $('modal-balance');
    const mAfter  = $('modal-after');
    const pinInput = $('pin-input');
    const errEl   = $('modal-err');

    if (mFee)    mFee.textContent    = fmtUnits(fee) + ' units';
    if (mBal)    mBal.textContent    = fmtUnits(walletBalance) + ' units';
    if (mAfter)  mAfter.textContent  = fmtUnits(Math.max(0, afterBal)) + ' units';
    if (pinInput) pinInput.value = '';
    if (errEl)   errEl.textContent  = '';

    $('pin-modal').classList.add('open');
    setTimeout(() => { if (pinInput) pinInput.focus(); }, 300);

    $('modal-close').onclick = closePinModal;
    $('pin-modal').onclick = e => { if (e.target === $('pin-modal')) closePinModal(); };
    $('modal-confirm-btn').onclick = handlePinConfirm;

    // PIN input: auto-submit on 4 digits
    if (pinInput) {
      pinInput.oninput = () => {
        if (pinInput.value.length === 4) handlePinConfirm();
      };
    }
  }

  function closePinModal() {
    $('pin-modal').classList.remove('open');
  }

  async function handlePinConfirm() {
    const pinInput = $('pin-input');
    const errEl    = $('modal-err');
    const confirmBtn = $('modal-confirm-btn');

    if (!pinInput || !currentUser || !currentEvent) return;

    const pin = pinInput.value.trim();
    if (!/^\d{4}$/.test(pin)) {
      if (errEl) errEl.textContent = 'Enter a valid 4-digit PIN.';
      return;
    }

    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Verifying…'; }
    if (errEl) errEl.textContent = '';

    try {
      // We call the Next.js Server Action endpoint
      // Since this is vanilla JS, we call the Supabase RPC directly
      // PIN hashing happens client-side to match the server pattern
      const pinHash = await sha256(pin);

      // First verify PIN via existing RPC
      const { data: wallet } = await window._sb
        .from('wallets').select('id').eq('user_id', currentUser.id).single();

      const { data: pinValid } = await window._sb
        .rpc('verify_transaction_pin', {
          p_wallet_id: wallet?.id,
          p_pin_hash: pinHash,
        });

      if (!pinValid) {
        if (errEl) errEl.textContent = 'Incorrect PIN. Please try again.';
        if (pinInput) { pinInput.value = ''; pinInput.focus(); }
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm & Join'; }
        return;
      }

      // PIN correct — call join_gauntlet
      const session = await window._sb.auth.getSession();
      const token   = session?.data?.session?.access_token;

      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/join_gauntlet`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_user_id: currentUser.id,
          p_event_id: currentEvent.id,
          p_wallet_id: wallet?.id,
        }),
      });

      const result = await res.json();

      if (result.success) {
        closePinModal();
        walletBalance = Math.max(0, walletBalance - currentEvent.entry_fee);
        renderNavBalance();
        await loadParticipation();
        renderJoinSection();
        renderPrizeBreakdown();
        showToast(`Entered! ${fmtUnits(currentEvent.entry_fee)} units locked. ⚔️`, 'success');
      } else {
        if (errEl) errEl.textContent = result.error || 'Failed to join. Please try again.';
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm & Join'; }
      }
    } catch (e) {
      if (errEl) errEl.textContent = 'Network error. Please try again.';
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm & Join'; }
    }
  }

  /* ── Leaderboard render ───────────────────────────────────── */
  function renderLeaderboard() {
    const list = $('leaderboard-list');
    const countBadge = $('lb-count');
    if (!list) return;

    if (countBadge) countBadge.textContent = leaderboard.length;

    if (!leaderboard.length) {
      list.innerHTML = '<div class="lb-empty">No participants yet. Be the first.</div>';
      return;
    }

    const rankIcons = ['🥇', '🥈', '🥉'];
    const rankClasses = ['gold', 'silver', 'bronze'];

    list.innerHTML = leaderboard.slice(0, 20).map((p, i) => {
      const isMe = currentUser && p.user_id === currentUser.id;
      const initials = (p.display_name || 'AN').slice(0, 2).toUpperCase();
      const rankDisplay = i < 3 ? rankIcons[i] : `${i + 1}`;
      const rankClass = i < 3 ? rankClasses[i] : '';

      return `
        <div class="lb-row${isMe ? ' is-me' : ''}">
          <span class="lb-rank ${rankClass}">${rankDisplay}</span>
          <div class="lb-avatar">${initials}</div>
          <span class="lb-name">
            ${escHtml(p.display_name || 'Anonymous')}
            ${isMe ? '<span class="you-tag">You</span>' : ''}
          </span>
          <span class="lb-score">${p.score}</span>
        </div>
      `;
    }).join('');
  }

  /* ── Progress bar ─────────────────────────────────────────── */
  function renderProgress() {
    const wrap   = $('progress-wrap');
    const fill   = $('progress-fill');
    const label  = $('q-progress-label');
    const text   = $('progress-text');
    const pct    = $('progress-pct');
    if (!currentEvent) return;

    const qNum   = currentEvent.question_number || 0;
    const total  = currentEvent.total_questions || 10;
    const perc   = total > 0 ? Math.round((qNum / total) * 100) : 0;

    if (label) label.textContent = `${qNum} / ${total}`;

    if (currentEvent.status === 'active' || currentEvent.status === 'finished') {
      if (wrap) wrap.style.display = '';
      if (fill) fill.style.width = perc + '%';
      if (text) text.textContent = `Question ${qNum} of ${total}`;
      if (pct)  pct.textContent  = perc + '%';
    } else {
      if (wrap) wrap.style.display = 'none';
    }
  }

  /* ── No event state ───────────────────────────────────────── */
  function renderNoEvent() {
    const content = $('arena-content');
    if (!content) return;
    content.innerHTML = `
      <div class="no-event reveal visible">
        <div class="no-event-icon">🏟</div>
        <h2>The Arena is Empty</h2>
        <p>No events are scheduled right now. MindStark will announce the next Gauntlet soon. Stay sharp.</p>
      </div>
    `;
    $('status-row').innerHTML = `
      <div class="status-pill finished">
        <div class="status-dot"></div>
        No Active Events
      </div>
    `;
  }

  /* ── Results / podium ─────────────────────────────────────── */
  function renderResults() {
    const body = $('question-body');
    if (!body || !currentEvent) return;

    const pool = (currentEvent.prize_pool || 0) * 0.85;
    const top3 = leaderboard.slice(0, 3);

    const podiumOrder = [top3[1], top3[0], top3[2]]; // 2nd, 1st, 3rd visual order
    const positions = ['second', 'first', 'third'];
    const crowns    = ['🥈', '🥇', '🥉'];
    const payouts   = [0.30, 0.50, 0.20];
    const barLabels = ['2nd', '1st', '3rd'];

    body.innerHTML = `
      <div class="results-title">⚔️ The Gauntlet Has Spoken</div>
      <div class="podium">
        ${podiumOrder.map((p, i) => p ? `
          <div class="podium-place">
            <div class="podium-crown">${crowns[i]}</div>
            <div class="podium-name">${escHtml(p.display_name || 'Anonymous')}</div>
            <div class="podium-score">${p.score} pts</div>
            <div class="podium-bar ${positions[i]}">
              <div class="podium-payout">+${fmtUnits(Math.floor(pool * payouts[i]))}</div>
            </div>
          </div>
        ` : `<div class="podium-place"><div class="podium-bar ${positions[i]}"></div></div>`
        ).join('')}
      </div>
      ${leaderboard.length > 3 ? `
        <p style="text-align:center;font-size:.82rem;color:var(--arena-muted);">
          ${leaderboard.length - 3} other participant${leaderboard.length - 3 === 1 ? '' : 's'} competed bravely.
        </p>
      ` : ''}
    `;
  }

  /* ── Utilities ────────────────────────────────────────────── */
  function fmtUnits(n) {
    if (n === undefined || n === null) return '—';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return n.toString();
  }

  function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  async function sha256(message) {
    const msgBuffer  = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray  = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /* ── Toast ────────────────────────────────────────────────── */
  function showToast(msg, type = '') {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.className   = `toast${type ? ' ' + type : ''} show`;
    setTimeout(() => t.classList.remove('show'), 3200);
  }

})();