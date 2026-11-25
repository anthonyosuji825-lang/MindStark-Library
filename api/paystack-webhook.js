// Vercel serverless function: /api/paystack-webhook
//
// Paystack calls this on every successful charge, including the automatic monthly renewals
// of a Paystack subscription plan. Without it a monthly member would be charged again but their
// membership_expiry (set when they first paid) would run out after 31 days.
//
// Setup (one time, in Paystack): Settings -> API Keys & Webhooks -> Live Webhook URL:
//   https://mind-stark-library.vercel.app/api/paystack-webhook
// Environment variables are the same as /api/paystack:
//   PAYSTACK_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const crypto = require('crypto');
const { recordConversion } = require('../lib/attribution');

const PLANS = {
  pro:     { monthly: 250000, annual: 2400000 },   // kobo
  scholar: { monthly: 500000, annual: 4800000 },
};
const DAYS = { monthly: 31, annual: 366 };
// Paystack subscription plan codes (the same ones membership.html checks out with)
const PLAN_CODES = {
  PLN_aeqae7wjuied7u7: { plan: 'pro',     cycle: 'monthly' },
  PLN_aw1ukn48zxz1gpo: { plan: 'scholar', cycle: 'monthly' },
};

const reply = (res, status, body) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(body));
};

async function rawBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString('utf8');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return reply(res, 405, { error: 'Method not allowed' });

  const SECRET = process.env.PAYSTACK_SECRET_KEY;
  const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SECRET || !SB_URL || !SB_KEY) return reply(res, 500, { error: 'Not configured' });

  // 1) Only Paystack can call this: the signature is an HMAC of the exact bytes it sent.
  const raw = await rawBody(req);
  const want = crypto.createHmac('sha512', SECRET).update(raw).digest('hex');
  const got = String(req.headers['x-paystack-signature'] || '');
  const a = Buffer.from(want), b = Buffer.from(got);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return reply(res, 401, { error: 'Bad signature' });

  let evt;
  try { evt = JSON.parse(raw); } catch (e) { return reply(res, 400, { error: 'Bad body' }); }
  if (!evt || evt.event !== 'charge.success') return reply(res, 200, { ok: true, ignored: true });

  try {
    const d = evt.data || {};
    if (d.status !== 'success' || d.currency !== 'NGN' || !d.reference) return reply(res, 200, { ok: true, ignored: true });

    // 2) Which plan was paid? Renewals carry the plan code; first payments carry our metadata.
    const code = d.plan && (d.plan.plan_code || d.plan);
    const fromCode = PLAN_CODES[code];
    const plan = fromCode ? fromCode.plan : d.metadata && d.metadata.plan_type;
    const cycle = fromCode ? fromCode.cycle : d.metadata && d.metadata.billing_cycle;
    if (!PLANS[plan] || !DAYS[cycle] || Number(d.amount) < PLANS[plan][cycle]) return reply(res, 200, { ok: true, ignored: 'unknown plan or amount' });

    const hdr = { apikey: SB_KEY, 'Content-Type': 'application/json' };
    if (!SB_KEY.startsWith('sb_')) hdr.Authorization = `Bearer ${SB_KEY}`;

    // 3) Whose membership? Match the payer's email to exactly one profile.
    const email = String((d.customer && d.customer.email) || '').trim().toLowerCase();
    if (!email) return reply(res, 200, { ok: true, ignored: 'no email' });
    const pRes = await fetch(`${SB_URL}/rest/v1/profiles?select=id,membership_reference,membership_expiry&email=eq.${encodeURIComponent(email)}&limit=2`, { headers: hdr });
    if (!pRes.ok) return reply(res, 500, { error: 'lookup failed' });
    const rows = await pRes.json();
    if (rows.length !== 1) return reply(res, 200, { ok: true, ignored: rows.length ? 'ambiguous email' : 'no such member' });
    const prof = rows[0];

    // 4) Each charge counts once (the browser-side verify may already have handled the first one).
    if (prof.membership_reference === d.reference) return reply(res, 200, { ok: true, duplicate: true });
    const dup = await fetch(`${SB_URL}/rest/v1/profiles?select=id&membership_reference=eq.${encodeURIComponent(d.reference)}&limit=1`, { headers: hdr });
    if (dup.ok && (await dup.json()).length) return reply(res, 200, { ok: true, duplicate: true });

    // 5) Extend: from the current end date if still in the future, otherwise from the payment.
    const paidAt = d.paid_at ? new Date(d.paid_at) : new Date();
    const cur = prof.membership_expiry ? new Date(prof.membership_expiry) : null;
    const base = cur && cur > paidAt ? cur : paidAt;
    const expiry = new Date(base.getTime() + DAYS[cycle] * 86400000).toISOString();
    const up = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${prof.id}`, {
      method: 'PATCH',
      headers: { ...hdr, Prefer: 'return=minimal' },
      body: JSON.stringify({ membership_plan: plan, membership_active: true, membership_expiry: expiry, membership_reference: d.reference }),
    });
    if (!up.ok) return reply(res, 500, { error: 'update failed' });   // Paystack will retry
    await recordConversion({ SB_URL, hdr, userId: prof.id, priorReference: prof.membership_reference, reference: d.reference, metadata: d.metadata, plan, cycle, amount: d.amount, paidAt: d.paid_at });
    return reply(res, 200, { ok: true, plan, cycle, expiry });
  } catch (err) {
    return reply(res, 500, { error: 'error' });
  }
};

// Paystack signs the raw bytes, so Vercel must not parse the body first.
module.exports.config = { api: { bodyParser: false } };