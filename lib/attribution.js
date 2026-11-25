// Records which Originals book led a reader to take their FIRST paid membership.
// Called by /api/paystack and /api/paystack-webhook after a membership is activated.
// It never throws: a problem here must never stop a paid member from being activated.
//
// Rules (they are what keeps the conversion bonus honest):
//  - the book id comes from the payment metadata (src_book), and must be a real, published book
//  - only a reader's first-ever payment counts (unique user_id in inkwell_conversions)
//  - a writer cannot earn from their own subscription
//  - the credit is held for HOLD_DAYS before it can ever be paid out
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOLD_DAYS = 30;

async function recordConversion({ SB_URL, hdr, userId, priorReference, reference, metadata, plan, cycle, amount, paidAt }) {
  try {
    const src = metadata && metadata.src_book;
    if (!userId || !UUID.test(String(src || ''))) return { skipped: 'no book' };
    // Someone who already paid before is not a new subscriber (the same reference means "this payment").
    if (priorReference && priorReference !== reference) return { skipped: 'not first payment' };

    const bRes = await fetch(`${SB_URL}/rest/v1/inkwell_books?select=id,creator_id,status&id=eq.${src}&limit=1`, { headers: hdr });
    if (!bRes.ok) return { skipped: 'book lookup failed' };
    const book = (await bRes.json())[0];
    if (!book || book.status !== 'published') return { skipped: 'book not published' };

    const cRes = await fetch(`${SB_URL}/rest/v1/inkwell_creators?select=user_id&id=eq.${book.creator_id}&limit=1`, { headers: hdr });
    if (!cRes.ok) return { skipped: 'creator lookup failed' };
    const creator = (await cRes.json())[0];
    if (!creator) return { skipped: 'no creator' };
    if (creator.user_id === userId) return { skipped: 'own book' };

    const paid = paidAt ? new Date(paidAt) : new Date();
    const row = {
      user_id: userId, book_id: book.id, creator_id: book.creator_id, reference,
      plan, billing_cycle: cycle, amount_kobo: Number(amount) || null,
      paid_at: paid.toISOString(),
      hold_until: new Date(paid.getTime() + HOLD_DAYS * 86400000).toISOString(),
    };
    const ins = await fetch(`${SB_URL}/rest/v1/inkwell_conversions?on_conflict=user_id`, {
      method: 'POST',
      headers: { ...hdr, Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
    return ins.ok ? { recorded: true } : { skipped: 'insert failed' };
  } catch (e) {
    return { skipped: 'error' };
  }
}

module.exports = { recordConversion, HOLD_DAYS };