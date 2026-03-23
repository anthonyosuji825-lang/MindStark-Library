/*
═══════════════════════════════════════════════════════════════
  MindStark Library — Supabase Client
  supabase.js

  Shared across all pages. Load this BEFORE nav.js and other
  scripts that need auth.

  Usage in any HTML file:
    <script src="supabase.js"></script>
═══════════════════════════════════════════════════════════════
*/

const SUPABASE_URL  = 'https://wgcpuohwyarhjlndmnlj.supabase.co';
const SUPABASE_ANON = 'sb_publishable_aCM0iO7qCRXWSnnzzynAlA_mHRquGLQ';

/* ── Load Supabase SDK from CDN ──────────────────────────────── */
(function loadSupabase() {
  const script = document.createElement('script');
  script.src   = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  script.onload = function() {
    window._sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    /* Fire a custom event so other scripts know Supabase is ready */
    document.dispatchEvent(new Event('supabase:ready'));
  };
  document.head.appendChild(script);
})();

/* ── Auth helpers ────────────────────────────────────────────── */

/* Get current signed-in user (null if not signed in) */
async function msGetUser() {
  if (!window._sb) return null;
  const { data: { user } } = await window._sb.auth.getUser();
  return user;
}

/* Get user profile from profiles table */
async function msGetProfile(userId) {
  if (!window._sb || !userId) return null;
  const { data } = await window._sb
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return data;
}

/* Save user profile to profiles table */
async function msUpsertProfile(profile) {
  if (!window._sb) return null;
  const { data, error } = await window._sb
    .from('profiles')
    .upsert(profile, { onConflict: 'id' });
  return { data, error };
}

/* Sign out */
window.location.href = 'index.html';

/* Check if user has active membership */
function msHasMembership(profile) {
  if (!profile) return false;
  return profile.membership_active === true &&
         ['pro', 'scholar'].includes(profile.membership_plan);
}

/* Sync Supabase user to sessionStorage (for nav.js compatibility) */
async function msSyncSession(user, profile) {
  if (!user || !profile) return;
  const sessionUser = {
    id:           user.id,
    email:        user.email,
    name:         profile.full_name || user.email.split('@')[0],
    avatar:       profile.avatar_url || '',
    membership:   profile.membership_active ? {
      plan:      profile.membership_plan,
      planName:  profile.membership_plan === 'scholar' ? 'Scholar Pro' : 'Reader Pro',
      active:    true,
    } : null,
    guest: false,
  };
  sessionStorage.setItem('ms_current_user', JSON.stringify(sessionUser));
  return sessionUser;
}