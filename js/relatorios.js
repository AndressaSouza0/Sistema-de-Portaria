// =====================================================================
// Logica da pagina de Relatorios
// =====================================================================
import { supabase } from './supabaseClient.js';
import {
  formatDateTime,
  formatTime,
  formatDateOnly,
  formatDuration,
  todayISO,
  daysAgoISO,
  addDaysISO,
  badgeHtml,
  statusLabel,
  escapeHtml,
  exportToCSV,
} from './utils.js';

let chartMov;
let chartOcorr;
let movimentacoesCache = [];
let ocorrenciasCache = [];
let pontoCache = [];
let currentProfile = null;

export async function initRelatorios(profile) {
  currentProfile = profile;
  setupTabs();

  document.getElementById('relDataInicio').value = daysAgoISO(29);
  document.getElementById('relDataFim').value = todayISO();
  document.getElementById('diarioData').value = todayISO();

  document.getElementById('gerarRelatorio').addEventListener('click', gerarRelatorios);
  document.getElementById('exportMov').addEventListener('click', exportMovimentacoes);
  document.getElementById('exportOcorr').addEventListener('click', exportOcorrencias);
  document.getElementById('exportPonto').addEventListener('click', exportPonto);
  document.getElementById('gerarDiario').addEventListener('click', gerarRelatorioDiario);
  document.getElementById('imprimirDiario').addEventListener('click', () => window.print());

  await Promise.all([gerarRelatorios(), gerarRelatorioDiario()]);
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

async function gerarRelatorios() {
  const dataInicio = document.getElementById('relDataInicio').value;
  const dataFim = document.getElementById('relDataFim').value;

  if (!dataInicio || !dataFim) return;

  await Promise.all([
    loadMovimentacoes(dataInicio, dataFim),
    loadOcorrencias(dataInicio, dataFim),
    loadPonto(dataInicio, dataFim),
  ]);
}

// ---------------------------------------------------------------- //
// Movimentacoes                                                      //
// ---------------------------------------------------------------- //

async function loadMovimentacoes(dataInicio, dataFim) {
  const tbody = document.getElementById('movBody');
  tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Carregando...</td></tr>';

  const { data, error } = await supabase
    .from('visitas')
    .select('*')
    .gte('entrada_at', `${dataInicio}T00:00:00`)
    .lte('entrada_at', `${dataFim}T23:59:59`)
    .order('entrada_at', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Erro: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  movimentacoesCache = data || [];

  const total = movimentacoesCache.length;
  const noPatio = movimentacoesCache.filter((v) => v.status === 'no_patio').length;
  const finalizados = movimentacoesCache.filter((v) => v.saida_at);
  let avgMs = 0;
  if (finalizados.length) {
    const totalMs = finalizados.reduce((acc, v) => acc + (new Date(v.saida_at) - new Date(v.entrada_at)), 0);
    avgMs = totalMs / finalizados.length;
  }

  document.getElementById('movStats').innerHTML = `
    <div class="stat-card accent-azul">
      <div class="stat-label">Total de movimentações</div>
      <div class="stat-value">${total}</div>
    </div>
    <div class="stat-card accent-amarelo">
      <div class="stat-label">Ainda no pátio</div>
      <div class="stat-value">${noPatio}</div>
    </div>
    <div class="stat-card accent-verde">
      <div class="stat-label">Tempo médio de permanência</div>
      <div class="stat-value">${msToHoras(avgMs)}</div>
    </div>
  `;

  if (!total) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Nenhuma movimentação no período.</td></tr>';
  } else {
    tbody.innerHTML = movimentacoesCache
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

  renderChartMov(dataInicio, dataFim, movimentacoesCache);
}

function renderChartMov(dataInicio, dataFim, data) {
  const dias = listaDias(dataInicio, dataFim);
  const entradasMap = {};
  const saidasMap = {};
  dias.forEach((d) => {
    entradasMap[d] = 0;
    saidasMap[d] = 0;
  });

  data.forEach((v) => {
    const dE = (v.entrada_at || '').slice(0, 10);
    if (entradasMap[dE] !== undefined) entradasMap[dE]++;
    if (v.saida_at) {
      const dS = v.saida_at.slice(0, 10);
      if (saidasMap[dS] !== undefined) saidasMap[dS]++;
    }
  });

  const ctx = document.getElementById('chartMovPeriodo');
  if (chartMov) chartMov.destroy();
  chartMov = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dias.map(formatChartDate),
      datasets: [
        { label: 'Entradas', data: dias.map((d) => entradasMap[d]), backgroundColor: '#2563eb' },
        { label: 'Saídas', data: dias.map((d) => saidasMap[d]), backgroundColor: '#16a34a' },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function listaDias(inicio, fim) {
  const dias = [];
  let cursor = inicio;
  let guard = 0;
  while (cursor <= fim && guard < 366) {
    dias.push(cursor);
    cursor = addDaysISO(cursor, 1);
    guard++;
  }
  return dias;
}

function formatChartDate(isoDate) {
  const [, m, d] = isoDate.split('-');
  return `${d}/${m}`;
}

// ---------------------------------------------------------------- //
// Ocorrencias                                                        //
// ---------------------------------------------------------------- //

async function loadOcorrencias(dataInicio, dataFim) {
  const tbody = document.getElementById('ocorrBody');
  tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Carregando...</td></tr>';

  const { data, error } = await supabase
    .from('ocorrencias')
    .select('*')
    .gte('data_hora', `${dataInicio}T00:00:00`)
    .lte('data_hora', `${dataFim}T23:59:59`)
    .order('data_hora', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Erro: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  ocorrenciasCache = data || [];

  const total = ocorrenciasCache.length;
  const abertas = ocorrenciasCache.filter((o) => o.status === 'aberta').length;
  const resolvidas = total - abertas;

  document.getElementById('ocorrStats').innerHTML = `
    <div class="stat-card accent-azul">
      <div class="stat-label">Total de ocorrências</div>
      <div class="stat-value">${total}</div>
    </div>
    <div class="stat-card accent-vermelho">
      <div class="stat-label">Abertas</div>
      <div class="stat-value">${abertas}</div>
    </div>
    <div class="stat-card accent-verde">
      <div class="stat-label">Resolvidas</div>
      <div class="stat-value">${resolvidas}</div>
    </div>
  `;

  if (!total) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhuma ocorrência no período.</td></tr>';
  } else {
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
      </tr>`
      )
      .join('');
  }

  renderChartOcorr(ocorrenciasCache);
}

function renderChartOcorr(data) {
  const counts = {};
  data.forEach((o) => {
    counts[o.tipo] = (counts[o.tipo] || 0) + 1;
  });

  const labels = Object.keys(counts);
  const values = Object.values(counts);

  const ctx = document.getElementById('chartOcorrPeriodo');
  if (chartOcorr) chartOcorr.destroy();

  if (!labels.length) {
    chartOcorr = new Chart(ctx, {
      type: 'bar',
      data: { labels: ['Sem dados'], datasets: [{ label: 'Ocorrências', data: [0], backgroundColor: ['#e5e7eb'] }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
    return;
  }

  chartOcorr = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.map((t) => statusLabel(t)),
      datasets: [{ label: 'Ocorrências', data: values, backgroundColor: '#dc2626' }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

// ---------------------------------------------------------------- //
// Bate-ponto                                                         //
// ---------------------------------------------------------------- //

async function loadPonto(dataInicio, dataFim) {
  const tbody = document.getElementById('pontoBody');
  tbody.innerHTML = '<tr><td colspan="3" class="empty-state">Carregando...</td></tr>';

  const { data, error } = await supabase
    .from('ponto_registros')
    .select('*, funcionarios(nome)')
    .eq('pessoa_tipo', 'funcionario')
    .gte('data_hora', `${dataInicio}T00:00:00`)
    .lte('data_hora', `${dataFim}T23:59:59`)
    .order('data_hora', { ascending: true });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-state">Erro: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  pontoCache = calcularHoras(data || []);

  if (!pontoCache.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">Nenhum registro de ponto no período.</td></tr>';
    return;
  }

  tbody.innerHTML = pontoCache
    .map(
      (p) => `
    <tr>
      <td>${escapeHtml(p.funcionario)}</td>
      <td>${p.dias}</td>
      <td>${msToHoras(p.totalMs)}</td>
    </tr>`
    )
    .join('');
}

// Agrupa registros por funcionario e por dia, pareando entrada/saida
// e descontando os intervalos de pausa.
function calcularHoras(registros) {
  const porFuncionario = {};

  registros.forEach((r) => {
    if (!r.funcionario_id) return;
    const dia = r.data_hora.slice(0, 10);
    porFuncionario[r.funcionario_id] = porFuncionario[r.funcionario_id] || {
      nome: r.funcionarios?.nome || '-',
      dias: {},
    };
    porFuncionario[r.funcionario_id].dias[dia] = porFuncionario[r.funcionario_id].dias[dia] || [];
    porFuncionario[r.funcionario_id].dias[dia].push(r);
  });

  const resultado = [];
  for (const info of Object.values(porFuncionario)) {
    let totalMs = 0;
    let diasTrabalhados = 0;

    for (const recs of Object.values(info.dias)) {
      recs.sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));

      let entradaTime = null;
      let pausaInicio = null;
      let dayMs = 0;

      recs.forEach((r) => {
        const t = new Date(r.data_hora).getTime();
        if (r.tipo === 'entrada') {
          entradaTime = t;
        } else if (r.tipo === 'saida' && entradaTime !== null) {
          dayMs += t - entradaTime;
          entradaTime = null;
        } else if (r.tipo === 'pausa_inicio') {
          pausaInicio = t;
        } else if (r.tipo === 'pausa_fim' && pausaInicio !== null) {
          dayMs -= t - pausaInicio;
          pausaInicio = null;
        }
      });

      if (dayMs > 0) {
        totalMs += dayMs;
        diasTrabalhados++;
      }
    }

    resultado.push({ funcionario: info.nome, totalMs, dias: diasTrabalhados });
  }

  return resultado.sort((a, b) => a.funcionario.localeCompare(b.funcionario, 'pt-BR'));
}

function msToHoras(ms) {
  if (!ms || ms <= 0) return '0h 00min';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

// ---------------------------------------------------------------- //
// Exportacao CSV                                                     //
// ---------------------------------------------------------------- //

function exportMovimentacoes() {
  exportToCSV(
    'movimentacoes.csv',
    [
      { key: 'placa', label: 'Placa' },
      { key: 'motorista_nome', label: 'Motorista' },
      { key: 'transportadora', label: 'Transportadora' },
      { label: 'Operação', value: (r) => statusLabel(r.tipo_operacao) },
      { label: 'Entrada', value: (r) => formatDateTime(r.entrada_at) },
      { label: 'Saída', value: (r) => (r.saida_at ? formatDateTime(r.saida_at) : '') },
      { label: 'Permanência', value: (r) => formatDuration(r.entrada_at, r.saida_at) },
      { label: 'Status', value: (r) => statusLabel(r.status) },
    ],
    movimentacoesCache
  );
}

function exportOcorrencias() {
  exportToCSV(
    'ocorrencias.csv',
    [
      { label: 'Data/Hora', value: (r) => formatDateTime(r.data_hora) },
      { label: 'Tipo', value: (r) => statusLabel(r.tipo) },
      { label: 'Gravidade', value: (r) => statusLabel(r.gravidade) },
      { key: 'descricao', label: 'Descrição' },
      { key: 'placa', label: 'Placa' },
      { label: 'Status', value: (r) => statusLabel(r.status) },
    ],
    ocorrenciasCache
  );
}

function exportPonto() {
  exportToCSV(
    'ponto.csv',
    [
      { key: 'funcionario', label: 'Funcionário' },
      { key: 'dias', label: 'Dias com registro' },
      { label: 'Total de horas', value: (r) => msToHoras(r.totalMs) },
    ],
    pontoCache
  );
}

// ---------------------------------------------------------------- //
// Relatorio diario (estilo empresa)                                  //
// ---------------------------------------------------------------- //

const PONTO_TIPO_LABELS = {
  entrada: 'Entrada',
  saida: 'Saída',
  pausa_inicio: 'Início de pausa',
  pausa_fim: 'Fim de pausa',
};

const PONTO_TIPO_BADGE_CLASS = {
  entrada: 'badge-verde',
  saida: 'badge-vermelho',
  pausa_inicio: 'badge-amarelo',
  pausa_fim: 'badge-azul',
};

function pontoTipoBadge(tipo) {
  const cls = PONTO_TIPO_BADGE_CLASS[tipo] || 'badge-cinza';
  const label = PONTO_TIPO_LABELS[tipo] || tipo;
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}

async function gerarRelatorioDiario() {
  const data = document.getElementById('diarioData').value;
  const container = document.getElementById('relatorioDiario');
  if (!data) return;

  container.innerHTML = '<div class="empty-state">Carregando...</div>';

  const inicio = `${data}T00:00:00`;
  const fim = `${data}T23:59:59`;

  const [visitasRes, entregasRes, ocorrenciasRes, pontoRes] = await Promise.all([
    supabase
      .from('visitas')
      .select('*')
      .or(
        `and(entrada_at.gte.${inicio},entrada_at.lte.${fim}),and(saida_at.gte.${inicio},saida_at.lte.${fim})`
      )
      .order('entrada_at', { ascending: true }),
    supabase
      .from('entregas')
      .select('*')
      .eq('data_prevista', data)
      .order('hora_prevista', { ascending: true, nullsFirst: false }),
    supabase
      .from('ocorrencias')
      .select('*')
      .gte('data_hora', inicio)
      .lte('data_hora', fim)
      .order('data_hora', { ascending: true }),
    supabase
      .from('ponto_registros')
      .select('*, funcionarios(nome)')
      .gte('data_hora', inicio)
      .lte('data_hora', fim)
      .order('data_hora', { ascending: true }),
  ]);

  const erro = visitasRes.error || entregasRes.error || ocorrenciasRes.error || pontoRes.error;
  if (erro) {
    container.innerHTML = `<div class="empty-state">Erro ao gerar relatório: ${escapeHtml(erro.message)}</div>`;
    return;
  }

  container.innerHTML = buildRelatorioDiarioHtml(data, {
    visitas: visitasRes.data || [],
    entregas: entregasRes.data || [],
    ocorrencias: ocorrenciasRes.data || [],
    ponto: pontoRes.data || [],
  });
}

function buildRelatorioDiarioHtml(data, { visitas, entregas, ocorrencias, ponto }) {
  const entradas = visitas.filter((v) => (v.entrada_at || '').slice(0, 10) === data).length;
  const saidas = visitas.filter((v) => (v.saida_at || '').slice(0, 10) === data).length;
  const noPatio = visitas.filter((v) => v.status === 'no_patio').length;
  const ocorrenciasAbertas = ocorrencias.filter((o) => o.status === 'aberta').length;

  return `
    <div class="report-header">
      <div class="report-brand">
        <span class="icon"><i class="bi bi-building"></i></span>
        <div>
          <div class="report-brand-name">Sistema de Portaria do Galpão</div>
          <div class="report-brand-sub">Relatório Diário de Operações</div>
        </div>
      </div>
      <div class="report-meta">
        <div><strong>Data de referência:</strong> ${formatDateOnly(data)}</div>
        <div><strong>Gerado em:</strong> ${formatDateTime(new Date().toISOString())}</div>
        <div><strong>Gerado por:</strong> ${escapeHtml(currentProfile?.nome || '-')}</div>
      </div>
    </div>

    <div class="report-summary">
      <div class="summary-item">
        <div class="summary-value">${entradas}</div>
        <div class="summary-label">Entradas no pátio</div>
      </div>
      <div class="summary-item">
        <div class="summary-value">${saidas}</div>
        <div class="summary-label">Saídas do pátio</div>
      </div>
      <div class="summary-item">
        <div class="summary-value">${noPatio}</div>
        <div class="summary-label">Veículos ainda no pátio</div>
      </div>
      <div class="summary-item">
        <div class="summary-value">${entregas.length}</div>
        <div class="summary-label">Entregas/coletas previstas</div>
      </div>
      <div class="summary-item">
        <div class="summary-value">${ocorrencias.length}</div>
        <div class="summary-label">Ocorrências (${ocorrenciasAbertas} em aberto)</div>
      </div>
      <div class="summary-item">
        <div class="summary-value">${ponto.length}</div>
        <div class="summary-label">Registros de ponto</div>
      </div>
    </div>

    <div class="report-section">
      <div class="report-section-title">Movimentação de Veículos</div>
      ${tableOrEmpty(
        ['Placa', 'Motorista', 'Transportadora', 'Operação', 'Entrada', 'Saída', 'Permanência', 'Status'],
        visitas,
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
          </tr>`,
        'Nenhuma movimentação de veículos neste dia.'
      )}
    </div>

    <div class="report-section">
      <div class="report-section-title">Entregas e Coletas Previstas</div>
      ${tableOrEmpty(
        ['Hora', 'Tipo', 'Transportadora', 'Placa prevista', 'Documento', 'Fornecedor/Cliente', 'Status'],
        entregas,
        (e) => `
          <tr>
            <td>${e.hora_prevista ? e.hora_prevista.slice(0, 5) : '-'}</td>
            <td>${badgeHtml(e.tipo)}</td>
            <td>${escapeHtml(e.transportadora || '-')}</td>
            <td>${escapeHtml(e.placa_prevista || '-')}</td>
            <td>${escapeHtml(e.documento || '-')}</td>
            <td>${escapeHtml(e.fornecedor_cliente || '-')}</td>
            <td>${badgeHtml(e.status)}</td>
          </tr>`,
        'Nenhuma entrega ou coleta prevista para este dia.'
      )}
    </div>

    <div class="report-section">
      <div class="report-section-title">Ocorrências</div>
      ${tableOrEmpty(
        ['Hora', 'Tipo', 'Gravidade', 'Descrição', 'Placa', 'Status'],
        ocorrencias,
        (o) => `
          <tr>
            <td>${formatTime(o.data_hora)}</td>
            <td>${badgeHtml(o.tipo)}</td>
            <td>${badgeHtml(o.gravidade)}</td>
            <td>${escapeHtml(o.descricao)}</td>
            <td>${escapeHtml(o.placa || '-')}</td>
            <td>${badgeHtml(o.status)}</td>
          </tr>`,
        'Nenhuma ocorrência registrada neste dia.'
      )}
    </div>

    <div class="report-section">
      <div class="report-section-title">Bate-ponto</div>
      ${tableOrEmpty(
        ['Hora', 'Pessoa', 'Tipo', 'Registro', 'Observações'],
        ponto,
        (p) => `
          <tr>
            <td>${formatTime(p.data_hora)}</td>
            <td>${escapeHtml(
              p.pessoa_tipo === 'funcionario' ? p.funcionarios?.nome || '-' : p.motorista_nome || '-'
            )}</td>
            <td>${p.pessoa_tipo === 'funcionario' ? 'Funcionário' : 'Motorista'}</td>
            <td>${pontoTipoBadge(p.tipo)}</td>
            <td>${escapeHtml(p.observacoes || '-')}</td>
          </tr>`,
        'Nenhum registro de ponto neste dia.'
      )}
    </div>

    <div class="report-footer">
      Documento gerado automaticamente pelo Sistema de Portaria do Galpão.
    </div>
  `;
}

function tableOrEmpty(headers, rows, rowFn, emptyMessage) {
  if (!rows.length) {
    return `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
  }
  return `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
        </thead>
        <tbody>${rows.map(rowFn).join('')}</tbody>
      </table>
    </div>`;
}
