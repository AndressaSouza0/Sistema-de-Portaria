// =====================================================================
// Logica da pagina de Entrada / Saida de caminhoes
// =====================================================================
import { supabase } from './supabaseClient.js';
import { formatDateTime, formatDuration, todayISO, badgeHtml, escapeHtml, showMessage } from './utils.js';

let currentUser = null;
let saidaVisitaId = null;

export async function initMovimentacao(auth) {
  currentUser = auth.user;

  await Promise.all([loadTransportadoras(), loadEntregasHojeOptions(), loadPatio(), loadHistoricoHoje()]);

  document.getElementById('entradaForm').addEventListener('submit', handleEntradaSubmit);
  document.getElementById('closeSaidaModal').addEventListener('click', closeSaidaModal);
  document.getElementById('cancelSaida').addEventListener('click', closeSaidaModal);
  document.getElementById('confirmSaida').addEventListener('click', handleConfirmSaida);
}

async function loadTransportadoras() {
  const { data } = await supabase.from('transportadoras').select('nome').order('nome');
  const datalist = document.getElementById('transportadorasList');
  datalist.innerHTML = (data || []).map((t) => `<option value="${escapeHtml(t.nome)}"></option>`).join('');
}

async function loadEntregasHojeOptions() {
  const today = todayISO();
  const { data } = await supabase
    .from('entregas')
    .select('*')
    .eq('data_prevista', today)
    .eq('status', 'pendente')
    .order('hora_prevista', { ascending: true, nullsFirst: false });

  const select = document.getElementById('entregaVinculada');
  const current = select.value;

  select.innerHTML =
    '<option value="">Nenhuma (não vinculado)</option>' +
    (data || [])
      .map((e) => {
        const hora = e.hora_prevista ? e.hora_prevista.slice(0, 5) : '--:--';
        const tipo = e.tipo === 'coleta' ? 'Coleta' : 'Entrega';
        const desc = `${hora} · ${tipo} · ${e.transportadora || 'Sem transportadora'} · ${e.documento || 'sem doc.'}`;
        return `<option value="${e.id}">${escapeHtml(desc)}</option>`;
      })
      .join('');

  select.value = current;
}

async function handleEntradaSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const alertBox = document.getElementById('entradaAlert');
  const submitBtn = form.querySelector('button[type="submit"]');

  const placa = document.getElementById('placa').value.trim().toUpperCase();
  const motoristaNome = document.getElementById('motoristaNome').value.trim();
  const motoristaDoc = document.getElementById('motoristaDoc').value.trim();
  const transportadora = document.getElementById('transportadora').value.trim();
  const tipoOperacao = document.getElementById('tipoOperacao').value;
  const documento = document.getElementById('documento').value.trim();
  const doca = document.getElementById('doca').value.trim();
  const entregaId = document.getElementById('entregaVinculada').value || null;
  const observacoes = document.getElementById('observacoes').value.trim();

  if (!placa) {
    showMessage(alertBox, 'Informe a placa do veículo.', 'error');
    return;
  }

  submitBtn.disabled = true;

  const { data: visita, error } = await supabase
    .from('visitas')
    .insert({
      placa,
      motorista_nome: motoristaNome || null,
      motorista_documento: motoristaDoc || null,
      transportadora: transportadora || null,
      tipo_operacao: tipoOperacao,
      documento: documento || null,
      doca: doca || null,
      observacoes: observacoes || null,
      entrega_id: entregaId,
      registrado_por: currentUser.id,
    })
    .select()
    .single();

  if (error) {
    showMessage(alertBox, `Erro ao registrar entrada: ${error.message}`, 'error');
    submitBtn.disabled = false;
    return;
  }

  if (entregaId) {
    await supabase.from('entregas').update({ status: 'em_andamento', visita_id: visita.id }).eq('id', entregaId);
  }

  showMessage(alertBox, 'Entrada registrada com sucesso!', 'success');
  form.reset();
  submitBtn.disabled = false;

  await Promise.all([loadPatio(), loadHistoricoHoje(), loadEntregasHojeOptions()]);
}

async function loadPatio() {
  const tbody = document.getElementById('patioBody');
  const { data, error } = await supabase
    .from('visitas')
    .select('*')
    .eq('status', 'no_patio')
    .order('entrada_at', { ascending: true });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Erro: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Nenhum caminhão no pátio.</td></tr>';
    return;
  }

  tbody.innerHTML = data
    .map(
      (v) => `
    <tr>
      <td><strong>${escapeHtml(v.placa)}</strong></td>
      <td>${escapeHtml(v.motorista_nome || '-')}</td>
      <td>${escapeHtml(v.transportadora || '-')}</td>
      <td>${badgeHtml(v.tipo_operacao)}</td>
      <td>${escapeHtml(v.documento || '-')}</td>
      <td>${escapeHtml(v.doca || '-')}</td>
      <td>${formatDateTime(v.entrada_at)}</td>
      <td>${formatDuration(v.entrada_at)}</td>
      <td class="table-actions">
        <button class="btn btn-success btn-sm" data-saida="${v.id}" data-placa="${escapeHtml(v.placa)}">Registrar Saída</button>
      </td>
    </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-saida]').forEach((btn) => {
    btn.addEventListener('click', () => openSaidaModal(btn.dataset.saida, btn.dataset.placa));
  });
}

async function loadHistoricoHoje() {
  const tbody = document.getElementById('historicoBody');
  const today = todayISO();
  const startOfDay = `${today}T00:00:00`;

  const { data, error } = await supabase
    .from('visitas')
    .select('*')
    .gte('entrada_at', startOfDay)
    .order('entrada_at', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Erro: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Nenhuma movimentação hoje.</td></tr>';
    return;
  }

  tbody.innerHTML = data
    .map(
      (v) => `
    <tr>
      <td><strong>${escapeHtml(v.placa)}</strong></td>
      <td>${escapeHtml(v.motorista_nome || '-')}</td>
      <td>${escapeHtml(v.transportadora || '-')}</td>
      <td>${badgeHtml(v.tipo_operacao)}</td>
      <td>${formatDateTime(v.entrada_at)}</td>
      <td>${v.saida_at ? formatDateTime(v.saida_at) : '-'}</td>
      <td>${formatDuration(v.entrada_at, v.saida_at)}</td>
      <td>${badgeHtml(v.status)}</td>
    </tr>`
    )
    .join('');
}

function openSaidaModal(visitaId, placa) {
  saidaVisitaId = visitaId;
  document.getElementById('saidaPlaca').textContent = placa;
  document.getElementById('saidaObs').value = '';
  document.getElementById('saidaModal').classList.add('open');
}

function closeSaidaModal() {
  saidaVisitaId = null;
  document.getElementById('saidaModal').classList.remove('open');
}

async function handleConfirmSaida() {
  if (!saidaVisitaId) return;
  const btn = document.getElementById('confirmSaida');
  btn.disabled = true;

  const obsExtra = document.getElementById('saidaObs').value.trim();

  const { data: visita, error: fetchError } = await supabase
    .from('visitas')
    .select('*')
    .eq('id', saidaVisitaId)
    .single();

  if (fetchError) {
    btn.disabled = false;
    closeSaidaModal();
    return;
  }

  const novaObs = obsExtra
    ? [visita.observacoes, `Saída: ${obsExtra}`].filter(Boolean).join(' | ')
    : visita.observacoes;

  const { error } = await supabase
    .from('visitas')
    .update({
      saida_at: new Date().toISOString(),
      status: 'finalizado',
      finalizado_por: currentUser.id,
      observacoes: novaObs,
    })
    .eq('id', saidaVisitaId);

  if (!error && visita.entrega_id) {
    await supabase.from('entregas').update({ status: 'concluida' }).eq('id', visita.entrega_id);
  }

  btn.disabled = false;
  closeSaidaModal();
  await Promise.all([loadPatio(), loadHistoricoHoje(), loadEntregasHojeOptions()]);
}
