// =====================================================================
// Logica da pagina de Cadastros (funcionarios, transportadoras, usuarios)
// =====================================================================
import { supabase } from './supabaseClient.js';
import { badgeHtml, escapeHtml, showMessage } from './utils.js';

let currentUser = null;
let funcionariosCache = [];
let transportadorasCache = [];
let usuariosCache = [];
let editingFuncionarioId = null;
let editingTransportadoraId = null;
let editingUsuarioId = null;

export async function initCadastros(auth) {
  currentUser = auth.user;

  setupTabs();

  document.getElementById('funcionarioForm').addEventListener('submit', handleFuncionarioSubmit);
  document.getElementById('closeFuncionarioModal').addEventListener('click', closeFuncionarioModal);
  document.getElementById('cancelFuncionarioEdit').addEventListener('click', closeFuncionarioModal);
  document.getElementById('funcionarioEditForm').addEventListener('submit', handleFuncionarioEditSubmit);
  document.getElementById('deleteFuncionario').addEventListener('click', handleFuncionarioDelete);

  document.getElementById('transportadoraForm').addEventListener('submit', handleTransportadoraSubmit);
  document.getElementById('closeTransportadoraModal').addEventListener('click', closeTransportadoraModal);
  document.getElementById('cancelTransportadoraEdit').addEventListener('click', closeTransportadoraModal);
  document.getElementById('transportadoraEditForm').addEventListener('submit', handleTransportadoraEditSubmit);
  document.getElementById('deleteTransportadora').addEventListener('click', handleTransportadoraDelete);

  document.getElementById('closeUsuarioModal').addEventListener('click', closeUsuarioModal);
  document.getElementById('cancelUsuarioEdit').addEventListener('click', closeUsuarioModal);
  document.getElementById('usuarioEditForm').addEventListener('submit', handleUsuarioEditSubmit);

  await Promise.all([loadFuncionarios(), loadTransportadoras(), loadUsuarios()]);
}

function setupTabs() {
  const buttons = document.querySelectorAll('.tab-button');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

// ---------------------------------------------------------------- //
// Funcionarios                                                       //
// ---------------------------------------------------------------- //

async function handleFuncionarioSubmit(e) {
  e.preventDefault();
  const alertBox = document.getElementById('funcionarioAlert');
  const submitBtn = e.target.querySelector('button[type="submit"]');

  const nome = document.getElementById('funcNome').value.trim();
  if (!nome) {
    showMessage(alertBox, 'Informe o nome do funcionário.', 'error');
    return;
  }

  const payload = {
    nome,
    cargo: document.getElementById('funcCargo').value.trim() || null,
  };

  submitBtn.disabled = true;
  const { error } = await supabase.from('funcionarios').insert(payload);
  submitBtn.disabled = false;

  if (error) {
    showMessage(alertBox, `Erro ao cadastrar: ${error.message}`, 'error');
    return;
  }

  showMessage(alertBox, 'Funcionário cadastrado com sucesso!', 'success');
  e.target.reset();
  await loadFuncionarios();
}

async function loadFuncionarios() {
  const tbody = document.getElementById('funcionariosBody');
  tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Carregando...</td></tr>';

  const { data, error } = await supabase.from('funcionarios').select('*').order('nome');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Erro: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  funcionariosCache = data || [];

  if (!funcionariosCache.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Nenhum funcionário cadastrado.</td></tr>';
    return;
  }

  tbody.innerHTML = funcionariosCache
    .map(
      (f) => `
    <tr>
      <td>${escapeHtml(f.nome)}</td>
      <td>${escapeHtml(f.cargo || '-')}</td>
      <td><span class="badge ${f.ativo ? 'badge-verde' : 'badge-cinza'}">${f.ativo ? 'Ativo' : 'Inativo'}</span></td>
      <td class="table-actions">
        <button class="btn btn-secondary btn-sm" data-edit="${f.id}">Editar</button>
      </td>
    </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => openFuncionarioModal(btn.dataset.edit))
  );
}

function openFuncionarioModal(id) {
  const f = funcionariosCache.find((x) => x.id === id);
  if (!f) return;
  editingFuncionarioId = id;

  document.getElementById('editFuncNome').value = f.nome;
  document.getElementById('editFuncCargo').value = f.cargo || '';
  document.getElementById('editFuncAtivo').checked = !!f.ativo;

  document.getElementById('funcionarioModal').classList.add('open');
}

function closeFuncionarioModal() {
  editingFuncionarioId = null;
  document.getElementById('funcionarioModal').classList.remove('open');
}

async function handleFuncionarioEditSubmit(e) {
  e.preventDefault();
  if (!editingFuncionarioId) return;

  const nome = document.getElementById('editFuncNome').value.trim();
  if (!nome) return;

  const payload = {
    nome,
    cargo: document.getElementById('editFuncCargo').value.trim() || null,
    ativo: document.getElementById('editFuncAtivo').checked,
  };

  const { error } = await supabase.from('funcionarios').update(payload).eq('id', editingFuncionarioId);

  if (error) {
    alert(`Erro ao salvar: ${error.message}`);
    return;
  }

  closeFuncionarioModal();
  await loadFuncionarios();
}

async function handleFuncionarioDelete() {
  if (!editingFuncionarioId) return;
  if (!confirm('Tem certeza que deseja excluir definitivamente este funcionário?')) return;

  const { error } = await supabase.from('funcionarios').delete().eq('id', editingFuncionarioId);
  if (error) {
    alert(`Erro ao excluir: ${error.message}`);
    return;
  }

  closeFuncionarioModal();
  await loadFuncionarios();
}

// ---------------------------------------------------------------- //
// Transportadoras                                                    //
// ---------------------------------------------------------------- //

async function handleTransportadoraSubmit(e) {
  e.preventDefault();
  const alertBox = document.getElementById('transportadoraAlert');
  const submitBtn = e.target.querySelector('button[type="submit"]');

  const nome = document.getElementById('transpNome').value.trim();
  if (!nome) {
    showMessage(alertBox, 'Informe o nome da transportadora.', 'error');
    return;
  }

  const payload = {
    nome,
    cnpj: document.getElementById('transpCnpj').value.trim() || null,
  };

  submitBtn.disabled = true;
  const { error } = await supabase.from('transportadoras').insert(payload);
  submitBtn.disabled = false;

  if (error) {
    showMessage(alertBox, `Erro ao cadastrar: ${error.message}`, 'error');
    return;
  }

  showMessage(alertBox, 'Transportadora cadastrada com sucesso!', 'success');
  e.target.reset();
  await loadTransportadoras();
}

async function loadTransportadoras() {
  const tbody = document.getElementById('transportadorasBody');
  tbody.innerHTML = '<tr><td colspan="3" class="empty-state">Carregando...</td></tr>';

  const { data, error } = await supabase.from('transportadoras').select('*').order('nome');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-state">Erro: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  transportadorasCache = data || [];

  if (!transportadorasCache.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">Nenhuma transportadora cadastrada.</td></tr>';
    return;
  }

  tbody.innerHTML = transportadorasCache
    .map(
      (t) => `
    <tr>
      <td>${escapeHtml(t.nome)}</td>
      <td>${escapeHtml(t.cnpj || '-')}</td>
      <td class="table-actions">
        <button class="btn btn-secondary btn-sm" data-edit="${t.id}">Editar</button>
      </td>
    </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => openTransportadoraModal(btn.dataset.edit))
  );
}

function openTransportadoraModal(id) {
  const t = transportadorasCache.find((x) => x.id === id);
  if (!t) return;
  editingTransportadoraId = id;

  document.getElementById('editTranspNome').value = t.nome;
  document.getElementById('editTranspCnpj').value = t.cnpj || '';

  document.getElementById('transportadoraModal').classList.add('open');
}

function closeTransportadoraModal() {
  editingTransportadoraId = null;
  document.getElementById('transportadoraModal').classList.remove('open');
}

async function handleTransportadoraEditSubmit(e) {
  e.preventDefault();
  if (!editingTransportadoraId) return;

  const nome = document.getElementById('editTranspNome').value.trim();
  if (!nome) return;

  const payload = {
    nome,
    cnpj: document.getElementById('editTranspCnpj').value.trim() || null,
  };

  const { error } = await supabase.from('transportadoras').update(payload).eq('id', editingTransportadoraId);

  if (error) {
    alert(`Erro ao salvar: ${error.message}`);
    return;
  }

  closeTransportadoraModal();
  await loadTransportadoras();
}

async function handleTransportadoraDelete() {
  if (!editingTransportadoraId) return;
  if (!confirm('Tem certeza que deseja excluir definitivamente esta transportadora?')) return;

  const { error } = await supabase.from('transportadoras').delete().eq('id', editingTransportadoraId);
  if (error) {
    alert(`Erro ao excluir: ${error.message}`);
    return;
  }

  closeTransportadoraModal();
  await loadTransportadoras();
}

// ---------------------------------------------------------------- //
// Usuarios                                                           //
// ---------------------------------------------------------------- //

async function loadUsuarios() {
  const tbody = document.getElementById('usuariosBody');
  tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Carregando...</td></tr>';

  const { data, error } = await supabase.from('profiles').select('*').order('nome');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Erro: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  usuariosCache = data || [];

  if (!usuariosCache.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhum usuário encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = usuariosCache
    .map(
      (u) => `
    <tr>
      <td>${escapeHtml(u.nome)}</td>
      <td>${escapeHtml(u.email || '-')}</td>
      <td>${badgeHtml(u.cargo)}</td>
      <td><span class="badge ${u.ativo ? 'badge-verde' : 'badge-cinza'}">${u.ativo ? 'Ativo' : 'Inativo'}</span></td>
      <td class="table-actions">
        <button class="btn btn-secondary btn-sm" data-edit="${u.id}">Editar</button>
      </td>
    </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => openUsuarioModal(btn.dataset.edit))
  );
}

function openUsuarioModal(id) {
  const u = usuariosCache.find((x) => x.id === id);
  if (!u) return;
  editingUsuarioId = id;

  document.getElementById('usuarioInfo').innerHTML = `
    <p><strong>Nome:</strong> ${escapeHtml(u.nome)}</p>
    <p><strong>Email:</strong> ${escapeHtml(u.email || '-')}</p>
  `;
  document.getElementById('editUsuarioCargo').value = u.cargo;
  document.getElementById('editUsuarioAtivo').checked = !!u.ativo;

  document.getElementById('usuarioModal').classList.add('open');
}

function closeUsuarioModal() {
  editingUsuarioId = null;
  document.getElementById('usuarioModal').classList.remove('open');
}

async function handleUsuarioEditSubmit(e) {
  e.preventDefault();
  if (!editingUsuarioId) return;

  const cargo = document.getElementById('editUsuarioCargo').value;
  const ativo = document.getElementById('editUsuarioAtivo').checked;

  if (editingUsuarioId === currentUser.id && (cargo !== 'admin' || !ativo)) {
    if (!confirm('Você está alterando seu próprio acesso e pode perder a permissão de administrador. Continuar?')) {
      return;
    }
  }

  const { error } = await supabase.from('profiles').update({ cargo, ativo }).eq('id', editingUsuarioId);

  if (error) {
    alert(`Erro ao salvar: ${error.message}`);
    return;
  }

  closeUsuarioModal();
  await loadUsuarios();
}
