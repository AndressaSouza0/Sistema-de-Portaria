// =====================================================================
// Logica da pagina de login / cadastro
// =====================================================================
import { supabase } from './supabaseClient.js';
import { redirectIfAuthenticated } from './auth.js';
import { showMessage } from './utils.js';

await redirectIfAuthenticated();

const alertBox = document.getElementById('alertBox');

// Mensagem vinda de auth.js (ex.: usuário inativo / perfil não encontrado)
const params = new URLSearchParams(window.location.search);
const msg = params.get('msg');
if (msg) showMessage(alertBox, msg, 'error');

// ---- Abas (Entrar / Criar conta) --------------------------------------
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('[data-tab-content]');

function switchTab(tabName) {
  tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === tabName));
  tabContents.forEach((c) => c.classList.toggle('active', c.dataset.tabContent === tabName));
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    switchTab(btn.dataset.tab);
    showMessage(alertBox, '');
  });
});

// ---- Mostrar/ocultar senha ----------------------------------------------
document.querySelectorAll('.toggle-password').forEach((btn) => {
  const input = document.getElementById(btn.dataset.target);
  const eyeIcon = btn.querySelector('.icon-eye');
  const eyeOffIcon = btn.querySelector('.icon-eye-off');

  btn.addEventListener('click', () => {
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    eyeIcon.style.display = isHidden ? 'none' : '';
    eyeOffIcon.style.display = isHidden ? '' : 'none';
    btn.setAttribute('aria-label', isHidden ? 'Ocultar senha' : 'Mostrar senha');
  });
});

// ---- Login ----------------------------------------------------------------
const loginForm = document.getElementById('loginForm');
const loginSubmitBtn = document.getElementById('loginSubmitBtn');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showMessage(alertBox, '');

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  await withLoading(loginSubmitBtn, async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    window.location.href = 'index.html';
  });
});

// ---- Cadastro ---------------------------------------------------------------
const signupForm = document.getElementById('signupForm');
const signupSubmitBtn = document.getElementById('signupSubmitBtn');

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showMessage(alertBox, '');

  const nome = document.getElementById('signupNome').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;

  await withLoading(signupSubmitBtn, async () => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nome } },
    });
    if (error) throw error;

    if (data.session) {
      window.location.href = 'index.html';
      return;
    }

    signupForm.reset();
    switchTab('login');
    document.getElementById('loginEmail').value = email;
    showMessage(
      alertBox,
      'Conta criada com sucesso! Se a confirmação por e-mail estiver ativa, confirme antes de entrar.',
      'success'
    );
  });
});

// ---- Helpers ------------------------------------------------------------------
async function withLoading(button, fn) {
  const originalText = button.textContent;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span>';
  try {
    await fn();
  } catch (err) {
    showMessage(alertBox, traduzirErro(err.message), 'error');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function traduzirErro(message) {
  const map = {
    'Invalid login credentials': 'E-mail ou senha inválidos.',
    'User already registered': 'Este e-mail já está cadastrado.',
    'Password should be at least 6 characters': 'A senha deve ter no mínimo 6 caracteres.',
    'Email not confirmed': 'Confirme seu e-mail antes de entrar.',
    'Email rate limit exceeded': 'Limite de envio de e-mails atingido. Peça ao administrador para desativar a confirmação por e-mail em Authentication > Providers no Supabase, ou aguarde alguns minutos.',
    'For security purposes, you can only request this after 60 seconds.': 'Por segurança, aguarde 60 segundos antes de tentar novamente.',
  };
  return map[message] || message;
}
