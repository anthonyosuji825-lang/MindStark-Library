/*
═══════════════════════════════════════════════════════════
  MindStark Library — Terms & Conditions Modal
  terms.js

  Adds a reusable terms modal dialogue to any page.
  Call openTerms() from any link or button.

  USAGE: Add to any page:
  <script src="terms.js"></script>
  Then on any link: onclick="openTerms(event)"
═══════════════════════════════════════════════════════════
*/

(function () {

  /* ── INJECT STYLES ─────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    /* Overlay */
    .terms-overlay {
      position: fixed;
      inset: 0;
      background: rgba(30, 18, 8, 0.72);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      z-index: 9000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      opacity: 0;
      pointer-events: none;
      transition: opacity .3s ease;
    }
    .terms-overlay.open {
      opacity: 1;
      pointer-events: all;
    }

    /* Modal box */
    .terms-modal {
      background: rgba(245, 240, 232, 0.97);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(200, 150, 62, 0.2);
      border-radius: 20px;
      width: 100%;
      max-width: 680px;
      max-height: 88vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 32px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(200,150,62,0.1);
      transform: translateY(24px) scale(0.97);
      transition: transform .35s cubic-bezier(.34,1.2,.64,1);
      overflow: hidden;
    }
    .terms-overlay.open .terms-modal {
      transform: translateY(0) scale(1);
    }

    /* Modal header */
    .terms-modal-head {
      background: #3b2a1a;
      padding: 1.25rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
      position: relative;
      overflow: hidden;
    }
    .terms-modal-head::after {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 80% 50%, rgba(200,150,62,.15), transparent 60%);
      pointer-events: none;
    }
    .terms-modal-head-left {
      display: flex;
      align-items: center;
      gap: .75rem;
      position: relative;
      z-index: 1;
    }
    .terms-head-icon {
      width: 36px; height: 36px;
      border-radius: 10px;
      background: rgba(200,150,62,.2);
      border: 1px solid rgba(200,150,62,.3);
      display: flex; align-items: center; justify-content: center;
      font-size: 1rem;
    }
    .terms-head-title {
      font-family: 'Playfair Display', serif;
      font-size: 1.05rem; font-weight: 700;
      color: #f5f0e8;
    }
    .terms-head-sub {
      font-size: .72rem;
      color: rgba(245,240,232,.5);
      margin-top: .1rem;
    }
    .terms-close-btn {
      width: 32px; height: 32px;
      border-radius: 50%;
      background: rgba(245,240,232,.1);
      border: 1px solid rgba(245,240,232,.15);
      color: rgba(245,240,232,.7);
      font-size: 1rem;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all .2s;
      position: relative; z-index: 1;
      flex-shrink: 0;
    }
    .terms-close-btn:hover {
      background: rgba(229,62,62,.2);
      border-color: rgba(229,62,62,.3);
      color: #fc8181;
    }

    /* Tab navigation */
    .terms-tabs {
      display: flex;
      background: #ede5d5;
      border-bottom: 1px solid rgba(200,150,62,.18);
      flex-shrink: 0;
    }
    .terms-tab {
      flex: 1;
      padding: .75rem 1rem;
      border: none;
      background: transparent;
      font-family: 'DM Sans', sans-serif;
      font-size: .82rem;
      font-weight: 500;
      color: #7a6652;
      cursor: pointer;
      transition: all .2s;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
    }
    .terms-tab:hover { color: #c8963e; }
    .terms-tab.active {
      color: #3b2a1a;
      border-bottom-color: #c8963e;
      background: rgba(200,150,62,.06);
    }

    /* Scrollable body */
    .terms-modal-body {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem;
      scroll-behavior: smooth;
    }
    .terms-modal-body::-webkit-scrollbar { width: 6px; }
    .terms-modal-body::-webkit-scrollbar-track { background: transparent; }
    .terms-modal-body::-webkit-scrollbar-thumb { background: rgba(200,150,62,.3); border-radius: 3px; }

    /* Tab panels */
    .terms-panel { display: none; }
    .terms-panel.active { display: block; }

    /* Section styles */
    .tm-intro {
      background: rgba(200,150,62,.08);
      border: 1px solid rgba(200,150,62,.18);
      border-radius: 12px;
      padding: 1rem 1.25rem;
      margin-bottom: 1.5rem;
      font-size: .85rem;
      color: #a0522d;
      line-height: 1.7;
    }
    .tm-intro strong { color: #3b2a1a; }

    .tm-section { margin-bottom: 1.75rem; }
    .tm-section-title {
      display: flex;
      align-items: center;
      gap: .65rem;
      font-family: 'Playfair Display', serif;
      font-size: .98rem;
      font-weight: 700;
      color: #3b2a1a;
      margin-bottom: .75rem;
      padding-bottom: .5rem;
      border-bottom: 1px solid rgba(200,150,62,.18);
    }
    .tm-num {
      width: 24px; height: 24px;
      border-radius: 50%;
      background: #c8963e;
      color: #fff;
      font-size: .7rem;
      font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .tm-section p {
      font-size: .87rem;
      color: #2c1e0f;
      line-height: 1.75;
      margin-bottom: .75rem;
    }
    .tm-section ul {
      padding-left: 1.25rem;
      margin-bottom: .75rem;
    }
    .tm-section li {
      font-size: .87rem;
      color: #2c1e0f;
      line-height: 1.7;
      margin-bottom: .4rem;
    }
    .tm-section strong { color: #3b2a1a; }

    /* Highlight boxes */
    .tm-box {
      border-radius: 10px;
      padding: .85rem 1rem;
      margin: .75rem 0;
      font-size: .83rem;
      line-height: 1.65;
    }
    .tm-box.warning { background: rgba(229,62,62,.07); border-left: 3px solid #e53e3e; color: #742a2a; }
    .tm-box.info    { background: rgba(200,150,62,.08); border-left: 3px solid #c8963e; color: #a0522d; }
    .tm-box.success { background: rgba(74,103,65,.08);  border-left: 3px solid #6db86d; color: #276128; }

    /* Footer bar */
    .terms-modal-foot {
      background: #f5f0e8;
      border-top: 1px solid rgba(200,150,62,.18);
      padding: 1rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-shrink: 0;
      flex-wrap: wrap;
    }
    .terms-foot-text {
      font-size: .78rem;
      color: #7a6652;
      line-height: 1.5;
    }
    .terms-agree-btn {
      background: #3b2a1a;
      color: #f5f0e8;
      border: none;
      padding: .7rem 1.5rem;
      border-radius: 50px;
      font-family: 'DM Sans', sans-serif;
      font-size: .88rem;
      font-weight: 500;
      cursor: pointer;
      transition: all .2s;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .terms-agree-btn:hover {
      background: #c8963e;
      transform: translateY(-1px);
    }

    /* Progress bar inside modal */
    .terms-scroll-progress {
      height: 3px;
      background: rgba(200,150,62,.15);
      flex-shrink: 0;
    }
    .terms-scroll-bar {
      height: 100%;
      background: #c8963e;
      width: 0%;
      transition: width .1s;
      border-radius: 2px;
    }

    @media(max-width: 600px) {
      .terms-overlay { padding: 0; align-items: flex-end; }
      .terms-modal { max-height: 92vh; border-radius: 20px 20px 0 0; }
      .terms-modal-foot { flex-direction: column; align-items: stretch; }
      .terms-agree-btn { text-align: center; }
    }
  `;
  document.head.appendChild(style);

  /* ── BUILD MODAL HTML ──────────────────────── */
  const overlay = document.createElement('div');
  overlay.className = 'terms-overlay';
  overlay.id = 'termsOverlay';
  overlay.innerHTML = `
    <div class="terms-modal" id="termsModal">

      <!-- Header -->
      <div class="terms-modal-head">
        <div class="terms-modal-head-left">
          <div class="terms-head-icon">📋</div>
          <div>
            <div class="terms-head-title">Terms & Conditions</div>
            <div class="terms-head-sub">MindStark Library · Last updated February 2026</div>
          </div>
        </div>
        <button class="terms-close-btn" onclick="closeTerms()" title="Close">✕</button>
      </div>

      <!-- Scroll progress -->
      <div class="terms-scroll-progress">
        <div class="terms-scroll-bar" id="termsScrollBar"></div>
      </div>

      <!-- Tabs -->
      <div class="terms-tabs">
        <button class="terms-tab active" onclick="switchTermsTab('general',this)">📄 General Use</button>
        <button class="terms-tab" onclick="switchTermsTab('payments',this)">💳 Payments</button>
        <button class="terms-tab" onclick="switchTermsTab('content',this)">📖 Content</button>
        <button class="terms-tab" onclick="switchTermsTab('privacy',this)">🔒 Privacy</button>
      </div>

      <!-- Body -->
      <div class="terms-modal-body" id="termsBody">

        <!-- GENERAL TAB -->
        <div class="terms-panel active" id="tab-general">
          <div class="tm-intro">
            By using MindStark Library you agree to these terms. <strong>Please read them carefully.</strong> If you do not agree, please do not use our service. These terms are governed by the laws of the Federal Republic of Nigeria.
          </div>

          <div class="tm-section">
            <div class="tm-section-title"><span class="tm-num">1</span> Acceptance of Terms</div>
            <p>By creating an account or using MindStark Library, you confirm you have read and agree to be legally bound by these Terms. You must be at least <strong>13 years old</strong> to use this platform. Users under 18 require parental consent for paid membership.</p>
          </div>

          <div class="tm-section">
            <div class="tm-section-title"><span class="tm-num">2</span> About MindStark Library</div>
            <p>MindStark Library is a Nigerian online reading platform providing access to 70,000+ public domain books via Project Gutenberg, personalised reading tools, and optional premium membership features.</p>
            <div class="tm-box success">Browse and read our public domain catalogue is free — no account required. Creating an account unlocks bookmarks, reading history, and personalisation.</div>
          </div>

          <div class="tm-section">
            <div class="tm-section-title"><span class="tm-num">3</span> User Accounts</div>
            <p>You are responsible for keeping your account credentials secure and for all activity that occurs under your account.</p>
            <ul>
              <li>Provide accurate and truthful registration information</li>
              <li>Do not share your password with anyone</li>
              <li>One personal account per user — accounts are non-transferable</li>
              <li>Notify us immediately of any unauthorised account access</li>
            </ul>
            <div class="tm-box warning">MindStark will <strong>never</strong> ask for your password via email or social media. Report any such requests immediately.</div>
          </div>

          <div class="tm-section">
            <div class="tm-section-title"><span class="tm-num">4</span> Acceptable Use</div>
            <p>You agree not to:</p>
            <ul>
              <li>Scrape, copy, or bulk-download content from the platform</li>
              <li>Use automated bots or tools to access the platform</li>
              <li>Upload malware or harmful code</li>
              <li>Harass, threaten, or abuse other users or staff</li>
              <li>Impersonate MindStark staff or other users</li>
              <li>Use the platform for unauthorised commercial activity</li>
              <li>Attempt to reverse-engineer or extract source code</li>
            </ul>
            <p>Violations may result in immediate account suspension and legal action.</p>
          </div>

          <div class="tm-section">
            <div class="tm-section-title"><span class="tm-num">5</span> Disclaimers & Liability</div>
            <p>MindStark Library is provided "as is". We do not guarantee uninterrupted service or that all books will be available at all times. We are not liable for indirect or consequential damages arising from your use of the platform.</p>
            <p>Our total liability to you shall not exceed the amount you paid us in the 3 months preceding any claim.</p>
          </div>

          <div class="tm-section">
            <div class="tm-section-title"><span class="tm-num">6</span> Governing Law</div>
            <p>These Terms are governed by the laws of the <strong>Federal Republic of Nigeria</strong>. Any disputes are subject to the exclusive jurisdiction of Nigerian courts.</p>
          </div>
        </div>

        <!-- PAYMENTS TAB -->
        <div class="terms-panel" id="tab-payments">
          <div class="tm-section">
            <div class="tm-section-title"><span class="tm-num">1</span> Membership Plans</div>
            <ul>
              <li><strong>Basic (Free):</strong> Browse & read all public domain books, up to 10 bookmarks</li>
              <li><strong>Reader Pro — ₦9,000/month or ₦86,400/year:</strong> Unlimited bookmarks, reading progress sync, ad-free experience</li>
              <li><strong>Scholar — ₦19,000/month or ₦182,400/year:</strong> Everything in Pro plus writer tools, early access, and priority support</li>
            </ul>
          </div>

          <div class="tm-section">
            <div class="tm-section-title"><span class="tm-num">2</span> Billing & Payments</div>
            <p>All payments are processed securely through <strong>Paystack</strong> in Nigerian Naira (₦).</p>
            <ul>
              <li>Subscriptions renew automatically unless cancelled before the renewal date</li>
              <li>Accepted: Debit/credit cards (Visa, Mastercard, Verve), bank transfer, USSD, mobile money</li>
              <li>You will receive a payment confirmation email for each transaction</li>
              <li>Prices may change with at least 30 days notice to existing subscribers</li>
            </ul>
            <div class="tm-box info">MindStark does not store your card details. All payment data is handled by Paystack in compliance with PCI-DSS standards.</div>
          </div>

          <div class="tm-section">
            <div class="tm-section-title"><span class="tm-num">3</span> Refund Policy</div>
            <ul>
              <li><strong>7-day money-back guarantee</strong> on your first payment — no questions asked</li>
              <li>After 7 days, payments are non-refundable</li>
              <li>Annual plans cancelled within 30 days may receive a pro-rata refund at our discretion</li>
              <li>Cancelling a subscription ends it at the next billing date — you keep access until then</li>
            </ul>
            <p>To request a refund, email <strong>support@mindstarklibrary.com</strong> with your account email and reason.</p>
          </div>

          <div class="tm-section">
            <div class="tm-section-title"><span class="tm-num">4</span> Failed Payments</div>
            <p>If a payment fails, we will notify you and retry. After reasonable failed attempts, your account may be downgraded to the Basic (free) plan until payment is resolved.</p>
          </div>
        </div>

        <!-- CONTENT TAB -->
        <div class="terms-panel" id="tab-content">
          <div class="tm-section">
            <div class="tm-section-title"><span class="tm-num">1</span> Public Domain Books</div>
            <p>Books sourced from Project Gutenberg are in the public domain and free to read, download, and share under Project Gutenberg's licence. MindStark Library does not claim ownership over any public domain content.</p>
          </div>

          <div class="tm-section">
            <div class="tm-section-title"><span class="tm-num">2</span> MindStark Original Content</div>
            <p>Our website design, logo, branding, written descriptions, and interface elements are the intellectual property of MindStark Library and are protected under Nigerian and international copyright law.</p>
            <div class="tm-box warning">You may not copy, reproduce, or distribute our original content without written permission.</div>
          </div>

          <div class="tm-section">
            <div class="tm-section-title"><span class="tm-num">3</span> Writer Uploads (Coming Soon)</div>
            <p>When the writer upload feature launches:</p>
            <ul>
              <li>You retain ownership of content you upload</li>
              <li>By uploading, you grant MindStark a non-exclusive licence to display and distribute it on the platform</li>
              <li>You confirm you have the rights to publish the content</li>
              <li>We may remove content that violates copyright or these terms without notice</li>
            </ul>
            <div class="tm-box warning">Uploading content you do not own may result in immediate account suspension and legal action.</div>
          </div>

          <div class="tm-section">
            <div class="tm-section-title"><span class="tm-num">4</span> Changes to Terms</div>
            <p>We may update these Terms at any time. We will notify registered users by email for significant changes and display a notice on the platform for at least 14 days. Continued use of the platform constitutes acceptance of the updated terms.</p>
          </div>
        </div>

        <!-- PRIVACY TAB -->
        <div class="terms-panel" id="tab-privacy">
          <div class="tm-intro">
            MindStark Library complies with the <strong>Nigerian Data Protection Regulation (NDPR) 2019</strong>. We take your privacy seriously and are committed to protecting your personal information.
          </div>

          <div class="tm-section">
            <div class="tm-section-title"><span class="tm-num">1</span> What We Collect</div>
            <ul>
              <li><strong>Account info:</strong> Name and email when you register</li>
              <li><strong>Reading activity:</strong> Books opened, bookmarks saved, reading progress</li>
              <li><strong>Payment info:</strong> Processed by Paystack — we do not store card details</li>
              <li><strong>Usage data:</strong> Browser type and general usage patterns to improve the platform</li>
            </ul>
          </div>

          <div class="tm-section">
            <div class="tm-section-title"><span class="tm-num">2</span> How We Use It</div>
            <ul>
              <li>To provide and improve our services</li>
              <li>To send account-related emails (receipts, password resets)</li>
              <li>To personalise your reading experience</li>
              <li>We <strong>do not sell</strong> your personal data to third parties</li>
            </ul>
          </div>

          <div class="tm-section">
            <div class="tm-section-title"><span class="tm-num">3</span> Your Rights</div>
            <div class="tm-box success">You have the right to access, correct, or delete your personal data at any time. Email <strong>privacy@mindstarklibrary.com</strong> to exercise these rights.</div>
            <ul>
              <li>Right to access your data</li>
              <li>Right to correct inaccurate data</li>
              <li>Right to request deletion of your account and data</li>
              <li>Right to withdraw consent for marketing emails at any time</li>
            </ul>
          </div>

          <div class="tm-section">
            <div class="tm-section-title"><span class="tm-num">4</span> Data Security</div>
            <p>We take reasonable technical and organisational measures to protect your data from unauthorised access, loss, or misuse. However, no online system is 100% secure and we cannot guarantee absolute security.</p>
          </div>

          <div class="tm-section">
            <div class="tm-section-title"><span class="tm-num">5</span> Contact</div>
            <p>For privacy-related questions: <strong>privacy@mindstarklibrary.com</strong><br/>
            For general support: <strong>support@mindstarklibrary.com</strong><br/>
            For legal matters: <strong>legal@mindstarklibrary.com</strong></p>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="terms-modal-foot">
        <div class="terms-foot-text">
          📍 MindStark Library · Nigeria · © 2026<br/>
          By clicking "I Agree" you accept all terms above.
        </div>
        <button class="terms-agree-btn" onclick="agreeTerms()">I Agree ✓</button>
      </div>

    </div>
  `;
  document.body.appendChild(overlay);

  /* ── SCROLL PROGRESS ───────────────────────── */
  document.getElementById('termsBody').addEventListener('scroll', function () {
    const pct = this.scrollHeight - this.clientHeight > 0
      ? (this.scrollTop / (this.scrollHeight - this.clientHeight)) * 100
      : 100;
    document.getElementById('termsScrollBar').style.width = pct + '%';
  });

  /* ── CLOSE ON OVERLAY CLICK ────────────────── */
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeTerms();
  });

  /* ── CLOSE ON ESC ──────────────────────────── */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeTerms();
  });

  /* ── GLOBAL FUNCTIONS ──────────────────────── */
  window.openTerms = function (e) {
    if (e) e.preventDefault();
    document.getElementById('termsOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    /* Reset to first tab */
    switchTermsTab('general', document.querySelector('.terms-tab'));
    document.getElementById('termsBody').scrollTop = 0;
    document.getElementById('termsScrollBar').style.width = '0%';
  };

  window.closeTerms = function () {
    document.getElementById('termsOverlay').classList.remove('open');
    document.body.style.overflow = '';
  };

  window.switchTermsTab = function (tab, btn) {
    /* Hide all panels */
    document.querySelectorAll('.terms-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.terms-tab').forEach(b => b.classList.remove('active'));
    /* Show selected */
    const panel = document.getElementById('tab-' + tab);
    if (panel) panel.classList.add('active');
    if (btn) btn.classList.add('active');
    /* Reset scroll */
    document.getElementById('termsBody').scrollTop = 0;
    document.getElementById('termsScrollBar').style.width = '0%';
  };

  window.agreeTerms = function () {
    sessionStorage.setItem('ms_terms_agreed', 'true');
    closeTerms();
    /* Show a brief confirmation toast if available */
    if (window.showNavToast) {
      window.showNavToast('✅ Terms accepted!');
    } else {
      const t = document.createElement('div');
      t.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#3b2a1a;color:#f5f0e8;padding:.75rem 1.5rem;border-radius:50px;font-family:DM Sans,sans-serif;font-size:.88rem;font-weight:500;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,.3);';
      t.textContent = '✅ Terms accepted!';
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 3000);
    }
  };

})();