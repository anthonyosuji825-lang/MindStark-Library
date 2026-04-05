/*
  MindStark Library — Paystack Serverless Function
  netlify/functions/paystack.js

  Your SECRET KEY lives in Netlify Environment Variables ONLY.
  Go to: Netlify Dashboard → Site Settings → Environment Variables
  Add:   PAYSTACK_SECRET_KEY = sk_test_8d3b54e00d2eeb7fee73a2d64bb8a9a3b31020a5
  (swap sk_test_ for sk_live_ when going live)
*/
const https = require('https');
const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers:CORS, body:'' };
  if (event.httpMethod !== 'POST')    return { statusCode:405, headers:CORS, body: JSON.stringify({error:'Method not allowed'}) };
  if (!SECRET_KEY)                    return { statusCode:500, headers:CORS, body: JSON.stringify({error:'Payment service not configured. Set PAYSTACK_SECRET_KEY in Netlify.'}) };

  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode:400, headers:CORS, body: JSON.stringify({error:'Invalid request body'}) }; }

  if (body.action === 'verify') {
    const { reference } = body;
    if (!reference) return { statusCode:400, headers:CORS, body: JSON.stringify({error:'Missing reference'}) };
    try {
      const result = await paystackGET(`/transaction/verify/${encodeURIComponent(reference)}`);
      const txn = result.data;
      if (txn.status !== 'success') return { statusCode:200, headers:CORS, body: JSON.stringify({verified:false, status:txn.status}) };
      return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({
          verified:  true,
          status:    txn.status,
          amount:    txn.amount,
          email:     txn.customer.email,
          plan:      txn.metadata?.plan_type,
          plan_name: txn.metadata?.plan_name,
          reference: txn.reference,
          paid_at:   txn.paid_at,
        })
      };
    } catch(err) {
      return { statusCode:500, headers:CORS, body: JSON.stringify({error:err.message}) };
    }
  }

  return { statusCode:400, headers:CORS, body: JSON.stringify({error:'Unknown action'}) };
};

function paystackGET(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname:'api.paystack.co', port:443, path, method:'GET',
        headers:{ Authorization:`Bearer ${SECRET_KEY}`, 'Content-Type':'application/json' } },
      res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try {
            const p = JSON.parse(d);
            p.status ? resolve(p) : reject(new Error(p.message || 'Paystack error'));
          } catch(e) { reject(new Error('Invalid Paystack response')); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}