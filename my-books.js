/* ═══════════════════════════════════════════════════
   my-books.js — MindStark Original Books
   Add your own books here. Each object follows the
   same shape as a Gutendex API result so the reader
   and browse page work with zero extra code.

   HOW TO ADD A BOOK:
   1. Copy one of the entries below and paste it in
      the MY_BOOKS array.
   2. Give it a unique id starting with "ms-"
   3. Host your book content as an HTML or .txt file
      (e.g. on Vercel alongside this site) and paste
      the URL into formats["text/html"].
   4. Upload a cover image and paste its URL into
      formats["image/jpeg"].  Remove that line to use
      the auto-generated fallback cover instead.
═══════════════════════════════════════════════════ */

const MY_BOOKS = [

  /* ── EXAMPLE BOOK 1 ─────────────────────────── */
  {
    id:             "ms-001",
    title:          "Margaret",
    authors:        [{ name: "Onaraku Valeria" }],
    subjects:       ["Fiction -- Nigerian Literature -- Literary Fiction"],
    download_count: 0,
    _mindstark:     true,   /* marks this as a MindStark Original */

    formats: {
      /* Replace this URL with the real hosted URL of your book's HTML file */
      "text/html":   "Document1.htm",

      /* Replace with your cover image URL — delete this line to use auto fallback */
      "image/jpeg":  "image1.png"
    }
  },

  /* ── EXAMPLE BOOK 2 ─────────────────────────── */
  {
    id:             "ms-002",
    title:          "A Thousand Harmattan Nights",
    authors:        [{ name: "Your Name" }],
    subjects:       ["Romance -- African Fiction -- Short Stories"],
    download_count: 0,
    _mindstark:     true,

    formats: {
      "text/html":  "https://mind-stark-library.vercel.app/books/ms-002.html",
      "image/jpeg": "https://mind-stark-library.vercel.app/covers/ms-002.jpg"
    }
  },

  /* ── EXAMPLE BOOK 3 ─────────────────────────── */
  {
    id:             "ms-003",
    title:          "Port Harcourt After Dark",
    authors:        [{ name: "Your Name" }],
    subjects:       ["Mystery -- Crime Fiction -- Nigerian Noir"],
    download_count: 0,
    _mindstark:     true,

    formats: {
      "text/html":  "https://mind-stark-library.vercel.app/books/ms-003.html",
      "image/jpeg": "https://mind-stark-library.vercel.app/covers/ms-003.jpg"
    }
  },

  /* ── ADD MORE BOOKS BELOW THIS LINE ─────────────
  {
    id:             "ms-004",
    title:          "Your Book Title Here",
    authors:        [{ name: "Author Name" }],
    subjects:       ["Genre -- Sub-genre"],
    download_count: 0,
    _mindstark:     true,
    formats: {
      "text/html":  "https://your-url-here.com/books/ms-004.html",
      "image/jpeg": "https://your-url-here.com/covers/ms-004.jpg"
    }
  },
  ─────────────────────────────────────────────── */

];
