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
  /* A link opened in a NEW tab starts with empty sessionStorage, so the page would think the
     reader is signed out. Restore the saved sign-in from localStorage first. */
  try {
    if (!sessionStorage.getItem('ms_current_user')) {
      const saved = localStorage.getItem('ms_current_user');
      if (saved && JSON.parse(saved)) sessionStorage.setItem('ms_current_user', saved);
    }
    if (!sessionStorage.getItem('ms_membership')) {
      const savedMem = localStorage.getItem('ms_membership');
      if (savedMem && JSON.parse(savedMem)) sessionStorage.setItem('ms_membership', savedMem);
    }
  } catch(e) {}
  let currentUser = null;
  try { currentUser = JSON.parse(sessionStorage.getItem('ms_current_user') || 'null'); } catch(e) {}
  const isSignedIn = currentUser && !currentUser.guest && currentUser.email;
  const isGuest    = currentUser && currentUser.guest;

  let prefs = { darkMode: false, accentColor: '#c8963e', streak: 1 };
  try { const s = JSON.parse(sessionStorage.getItem('ms_user_prefs') || '{}'); prefs = {...prefs,...s}; } catch(e) {}

  /* Dark mode is a device preference: persist it beyond the tab. */
  try {
    const d = localStorage.getItem('ms_dark_mode');
    if (d !== null) prefs.darkMode = (d === '1');
  } catch(e) {}

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
    const setBodyClass = () => document.body && document.body.classList.toggle('dark-mode', dark);
    if (document.body) setBodyClass(); else document.addEventListener('DOMContentLoaded', setBodyClass);
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
      [data-theme="dark"] .sort-select,
      [data-theme="dark"] .view-btn,
      [data-theme="dark"] .pag-btn{background:#1e1510!important;color:#e8dfd0!important}
      [data-theme="dark"] .plan-card{background:#1e1510!important}
      [data-theme="dark"] .compare-table{background:#1e1510!important}
      [data-theme="dark"] .compare-table th{background:#150d05!important}
      [data-theme="dark"] .compare-table td{color:#e8dfd0!important;border-color:rgba(200,150,62,.1)!important}
      [data-theme="dark"] footer{background:#080503!important}
      [data-theme="dark"] .faq-q{color:#e8dfd0!important}
      [data-theme="dark"] .ms-sheet{background:#1a1208!important}
      [data-theme="dark"] .ms-mob-link{color:#e8dfd0!important;border-color:rgba(200,150,62,.07)!important}
      [data-theme="dark"] .ms-sheet .ms-stat{background:#150d05!important;border-color:rgba(200,150,62,.12)!important}
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
    .nav-dropdown{position:absolute;top:calc(100% + .65rem);right:0;background:#fff;border:1px solid rgba(200,150,62,.18);border-radius:16px;box-shadow:0 16px 48px rgba(59,42,26,.18);min-width:270px;overflow:hidden;display:none;z-index:9999;animation:dropIn .2s ease;max-height:85vh;overflow-y:auto}
    .nav-dropdown::-webkit-scrollbar{width:3px}
    .nav-dropdown::-webkit-scrollbar-track{background:transparent}
    .nav-dropdown::-webkit-scrollbar-thumb{background:rgba(200,150,62,.3);border-radius:3px}
    .nav-dropdown::-webkit-scrollbar-thumb:hover{background:rgba(200,150,62,.6)}
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

    /* ═══ NOTIFICATION BELL ═══════════════════ */
    .notif-bell-wrap{position:relative}
    .notif-bell-btn{
      width:36px;height:36px;border-radius:50%;border:1px solid rgba(200,150,62,.25);
      background:rgba(200,150,62,.08);cursor:pointer;font-size:1rem;
      display:flex;align-items:center;justify-content:center;position:relative;transition:all .2s;
    }
    .notif-bell-btn:hover{background:rgba(200,150,62,.18);border-color:#c8963e}
    .notif-badge{
      position:absolute;top:-3px;right:-3px;background:#e05c5c;color:#fff;
      font-size:.58rem;font-weight:700;min-width:16px;height:16px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;border:1.5px solid #fff;padding:0 3px;
    }
    .notif-dropdown{
      position:absolute;top:calc(100% + .65rem);right:0;background:#fff;
      border:1px solid rgba(200,150,62,.18);border-radius:16px;box-shadow:0 16px 48px rgba(59,42,26,.18);
      width:320px;max-width:88vw;overflow:hidden;display:none;z-index:9999;animation:dropIn .2s ease;
    }
    .notif-bell-wrap.open .notif-dropdown{display:block}
    .notif-dropdown-header{padding:.9rem 1.1rem;font-family:'Playfair Display',serif;font-weight:900;color:#3b2a1a;border-bottom:1px solid rgba(200,150,62,.12);background:#fdf8f0}
    .notif-dropdown-list{max-height:340px;overflow-y:auto}
    .notif-item{display:block;padding:.8rem 1.1rem;border-bottom:1px solid rgba(200,150,62,.08);text-decoration:none;color:inherit;transition:background .15s;cursor:pointer}
    .notif-item:hover{background:#fdf8f0}
    .notif-item.unread{background:rgba(200,150,62,.06)}
    .notif-item-title{font-size:.83rem;font-weight:600;color:#2c1e0f;margin-bottom:.15rem}
    .notif-item-msg{font-size:.78rem;color:#7a6652;line-height:1.4}
    .notif-item-time{font-size:.68rem;color:#a89880;margin-top:.25rem}
    .notif-empty{padding:1.5rem 1.1rem;text-align:center;color:#7a6652;font-size:.85rem;font-style:italic}
    .notif-view-all{display:block;text-align:center;padding:.75rem;font-size:.82rem;font-weight:600;color:#c8963e;text-decoration:none;border-top:1px solid rgba(200,150,62,.12);background:#fdf8f0}
    .notif-view-all:hover{background:rgba(200,150,62,.1)}
    body.dark-mode .notif-dropdown{background:#1e1510;border-color:rgba(200,150,62,.15)}
    body.dark-mode .notif-dropdown-header{background:#150d05;color:#e8dfd0}
    body.dark-mode .notif-item{border-color:rgba(200,150,62,.08)}
    body.dark-mode .notif-item:hover{background:#150d05}
    body.dark-mode .notif-item.unread{background:rgba(200,150,62,.1)}
    body.dark-mode .notif-item-title{color:#e8dfd0}
    body.dark-mode .notif-view-all{background:#150d05}
  `;
  document.head.appendChild(style);

  /* ═══ DESIGN REFRESH ══════════════════════════ */
  const refresh = document.createElement('style');
  refresh.id = 'ms-nav-refresh';
  refresh.textContent = `
    /* Hidden scrollbars (page, dropdowns, lists) in light and dark mode. Scrolling still works. */
    html,html *{scrollbar-width:none!important;-ms-overflow-style:none}
    html::-webkit-scrollbar,html *::-webkit-scrollbar{display:none!important;width:0;height:0}
    :focus-visible{outline-offset:2px}
    .nav-profile-btn:focus-visible,.notif-bell-btn:focus-visible,.dd-item:focus-visible,.ms-mob-link:focus-visible,.toggle-switch:focus-visible{outline:2px solid #c8963e}
    @keyframes msPop{from{opacity:0;transform:translateY(-6px) scale(.97)}to{opacity:1;transform:none}}

    /* Profile button */
    .nav-profile-btn{background:rgba(59,42,26,.05);border:1px solid rgba(59,42,26,.12);color:#3b2a1a;padding:.3rem .85rem .3rem .3rem;gap:.55rem;transition:background .2s,border-color .2s,box-shadow .2s}
    .nav-profile-btn:hover{background:rgba(200,150,62,.14);border-color:rgba(200,150,62,.5);box-shadow:0 4px 14px -6px rgba(59,42,26,.3)}
    .nav-profile-wrap.open .nav-profile-btn{background:#3b2a1a;border-color:#3b2a1a;color:#f5f0e8}
    .nav-avatar{width:32px;height:32px;box-shadow:0 0 0 2px #f5f0e8;border:0;overflow:hidden}
    .nav-avatar img{border:0!important;width:100%!important;height:100%!important}
    .nav-avatar.member-pro{box-shadow:0 0 0 2px #f5f0e8,0 0 0 4px #c8963e}
    .nav-avatar.member-scholar{box-shadow:0 0 0 2px #f5f0e8,0 0 0 4px #7c5cbf}
    .nav-profile-name{font-weight:600;font-size:.86rem}
    .nav-chevron{font-size:.55rem;opacity:.55}
    .streak-badge{border-color:#f5f0e8;top:-6px}
    .bm-badge{border-color:#f5f0e8;background:#3b2a1a;top:-6px;right:-4px}

    /* Dropdown */
    .nav-dropdown{border-radius:20px;border:1px solid rgba(59,42,26,.1);box-shadow:0 30px 70px -20px rgba(43,29,16,.45),0 4px 14px rgba(43,29,16,.08);min-width:292px;transform-origin:top right;animation:msPop .22s cubic-bezier(.2,.9,.3,1.1)}
    .dd-header{padding:1.15rem 1.25rem 1rem;background:radial-gradient(120% 140% at 100% 0%,rgba(200,150,62,.35),transparent 60%),linear-gradient(135deg,#2b1d10,#4a3220)}
    .dd-avatar-large{width:48px;height:48px;overflow:hidden;border:2px solid rgba(245,240,232,.35)}
    .dd-avatar-large img{border:0!important;width:100%!important;height:100%!important}
    .dd-greeting{font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:#e0b058;font-weight:600}
    .dd-user-name{font-size:1rem}
    .dd-user-email{max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .dd-member-card{margin:.75rem 1rem .25rem;border-radius:14px;box-shadow:0 10px 22px -12px rgba(0,0,0,.5)}
    .dd-stats{margin:.75rem 1rem .25rem;border:1px solid rgba(59,42,26,.08);border-radius:14px;background:#faf6ee;overflow:hidden}
    .dd-stat{padding:.7rem .4rem;border-right-color:rgba(59,42,26,.08)}
    .dd-stat-num{font-size:1.15rem}
    .dd-stat-label{font-size:.58rem;letter-spacing:.1em}
    .dd-section{background:transparent;border:0;padding:.85rem 1.25rem .3rem;font-size:.62rem;font-weight:700;letter-spacing:.16em;color:#8a5f16}
    .dd-item{margin:0 .5rem;width:calc(100% - 1rem);padding:.5rem .75rem;border-radius:12px;gap:.75rem;font-weight:500}
    .dd-item .dd-icon,.dd-toggle-label .dd-icon{width:32px;height:32px;border-radius:10px;background:rgba(200,150,62,.12);color:#8a5f16;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .18s,color .18s}
    .dd-item:hover{background:rgba(200,150,62,.1);color:#2c1e0f}
    .dd-item:hover .dd-icon{background:#c8963e;color:#fff}
    .dd-item .dd-badge{background:#3b2a1a;font-size:.64rem;padding:.12rem .5rem}
    .dd-toggle-row{margin:.35rem .5rem 0;padding:.5rem .75rem;border:0;border-radius:12px}
    .dd-toggle-label{gap:.75rem;font-weight:500}
    .toggle-switch{width:42px;height:24px;background:#d9d0c1}
    .toggle-switch::after{top:3px;left:3px;width:18px;height:18px}
    .toggle-switch.on{background:linear-gradient(180deg,#d9a84c,#c8963e)}
    .toggle-switch.on::after{transform:translateX(18px)}
    .dd-item.danger{margin-top:.35rem;margin-bottom:.5rem;border:0;color:#b42323}
    .dd-item.danger .dd-icon{background:rgba(197,48,48,.1);color:#b42323}
    .dd-item.danger:hover{background:rgba(197,48,48,.08)}
    .dd-item.danger:hover .dd-icon{background:#b42323;color:#fff}

    /* Notification bell */
    .notif-bell-btn{width:38px;height:38px;background:rgba(59,42,26,.05);border:1px solid rgba(59,42,26,.12);color:#3b2a1a;transition:background .2s,border-color .2s,color .2s}
    .notif-bell-btn svg{display:block}
    .notif-bell-btn:hover,.notif-bell-wrap.open .notif-bell-btn{background:rgba(200,150,62,.16);border-color:rgba(200,150,62,.55);color:#8a5f16}
    .notif-badge{top:-4px;right:-4px;background:#d94848;border:2px solid #f5f0e8;min-width:18px;height:18px;border-radius:50px;box-shadow:0 2px 6px rgba(217,72,72,.4)}
    .notif-dropdown{width:352px;border-radius:20px;border:1px solid rgba(59,42,26,.1);box-shadow:0 30px 70px -20px rgba(43,29,16,.45),0 4px 14px rgba(43,29,16,.08);transform-origin:top right;animation:msPop .22s cubic-bezier(.2,.9,.3,1.1)}
    .notif-dropdown-header{padding:1rem 1.2rem;font-size:1.05rem;background:#fff;border-bottom:1px solid rgba(59,42,26,.08)}
    .notif-dropdown-list{max-height:380px}
    .notif-dropdown-list::-webkit-scrollbar{width:3px}
    .notif-dropdown-list::-webkit-scrollbar-thumb{background:rgba(200,150,62,.35);border-radius:3px}
    .notif-item{position:relative;padding:.85rem 1.2rem .85rem 1.6rem;border-bottom:1px solid rgba(59,42,26,.06)}
    .notif-item:last-child{border-bottom:0}
    .notif-item.unread{background:rgba(200,150,62,.07)}
    .notif-item.unread::before{content:'';position:absolute;left:.7rem;top:1.2rem;width:7px;height:7px;border-radius:50%;background:#c8963e}
    .notif-item-title{font-size:.85rem}
    .notif-item-msg{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .notif-empty{padding:2.2rem 1.2rem;font-style:normal}
    .notif-view-all{padding:.85rem;background:#faf6ee;border-top:1px solid rgba(59,42,26,.08);color:#8a5f16;letter-spacing:.02em}
    .notif-view-all:hover{background:#c8963e;color:#fff}

    /* Mobile sheet */
    .ms-overlay{background:rgba(20,12,5,.55);backdrop-filter:blur(4px)}
    .ms-sheet{border-radius:26px 26px 0 0;box-shadow:0 -20px 60px -10px rgba(20,12,5,.45);padding-bottom:max(env(safe-area-inset-bottom,0px),1.1rem)}
    .ms-handle{width:40px;height:5px;background:rgba(59,42,26,.18);margin:10px auto 10px}
    .ms-profile-card{background:radial-gradient(120% 140% at 100% 0%,rgba(200,150,62,.35),transparent 60%),linear-gradient(135deg,#2b1d10,#4a3220);border-radius:18px;margin:.25rem 1rem .75rem;box-shadow:0 14px 28px -16px rgba(43,29,16,.7)}
    .ms-pf-avatar{overflow:hidden;border:2px solid rgba(245,240,232,.35)}
    .ms-pf-avatar img{border:0!important;width:100%!important;height:100%!important}
    .ms-pf-sub{color:rgba(245,240,232,.65)}
    .ms-stats{gap:.6rem}
    .ms-stat{border-radius:14px;border-color:rgba(59,42,26,.08);padding:.7rem .35rem}
    .ms-section{font-weight:700;letter-spacing:.16em;color:#8a5f16;padding:.9rem 1.4rem .35rem}
    .ms-mob-link{margin:0 .6rem;width:calc(100% - 1.2rem);padding:.55rem .7rem;gap:.85rem;border:0;border-radius:14px}
    .ms-mob-link-icon{width:36px;height:36px;border-radius:11px;background:rgba(200,150,62,.12);color:#8a5f16;display:flex;align-items:center;justify-content:center;transition:background .18s,color .18s}
    .ms-mob-link-icon svg{width:19px;height:19px}
    .ms-mob-link:hover,.ms-mob-link:active{background:rgba(200,150,62,.1);color:#2c1e0f}
    .ms-mob-link:active .ms-mob-link-icon{background:#c8963e;color:#fff}
    .ms-mob-link-badge{background:#3b2a1a;font-size:.64rem;padding:.14rem .55rem}
    #mob-notif-badge{background:#d94848}
    .ms-toggle-row{margin:0 .6rem;padding:.55rem .7rem;border:0;border-radius:14px}
    .ms-mob-link.danger{color:#b42323}
    .ms-mob-link.danger .ms-mob-link-icon{background:rgba(197,48,48,.1);color:#b42323}
    .ms-mob-link.danger:hover{background:rgba(197,48,48,.07)}
    .ms-cta{border-radius:50px;padding:1rem;background:linear-gradient(180deg,#4a3220,#2b1d10);box-shadow:0 12px 24px -12px rgba(43,29,16,.6)}
    .ms-av-dot{background:#d94848}

    /* Guest button */
    .nav-guest-btn svg{width:16px;height:16px}

    /* ── Dark mode ── */
    html[data-theme="dark"] .nav-profile-btn,html[data-theme="dark"] .notif-bell-btn{background:rgba(241,232,216,.06);border-color:rgba(224,176,88,.22);color:#f1e8d8}
    html[data-theme="dark"] .nav-profile-btn:hover,html[data-theme="dark"] .notif-bell-btn:hover,html[data-theme="dark"] .notif-bell-wrap.open .notif-bell-btn{background:rgba(224,176,88,.16);border-color:rgba(224,176,88,.5);color:#e0b058}
    html[data-theme="dark"] .nav-profile-wrap.open .nav-profile-btn{background:#e0b058;border-color:#e0b058;color:#1e1208}
    html[data-theme="dark"] .nav-avatar{box-shadow:0 0 0 2px #0f0a05}
    html[data-theme="dark"] .notif-badge,html[data-theme="dark"] .ms-av-dot{border-color:#0f0a05}
    html[data-theme="dark"] .streak-badge,html[data-theme="dark"] .bm-badge{border-color:#0f0a05}
    html[data-theme="dark"] .nav-dropdown,html[data-theme="dark"] .notif-dropdown{background:#17100a!important;border-color:rgba(224,176,88,.2)!important;box-shadow:0 30px 70px -20px #000}
    html[data-theme="dark"] .dd-stats{background:#1f150c!important;border-color:rgba(224,176,88,.14)}
    html[data-theme="dark"] .dd-stat{border-right-color:rgba(224,176,88,.14)}
    html[data-theme="dark"] .dd-stat-label{color:#b3a58f}
    html[data-theme="dark"] .dd-section{background:transparent!important;color:#e0b058}
    html[data-theme="dark"] .dd-item .dd-icon,html[data-theme="dark"] .dd-toggle-label .dd-icon,html[data-theme="dark"] .ms-mob-link-icon{background:rgba(224,176,88,.12);color:#e0b058}
    html[data-theme="dark"] .dd-item:hover{background:rgba(224,176,88,.1)!important;color:#f1e8d8!important}
    html[data-theme="dark"] .dd-item:hover .dd-icon{background:#e0b058;color:#1e1208}
    html[data-theme="dark"] .dd-item .dd-badge,html[data-theme="dark"] .ms-mob-link-badge{background:#e0b058;color:#1e1208}
    html[data-theme="dark"] .dd-item.danger,html[data-theme="dark"] .ms-mob-link.danger{color:#ff8a80!important}
    html[data-theme="dark"] .dd-item.danger .dd-icon,html[data-theme="dark"] .ms-mob-link.danger .ms-mob-link-icon{background:rgba(255,138,128,.12);color:#ff8a80}
    html[data-theme="dark"] .toggle-switch{background:#3a2c1e}
    html[data-theme="dark"] .toggle-switch.on{background:linear-gradient(180deg,#e0b058,#c8963e)}
    html[data-theme="dark"] .notif-dropdown-header{background:#1f150c!important;color:#f1e8d8!important;border-color:rgba(224,176,88,.14)}
    html[data-theme="dark"] .notif-item{border-color:rgba(224,176,88,.1)}
    html[data-theme="dark"] .notif-item.unread{background:rgba(224,176,88,.09)}
    html[data-theme="dark"] .notif-item.unread::before{background:#e0b058}
    html[data-theme="dark"] .notif-item-msg,html[data-theme="dark"] .notif-empty{color:#b3a58f}
    html[data-theme="dark"] .notif-view-all{background:#1f150c!important;color:#e0b058;border-color:rgba(224,176,88,.14)}
    html[data-theme="dark"] .notif-view-all:hover{background:#e0b058!important;color:#1e1208}
    html[data-theme="dark"] .ms-sheet{background:#17100a!important}
    html[data-theme="dark"] .ms-handle{background:rgba(241,232,216,.2)}
    html[data-theme="dark"] .ms-sheet .ms-stat{background:#1f150c!important;border-color:rgba(224,176,88,.14)!important}
    html[data-theme="dark"] .ms-section{color:#e0b058}
    html[data-theme="dark"] .ms-mob-link:hover,html[data-theme="dark"] .ms-mob-link:active{background:rgba(224,176,88,.1)!important}
    html[data-theme="dark"] .ms-cta{background:linear-gradient(180deg,#e0b058,#c8963e);color:#1e1208}

    .dd-item,.ms-mob-link,.dd-toggle-row,.ms-toggle-row,.dd-stats,.ms-stats,.notif-item{box-sizing:border-box}
    html[data-theme="dark"] .dd-item,html[data-theme="dark"] .dd-toggle-label,html[data-theme="dark"] .dd-stat-num,html[data-theme="dark"] .ms-mob-link,html[data-theme="dark"] .ms-mob-toggle-lbl,html[data-theme="dark"] .ms-stat-num,html[data-theme="dark"] .notif-item-title{color:#f1e8d8!important}
    html[data-theme="dark"] .dd-item.danger,html[data-theme="dark"] .ms-mob-link.danger{color:#ff8a80!important}
    @media(max-width:860px){
      .nav-profile-btn{width:40px;height:40px}
      .nav-dropdown{min-width:260px}
      .notif-dropdown{width:min(352px,92vw)}
    }
    @media (prefers-reduced-motion:reduce){.nav-dropdown,.notif-dropdown{animation:none}*{transition-duration:.01ms!important}}
  `;
  document.head.appendChild(refresh);

  /* ── ICONS (inline SVG, inherit colour) ───── */
  const ICONS = {
    books:'<path d="M4 4h5v16H4z"/><path d="M10 4h5v16h-5z"/><path d="M17 5.5l3.2.9-3.7 13.6-3.2-.9z"/>',
    bookmark:'<path d="M6 3h12v18l-6-4-6 4z"/>',
    swords:'<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5"/><path d="m5 14 4 4"/><path d="m7 17-3 3"/><path d="m3 19 2 2"/>',
    pen:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    clipboard:'<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    card:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    gem:'<path d="M6 3h12l4 6-10 13L2 9z"/><path d="M2 9h20"/>',
    news:'<path d="M4 4h13v16H6a2 2 0 0 1-2-2z"/><path d="M17 8h3v10a2 2 0 0 1-2 2"/><path d="M8 8h5M8 12h5"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>'
  };
  function ico(n){ return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(ICONS[n]||'')+'</svg>'; }

  /* ── HELPER ────────────────────────────────── */
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  /* Notification links come from the DB — allow only same-site pages
     and http(s). Blocks javascript: and data: URLs. */
  function safeLink(u){
    const v = String(u || '').trim();
    if (!v) return 'notifications.html';
    if (/^https?:\/\//i.test(v)) return esc(v);
    if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return 'notifications.html';
    if (v.startsWith('//')) return 'notifications.html';
    return esc(v);
  }
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

  /* ── AVATAR HTML — photo if available, else initials ── */
  const avatarUrl = isSignedIn ? (currentUser.avatar || '') : '';
  function avatarHtml(size) {
    const dim = size === 'lg' ? 44 : size === 'mob' ? 46 : 30;
    if (avatarUrl) {
      return '<img src="' + esc(avatarUrl) + '" alt="' + esc(initials) + '" style="width:' + dim + 'px;height:' + dim + 'px;border-radius:50%;object-fit:cover;display:block;flex-shrink:0;border:2px solid rgba(200,150,62,.4)">';
    }
    return esc(initials);
  }

  /* ══════════════════════════════════════════
     DESKTOP NAV
  ══════════════════════════════════════════ */
  const navCta = document.querySelector('.nav-cta');

  if (navCta && isSignedIn) {
    const bellWrap = document.createElement('div');
    bellWrap.className = 'notif-bell-wrap';
    bellWrap.id = 'notif-bell-wrap';
    bellWrap.innerHTML = `
      <button class="notif-bell-btn" onclick="toggleNotifDropdown(event)" aria-label="Notifications">
        ${ico('bell')}<span class="notif-badge" id="notif-badge" style="display:none">0</span>
      </button>
      <div class="notif-dropdown">
        <div class="notif-dropdown-header">Notifications</div>
        <div class="notif-dropdown-list" id="notif-dropdown-list">
          <div class="notif-empty">Loading...</div>
        </div>
        <a href="notifications.html" class="notif-view-all">View all →</a>
      </div>`;

    // Some pages wrap .nav-cta in an <li> inside .nav-links (index.html,
    // browse.html, profile.html, etc.); others (inkwell.html and friends)
    // put it directly in a .nav-right flex div. Insert accordingly so the
    // bell doesn't get trapped as a stacked block inside a narrow <li>.
    const navCtaParent = navCta.parentElement;
    if (navCtaParent && navCtaParent.tagName === 'LI') {
      const bellLi = document.createElement('li');
      bellLi.style.display = 'flex';
      bellLi.style.alignItems = 'center';
      bellLi.appendChild(bellWrap);
      navCtaParent.parentNode.insertBefore(bellLi, navCtaParent);
    } else {
      navCta.parentNode.insertBefore(bellWrap, navCta);
    }
    document.addEventListener('click', e => { if (!bellWrap.contains(e.target)) bellWrap.classList.remove('open'); });

    const wrap = document.createElement('div');
    wrap.className = 'nav-profile-wrap';
    wrap.innerHTML = `
      <button class="nav-profile-btn" onclick="toggleNavDropdown(event)">
        ${prefs.streak > 1 ? `<span class="streak-badge">🔥${prefs.streak}</span>` : ''}
        <div class="nav-avatar ${avatarMemberClass}">${avatarHtml('sm')}</div>
        <span class="nav-profile-name">${esc(firstName)}</span>
        ${memberPillHtml(true)}
        <span class="nav-chevron">▼</span>
        ${bmCount > 0 ? `<span class="bm-badge">${bmCount}</span>` : ''}
      </button>
      <div class="nav-dropdown">
        <div class="dd-header">
          <div class="dd-avatar-large ${avatarMemberClass}">${avatarHtml('lg')}</div>
          <div class="dd-user-info">
            <div class="dd-greeting">${greeting}</div>
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
        <a href="browse.html" class="dd-item"><span class="dd-icon">${ico('books')}</span> Browse Books</a>
        <a href="book.html" class="dd-item"><span class="dd-icon">${ico('bookmark')}</span> My Books ${bmCount>0?`<span class="dd-badge">${bmCount}</span>`:''}</a>
        <a href="arena.html" class="dd-item" id="nav-arena-link" target="_blank" rel="noopener"><span class="dd-icon">${ico('swords')}</span> The Arena</a>
        <a href="inkwell.html" class="dd-item" target="_blank" rel="noopener"><span class="dd-icon">${ico('pen')}</span> Inkwell</a>
        <a href="my-requests.html" class="dd-item" id="nav-requests-link"><span class="dd-icon">${ico('clipboard')}</span> My Event Requests</a>
        <div class="dd-section">Account</div>
        <a href="profile.html" class="dd-item"><span class="dd-icon">${ico('user')}</span> My Profile</a>
        <a href="membership.html" class="dd-item"><span class="dd-icon">${ico('card')}</span> Membership</a>
        <div class="dd-toggle-row">
          <span class="dd-toggle-label"><span class="dd-icon">${ico('moon')}</span> Dark Mode</span>
          <button class="toggle-switch ${prefs.darkMode?'on':''}" id="darkToggle" onclick="toggleDarkMode(event)"></button>
        </div>
        <button class="dd-item danger" onclick="signOut()"><span class="dd-icon">${ico('logout')}</span> Sign Out</button>
      </div>`;
    navCta.replaceWith(wrap);
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) wrap.classList.remove('open'); });

  } else if (navCta && isGuest) {
    const btn = document.createElement('a');
    btn.href = 'signin.html'; btn.className = 'nav-guest-btn'; btn.innerHTML = ico('user') + ' Sign In';
    navCta.replaceWith(btn);
  }

  /* Continue reading bar */
  if (isSignedIn && lastBook) {
    if (!document.getElementById('ms-continue-style')) {
      const cs = document.createElement('style');
      cs.id = 'ms-continue-style';
      cs.textContent =
        '.continue-bar{position:relative;display:flex;align-items:center;gap:.9rem;width:calc(100% - 2rem);max-width:1240px;margin:.7rem auto .7rem;padding:.6rem .6rem .6rem .75rem;border:1px solid rgba(224,176,88,.22);border-radius:18px;overflow:hidden;flex-wrap:nowrap;' +
          'background:radial-gradient(90% 160% at 100% 0%,rgba(224,176,88,.2),transparent 60%),linear-gradient(135deg,#2b1d10,#3b2a1a);box-shadow:0 14px 26px -18px rgba(43,29,16,.75);box-sizing:border-box}' +
        '.continue-bar *{box-sizing:border-box}' +
        '.continue-bar .cb-main{flex:1;min-width:0;display:flex;align-items:center;gap:.85rem;text-decoration:none;color:inherit}' +
        '.continue-bar .cb-cover{flex:none;position:relative;width:34px;height:46px;border-radius:3px 7px 7px 3px;overflow:hidden;background:linear-gradient(155deg,#7a5530,#3b2a1a 55%,#241709);box-shadow:0 6px 12px -4px rgba(0,0,0,.7),0 0 0 1px rgba(224,176,88,.25)}' +
        '.continue-bar .cb-cover::before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:linear-gradient(90deg,rgba(0,0,0,.45),rgba(255,255,255,.1) 70%,transparent)}' +
        '.continue-bar .cb-cover::after{content:"";position:absolute;left:12px;right:6px;top:14px;height:1.5px;border-radius:1px;background:#e0b058;box-shadow:0 5px 0 -.5px rgba(224,176,88,.55)}' +
        '.continue-bar .cb-text{min-width:0;display:flex;flex-direction:column;gap:2px}' +
        '.continue-bar .cb-kicker{font:500 .72rem/1.2 "DM Sans",sans-serif;color:rgba(245,240,232,.6)}' +
        '.continue-bar .cb-title{font:700 1rem/1.25 "Playfair Display",serif;color:#f5f0e8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.continue-bar .cb-prog{display:block;height:3px;margin-top:5px;border-radius:3px;background:rgba(245,240,232,.14);overflow:hidden;max-width:220px}' +
        '.continue-bar .cb-prog i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#c8963e,#e0b058)}' +
        '.continue-bar .continue-bar-btn{flex:none;display:inline-flex;align-items:center;gap:.4rem;height:40px;padding:0 1.1rem 0 .95rem;border:0;border-radius:50px;background:linear-gradient(180deg,#e0b058,#c8963e);color:#2b1c0e;font:600 .85rem "DM Sans",sans-serif;text-decoration:none;white-space:nowrap;box-shadow:0 10px 18px -10px rgba(200,150,62,.9);transition:transform .15s,filter .2s}' +
        '.continue-bar .continue-bar-btn:hover{background:linear-gradient(180deg,#f0c46c,#d9a84c);color:#2b1c0e}' +
        '.continue-bar .continue-bar-btn:active{transform:scale(.96)}' +
        '.continue-bar .continue-bar-btn svg{width:13px;height:13px}' +
        '@media(max-width:600px){.continue-bar{width:calc(100% - 1.5rem);margin:.55rem auto .5rem;gap:.7rem;padding:.55rem .55rem .55rem .65rem;border-radius:16px}.continue-bar .cb-title{font-size:.92rem}.continue-bar .continue-bar-btn{height:38px;padding:0 .95rem 0 .8rem}}';
      document.head.appendChild(cs);
    }
    const pctRaw = Number(lastBook.progress != null ? lastBook.progress : (lastBook.percent != null ? lastBook.percent : lastBook.pct));
    const pct = isFinite(pctRaw) && pctRaw > 0 ? Math.min(100, Math.round(pctRaw <= 1 ? pctRaw * 100 : pctRaw)) : 0;
    const bar = document.createElement('div');
    bar.className = 'continue-bar';
    bar.innerHTML =
      '<a href="reader.html" class="cb-main" onclick="resumeBook()" aria-label="Continue reading ' + esc(lastBook.title) + '">' +
        '<span class="cb-cover" aria-hidden="true"></span>' +
        '<span class="cb-text"><span class="cb-kicker">Continue reading</span>' +
        '<span class="cb-title">' + esc(lastBook.title) + '</span>' +
        (pct ? '<span class="cb-prog" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + pct + '%"></i></span>' : '') +
        '</span></a>' +
      '<a href="reader.html" class="continue-bar-btn" onclick="resumeBook()">' +
        '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>Resume</a>';
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
          <div class="ms-pf-avatar ${avatarMemberClass}">${avatarHtml('mob')}</div>
          <div class="ms-pf-info">
            <div class="ms-pf-name">
              ${esc(name)}
              ${memberPillHtml(false)}
            </div>
            <div class="ms-pf-sub">${greeting}${prefs.streak>1?` · 🔥 ${prefs.streak} day streak`:''}</div>
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
      <a href="browse.html" class="ms-mob-link"><span class="ms-mob-link-icon">${ico('books')}</span> Browse Books</a>
      <a href="book.html" class="ms-mob-link"><span class="ms-mob-link-icon">${ico('bookmark')}</span> My Books ${bmCount>0?`<span class="ms-mob-link-badge">${bmCount}</span>`:''}</a>
      <a href="membership.html" class="ms-mob-link"><span class="ms-mob-link-icon">${ico('gem')}</span> Membership</a>
      <a href="feeds.html" class="ms-mob-link"><span class="ms-mob-link-icon">${ico('news')}</span> Feeds</a>
      <a href="arena.html" class="ms-mob-link" id="mob-arena-link" target="_blank" rel="noopener"><span class="ms-mob-link-icon">${ico('swords')}</span> The Arena</a>
      <a href="inkwell.html" class="ms-mob-link" target="_blank" rel="noopener"><span class="ms-mob-link-icon">${ico('pen')}</span> Inkwell</a>
      <a href="my-requests.html" class="ms-mob-link" id="mob-requests-link"><span class="ms-mob-link-icon">${ico('clipboard')}</span> My Event Requests</a>
      <a href="about.html" class="ms-mob-link"><span class="ms-mob-link-icon">${ico('info')}</span> About</a>`;

    let accountSection = '';
    if (isSignedIn) {
      accountSection = `
        <span class="ms-section">Account</span>
        <a href="notifications.html" class="ms-mob-link"><span class="ms-mob-link-icon">${ico('bell')}</span> Notifications <span class="ms-mob-link-badge" id="mob-notif-badge" style="display:none">0</span></a>
        <a href="profile.html" class="ms-mob-link"><span class="ms-mob-link-icon">${ico('user')}</span> My Profile</a>
        <div class="ms-toggle-row">
          <span class="ms-mob-toggle-lbl"><span class="ms-mob-link-icon">${ico('moon')}</span> Dark Mode</span>
          <button class="toggle-switch ${prefs.darkMode?'on':''}" id="mobDarkToggle" onclick="toggleDarkMode(event)"></button>
        </div>
        <button class="ms-mob-link danger" onclick="signOut()"><span class="ms-mob-link-icon">${ico('logout')}</span> Sign Out</button>`;
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

  /* ── PHONE MENU BUTTON: round profile picture instead of the three-line icon ── */
  function avatarMenuButton() {
    const hb = document.getElementById('hamburger');
    if (!hb || hb.dataset.msAvatar) return;
    hb.dataset.msAvatar = '1';
    if (!document.getElementById('ms-avatar-style')) {
      const st = document.createElement('style');
      st.id = 'ms-avatar-style';
      st.textContent = `
        .hamburger.ms-avatar-btn{padding:0;gap:0;flex-direction:row;align-items:center;justify-content:center;width:46px;height:46px;border-radius:50%;position:relative;-webkit-tap-highlight-color:transparent}
        .ms-av{display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;overflow:hidden;font:700 .82rem 'DM Sans',sans-serif;font-style:normal;color:#fff;background:linear-gradient(135deg,#c8963e,#a0522d);box-shadow:0 0 0 2px #f5f0e8,0 0 0 3.5px rgba(59,42,26,.28);transition:transform .2s}
        .ms-av img{width:100%;height:100%;object-fit:cover;display:block}
        .ms-av.ring-pro{box-shadow:0 0 0 2px #f5f0e8,0 0 0 3.5px #c8963e}
        .ms-av.ring-scholar{box-shadow:0 0 0 2px #f5f0e8,0 0 0 3.5px #8b5cf6}
        .ms-av.ms-av-guest{background:transparent;color:#3b2a1a;box-shadow:0 0 0 1.5px rgba(59,42,26,.35)}
        .hamburger.ms-avatar-btn:active .ms-av,.hamburger.ms-avatar-btn.open .ms-av{transform:scale(.92)}
        .ms-av-dot{position:absolute;top:0;right:0;min-width:17px;height:17px;padding:0 4px;border-radius:50px;background:#e05c5c;color:#fff;font:700 .6rem/1 'DM Sans',sans-serif;display:none;align-items:center;justify-content:center;border:2px solid #f5f0e8}
        [data-theme="dark"] .ms-av{box-shadow:0 0 0 2px #0f0a05,0 0 0 3.5px rgba(200,150,62,.4)}
        [data-theme="dark"] .ms-av.ring-pro{box-shadow:0 0 0 2px #0f0a05,0 0 0 3.5px #c8963e}
        [data-theme="dark"] .ms-av.ring-scholar{box-shadow:0 0 0 2px #0f0a05,0 0 0 3.5px #8b5cf6}
        [data-theme="dark"] .ms-av.ms-av-guest{color:#f1e8d8;box-shadow:0 0 0 1.5px rgba(241,232,216,.4)}
        [data-theme="dark"] .ms-av-dot{border-color:#0f0a05}`;
      document.head.appendChild(st);
    }
    hb.classList.add('ms-avatar-btn');
    hb.setAttribute('aria-label', isSignedIn ? 'Open account menu' : 'Open menu');
    hb.setAttribute('aria-haspopup', 'dialog');
    const ring = isScholar ? ' ring-scholar' : isPro ? ' ring-pro' : '';
    const face = isSignedIn
      ? (avatarUrl ? '<img src="' + esc(avatarUrl) + '" alt="">' : esc(initials))
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>';
    hb.innerHTML = '<i class="ms-av' + ring + (isSignedIn ? '' : ' ms-av-guest') + '">' + face + '</i><b class="ms-av-dot" id="mob-av-dot"></b>';
    updateNotifBadge();
  }

  function initMobileMenu() { buildSheet(); avatarMenuButton(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileMenu);
  } else {
    initMobileMenu();
  }

  /* ── OPEN ARENA & INKWELL IN A NEW TAB ─────────────────────────
     Covers every link to them on the page: the page's own menu, the dropdown, the mobile sheet,
     and anything added later. A link to the page you are already on is left alone. */
  (function newTabLinks() {
    const here = (location.pathname.split('/').pop() || '').toLowerCase();
    const re = /(^|\/)(arena|inkwell)\.html(?:[?#]|$)/i;
    function mark(root) {
      (root.querySelectorAll ? root.querySelectorAll('a[href]') : []).forEach(a => {
        if (a.target) return;
        const href = a.getAttribute('href') || '';
        const m = re.exec(href);
        if (!m || (m[2].toLowerCase() + '.html') === here) return;
        a.target = '_blank'; a.rel = 'noopener';
      });
    }
    function run() {
      mark(document);
      new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.matches && n.matches('a[href]')) mark({ querySelectorAll: () => [n] }); mark(n); } }))
      ).observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  })();

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
    try { localStorage.setItem('ms_dark_mode', prefs.darkMode ? '1' : '0'); } catch(err) {}
  };

  window.signOut = async function() {
  if (window._sb) await window._sb.auth.signOut();
  sessionStorage.clear();
  localStorage.removeItem('ms_current_user');
  localStorage.removeItem('ms_membership');
  showNavToast('👋 Signed out. See you soon!');
  setTimeout(() => {
    window.location.replace('signin.html');
  }, 1200);
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

  /* ── NOTIFICATIONS ──────────────────────────────────────────── */
  window.toggleNotifDropdown = function(e) {
    e.stopPropagation();
    const wrap = document.getElementById('notif-bell-wrap');
    if (!wrap) return;
    const willOpen = !wrap.classList.contains('open');
    document.querySelectorAll('.nav-profile-wrap.open').forEach(w => w.classList.remove('open'));
    wrap.classList.toggle('open', willOpen);
    if (willOpen) markVisibleNotifsRead();
  };

  function timeAgoShort(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  let loadedNotifs = [];
  let readIds = new Set();

  async function loadNotifications() {
    if (!isSignedIn || !window._sb) return;
    try {
      const { data: notifs } = await window._sb
        .from('inkwell_notifications')
        .select('*')
        .or(`user_id.eq.${currentUser.id},user_id.is.null`)
        .order('created_at', { ascending: false })
        .limit(20);
      loadedNotifs = notifs || [];

      const { data: reads } = await window._sb
        .from('inkwell_notification_reads')
        .select('notification_id')
        .eq('user_id', currentUser.id);
      readIds = new Set((reads || []).map(r => r.notification_id));

      renderNotifDropdown();
      updateNotifBadge();
    } catch (e) { console.error('Failed to load notifications:', e); }
  }

  function unreadCount() {
    return loadedNotifs.filter(n => !readIds.has(n.id)).length;
  }

  function updateNotifBadge() {
    const count = unreadCount();
    const badge = document.getElementById('notif-badge');
    const mobBadge = document.getElementById('mob-notif-badge');
    [badge, mobBadge, document.getElementById('mob-av-dot')].forEach(b => {
      if (!b) return;
      if (count > 0) { b.textContent = count > 9 ? '9+' : count; b.style.display = 'flex'; }
      else { b.style.display = 'none'; }
    });
  }

  function renderNotifDropdown() {
    const list = document.getElementById('notif-dropdown-list');
    if (!list) return;
    if (!loadedNotifs.length) {
      list.innerHTML = '<div class="notif-empty">No notifications yet.</div>';
      return;
    }
    list.innerHTML = loadedNotifs.slice(0, 8).map(n => `
      <a class="notif-item ${readIds.has(n.id) ? '' : 'unread'}" href="${safeLink(n.link_url)}">
        <div class="notif-item-title">${esc(n.title)}</div>
        <div class="notif-item-msg">${esc(n.message)}</div>
        <div class="notif-item-time">${timeAgoShort(n.created_at)}</div>
      </a>`).join('');
  }

  async function markVisibleNotifsRead() {
    const unread = loadedNotifs.filter(n => !readIds.has(n.id)).slice(0, 8);
    if (!unread.length || !window._sb) return;
    unread.forEach(n => readIds.add(n.id));
    updateNotifBadge();
    try {
      await window._sb.from('inkwell_notification_reads')
        .upsert(unread.map(n => ({ notification_id: n.id, user_id: currentUser.id })), { onConflict: 'notification_id,user_id' });
    } catch (e) { console.error('Failed to mark notifications read:', e); }
  }

  if (isSignedIn) {
    document.addEventListener('supabase:ready', loadNotifications);
    if (window._sb) loadNotifications();
  }

  /* ── ADMIN BADGE: show pending request count for Tony ─────── */
  const TONY_ID = '429025f0-a2b5-41ec-a292-29e8a2241690';
  if (isSignedIn && currentUser?.id === TONY_ID) {
    document.addEventListener('supabase:ready', async () => {
      try {
        const { count } = await window._sb
          .from('event_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');

        if (count > 0) {
          const badge = `<span class="dd-badge" style="background:#e05c5c;">${count}</span>`;
          const mobBadge = `<span class="ms-mob-link-badge" style="background:#e05c5c;">${count}</span>`;

          const desktopLink = document.getElementById('nav-arena-link');
          if (desktopLink) desktopLink.innerHTML += badge;

          const mobLink = document.getElementById('mob-arena-link');
          if (mobLink) mobLink.innerHTML += mobBadge;
        }
      } catch(e) {}
    });
  }

  /* ── USER BADGE: unseen approved/rejected requests ──────────── */
  if (isSignedIn && currentUser?.id !== TONY_ID) {
    document.addEventListener('supabase:ready', async () => {
      try {
        const { count } = await window._sb
          .from('event_requests')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', currentUser.id)
          .eq('seen_by_user', false)
          .neq('status', 'pending');

        if (count > 0) {
          const badge = `<span style="background:#e05c5c;color:#fff;font-size:.6rem;padding:.1rem .35rem;border-radius:50px;margin-left:.3rem;font-weight:800;">${count}</span>`;
          const desktopLink = document.getElementById('nav-requests-link');
          if (desktopLink) desktopLink.innerHTML += badge;
          const mobLink = document.getElementById('mob-requests-link');
          if (mobLink) mobLink.innerHTML += badge;
        }
      } catch(e) {}
    });
  }

})();