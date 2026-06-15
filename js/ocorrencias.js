// =====================================================================
// Logica da pagina de Ocorrencias
// =====================================================================
import { supabase } from './supabaseClient.js';
import { formatDateTime, todayISO, daysAgoISO, badgeHtml, escapeHtml, showMessage, uploadFoto } from './utils.js';

let currentUser = null;
let ocorrenciasCache = [];
let detalheId = null;
let fotoFile = null;

export async function initOcorrencias(auth) {
  currentUser = auth.user;

  document.getElementById('filtroDataInicio').value = daysAgoISO(7);
  document.getElementById('filtroDataFim').value = todayISO();

  document.getElementById('ocorrenciaForm').addEventListener('submit', handleFormSubmit);
  document.getElementById('fotoOcorrencia').addEventListener('change', handleFotoChange);
  document.getElementById('visitaRelacionada').addEventListener('change', handleVisitaChange);

  document.getElementById('filtrar').addEventListener('click', loadOcorrencias);
  document.getElementById('limparFiltros').addEventListener('click', () => {
    document.getElementById('filtroDataInicio').value = daysAgoISO(7);
    document.getElementById('filtroDataFim').value = todayISO();
    document.getElementById('filtroStatus').value = '';
    document.getElementById('filtroGravidade').value = '';
    document.getElementById('filtroTipo').value = '';
    loadOcorrencias();
  });

  document.getElementById('closeDetalheModal').addEventListener('click', closeDetalheModal);
  document.getElementById('cancelDetalhe').addEventListener('click', closeDetalheModal);
  document.getElementById('resolverBtn').addEventListener('click', handleResolver);
  document.getElementById('reabrirBtn').addEventListener('click', handleReabrir);

  await Promise.all([loadVisitasPatioOptions(), loadOcorrencias()]);
}

async function loadVisitasPatioOptions() {
  const { data } = await supabase
    .from('visitas')
    .select('id, placa, motorista_nome')
    .eq('status', 'no_patio')
    .order('entrada_at', { ascending: false });

  const select = document.getElementById('visitaRelacionada');
  select.innerHTML =
    '<option value="">Nenhum (não vinculado)</option>' +
    (data || [])
      .map(
        (v) =>
          `<option value="${v.id}" data-placa="${escapeHtml(v.placa)}">${escapeHtml(v.placa)} - ${escapeHtml(
            v.motorista_nome || 'sem motorista'
          )}</option>`
      )
      .join('');
}

function handleVisitaChange(e) {
  const opt = e.target.selectedOptions[0];
  const placaInput = document.getElementById('placaOcorrencia');
  if (opt?.dataset.placa && !placaInput.value) {
    placaInput.value = opt.dataset.placa;
  }
}

function handleFotoChange(e) {
  const file = e.target.files[0];
  const preview = document.getElementById('fotoPreview');

  if (!file) {
    fotoFile = null;
    preview.style.display = 'none';
    preview.src = '';
    return;
  }

  fotoFile = file;
  preview.src = URL.createObjectURL(file);
  preview.style.display = 'block';
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const alertBox = document.getElementById('ocorrenciaAlert');
  const submitBtn = form.querySelector('button[type="submit"]');

  const descricao = document.getElementById('descricao').value.trim();
  if (!descricao) {
    showMessage(alertBox, 'Informe a descrição da ocorrência.', 'error');
    return;
  }

  const payload = {
    tipo: document.getElementById('tipoOcorrencia').value,
    gravidade: document.getElementById('gravidade').value,
    placa: document.getElementById('placaOcorrencia').value.trim().toUpperCase() || null,
    visita_id: document.getElementById('visitaRelacionada').value || null,
    descricao,
    registrado_por: currentUser.id,
  };

  submitBtn.disabled = true;

  if (fotoFile) {
    try {
      payload.foto_url = await uploadFoto(supabase, 'ocorrencias', fotoFile);
    } catch (err) {
      showMessage(alertBox, `Erro ao enviar foto: ${err.message}`, 'error');
      submitBtn.disabled = false;
      return;
    }
  }

  const { error } = await supabase.from('ocorrencias').insert(payload);

  submitBtn.disabled = false;

  if (error) {
    showMessage(alertBox, `Erro ao registrar ocorrência: ${error.message}`, 'error');
    return;
  }

  showMessage(alertBox, 'Ocorrência registrada com sucesso!', 'success');
  form.reset();
  document.getElementById('gravidade').value = 'media';
  document.getElementById('fotoPreview').style.display = 'none';
  fotoFile = null;

  await loadOcorrencias();
}

async function loadOcorrencias() {
  const tbody = document.getElementById('ocorrenciasBody');
  tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Carregando...</td></tr>';

  const dataInicio = document.getElementById('filtroDataInicio').value;
  const dataFim = document.getElementById('filtroDataFim').value;
  const status = document.getElementById('filtroStatus').value;
  const gravidade = document.getElementById('filtroGravidade').value;
  const tipo = document.getElementById('filtroTipo').value;

  let query = supabase.from('ocorrencias').select('*').order('data_hora', { ascending: false });

  if (dataInicio) query = query.gte('data_hora', `${dataInicio}T00:00:00`);
  if (dataFim) query = query.lte('data_hora', `${dataFim}T23:59:59`);
  if (status) query = query.eq('status', status);
  if (gravidade) query = query.eq('gravidade', gravidade);
  if (tipo) query = query.eq('tipo', tipo);

  const { data, error } = await query;

  if (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Erro: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  ocorrenciasCache = data || [];

  if (!ocorrenciasCache.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Nenhuma ocorrência encontrada para o período.</td></tr>';
    return;
  }

  tbody.innerHTML = ocorrenciasCache
    .map(
      (o) => `
    <tr>
      <td>${formatDateTime(o.data_hora)}</td>
      <td>${badgeHtml(o.tipo)}</td>
      <td>${badgeHtml(o.gravidade)}</td>
      <td>${escapeHtml(o.descricao)}</td>
      <td>${escapeHtml(o.placa || '-')}</td>
      <td>${badgeHtml(o.status)}</td>
      <td class="table-actions">
        <button class="btn btn-secondary btn-sm" data-detalhe="${o.id}">Detalhes</button>
      </td>
    </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-detalhe]').forEach((btn) =>
    btn.addEventListener('click', () => openDetalheModal(btn.dataset.detalhe))
  );
}

function openDetalheModal(id) {
  const o = ocorrenciasCache.find((x) => x.id === id);
  if (!o) return;

  detalheId = id;

  document.getElementById('detalheInfo').innerHTML = `
    <p><strong>Data/Hora:</strong> ${formatDateTime(o.data_hora)}</p>
    <p><strong>Tipo:</strong> ${badgeHtml(o.tipo)}</p>
    <p><strong>Gravidade:</strong> ${badgeHtml(o.gravidade)}</p>
    <p><strong>Placa:</strong> ${escapeHtml(o.placa || '-')}</p>
    <p><strong>Descrição:</strong> ${escapeHtml(o.descricao)}</p>
    ${
      o.foto_url
        ? `<p><img src="${escapeHtml(o.foto_url)}" alt="Foto da ocorrência" style="max-width: 100%; border-radius: 8px; border: 1px solid var(--color-border);" /></p>`
        : ''
    }
    <p><strong>Status:</strong> ${badgeHtml(o.status)}</p>
  `;

  const resolverSection = document.getElementById('resolverSection');
  const resolvidaInfo = document.getElementById('resolvidaInfo');
  const resolverBtn = document.getElementById('resolverBtn');
  const reabrirBtn = document.getElementById('reabrirBtn');

  document.getElementById('resolucaoTexto').value = '';

  if (o.status === 'resolvida') {
    resolverSection.style.display = 'none';
    resolverBtn.style.display = 'none';
    reabrirBtn.style.display = '';
    resolvidaInfo.innerHTML = `
      <p><strong>Resolução:</strong> ${escapeHtml(o.resolucao || '-')}</p>
      <p><strong>Resolvida em:</strong> ${formatDateTime(o.resolvido_at)}</p>
    `;
  } else {
    resolverSection.style.display = '';
    resolverBtn.style.display = '';
    reabrirBtn.style.display = 'none';
    resolvidaInfo.innerHTML = '';
  }

  document.getElementById('detalheModal').classList.add('open');
}

function closeDetalheModal() {
  detalheId = null;
  document.getElementById('detalheModal').classList.remove('open');
}

async function handleResolver() {
  if (!detalheId) return;

  const resolucao = document.getElementById('resolucaoTexto').value.trim();
  if (!resolucao) {
    alert('Descreva como a ocorrência foi resolvida.');
    return;
  }

  const btn = document.getElementById('resolverBtn');
  btn.disabled = true;

  const { error } = await supabase
    .from('ocorrencias')
    .update({
      status: 'resolvida',
      resolucao,
      resolvido_por: currentUser.id,
      resolvido_at: new Date().toISOString(),
    })
    .eq('id', detalheId);

  btn.disabled = false;

  if (error) {
    alert(`Erro ao salvar: ${error.message}`);
    return;
  }

  closeDetalheModal();
  await loadOcorrencias();
}

async function handleReabrir() {
  if (!detalheId) return;
  if (!confirm('Reabrir esta ocorrência?')) return;

  const btn = document.getElementById('reabrirBtn');
  btn.disabled = true;

  const { error } = await supabase
    .from('ocorrencias')
    .update({ status: 'aberta', resolucao: null, resolvido_por: null, resolvido_at: null })
    .eq('id', detalheId);

  btn.disabled = false;

  if (error) {
    alert(`Erro ao salvar: ${error.message}`);
    return;
  }

  closeDetalheModal();
  await loadOcorrencias();
}
