// =====================================================================
// Autenticacao e controle de sessao
// =====================================================================
import { supabase } from './supabaseClient.js';

let cachedProfile = null;

// Garante que o usuario esta autenticado; caso contrario redireciona
// para login.html. Retorna { user, profile } ou null.
export async function requireAuth() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    redirectToLogin();
    return null;
  }

  const { profile, error } = await loadProfile(session.user.id, session.user.email);

  if (error) {
    await supabase.auth.signOut();
    redirectToLogin(`Erro ao carregar perfil: ${error.message}`);
    return null;
  }

  if (profile.ativo === false) {
    await supabase.auth.signOut();
    redirectToLogin('Seu usuário está inativo. Contate um administrador.');
    return null;
  }

  return { user: session.user, profile };
}

// Busca o perfil do usuario em public.profiles. Se ainda nao existir
// (ex.: o trigger on_auth_user_created nao rodou), cria um perfil padrao
// (cargo "porteiro") para o proprio usuario.
async function loadProfile(userId, email) {
  if (cachedProfile && cachedProfile.id === userId) return { profile: cachedProfile };

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) return { error };

  if (data) {
    cachedProfile = data;
    return { profile: data };
  }

  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert({ id: userId, email, nome: email?.split('@')[0] || 'Usuário' })
    .select()
    .single();

  if (insertError) return { error: insertError };

  cachedProfile = created;
  return { profile: created };
}

export function redirectToLogin(message) {
  const params = message ? `?msg=${encodeURIComponent(message)}` : '';
  window.location.href = `login.html${params}`;
}

export async function logout() {
  await supabase.auth.signOut();
  cachedProfile = null;
  window.location.href = 'login.html';
}

// Para a pagina de login: se ja existe sessao ativa, vai direto pro dashboard
export async function redirectIfAuthenticated() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) {
    window.location.href = 'index.html';
  }
}

export function isAdmin(profile) {
  return profile?.cargo === 'admin';
}
