// =====================================================================
// Logica da pagina de login / cadastro
// =====================================================================
import { supabase } from '../shared/supabaseClient.js';
import { redirectIfAuthenticated } from '../shared/auth.js';
import { formatDateTime, todayISO, escapeHtml, showMessage } from '../shared/utils.js';

await redirectIfAuthenticated();

const alertBox = document.getElementById('alertBox');

// Mensagem vinda de auth.js (ex.: usuário inativo / perfil não encontrado)
const params = new URLSearchParams(window.location.search);
const msg = params.get('msg');
if (msg) showMessage(alertBox, msg, 'error');

// ---- Abas (Entrar / Bater Ponto) ---------------------------------------
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

// ---- Alternar entre login e cadastro -----------------------------------
const loginView = document.getElementById('loginView');
const signupView = document.getElementById('signupView');

function showSignupView() {
  loginView.classList.add('hidden');
  signupView.classList.remove('hidden');
  showMessage(alertBox, '');
}

function showLoginView() {
  signupView.classList.add('hidden');
  loginView.classList.remove('hidden');
  showMessage(alertBox, '');
}

document.getElementById('showSignup').addEventListener('click', (e) => {
  e.preventDefault();
  showSignupView();
});

document.getElementById('showLogin').addEventListener('click', (e) => {
  e.preventDefault();
  showLoginView();
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
    window.location.href = '../dashboard/dashboard.html';
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
      window.location.href = '../dashboard/dashboard.html';
      return;
    }

    signupForm.reset();
    showLoginView();
    document.getElementById('loginEmail').value = email;
    showMessage(
      alertBox,
      'Conta criada com sucesso! Se a confirmação por e-mail estiver ativa, confirme antes de entrar.',
      'success'
    );
  });
});

// ---- Bater Ponto (sem login, para funcionarios na portaria) -----------------
const PONTO_TIPO_LABELS = {
  entrada: 'Entrada',
  saida: 'Saída',
  pausa_inicio: 'Início de pausa',
  pausa_fim: 'Fim de pausa',
};

const pontoSelect = document.getElementById('pontoFuncionarioSelect');

await loadPontoFuncionarios();
pontoSelect.addEventListener('change', updatePontoStatus);
document
  .querySelectorAll('[data-ponto-tipo]')
  .forEach((btn) => btn.addEventListener('click', () => registrarPonto(btn.dataset.pontoTipo)));

async function loadPontoFuncionarios() {
  const { data, error } = await supabase.from('funcionarios').select('*').eq('ativo', true).order('nome');

  if (error || !data || !data.length) {
    pontoSelect.innerHTML = '<option value="">Nenhum funcionário disponível</option>';
    return;
  }

  pontoSelect.innerHTML = data
    .map((f) => `<option value="${f.id}">${escapeHtml(f.nome)}${f.cargo ? ' - ' + escapeHtml(f.cargo) : ''}</option>`)
    .join('');

  await updatePontoStatus();
}

async function updatePontoStatus() {
  const statusEl = document.getElementById('pontoFuncionarioStatus');
  const funcionarioId = pontoSelect.value;

  if (!funcionarioId) {
    statusEl.textContent = '-';
    return;
  }

  const today = todayISO();
  const { data } = await supabase
    .from('ponto_registros')
    .select('*')
    .eq('funcionario_id', funcionarioId)
    .eq('pessoa_tipo', 'funcionario')
    .gte('data_hora', `${today}T00:00:00`)
    .order('data_hora', { ascending: false })
    .limit(1);

  if (data && data.length) {
    const r = data[0];
    statusEl.innerHTML = `Último registro hoje: <strong>${PONTO_TIPO_LABELS[r.tipo] || r.tipo}</strong> às ${
      formatDateTime(r.data_hora).split(' ')[1]
    }`;
  } else {
    statusEl.textContent = 'Nenhum registro hoje.';
  }
}

async function registrarPonto(tipo) {
  const pontoAlert = document.getElementById('pontoAlert');
  const funcionarioId = pontoSelect.value;

  if (!funcionarioId) {
    showMessage(pontoAlert, 'Selecione um funcionário.', 'error');
    return;
  }

  const observacoes = document.getElementById('pontoObs').value.trim();

  const { error } = await supabase.from('ponto_registros').insert({
    pessoa_tipo: 'funcionario',
    funcionario_id: funcionarioId,
    tipo,
    observacoes: observacoes || null,
  });

  if (error) {
    showMessage(pontoAlert, `Erro: ${error.message}`, 'error');
    return;
  }

  showMessage(pontoAlert, `${PONTO_TIPO_LABELS[tipo]} registrada com sucesso!`, 'success');
  document.getElementById('pontoObs').value = '';
  await updatePontoStatus();
}

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
