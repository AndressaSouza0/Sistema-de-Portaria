// =====================================================================
// Logica da pagina de Bate-ponto (funcionarios e motoristas)
// =====================================================================
import { supabase } from './supabaseClient.js';
import { formatDateTime, todayISO, escapeHtml, showMessage } from './utils.js';

let currentUser = null;

const TIPO_LABELS = {
  entrada: 'Entrada',
  saida: 'Saída',
  pausa_inicio: 'Início de pausa',
  pausa_fim: 'Fim de pausa',
};

const TIPO_BADGE_CLASS = {
  entrada: 'badge-verde',
  saida: 'badge-vermelho',
  pausa_inicio: 'badge-amarelo',
  pausa_fim: 'badge-azul',
};

export async function initPonto(auth) {
  currentUser = auth.user;

  setupTabs();

  document.getElementById('filtroDataFuncionarios').value = todayISO();
  document.getElementById('filtroDataMotoristas').value = todayISO();

  document.getElementById('funcionarioSelect').addEventListener('change', updateFuncionarioStatus);
  document
    .querySelectorAll('[data-ponto-tipo]')
    .forEach((btn) => btn.addEventListener('click', () => registrarPontoFuncionario(btn.dataset.pontoTipo)));

  document.getElementById('veiculoPatioSelect').addEventListener('change', handleVeiculoSelectChange);
  document.getElementById('motoristaForm').addEventListener('submit', handleMotoristaSubmit);

  document.getElementById('filtrarFuncionarios').addEventListener('click', loadHistoricoFuncionarios);
  document.getElementById('filtrarMotoristas').addEventListener('click', loadHistoricoMotoristas);

  await Promise.all([loadFuncionariosOptions(), loadVisitasPatioOptions()]);
  await Promise.all([loadHistoricoFuncionarios(), loadHistoricoMotoristas(), updateFuncionarioStatus()]);
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

function tipoLabel(tipo) {
  return TIPO_LABELS[tipo] || tipo;
}

function tipoBadge(tipo) {
  const cls = TIPO_BADGE_CLASS[tipo] || 'badge-cinza';
  return `<span class="badge ${cls}">${tipoLabel(tipo)}</span>`;
}

// ---------------------------------------------------------------- //
// Funcionarios                                                       //
// ---------------------------------------------------------------- //

async function loadFuncionariosOptions() {
  const { data } = await supabase.from('funcionarios').select('*').eq('ativo', true).order('nome');
  const select = document.getElementById('funcionarioSelect');

  if (!data || !data.length) {
    select.innerHTML = '<option value="">Nenhum funcionário cadastrado</option>';
    return;
  }

  select.innerHTML = data
    .map((f) => `<option value="${f.id}">${escapeHtml(f.nome)}${f.cargo ? ' - ' + escapeHtml(f.cargo) : ''}</option>`)
    .join('');
}

async function updateFuncionarioStatus() {
  const funcionarioId = document.getElementById('funcionarioSelect').value;
  const statusEl = document.getElementById('funcionarioStatus');
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
    statusEl.innerHTML = `Último registro hoje: <strong>${tipoLabel(r.tipo)}</strong> às ${formatDateTime(r.data_hora).split(' ')[1]}`;
  } else {
    statusEl.textContent = 'Nenhum registro hoje.';
  }
}

async function registrarPontoFuncionario(tipo) {
  const alertBox = document.getElementById('funcionarioAlert');
  const funcionarioId = document.getElementById('funcionarioSelect').value;

  if (!funcionarioId) {
    showMessage(alertBox, 'Selecione um funcionário.', 'error');
    return;
  }

  const observacoes = document.getElementById('funcionarioObs').value.trim();

  const { error } = await supabase.from('ponto_registros').insert({
    pessoa_tipo: 'funcionario',
    funcionario_id: funcionarioId,
    tipo,
    observacoes: observacoes || null,
    registrado_por: currentUser.id,
  });

  if (error) {
    showMessage(alertBox, `Erro: ${error.message}`, 'error');
    return;
  }

  showMessage(alertBox, `${tipoLabel(tipo)} registrada com sucesso!`, 'success');
  document.getElementById('funcionarioObs').value = '';
  await Promise.all([updateFuncionarioStatus(), loadHistoricoFuncionarios()]);
}

async function loadHistoricoFuncionarios() {
  const tbody = document.getElementById('historicoFuncionariosBody');
  tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Carregando...</td></tr>';

  const data_filtro = document.getElementById('filtroDataFuncionarios').value || todayISO();

  const { data, error } = await supabase
    .from('ponto_registros')
    .select('*, funcionarios(nome)')
    .eq('pessoa_tipo', 'funcionario')
    .gte('data_hora', `${data_filtro}T00:00:00`)
    .lte('data_hora', `${data_filtro}T23:59:59`)
    .order('data_hora', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Erro: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Nenhum registro neste dia.</td></tr>';
    return;
  }

  tbody.innerHTML = data
    .map(
      (r) => `
    <tr>
      <td>${escapeHtml(r.funcionarios?.nome || '-')}</td>
      <td>${tipoBadge(r.tipo)}</td>
      <td>${formatDateTime(r.data_hora)}</td>
      <td>${escapeHtml(r.observacoes || '-')}</td>
    </tr>`
    )
    .join('');
}

// ---------------------------------------------------------------- //
// Motoristas                                                         //
// ---------------------------------------------------------------- //

async function loadVisitasPatioOptions() {
  const { data } = await supabase
    .from('visitas')
    .select('id, placa, motorista_nome, motorista_documento')
    .eq('status', 'no_patio')
    .order('entrada_at', { ascending: false });

  const select = document.getElementById('veiculoPatioSelect');
  select.innerHTML =
    '<option value="">Registro manual (sem veículo)</option>' +
    (data || [])
      .map(
        (v) =>
          `<option value="${v.id}" data-nome="${escapeHtml(v.motorista_nome || '')}" data-doc="${escapeHtml(
            v.motorista_documento || ''
          )}">${escapeHtml(v.placa)} - ${escapeHtml(v.motorista_nome || 'sem motorista')}</option>`
      )
      .join('');
}

function handleVeiculoSelectChange() {
  const select = document.getElementById('veiculoPatioSelect');
  const opt = select.options[select.selectedIndex];
  const nomeInput = document.getElementById('motoristaNomePonto');
  const docInput = document.getElementById('motoristaDocPonto');

  if (select.value) {
    nomeInput.value = opt.dataset.nome || '';
    docInput.value = opt.dataset.doc || '';
    nomeInput.readOnly = true;
    docInput.readOnly = true;
  } else {
    nomeInput.value = '';
    docInput.value = '';
    nomeInput.readOnly = false;
    docInput.readOnly = false;
  }
}

async function handleMotoristaSubmit(e) {
  e.preventDefault();
  const alertBox = document.getElementById('motoristaAlert');
  const submitBtn = e.target.querySelector('button[type="submit"]');

  const visitaId = document.getElementById('veiculoPatioSelect').value || null;
  const nome = document.getElementById('motoristaNomePonto').value.trim();
  const documento = document.getElementById('motoristaDocPonto').value.trim();
  const tipo = document.getElementById('tipoPontoMotorista').value;
  const observacoes = document.getElementById('motoristaObs').value.trim();

  if (!visitaId && !nome) {
    showMessage(alertBox, 'Selecione um veículo no pátio ou informe o nome do motorista.', 'error');
    return;
  }

  submitBtn.disabled = true;
  const { error } = await supabase.from('ponto_registros').insert({
    pessoa_tipo: 'motorista',
    motorista_nome: nome || null,
    motorista_documento: documento || null,
    visita_id: visitaId,
    tipo,
    observacoes: observacoes || null,
    registrado_por: currentUser.id,
  });
  submitBtn.disabled = false;

  if (error) {
    showMessage(alertBox, `Erro: ${error.message}`, 'error');
    return;
  }

  showMessage(alertBox, 'Ponto do motorista registrado com sucesso!', 'success');
  e.target.reset();
  document.getElementById('motoristaNomePonto').readOnly = false;
  document.getElementById('motoristaDocPonto').readOnly = false;
  await loadHistoricoMotoristas();
}

async function loadHistoricoMotoristas() {
  const tbody = document.getElementById('historicoMotoristasBody');
  tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Carregando...</td></tr>';

  const data_filtro = document.getElementById('filtroDataMotoristas').value || todayISO();

  const { data, error } = await supabase
    .from('ponto_registros')
    .select('*, visitas(placa)')
    .eq('pessoa_tipo', 'motorista')
    .gte('data_hora', `${data_filtro}T00:00:00`)
    .lte('data_hora', `${data_filtro}T23:59:59`)
    .order('data_hora', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Erro: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhum registro neste dia.</td></tr>';
    return;
  }

  tbody.innerHTML = data
    .map(
      (r) => `
    <tr>
      <td>${escapeHtml(r.motorista_nome || '-')}</td>
      <td>${escapeHtml(r.motorista_documento || '-')}</td>
      <td>${escapeHtml(r.visitas?.placa || '-')}</td>
      <td>${tipoBadge(r.tipo)}</td>
      <td>${formatDateTime(r.data_hora)}</td>
    </tr>`
    )
    .join('');
}
