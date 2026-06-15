// =====================================================================
// Logica da pagina de Entregas / Coletas Esperadas
// =====================================================================
import { supabase } from '../shared/supabaseClient.js';
import { formatDateOnly, todayISO, addDaysISO, badgeHtml, escapeHtml, showMessage } from '../shared/utils.js';

let currentUser = null;
let entregasCache = [];
let editingId = null;

export async function initEntregas(auth) {
  currentUser = auth.user;

  const today = todayISO();
  document.getElementById('dataPrevista').value = today;
  document.getElementById('filtroDataInicio').value = today;
  document.getElementById('filtroDataFim').value = addDaysISO(today, 7);

  document.getElementById('entregaForm').addEventListener('submit', handleFormSubmit);
  document.getElementById('filtrar').addEventListener('click', loadEntregas);
  document.getElementById('limparFiltros').addEventListener('click', () => {
    document.getElementById('filtroDataInicio').value = today;
    document.getElementById('filtroDataFim').value = addDaysISO(today, 7);
    document.getElementById('filtroStatus').value = '';
    document.getElementById('filtroTipo').value = '';
    loadEntregas();
  });

  document.getElementById('closeEditModal').addEventListener('click', closeEditModal);
  document.getElementById('cancelEdit').addEventListener('click', closeEditModal);
  document.getElementById('editForm').addEventListener('submit', handleEditSubmit);
  document.getElementById('deleteEntrega').addEventListener('click', handleDelete);

  await Promise.all([loadTransportadoras(), loadEntregas()]);
}

async function loadTransportadoras() {
  const { data } = await supabase.from('transportadoras').select('nome').order('nome');
  const datalist = document.getElementById('transportadorasListEntregas');
  datalist.innerHTML = (data || []).map((t) => `<option value="${escapeHtml(t.nome)}"></option>`).join('');
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const alertBox = document.getElementById('entregaAlert');
  const submitBtn = e.target.querySelector('button[type="submit"]');

  const dataPrevista = document.getElementById('dataPrevista').value;
  if (!dataPrevista) {
    showMessage(alertBox, 'Informe a data prevista.', 'error');
    return;
  }

  const payload = {
    data_prevista: dataPrevista,
    hora_prevista: document.getElementById('horaPrevista').value || null,
    tipo: document.getElementById('tipo').value,
    transportadora: document.getElementById('transportadoraEntrega').value.trim() || null,
    placa_prevista: document.getElementById('placaPrevista').value.trim().toUpperCase() || null,
    documento: document.getElementById('documentoEntrega').value.trim() || null,
    fornecedor_cliente: document.getElementById('fornecedorCliente').value.trim() || null,
    observacoes: document.getElementById('observacoesEntrega').value.trim() || null,
    created_by: currentUser.id,
  };

  submitBtn.disabled = true;
  const { error } = await supabase.from('entregas').insert(payload);
  submitBtn.disabled = false;

  if (error) {
    showMessage(alertBox, `Erro ao cadastrar: ${error.message}`, 'error');
    return;
  }

  showMessage(alertBox, 'Entrega/coleta cadastrada com sucesso!', 'success');
  e.target.reset();
  document.getElementById('dataPrevista').value = todayISO();
  await loadEntregas();
}

async function loadEntregas() {
  const tbody = document.getElementById('entregasBody');
  tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Carregando...</td></tr>';

  const dataInicio = document.getElementById('filtroDataInicio').value;
  const dataFim = document.getElementById('filtroDataFim').value;
  const status = document.getElementById('filtroStatus').value;
  const tipo = document.getElementById('filtroTipo').value;

  let query = supabase
    .from('entregas')
    .select('*')
    .order('data_prevista', { ascending: true })
    .order('hora_prevista', { ascending: true, nullsFirst: false });

  if (dataInicio) query = query.gte('data_prevista', dataInicio);
  if (dataFim) query = query.lte('data_prevista', dataFim);
  if (status) query = query.eq('status', status);
  if (tipo) query = query.eq('tipo', tipo);

  const { data, error } = await query;

  if (error) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Erro: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  entregasCache = data || [];

  if (!entregasCache.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Nenhuma entrega/coleta encontrada para o período.</td></tr>';
    return;
  }

  tbody.innerHTML = entregasCache
    .map(
      (e) => `
    <tr>
      <td>${formatDateOnly(e.data_prevista)}</td>
      <td>${e.hora_prevista ? e.hora_prevista.slice(0, 5) : '-'}</td>
      <td>${badgeHtml(e.tipo)}</td>
      <td>${escapeHtml(e.transportadora || '-')}</td>
      <td>${escapeHtml(e.placa_prevista || '-')}</td>
      <td>${escapeHtml(e.documento || '-')}</td>
      <td>${escapeHtml(e.fornecedor_cliente || '-')}</td>
      <td>${badgeHtml(e.status)}</td>
      <td class="table-actions">
        <button class="btn btn-secondary btn-sm" data-edit="${e.id}">Editar</button>
        ${
          e.status === 'pendente' || e.status === 'em_andamento'
            ? `<button class="btn btn-danger btn-sm" data-cancel="${e.id}">Cancelar</button>`
            : ''
        }
      </td>
    </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => openEditModal(btn.dataset.edit))
  );
  tbody.querySelectorAll('[data-cancel]').forEach((btn) =>
    btn.addEventListener('click', () => handleCancel(btn.dataset.cancel))
  );
}

async function handleCancel(id) {
  if (!confirm('Cancelar esta entrega/coleta?')) return;
  await supabase.from('entregas').update({ status: 'cancelada' }).eq('id', id);
  await loadEntregas();
}

function openEditModal(id) {
  const entrega = entregasCache.find((e) => e.id === id);
  if (!entrega) return;
  editingId = id;

  document.getElementById('editAlert').style.display = 'none';
  document.getElementById('editDataPrevista').value = entrega.data_prevista;
  document.getElementById('editHoraPrevista').value = entrega.hora_prevista ? entrega.hora_prevista.slice(0, 5) : '';
  document.getElementById('editTipo').value = entrega.tipo;
  document.getElementById('editStatus').value = entrega.status;
  document.getElementById('editTransportadora').value = entrega.transportadora || '';
  document.getElementById('editPlacaPrevista').value = entrega.placa_prevista || '';
  document.getElementById('editDocumento').value = entrega.documento || '';
  document.getElementById('editFornecedorCliente').value = entrega.fornecedor_cliente || '';
  document.getElementById('editObservacoes').value = entrega.observacoes || '';

  document.getElementById('editModal').classList.add('open');
}

function closeEditModal() {
  editingId = null;
  document.getElementById('editModal').classList.remove('open');
}

async function handleEditSubmit(e) {
  e.preventDefault();
  if (!editingId) return;

  const alertBox = document.getElementById('editAlert');
  const payload = {
    data_prevista: document.getElementById('editDataPrevista').value,
    hora_prevista: document.getElementById('editHoraPrevista').value || null,
    tipo: document.getElementById('editTipo').value,
    status: document.getElementById('editStatus').value,
    transportadora: document.getElementById('editTransportadora').value.trim() || null,
    placa_prevista: document.getElementById('editPlacaPrevista').value.trim().toUpperCase() || null,
    documento: document.getElementById('editDocumento').value.trim() || null,
    fornecedor_cliente: document.getElementById('editFornecedorCliente').value.trim() || null,
    observacoes: document.getElementById('editObservacoes').value.trim() || null,
  };

  const { error } = await supabase.from('entregas').update(payload).eq('id', editingId);

  if (error) {
    showMessage(alertBox, `Erro ao salvar: ${error.message}`, 'error');
    return;
  }

  closeEditModal();
  await loadEntregas();
}

async function handleDelete() {
  if (!editingId) return;
  if (!confirm('Tem certeza que deseja excluir definitivamente este registro?')) return;

  const { error } = await supabase.from('entregas').delete().eq('id', editingId);
  if (error) {
    showMessage(document.getElementById('editAlert'), `Erro ao excluir: ${error.message}`, 'error');
    return;
  }

  closeEditModal();
  await loadEntregas();
}
