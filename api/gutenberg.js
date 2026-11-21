// Server-side proxy for fetching Project Gutenberg book content.
// Vercel serverless function — lives at /api/gutenberg (Vercel auto-routes
// any file under /api to a matching endpoint, no config needed).
//
// Why this exists: Gutenberg.org doesn't send CORS headers, so the browser
// can't fetch book text directly. Free public CORS-proxy services
// (corsproxy.io, allorigins.win, codetabs.com) are used as a fallback, but
// they're unreliable — they go down, rate-limit, or change their API without
// notice. This function does the fetch server-side instead, which sidesteps
// CORS entirely and doesn't depend on any third party's uptime.
//
// Usage: /api/gutenberg?url=<url-encoded gutenberg.org URL>

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const target = req.query?.url;
  if (!target) {
    res.status(400).json({ error: 'Missing "url" query parameter.' });
    return;
  }

  // Only ever proxy Gutenberg URLs — this must not become an open
  // proxy for arbitrary sites.
  let parsed;
  try {
    parsed = new URL(target);
  } catch (e) {
    res.status(400).json({ error: 'Invalid URL.' });
    return;
  }
  const allowedHosts = ['www.gutenberg.org', 'gutenberg.org'];
  if (!allowedHosts.includes(parsed.hostname)) {
    res.status(403).json({ error: 'Only gutenberg.org URLs are allowed.' });
    return;
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: {
        // A normal browser-like User-Agent; some sites block requests
        // that look like bare server-side fetches.
        'User-Agent': 'Mozilla/5.0 (compatible; MindStarkReader/1.0)',
      },
      redirect: 'follow',
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Gutenberg responded with ${upstream.status}` });
      return;
    }

    const text = await upstream.text();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(text);
  } catch (e) {
    res.status(502).json({ error: `Fetch failed: ${e.message}` });
  }
};