# MindStark Library

A reading platform: free public-domain books (Project Gutenberg), **MindStark Originals** written by approved creators on **Inkwell**, a community area (**Connect**), a games area (**Arena**) and a **MindStark Wallet**.

Plain HTML, CSS and JavaScript (no build step), a Supabase database and a few Vercel serverless functions.

> **How to read this file.** Sections marked **Decided** describe rules the owner has settled. Sections marked **Proposed** or **Open** are still being discussed and are *not* final policy or code. Nothing here is legal text. Have a lawyer review the creator agreement, privacy and payment wording before launch.

---

## 1. Project layout

| Path | Purpose |
|---|---|
| `index.html`, `browse.html`, `book.html`, `reader.html` | Library home, Gutenberg browsing, a reader's saved books, the reader |
| `story.html` | A MindStark Original: chapters, likes, follows, comments, paywall |
| `feeds.html` | Blog feed (no `?id`) and blog reader (`?id=<post id>`) |
| `inkwell.html`, `inkwell-profile.html` | Inkwell home and creator profiles |
| `inkwell-write.html` | Creator workspace: **Story** tab, and **Blogs** tab for blog-writing creators |
| `inkwell-admin.html` | Editorial admin: applications, submitted books, announcements |
| `membership.html` | Plans and Paystack checkout |
| `notifications.html` | Notification centre (bell lives in `nav.js`) |
| `arena*.html`, `arena*.js`, `events.html` | Arena (maintained separately) |
| `nav.js` | Shared header, mobile menu, dark mode, profile menu and membership badge |
| `supabase.js` | Supabase client (publishable key only) |
| `api/paystack.js` | Server-side payment verification (Vercel function) |
| `netlify/`, `netlify.toml` | Legacy. Ignored on Vercel. Safe to delete once payments are confirmed working |

### Environment variables (Vercel)
`PAYSTACK_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (the Supabase *secret* key). Never commit keys. Only the Supabase publishable key and the Paystack public key appear in the browser.

---

## 2. Membership tiers

**Decided**

| Tier | Price (NGN) | Originals | Extras |
|---|---|---|---|
| Reader (free) | 0 | Gutenberg books + the **free chapters** of each Original | none |
| Pro | 2,500 / month, 24,000 / year | **Every chapter of every Original** | Connect and AI reader features, at the Pro level |
| Scholar | 5,000 / month, 48,000 / year | **Every chapter of every Original** (same as Pro) | Connect and AI reader features, at the Scholar level, plus the purple Scholar badge |

- **Pro and Scholar have equal access to MindStark Originals.** What separates them is **Connect and the AI reader features**, not the books.
- Payments are verified on the server (`api/paystack.js`). A browser can no longer grant itself a membership: a database trigger blocks changes to the membership columns from signed-in users.

**Open:** exactly which Connect and AI features belong to Pro and which to Scholar.

### Device limits
**Proposed, not built.** Pro: 2 devices. Scholar: 5 devices.
Notes for the build: Supabase has no built-in device cap, so this needs a device list, a check at sign-in, and a "manage my devices" screen so people can remove old ones. Count a device as active if used in the last 30 days. Clearing browser storage looks like a new device, so expect some support requests. Five devices may invite account sharing; revisit after launch data.

---

## 3. MindStark Originals: free chapters and the paywall

**Decided and enforced in the database**

- Each Original has `free_chapters` (default **5**). Chapters numbered above that need an **active Pro or Scholar membership**.
- The lock is a database rule, not a page trick: the text of a locked chapter is never sent to a non-member, even if someone calls the API directly. Locked chapters still appear in the chapter list (title only) so readers see what they would unlock.
- The writer of a book and admins can always read all of its chapters.
- Creators cannot change `free_chapters`; only admins can.
- `story.html` shows 🔒 on locked chapters and a paywall with a link to `membership.html?src_book=<book id>`.

**Why chapters and not a time-limited trial:** a trial per original has to be tracked per reader per book, is easy to dodge with extra accounts, and lets a reader binge the whole book in the trial. A chapter count is simple, fair to every writer and can be enforced in the database.

**Open:** whether writers may set their own number of free chapters later (the column already exists).

---

## 3b. Offline reading and downloads

**Decided in principle; not built.**

- **Only paid members (Pro or Scholar) can download books** for offline reading. Free readers read Gutenberg books **online only** (confirmed): no payment needed to read, but no offline download.
- Downloads go into an **offline library inside the site**, shown in **My Books** under "Available offline". They are not loose files.
- **If a subscription ends without renewal, the offline books stop opening** and are removed from the device. My Books offers "Renew to read again".
- A free reader who goes offline cannot load further chapters. Locked chapters are never sent to non-members, and nothing is stored for free readers. Chapters already loaded in an open page stay readable until the page is closed. When offline, tapping a locked chapter should say "You're offline" rather than show the paywall.
- **Separate download limits for Pro and Scholar.** Pro 10 books, Scholar 30 books on a device. Agreed: **Pro 10, Scholar 30**.

**Proposed design (a lease, as music and ebook apps use)**
- Books are saved encrypted on the device. The device asks the server whether the membership is still active and receives a short **lease**; offline reading works until the lease or the membership ends, whichever comes first.
- At the next check-in, an expired membership means the lease is refused and the device deletes its books. Works that were removed (resigned creator, unpublished book) are deleted the same way.
- No website can make a download impossible to keep. The lease makes casual cancel-and-keep much harder; it is not perfect protection.
- Offline reads are queued and counted for writers' pay only when the device reconnects, under the normal qualified-read rules.
- Downloads follow the device limit (Pro 2 devices, Scholar 5; see section 2).
- **Lease length: 14 days, and never longer than the paid period.** Memberships are one-off payments, so the end date is always known and the lease stops there at the latest. Members with no end date recorded get the plain 14 days. Shorter than 14 asks readers with poor connectivity to reconnect too often; longer leaves a bigger gap after a refund, chargeback or revoked membership.
- The current Download button saves a permanent HTML file. It cannot expire and should be replaced by the offline library.

---

## 4. Inkwell creators

### Creator types
`novelist`, `blogger`, or `both`. Applicants choose a type; an admin approves.

| Type | Can write books (Story tab) | Can write blog posts (Blogs tab) |
|---|---|---|
| novelist | yes | no |
| both | yes | yes |
| blogger | no | yes (opens directly into Blogs) |

This is enforced by database rules, not just by hiding tabs.

### Publishing
- **Books** go draft → submitted → under review → published. **Only editors/admins can publish or review.** Creators cannot publish their own books.
- **Once a book is published, creators cannot edit it or its chapters.** They ask the editorial team. (Admins can.)
- **Blogs** are draft or published. Creators with a blog-writing type publish their own posts directly.
- Creators cannot edit read, like or comment counters, publish dates or rejection notes. Counters are kept by the database.

### Blogs
Writers use the **Blogs** tab in `inkwell-write.html` (list of posts, rich-text editor, cover image, autosave, publish/unpublish/delete). Readers use `feeds.html`: a searchable feed with topic filters, and a post page with **likes, follow, comments and share**. Writers get notifications for new likes, comments and followers.

### Safety of posts and comments
- Post HTML is cleaned **when saved** (database) and **again when displayed** (browser allow-list: paragraphs, headings, bold, italic, underline, quotes, lists, plain links). Scripts, frames, inline handlers and `javascript:` links never run.
- Comments are plain text, 1 to 2000 characters. A comment can be deleted by its author, by the writer of the post, or by an admin.
- Likes and comments only work on published work.

---

## 5. Creator agreement, resignation and account deletion

### Account deletion
**Decided.** Creators cannot simply delete their MindStark account. They must **resign as a creator first**. There is no delete-account feature on the site yet; the database currently blocks deleting any account that still owns creator work.

### Resignation
**Proposed (agreed in principle; numbers open).**
- A creator submits a resignation with a reason (for the record). It is **reversible during the notice period**, and every step is logged with who and when.
- Resigning removes their Inkwell tools and, after the notice period, **unpublishes their work**, which is kept privately for a retention period before permanent deletion. After that they may delete their MindStark account or keep it.
- **Bloggers (lighter):** short notice, no admin handover check, automatic confirmation.
- **Admins check the handover, they do not veto.** A creator who follows the process is always allowed to leave. The check is for things like a book stuck in review or an open dispute.
- Removal of a creator for breaking the rules is a **separate** process, recorded separately.
- Reader activity on removed work (likes, comments) goes with the work. A deleted writer's comments elsewhere show as "Deleted user".
- **Open numbers:** notice for book writers (30 days proposed, 14 suggested as less resented), notice for bloggers (7 days proposed), retention (30 days proposed), and whether a book under review blocks resignation.
- Privacy laws (including Nigeria's NDPA) give people a right to erasure. Waiting periods and a resignation step are fine; a permanent block on deletion is not.

### Paid works
**Proposed.** If MindStark has *paid* for a work, the work stays published for a **minimum term** even if the creator resigns, and early removal means repaying a pro-rata share. The stronger protection is **staged payment** (see section 6), so there is nothing to claw back. Whether a repayment clause is enforceable depends on the contract and the creator's country. Get legal review.

### Ownership and exclusivity
**Open.**
- Suggested model: the **writer keeps ownership** and gives MindStark a licence to show and promote the work.
- Books today: the application says a published book is **exclusive to MindStark while it stays published**, and rights return on unpublish.
- Blogs: no exclusivity today. A short window (for example 30 days) is an option.
- Still to decide: translation, audio and adaptation rights (suggested: not without written permission); use for AI training (suggested: not without permission); what happens to posts when an account is deleted (suggested: takedown by default).

### Community and legal pages still to write
Creator Agreement (accepted at application, like the exclusivity box), comment/community guidelines under the comment box, a **Report** button on posts and comments feeding the admin page, and a **Privacy & Cookies** page with a cookie notice. The site stores sign-in, dark-mode and membership state in the browser, and creator applications collect ID documents, so privacy wording needs a lawyer.

---

## 6. Creator payments

**Decided:** payouts are handled by the **MindStark Wallet** (earnings are credited to the creator's wallet and withdrawn through the existing withdrawal flow).

**Proposed, not built**

- **Revenue share pool.** A fixed share of membership income (30 to 40 percent suggested) goes into a monthly pool, split between creators by **qualified reads**. Costs rise and fall with income, so MindStark never owes more than it earns. No upfront advances at first.
- **Qualified read.** Counts only if the reader is a **paying member**, stayed a realistic time or scrolled most of the chapter, is not the writer or an admin, and is within a daily limit per reader per book. A bare page open earns nothing. Free readers' reads earn nothing from the pool.
- **Conversion bonus.** The free chapters persuade people to subscribe, so the creator whose paywall brought in a subscriber earns a share of that subscriber's first payment.
  - *Tracking:* the paywall button already carries the book (`membership.html?src_book=<id>`). It still has to be passed into the Paystack payment metadata, verified on the server and stored with the subscription. Fallback: the last paywall a person hit in the previous 7 days. Subscribers who never hit a paywall credit nobody.
  - *Anti-cheating:* no bonus for subscribing through your own book; paid only after a holding period (for example 30 days) and only if not refunded; one creator credited per subscription (the most recent paywall).
- **Holding period.** Earnings pay out 30 to 60 days after they are earned, above a minimum balance. This also removes most of the "paid, then resigned a week later" risk.
- **Bloggers:** unpaid at launch, or a small engagement bonus later.
- **Money safety:** wallet credits must come only from a protected server function, run monthly, with a ledger entry per credit and safe to re-run.
- Tax and withholding duties on creator payments: ask an accountant.

---

## 7. Security notes

- Row Level Security is enabled on every table. Database triggers back it up for the rules above (publishing, counters, memberships, chapter lock).
- Profiles are private. Public names for comments come from a vetted database function, not from direct table access.
- `Connect` login uses an email lookup function that can reveal a Scholar member's email to a signed-out caller. It is kept because Connect login depends on it, and should be reworked.
- Turn on **leaked-password protection** in Supabase Auth settings.
- Rotate the old Paystack key (it exists in git history).
- Arena has its own open items and is maintained separately.