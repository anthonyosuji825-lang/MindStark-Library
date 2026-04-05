/*
═══════════════════════════════════════════════════════════
  MindStark Library — Smart Nav v4
  - Desktop: unchanged
  - Mobile: modern bottom-sheet menu
  - NEW: Reader Pro & Scholar membership badges
═══════════════════════════════════════════════════════════
*/

(function () {

  /* ── SESSION DATA ──────────────────────────── */
  let currentUser = null;
  try { currentUser = JSON.parse(sessionStorage.getItem('ms_current_user') || 'null'); } catch(e) {}
  const isSignedIn = currentUser && !currentUser.guest && currentUser.email;
  const isGuest    = currentUser && currentUser.guest;

  let prefs = { darkMode: false, accentColor: '#c8963e', streak: 1 };
  try { const s = JSON.parse(sessionStorage.getItem('ms_user_prefs') || '{}'); prefs = {...prefs,...s}; } catch(e) {}

  let bmCount = 0;
  try { bmCount = JSON.parse(sessionStorage.getItem('ms_bookmarks_data') || '[]').length; } catch(e) {}

  let lastBook = null;
  try { lastBook = JSON.parse(sessionStorage.getItem('ms_last_read') || 'null'); } catch(e) {}

  let booksRead = 0;
  try { booksRead = parseInt(sessionStorage.getItem('ms_books_read') || '0'); } catch(e) {}

  /* ── MEMBERSHIP DETECTION ──────────────────── */
  let memberPlan = null; // null | 'pro' | 'scholar'
  try {
    const mem = JSON.parse(sessionStorage.getItem('ms_membership') || 'null');
    if (mem && mem.active) memberPlan = mem.plan;
    if (!memberPlan && currentUser?.membership?.active) memberPlan = currentUser.membership.plan;
  } catch(e) {}

  const isPro     = memberPlan === 'pro';
  const isScholar = memberPlan === 'scholar';
  const isMember  = isPro || isScholar;

  /* Badge config */
  const BADGE = {
    pro: {
      label:      'Reader Pro',
      icon:       '✦',
      shortLabel: 'PRO',
      color:      '#c8963e',
      bg:         'linear-gradient(135deg,#c8963e,#a0522d)',
      glow:       'rgba(200,150,62,.55)',
      textColor:  '#fff',
      pill:       'linear-gradient(135deg,#c8963e,#e8b84b)',
    },
    scholar: {
      label:      'Scholar',
      icon:       '🎓',
      shortLabel: 'SCHOLAR',
      color:      '#7c5cbf',
      bg:         'linear-gradient(135deg,#5b3fa0,#9b6de0)',
      glow:       'rgba(124,92,191,.55)',
      textColor:  '#fff',
      pill:       'linear-gradient(135deg,#5b3fa0,#9b6de0)',
    }
  };

  const badge = isMember ? BADGE[memberPlan] : null;

  function getGreeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  /* ── DARK MODE ─────────────────────────────── */
  function applyDarkMode(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    let tag = document.getElementById('ms-dark-style');
    if (!tag) { tag = document.createElement('style'); tag.id = 'ms-dark-style'; document.head.appendChild(tag); }
    tag.textContent = dark ? `
      [data-theme="dark"] body{background:#0f0a05!important;color:#e8dfd0!important}
      [data-theme="dark"] nav{background:rgba(15,10,5,.97)!important;border-color:rgba(200,150,62,.15)!important}
      [data-theme="dark"] .page-header{background:#1a0f07!important}
      [data-theme="dark"] .search-bar-wrap{background:#1a1208!important}
      [data-theme="dark"] .sort-bar{background:#150d05!important}
      [data-theme="dark"] .sidebar{background:#1a1208!important;border-color:rgba(200,150,62,.12)!important}
      [data-theme="dark"] .book-card{background:#1e1510!important;border-color:rgba(200,150,62,.12)!important}
      [data-theme="dark"] .book-info h3{color:#e8dfd0!important}
      [data-theme="dark"] .search-input{background:#1e1510!important;color:#e8dfd0!important}
      [data-theme="dark"] .sort-select,.view-btn,.pag-btn{background:#1e1510!important;color:#e8dfd0!important}
      [data-theme="dark"] .plan-card{background:#1e1510!important}
      [data-theme="dark"] .compare-table{background:#1e1510!important}
      [data-theme="dark"] .compare-table th{background:#150d05!important}
      [data-theme="dark"] .compare-table td{color:#e8dfd0!important;border-color:rgba(200,150,62,.1)!important}
      [data-theme="dark"] footer{background:#080503!important}
      [data-theme="dark"] .faq-q{color:#e8dfd0!important}
      [data-theme="dark"] .ms-sheet{background:#1a1208!important}
      [data-theme="dark"] .ms-mob-link{color:#e8dfd0!important;border-color:rgba(200,150,62,.07)!important}
      [data-theme="dark"] .ms-mob-link:hover{background:rgba(200,150,62,.08)!important}
      [data-theme="dark"] .ms-mob-stat{background:#150d05!important}
      [data-theme="dark"] .ms-mob-stat-num{color:#e8dfd0!important}
      [data-theme="dark"] .ms-mob-section{color:var(--gold)!important}
      [data-theme="dark"] .ms-mob-toggle-lbl{color:#e8dfd0!important}
      [data-theme="dark"] .nav-dropdown{background:#1e1510!important;border-color:rgba(200,150,62,.15)!important}
      [data-theme="dark"] .dd-stats{background:#150d05!important}
      [data-theme="dark"] .dd-stat-num{color:#e8dfd0!important}
      [data-theme="dark"] .dd-item{color:#e8dfd0!important}
      [data-theme="dark"] .dd-item:hover{background:#2a1a0a!important}
      [data-theme="dark"] .dd-section{background:#150d05!important}
      [data-theme="dark"] .dd-toggle-label{color:#e8dfd0!important}
    ` : '';
  }
  if (prefs.darkMode) applyDarkMode(true);

  /* ── STYLES ────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `

    /* ═══ MEMBERSHIP BADGE STYLES ════════════ */

    /* Pill badge next to name in nav */
    .ms-mem-pill{
      display:inline-flex;align-items:center;gap:.25rem;
      font-size:.58rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
      padding:.18rem .55rem;border-radius:50px;
      color:#fff;flex-shrink:0;
      box-shadow:0 2px 8px rgba(0,0,0,.2);
    }

    /* Glowing avatar ring for members */
    .nav-avatar.member-pro{
      border-color:#c8963e;
      box-shadow:0 0 0 2px #c8963e, 0 0 12px rgba(200,150,62,.6);
    }
    .nav-avatar.member-scholar{
      border-color:#7c5cbf;
      box-shadow:0 0 0 2px #7c5cbf, 0 0 12px rgba(124,92,191,.6);
    }

    /* Big avatar glow in dropdown */
    .dd-avatar-large.member-pro{
      border:2.5px solid #c8963e;
      box-shadow:0 0 0 3px rgba(200,150,62,.3), 0 4px 20px rgba(200,150,62,.4);
    }
    .dd-avatar-large.member-scholar{
      border:2.5px solid #7c5cbf;
      box-shadow:0 0 0 3px rgba(124,92,191,.3), 0 4px 20px rgba(124,92,191,.4);
    }

    /* Member plan card inside dropdown */
    .dd-member-card{
      margin:.5rem .85rem .75rem;
      border-radius:12px;
      padding:.7rem .9rem;
      display:flex;align-items:center;gap:.65rem;
      position:relative;overflow:hidden;
    }
    .dd-member-card::before{
      content:'';position:absolute;inset:0;
      opacity:.12;border-radius:12px;
    }
    .dd-member-card-icon{font-size:1.3rem;flex-shrink:0;position:relative;z-index:1}
    .dd-member-card-info{flex:1;min-width:0;position:relative;z-index:1}
    .dd-member-card-title{font-size:.8rem;font-weight:700;letter-spacing:.04em}
    .dd-member-card-sub{font-size:.68rem;opacity:.75;margin-top:.1rem}
    .dd-member-card-badge{
      font-size:.6rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
      padding:.2rem .55rem;border-radius:50px;
      background:rgba(255,255,255,.2);
      border:1px solid rgba(255,255,255,.3);
      position:relative;z-index:1;
      white-space:nowrap;flex-shrink:0;
    }

    /* Mobile sheet member card */
    .ms-mem-card{
      margin:.25rem 1rem .5rem;
      border-radius:14px;
      padding:.65rem 1rem;
      display:flex;align-items:center;gap:.65rem;
      position:relative;overflow:hidden;
    }
    .ms-mem-card-icon{font-size:1.2rem;flex-shrink:0;position:relative;z-index:1}
    .ms-mem-card-info{flex:1;min-width:0;position:relative;z-index:1}
    .ms-mem-card-title{font-size:.8rem;font-weight:700;color:#fff}
    .ms-mem-card-sub{font-size:.68rem;color:rgba(255,255,255,.65);margin-top:.05rem}
    .ms-mem-card-pill{
      font-size:.58rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
      padding:.18rem .5rem;border-radius:50px;
      background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.3);
      color:#fff;position:relative;z-index:1;flex-shrink:0;
    }

    /* ═══ DESKTOP PROFILE ════════════════════ */
    .nav-profile-wrap{position:relative}
    .nav-profile-btn{display:flex;align-items:center;gap:.5rem;background:rgba(200,150,62,.12);border:1px solid rgba(200,150,62,.25);color:#c8963e;padding:.42rem .9rem .42rem .5rem;border-radius:50px;font-family:'DM Sans',sans-serif;font-size:.85rem;font-weight:500;cursor:pointer;transition:all .2s;position:relative}
    .nav-profile-btn:hover{background:rgba(200,150,62,.22);border-color:#c8963e}
    .nav-avatar{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#c8963e,#a0522d);color:#fff;font-size:.78rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 8px rgba(200,150,62,.4);border:2px solid rgba(200,150,62,.4)}
    .nav-profile-name{max-width:90px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .nav-chevron{font-size:.6rem;transition:transform .2s;opacity:.7}
    .nav-profile-wrap.open .nav-chevron{transform:rotate(180deg)}
    .streak-badge{position:absolute;top:-4px;right:28px;background:#e53e3e;color:#fff;font-size:.58rem;font-weight:700;padding:.1rem .35rem;border-radius:50px;border:1.5px solid #fff;white-space:nowrap;pointer-events:none}
    .bm-badge{position:absolute;top:-5px;right:-5px;background:#c8963e;color:#fff;font-size:.58rem;font-weight:700;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;pointer-events:none}
    .nav-dropdown{position:absolute;top:calc(100% + .65rem);right:0;background:#fff;border:1px solid rgba(200,150,62,.18);border-radius:16px;box-shadow:0 16px 48px rgba(59,42,26,.18);min-width:270px;overflow:hidden;display:none;z-index:9999;animation:dropIn .2s ease}
    @keyframes dropIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
    .nav-profile-wrap.open .nav-dropdown{display:block}
    .dd-header{padding:1.1rem 1.25rem .9rem;background:linear-gradient(135deg,#3b2a1a,#5c3d20);display:flex;align-items:center;gap:.85rem}
    .dd-avatar-large{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#c8963e,#a0522d);color:#fff;font-size:1rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:2px solid rgba(200,150,62,.5);box-shadow:0 4px 12px rgba(0,0,0,.3)}
    .dd-user-info{flex:1;min-width:0}
    .dd-user-name{font-family:'Playfair Display',serif;font-size:.95rem;font-weight:700;color:#f5f0e8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:.4rem}
    .dd-user-email{font-size:.72rem;color:rgba(245,240,232,.5);margin-top:.1rem}
    .dd-greeting{font-size:.7rem;color:#c8963e;margin-bottom:.2rem}
    .dd-stats{display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1px solid rgba(200,150,62,.12);background:#fdf8f0}
    .dd-stat{padding:.75rem .5rem;text-align:center;border-right:1px solid rgba(200,150,62,.1)}
    .dd-stat:last-child{border-right:none}
    .dd-stat-num{font-family:'Playfair Display',serif;font-size:1.1rem;font-weight:900;color:#3b2a1a;display:block}
    .dd-stat-label{font-size:.62rem;color:#7a6652;text-transform:uppercase;letter-spacing:.08em}
    .dd-item{display:flex;align-items:center;gap:.7rem;padding:.72rem 1.25rem;font-family:'DM Sans',sans-serif;font-size:.88rem;color:#2c1e0f;text-decoration:none;cursor:pointer;transition:background .15s,color .15s;border:none;background:none;width:100%;text-align:left}
    .dd-item:hover{background:#fdf8f0;color:#c8963e}
    .dd-item .dd-icon{font-size:.95rem;width:22px;text-align:center;flex-shrink:0}
    .dd-item .dd-badge{margin-left:auto;background:#c8963e;color:#fff;font-size:.65rem;font-weight:700;padding:.1rem .45rem;border-radius:50px}
    .dd-item.danger{color:#c53030;border-top:1px solid rgba(200,150,62,.1)}
    .dd-item.danger:hover{background:rgba(229,62,62,.06)}
    .dd-section{padding:.4rem 1.25rem .2rem;font-size:.65rem;letter-spacing:.12em;text-transform:uppercase;color:#7a6652;background:#fdf8f0;border-top:1px solid rgba(200,150,62,.08)}
    .dd-toggle-row{display:flex;align-items:center;justify-content:space-between;padding:.72rem 1.25rem;border-top:1px solid rgba(200,150,62,.1)}
    .dd-toggle-label{font-size:.88rem;color:#2c1e0f;display:flex;align-items:center;gap:.6rem}
    .toggle-switch{width:38px;height:20px;border-radius:50px;background:#ddd;border:none;cursor:pointer;position:relative;transition:background .25s;flex-shrink:0}
    .toggle-switch.on{background:#c8963e}
    .toggle-switch::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .25s;box-shadow:0 1px 4px rgba(0,0,0,.2)}
    .toggle-switch.on::after{transform:translateX(18px)}
    .continue-bar{background:linear-gradient(135deg,#3b2a1a,#5c3d20);padding:.65rem 2rem;display:flex;align-items:center;gap:1rem;border-bottom:1px solid rgba(200,150,62,.15);flex-wrap:wrap}
    .continue-bar-text{font-size:.82rem;color:rgba(245,240,232,.7);flex:1;min-width:0}
    .continue-bar-title{color:#c8963e;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;display:inline-block;vertical-align:bottom}
    .continue-bar-btn{background:rgba(200,150,62,.2);border:1px solid rgba(200,150,62,.35);color:#c8963e;padding:.35rem .9rem;border-radius:50px;font-family:'DM Sans',sans-serif;font-size:.78rem;font-weight:500;cursor:pointer;transition:all .2s;white-space:nowrap;text-decoration:none;flex-shrink:0}
    .continue-bar-btn:hover{background:#c8963e;color:#3b2a1a}
    .nav-guest-btn{display:flex;align-items:center;gap:.45rem;background:transparent;border:1.5px dashed rgba(200,150,62,.35);color:#c8963e;padding:.42rem 1rem;border-radius:50px;font-family:'DM Sans',sans-serif;font-size:.82rem;cursor:pointer;transition:all .2s;text-decoration:none}
    .nav-guest-btn:hover{border-color:#c8963e;background:rgba(200,150,62,.08)}

    /* ═══ MOBILE BOTTOM SHEET ════════════════ */
    .ms-overlay{display:none;position:fixed;inset:0;background:rgba(10,5,2,.65);backdrop-filter:blur(3px);z-index:997;transition:opacity .3s}
    .ms-overlay.open{display:block;animation:fadeIn .25s ease}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    .ms-sheet{position:fixed;bottom:0;left:0;right:0;background:#fdf8f0;border-radius:22px 22px 0 0;z-index:998;transform:translateY(100%);transition:transform .38s cubic-bezier(.25,1,.5,1);max-height:90vh;overflow-y:auto;box-shadow:0 -4px 40px rgba(59,42,26,.2);padding-bottom:max(env(safe-area-inset-bottom,0px), 1rem)}
    .ms-sheet.open{transform:translateY(0)}
    .ms-handle{width:36px;height:4px;background:rgba(59,42,26,.15);border-radius:2px;margin:12px auto 6px}
    .ms-profile-card{margin:.25rem 1rem .85rem;background:linear-gradient(135deg,#3b2a1a 0%,#5c3d20 100%);border-radius:16px;padding:1rem 1.1rem;display:flex;align-items:center;gap:.85rem}
    .ms-pf-avatar{width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#c8963e,#a0522d);color:#fff;font-size:1.05rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:2px solid rgba(200,150,62,.5);box-shadow:0 3px 10px rgba(0,0,0,.25)}
    .ms-pf-avatar.member-pro{border-color:#c8963e;box-shadow:0 0 0 2px #c8963e,0 0 14px rgba(200,150,62,.7)}
    .ms-pf-avatar.member-scholar{border-color:#7c5cbf;box-shadow:0 0 0 2px #7c5cbf,0 0 14px rgba(124,92,191,.7)}
    .ms-pf-info{flex:1;min-width:0}
    .ms-pf-name{font-family:'Playfair Display',serif;font-size:.95rem;font-weight:700;color:#f5f0e8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:.4rem}
    .ms-pf-sub{font-size:.72rem;color:rgba(245,240,232,.5);margin-top:.1rem}
    .ms-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin:0 1rem .5rem}
    .ms-stat{background:#fff;border:1px solid rgba(200,150,62,.14);border-radius:12px;padding:.6rem .35rem;text-align:center}
    .ms-stat-num{font-family:'Playfair Display',serif;font-size:1.1rem;font-weight:900;color:#3b2a1a;display:block;line-height:1}
    .ms-stat-lbl{font-size:.58rem;color:#7a6652;text-transform:uppercase;letter-spacing:.07em;margin-top:.2rem;display:block}
    .ms-section{font-size:.62rem;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:#c8963e;padding:.65rem 1.25rem .3rem;display:block}
    .ms-mob-link{display:flex;align-items:center;gap:.8rem;padding:.82rem 1.25rem;border:none;background:none;width:100%;text-align:left;font-family:'DM Sans',sans-serif;font-size:.93rem;font-weight:500;color:#2c1e0f;text-decoration:none;cursor:pointer;transition:background .15s,color .15s;border-bottom:1px solid rgba(59,42,26,.06)}
    .ms-mob-link:last-of-type{border-bottom:none}
    .ms-mob-link:hover,.ms-mob-link:active{background:rgba(200,150,62,.07);color:#c8963e}
    .ms-mob-link-icon{font-size:1.05rem;width:24px;text-align:center;flex-shrink:0}
    .ms-mob-link-badge{margin-left:auto;background:#c8963e;color:#fff;font-size:.62rem;font-weight:700;padding:.1rem .45rem;border-radius:50px}
    .ms-mob-link.danger{color:#c53030}
    .ms-mob-link.danger:hover{background:rgba(229,62,62,.05)}
    .ms-toggle-row{display:flex;align-items:center;justify-content:space-between;padding:.82rem 1.25rem;border-bottom:1px solid rgba(59,42,26,.06)}
    .ms-toggle-lbl{display:flex;align-items:center;gap:.8rem;font-family:'DM Sans',sans-serif;font-size:.93rem;font-weight:500;color:#2c1e0f}
    .ms-mob-toggle-lbl{display:flex;align-items:center;gap:.8rem;font-family:'DM Sans',sans-serif;font-size:.93rem;font-weight:500;color:#2c1e0f}
    .ms-cta{display:block;margin:.75rem 1rem 1.25rem;padding:.9rem;background:#3b2a1a;color:#f5f0e8;text-align:center;border-radius:14px;font-family:'DM Sans',sans-serif;font-size:.95rem;font-weight:500;text-decoration:none;transition:background .2s;border:none;cursor:pointer;width:calc(100% - 2rem)}
    .ms-cta:hover{background:#c8963e}

    @media(max-width:860px){
      .nav-profile-name,.nav-chevron{display:none}
      .nav-profile-btn{width:36px;height:36px;padding:0;justify-content:center;border-radius:50%}
      .nav-dropdown{right:-.5rem;min-width:240px}
      .ms-mem-pill-nav{display:none}
    }
    @media(min-width:861px){
      .ms-overlay,.ms-sheet{display:none!important}
    }
  `;
  document.head.appendChild(style);

  /* ── HELPER ────────────────────────────────── */
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function savePrefs(){ sessionStorage.setItem('ms_user_prefs', JSON.stringify(prefs)); }

  /* ── USER DATA ─────────────────────────────── */
  const name      = isSignedIn ? (currentUser.name || 'Reader') : '';
  const firstName = name.split(' ')[0];
  const initials  = name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2) || '?';
  const greeting  = getGreeting();

  if (isSignedIn) {
    const today = new Date().toDateString();
    const last  = sessionStorage.getItem('ms_last_visit');
    if (last !== today) {
      sessionStorage.setItem('ms_last_visit', today);
      if (last) { prefs.streak = (prefs.streak||1)+1; savePrefs(); }
    }
  }

  /* ── BADGE HTML HELPERS ────────────────────── */
  function memberPillHtml(small) {
    if (!badge) return '';
    return `<span class="ms-mem-pill${small?' ms-mem-pill-nav':''}" style="background:${badge.pill};color:${badge.textColor}">
      ${badge.icon} ${small ? badge.shortLabel : badge.label}
    </span>`;
  }

  function memberCardHtml() {
    if (!badge) return '';
    return `<div class="dd-member-card" style="background:${badge.bg};color:${badge.textColor}">
      <div class="dd-member-card-icon">${badge.icon}</div>
      <div class="dd-member-card-info">
        <div class="dd-member-card-title">${badge.label} Member</div>
        <div class="dd-member-card-sub">Full library access · All premium features</div>
      </div>
      <div class="dd-member-card-badge">Active</div>
    </div>`;
  }

  function mobileMemCardHtml() {
    if (!badge) return '';
    return `<div class="ms-mem-card" style="background:${badge.pill}">
      <div class="ms-mem-card-icon">${badge.icon}</div>
      <div class="ms-mem-card-info">
        <div class="ms-mem-card-title">${badge.label} Member</div>
        <div class="ms-mem-card-sub">All premium features unlocked</div>
      </div>
      <div class="ms-mem-card-pill">Active</div>
    </div>`;
  }

  /* ── AVATAR CLASS ──────────────────────────── */
  const avatarMemberClass = isPro ? 'member-pro' : isScholar ? 'member-scholar' : '';

  /* ══════════════════════════════════════════
     DESKTOP NAV
  ══════════════════════════════════════════ */
  const navCta = document.querySelector('.nav-cta');

  if (navCta && isSignedIn) {
    const wrap = document.createElement('div');
    wrap.className = 'nav-profile-wrap';
    wrap.innerHTML = `
      <button class="nav-profile-btn" onclick="toggleNavDropdown(event)">
        ${prefs.streak > 1 ? `<span class="streak-badge">🔥${prefs.streak}</span>` : ''}
        <div class="nav-avatar ${avatarMemberClass}">${esc(initials)}</div>
        <span class="nav-profile-name">${esc(firstName)}</span>
        ${memberPillHtml(true)}
        <span class="nav-chevron">▼</span>
        ${bmCount > 0 ? `<span class="bm-badge">${bmCount}</span>` : ''}
      </button>
      <div class="nav-dropdown">
        <div class="dd-header">
          <div class="dd-avatar-large ${avatarMemberClass}">${esc(initials)}</div>
          <div class="dd-user-info">
            <div class="dd-greeting">${greeting} 👋</div>
            <div class="dd-user-name">
              ${esc(name)}
              ${memberPillHtml(false)}
            </div>
            <div class="dd-user-email">${esc(currentUser.email)}</div>
          </div>
        </div>
        ${memberCardHtml()}
        <div class="dd-stats">
          <div class="dd-stat"><span class="dd-stat-num">${bmCount}</span><span class="dd-stat-label">Saved</span></div>
          <div class="dd-stat"><span class="dd-stat-num">${booksRead}</span><span class="dd-stat-label">Read</span></div>
          <div class="dd-stat"><span class="dd-stat-num">${prefs.streak}</span><span class="dd-stat-label">Streak 🔥</span></div>
        </div>
        <div class="dd-section">Library</div>
        <a href="browse.html" class="dd-item"><span class="dd-icon">📚</span> Browse Books</a>
        <a href="mybooks.html" class="dd-item"><span class="dd-icon">🔖</span> My Books ${bmCount>0?`<span class="dd-badge">${bmCount}</span>`:''}</a>
        <div class="dd-section">Account</div>
        <a href="profile.html" class="dd-item"><span class="dd-icon">👤</span> My Profile</a>
        <a href="membership.html" class="dd-item"><span class="dd-icon">💳</span> Membership</a>
        <div class="dd-toggle-row">
          <span class="dd-toggle-label">🌙 Dark Mode</span>
          <button class="toggle-switch ${prefs.darkMode?'on':''}" id="darkToggle" onclick="toggleDarkMode(event)"></button>
        </div>
        <button class="dd-item danger" onclick="signOut()"><span class="dd-icon">🚪</span> Sign Out</button>
      </div>`;
    navCta.replaceWith(wrap);
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) wrap.classList.remove('open'); });

  } else if (navCta && isGuest) {
    const btn = document.createElement('a');
    btn.href = 'signin.html'; btn.className = 'nav-guest-btn'; btn.innerHTML = '👤 Sign In';
    navCta.replaceWith(btn);
  }

  /* Continue reading bar */
  if (isSignedIn && lastBook) {
    const bar = document.createElement('div');
    bar.className = 'continue-bar';
    bar.innerHTML = `<span class="continue-bar-text">📖 Continue: <span class="continue-bar-title">${esc(lastBook.title)}</span></span><a href="reader.html" class="continue-bar-btn" onclick="resumeBook()">Resume →</a>`;
    const nav = document.querySelector('nav');
    if (nav && nav.nextSibling) nav.parentNode.insertBefore(bar, nav.nextSibling);
  }

  /* ══════════════════════════════════════════
     MOBILE BOTTOM SHEET
  ══════════════════════════════════════════ */
  function buildSheet() {
    const overlay = document.createElement('div');
    overlay.className = 'ms-overlay';
    overlay.id = 'msOverlay';

    const sheet = document.createElement('div');
    sheet.className = 'ms-sheet';
    sheet.id = 'msSheet';

    let topSection = '';
    if (isSignedIn) {
      topSection = `
        <div class="ms-profile-card">
          <div class="ms-pf-avatar ${avatarMemberClass}">${esc(initials)}</div>
          <div class="ms-pf-info">
            <div class="ms-pf-name">
              ${esc(name)}
              ${memberPillHtml(false)}
            </div>
            <div class="ms-pf-sub">${greeting} 👋 ${prefs.streak>1?`· 🔥 ${prefs.streak} day streak`:''}</div>
          </div>
        </div>
        ${mobileMemCardHtml()}
        <div class="ms-stats">
          <div class="ms-stat"><span class="ms-stat-num">${bmCount}</span><span class="ms-stat-lbl">Saved</span></div>
          <div class="ms-stat"><span class="ms-stat-num">${booksRead}</span><span class="ms-stat-lbl">Read</span></div>
          <div class="ms-stat"><span class="ms-stat-num">${prefs.streak}</span><span class="ms-stat-lbl">Streak</span></div>
        </div>`;
    }

    const links = `
      <span class="ms-section">Explore</span>
      <a href="browse.html" class="ms-mob-link"><span class="ms-mob-link-icon">📚</span> Browse Books</a>
      <a href="mybooks.html" class="ms-mob-link"><span class="ms-mob-link-icon">🔖</span> My Books ${bmCount>0?`<span class="ms-mob-link-badge">${bmCount}</span>`:''}</a>
      <a href="membership.html" class="ms-mob-link"><span class="ms-mob-link-icon">💎</span> Membership</a>
      <a href="feeds.html" class="ms-mob-link"><span class="ms-mob-link-icon">📰</span> Feeds</a>
      <a href="about.html" class="ms-mob-link"><span class="ms-mob-link-icon">ℹ️</span> About</a>`;

    let accountSection = '';
    if (isSignedIn) {
      accountSection = `
        <span class="ms-section">Account</span>
        <a href="profile.html" class="ms-mob-link"><span class="ms-mob-link-icon">👤</span> My Profile</a>
        <div class="ms-toggle-row">
          <span class="ms-mob-toggle-lbl"><span class="ms-mob-link-icon">🌙</span> Dark Mode</span>
          <button class="toggle-switch ${prefs.darkMode?'on':''}" id="mobDarkToggle" onclick="toggleDarkMode(event)"></button>
        </div>
        <button class="ms-mob-link danger" onclick="signOut()"><span class="ms-mob-link-icon">🚪</span> Sign Out</button>`;
    } else {
      accountSection = `<a href="signin.html" class="ms-cta">Sign In / Create Account</a>`;
    }

    sheet.innerHTML = `
      <div class="ms-handle"></div>
      ${topSection}
      ${links}
      ${accountSection}`;

    document.body.appendChild(overlay);
    document.body.appendChild(sheet);

    function open() {
      overlay.classList.add('open');
      sheet.classList.add('open');
      document.body.style.overflow = 'hidden';
      const hb = document.getElementById('hamburger');
      if (hb) hb.classList.add('open');
    }
    function close() {
      overlay.classList.remove('open');
      sheet.classList.remove('open');
      document.body.style.overflow = '';
      const hb = document.getElementById('hamburger');
      if (hb) hb.classList.remove('open');
    }

    overlay.addEventListener('click', close);
    sheet.querySelectorAll('a.ms-mob-link, a.ms-cta').forEach(a => a.addEventListener('click', close));

    const hamburger = document.getElementById('hamburger');
    const oldMenu   = document.getElementById('mobileMenu');
    if (oldMenu) oldMenu.style.cssText = 'display:none!important;visibility:hidden!important';
    if (hamburger) hamburger.addEventListener('click', e => { e.stopPropagation(); open(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildSheet);
  } else {
    buildSheet();
  }

  /* ── GLOBAL FUNCTIONS ──────────────────────── */
  window.toggleNavDropdown = function(e) {
    e.stopPropagation();
    e.currentTarget.closest('.nav-profile-wrap').classList.toggle('open');
  };

  window.toggleDarkMode = function(e) {
    e.stopPropagation();
    prefs.darkMode = !prefs.darkMode;
    ['darkToggle','mobDarkToggle'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.classList.toggle('on', prefs.darkMode);
    });
    applyDarkMode(prefs.darkMode);
    savePrefs();
  };

  window.signOut = async function() {
    if (window._sb) await window._sb.auth.signOut();
    sessionStorage.removeItem('ms_current_user');
    sessionStorage.removeItem('ms_membership');
    showNavToast('👋 Signed out. See you soon!');
    setTimeout(() => { window.location.href = 'signin.html'; }, 1200);
  };

  window.resumeBook = function() {
    if (lastBook) sessionStorage.setItem('ms_book', JSON.stringify(lastBook));
  };

  window.requireSignIn = function(action) {
    if (isSignedIn) return true;
    showNavToast('🔒 Sign in to ' + (action || 'save books'));
    setTimeout(() => { window.location.href = 'signin.html'; }, 1500);
    return false;
  };

  function showNavToast(msg) {
    let t = document.getElementById('ms-nav-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'ms-nav-toast';
      t.style.cssText = `position:fixed;bottom:2rem;left:50%;transform:translateX(-50%) translateY(100px);background:#3b2a1a;color:#f5f0e8;padding:.75rem 1.5rem;border-radius:50px;font-family:'DM Sans',sans-serif;font-size:.88rem;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,.3);transition:transform .35s cubic-bezier(.34,1.56,.64,1);z-index:99999;white-space:nowrap;`;
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => { t.style.transform = 'translateX(-50%) translateY(100px)'; }, 3000);
  }

})();