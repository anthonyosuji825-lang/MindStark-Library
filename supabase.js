/*
═══════════════════════════════════════════════════════════════
  MindStark Library — Supabase Client
  supabase.js  (updated: MindStark ID + Scholar gate)
═══════════════════════════════════════════════════════════════
*/

const SUPABASE_URL  = 'https://wgcpuohwyarhjlndmnlj.supabase.co';
const SUPABASE_ANON = 'sb_publishable_aCM0iO7qCRXWSnnzzynAlA_mHRquGLQ';

/* Prevent redirect loops */
if (window.location.hostname.includes('vercel.app') &&
    window.location.href.includes('mind-stark-library-bpjl')) {
  window.location.replace('https://mind-stark-library.vercel.app' + window.location.pathname);
}

/* ── Load Supabase SDK ─────────────────────────────────────── */
(function loadSupabase() {
  const script = document.createElement('script');
  script.src   = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  script.onload = function () {
    window._sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    document.dispatchEvent(new Event('supabase:ready'));
  };
  document.head.appendChild(script);
})();

/* ── Auth helpers ─────────────────────────────────────────── */

async function msGetUser() {
  if (!window._sb) return null;
  const { data: { user } } = await window._sb.auth.getUser();
  return user;
}

async function msGetProfile(userId) {
  if (!window._sb || !userId) return null;
  const { data } = await window._sb
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return data;
}

async function msUpsertProfile(profile) {
  if (!window._sb) return null;
  const { data, error } = await window._sb
    .from('profiles')
    .upsert(profile, { onConflict: 'id' });
  return { data, error };
}

async function msSignOut() {
  if (window._sb) await window._sb.auth.signOut();
  sessionStorage.removeItem('ms_current_user');
  sessionStorage.removeItem('ms_membership');
  window.location.href = 'index.html';
}

function msHasMembership(profile) {
  if (!profile) return false;
  return profile.membership_active === true &&
         ['pro', 'scholar', 'reader pro'].includes(
           (profile.membership_plan || '').toLowerCase()
         );
}

/* ── NEW: Scholar check ───────────────────────────────────── */
function msIsScholar(profile) {
  if (!profile) return false;
  return profile.membership_active === true &&
         (profile.membership_plan || '').toLowerCase() === 'scholar';
}

/* ── NEW: Get profile by MindStark ID ────────────────────── */
async function msGetProfileByMsId(msId) {
  if (!window._sb || !msId) return null;
  const { data } = await window._sb
    .from('profiles')
    .select('*')
    .eq('mindstark_id', msId)
    .single();
  return data;
}

/* ── Sync session ────────────────────────────────────────── */
async function msSyncSession(user, profile) {
  if (!user || !profile) return;
  const sessionUser = {
    id:           user.id,
    email:        user.email,
    name:         profile.full_name || user.email.split('@')[0],
    avatar:       profile.avatar_url || '',
    mindstarkId:  profile.mindstark_id || null,
    membership:   profile.membership_active ? {
      plan:     profile.membership_plan,
      planName: profile.membership_plan === 'scholar'
                  ? 'Scholar'
                  : profile.membership_plan === 'reader pro'
                  ? 'Reader Pro'
                  : 'Pro',
      active:   true,
    } : null,
    guest: false,
  };
  sessionStorage.setItem('ms_current_user', JSON.stringify(sessionUser));
  return sessionUser;
}