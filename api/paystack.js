// Vercel serverless function: /api/paystack
//
// Verifies a Paystack payment with the SECRET key and, only if it is genuine, switches the
// signed-in reader's membership on in Supabase. The browser can no longer grant itself a plan.
//
// Environment variables (Vercel -> Project -> Settings -> Environment Variables):
//   PAYSTACK_SECRET_KEY        your Paystack secret key (sk_live_...)
//   SUPABASE_URL               https://wgcpuohwyarhjlndmnlj.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  the SECRET key: Supabase -> Settings -> API Keys -> "Secret keys" -> default (sb_secret_...).
//                              The old service_role key also works. SERVER ONLY, never in the repo.

const { recordConversion } = require('../lib/attribution');

const PLANS = {
  pro:     { monthly: 250000, annual: 2400000 },   // kobo
  scholar: { monthly: 500000, annual: 4800000 },
};
const DAYS = { monthly: 31, annual: 366 };          // a day of grace on top of the period

const json = (res, status, body) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).end(JSON.stringify(body));
};

async function paystackVerify(reference, secret) {
  const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const p = await r.json().catch(() => ({}));
  if (!r.ok || !p.status) throw new Error(p.message || 'Paystack could not verify this reference');
  return p.data;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const SECRET = process.env.PAYSTACK_SECRET_KEY;
  const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SECRET || !SB_URL || !SB_KEY) {
    return json(res, 500, { error: 'Payment service not configured (missing environment variables).' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const reference = body && typeof body.reference === 'string' ? body.reference.trim() : '';
  if (!body || body.action !== 'verify' || !reference || reference.length > 100) {
    return json(res, 400, { error: 'Invalid request' });
  }

  // 1) Who is calling? Ask Supabase to validate their sign-in token.
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(res, 401, { error: 'Please sign in first.' });
  const uRes = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` } });
  if (!uRes.ok) return json(res, 401, { error: 'Your sign-in has expired. Please sign in again.' });
  const user = await uRes.json();
  if (!user || !user.id) return json(res, 401, { error: 'Please sign in first.' });

  try {
    // 2) Is the payment genuine, successful and for this reader?
    const txn = await paystackVerify(reference, SECRET);
    if (txn.status !== 'success') return json(res, 200, { verified: false, status: txn.status });

    const plan = txn.metadata && txn.metadata.plan_type;
    const cycle = txn.metadata && txn.metadata.billing_cycle;
    if (!PLANS[plan] || !DAYS[cycle]) return json(res, 400, { verified: false, error: 'Unknown plan on this payment.' });
    if (txn.currency !== 'NGN' || Number(txn.amount) < PLANS[plan][cycle]) {
      return json(res, 400, { verified: false, error: 'Payment amount does not match the plan.' });
    }
    const payer = String((txn.customer && txn.customer.email) || '').toLowerCase();
    if (!user.email || payer !== String(user.email).toLowerCase()) {
      return json(res, 403, { verified: false, error: 'This payment belongs to a different account.' });
    }

    // 3) A payment reference can only ever activate one account.
    // New secret keys (sb_secret_...) go in `apikey` only; the old service_role key is a JWT and also needs Authorization.
    const hdr = { apikey: SB_KEY, 'Content-Type': 'application/json' };
    if (!SB_KEY.startsWith('sb_')) hdr.Authorization = `Bearer ${SB_KEY}`;
    const dup = await fetch(`${SB_URL}/rest/v1/profiles?select=id&membership_reference=eq.${encodeURIComponent(reference)}&id=neq.${user.id}&limit=1`, { headers: hdr });
    const dupRows = dup.ok ? await dup.json() : [];
    if (dupRows.length) return json(res, 409, { verified: false, error: 'This payment was already used.' });

    // Was this reader already a paying member before? (a first payment is what a book can be credited for)
    const pr = await fetch(`${SB_URL}/rest/v1/profiles?select=membership_reference&id=eq.${user.id}&limit=1`, { headers: hdr });
    const priorReference = pr.ok ? ((await pr.json())[0] || {}).membership_reference : 'unknown';

    // 4) Switch the membership on.
    const paidAt = txn.paid_at ? new Date(txn.paid_at) : new Date();
    const expiry = new Date(paidAt.getTime() + DAYS[cycle] * 86400000).toISOString();
    const up = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${user.id}`, {
      method: 'PATCH',
      headers: { ...hdr, Prefer: 'return=minimal' },
      body: JSON.stringify({
        membership_plan: plan,
        membership_active: true,
        membership_expiry: expiry,
        membership_reference: reference,
      }),
    });
    if (!up.ok) return json(res, 500, { verified: false, error: 'Payment confirmed but we could not activate your plan. Contact support with reference ' + reference });

    await recordConversion({ SB_URL, hdr, userId: user.id, priorReference, reference, metadata: txn.metadata, plan, cycle, amount: txn.amount, paidAt: txn.paid_at });

    return json(res, 200, { verified: true, plan, billing: cycle, reference, paid_at: txn.paid_at || null, expiry });
  } catch (err) {
    return json(res, 502, { verified: false, error: 'We could not reach the payment service. Try again in a moment.' });
  }
};