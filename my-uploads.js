/*
═══════════════════════════════════════════════════════════════
  MindStark Library — My Uploads
  my-uploads.js

  HOW TO ADD YOUR OWN BOOKS:
  ─────────────────────────
  1. Upload your book file (PDF or TXT) to your Netlify folder
  2. Copy the entry below and fill in your details
  3. Set "readUrl" to the path of your file e.g. "books/my-book.pdf"
  4. Set "cover" to your cover image path e.g. "covers/my-cover.jpg"
     (or leave as "" for a beautiful auto-generated cover)
  5. Save and redeploy to Netlify — done!

  When my backend is ready, I will replace this file with an API call.
═══════════════════════════════════════════════════════════════
*/

window.MINDSTARK_UPLOADS = [

  /* ── EXAMPLE ENTRY (delete or replace this) ─────────────────
  {
    id:          'ms-001',               // unique ID — never change once set
    title:       'The Silent Horizon',   // book title
    author:      'Anthony Osuji',        // your name
    cover:       'covers/silent-horizon.jpg', // cover image path (or "")
    readUrl:     'books/silent-horizon.pdf',  // path to your PDF/TXT file
    genre:       'Fiction',              // genre label
    description: 'A gripping tale of survival set against the vast silence of the Sahara.',
    pages:       240,                    // approximate page count
    year:        2026,
    language:    'en',
    tags:        ['fiction', 'adventure', 'africa'],
    free:        true,                   // true = anyone can read, false = members only
  },
  ─────────────────────────────────────────────────────────────── */

  /* ADD YOUR BOOKS BELOW THIS LINE */

];

/*
  READING YOUR UPLOADS IN THE BROWSER:
  ─────────────────────────────────────
  The browse.html page automatically reads window.MINDSTARK_UPLOADS
  and shows your books at the top with a "MindStark Original" badge.

  Your books open in reader.html just like Gutenberg books.
  PDFs open using the browser's built-in PDF viewer inside the reader.
  TXT files are rendered as formatted text.

  FUTURE BACKEND UPGRADE PATH:
  ─────────────────────────────
  When you're ready to go dynamic, replace this file with:

    async function loadUploads() {
      const res = await fetch('/api/my-books');
      window.MINDSTARK_UPLOADS = await res.json();
    }

  Nothing else in browse.html or reader.html needs to change.
*/