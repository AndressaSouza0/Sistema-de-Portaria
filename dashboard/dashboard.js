// =====================================================================
// Logica do Dashboard
// =====================================================================
import { supabase } from '../shared/supabaseClient.js';
import {
  formatDateTime,
  formatDuration,
  todayISO,
  daysAgoISO,
  badgeHtml,
  statusLabel,
  escapeHtml,
} from '../shared/utils.js';

let chartMov;
let chartOcorr;

export async function initDashboard() {
  await Promise.all([
    loadCardsAndPatio(),
    loadEntregasHoje(),
    loadMovimentacoesChart(),
    loadOcorrenciasChart(),
  ]);
}

async function loadCardsAndPatio() {
  const patioBody = document.getElementById('patioBody');
  const today = todayISO();
  const startOfDay = `${today}T00:00:00`;

  const [patioRes, entregasHojeRes, ocorrAbertasRes, movHojeRes] = await Promise.all([
    supabase
      .from('visitas')
      .select('*')
      .eq('status', 'no_patio')
      .order('entrada_at', { ascending: true }),
    supabase
      .from('entregas')
      .select('id', { count: 'exact', head: true })
      .eq('data_prevista', today)
      .in('status', ['pendente', 'em_andamento']),
    supabase
      .from('ocorrencias')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'aberta'),
    supabase
      .from('visitas')
      .select('id', { count: 'exact', head: true })
      .gte('entrada_at', startOfDay),
  ]);

  const patio = patioRes.data || [];

  renderStatCards({
    patio: patio.length,
    entregasHoje: entregasHojeRes.count ?? 0,
    ocorrencias: ocorrAbertasRes.count ?? 0,
    movimentacoesHoje: movHojeRes.count ?? 0,
  });

  if (!patio.length) {
    patioBody.innerHTML =
      '<tr><td colspan="7" class="empty-state">Nenhum caminhão no pátio no momento.</td></tr>';
    return;
  }

  patioBody.innerHTML = patio
    .map(
      (v) => `
    <tr>
      <td><strong>${escapeHtml(v.placa)}</strong></td>
      <td>${escapeHtml(v.motorista_nome || '-')}</td>
      <td>${escapeHtml(v.transportadora || '-')}</td>
      <td>${badgeHtml(v.tipo_operacao)}</td>
      <td>${escapeHtml(v.doca || '-')}</td>
      <td>${formatDateTime(v.entrada_at)}</td>
      <td>${formatDuration(v.entrada_at)}</td>
    </tr>`
    )
    .join('');
}

function renderStatCards({ patio, entregasHoje, ocorrencias, movimentacoesHoje }) {
  const el = document.getElementById('statsCards');
  el.innerHTML = `
    <div class="stat-card accent-azul">
      <div class="stat-label"><i class="bi bi-truck"></i> Caminhões no pátio</div>
      <div class="stat-value">${patio}</div>
    </div>
    <div class="stat-card accent-roxo">
      <div class="stat-label"><i class="bi bi-box-seam"></i> Entregas esperadas hoje</div>
      <div class="stat-value">${entregasHoje}</div>
    </div>
    <div class="stat-card accent-vermelho">
      <div class="stat-label"><i class="bi bi-exclamation-triangle"></i> Ocorrências abertas</div>
      <div class="stat-value">${ocorrencias}</div>
    </div>
    <div class="stat-card accent-verde">
      <div class="stat-label"><i class="bi bi-arrow-repeat"></i> Movimentações hoje</div>
      <div class="stat-value">${movimentacoesHoje}</div>
    </div>
  `;
}

async function loadEntregasHoje() {
  const tbody = document.getElementById('entregasHojeBody');
  const today = todayISO();

  const { data, error } = await supabase
    .from('entregas')
    .select('*')
    .eq('data_prevista', today)
    .order('hora_prevista', { ascending: true, nullsFirst: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Erro ao carregar: ${escapeHtml(
      error.message
    )}</td></tr>`;
    return;
  }

  if (!data.length) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="empty-state">Nenhuma entrega/coleta prevista para hoje.</td></tr>';
    return;
  }

  tbody.innerHTML = data
    .map(
      (e) => `
    <tr>
      <td>${e.hora_prevista ? e.hora_prevista.slice(0, 5) : '-'}</td>
      <td>${badgeHtml(e.tipo)}</td>
      <td>${escapeHtml(e.transportadora || '-')}</td>
      <td>${escapeHtml(e.placa_prevista || '-')}</td>
      <td>${escapeHtml(e.documento || '-')}</td>
      <td>${escapeHtml(e.fornecedor_cliente || '-')}</td>
      <td>${badgeHtml(e.status)}</td>
    </tr>`
    )
    .join('');
}

async function loadMovimentacoesChart() {
  const days = 7;
  const start = `${daysAgoISO(days - 1)}T00:00:00`;

  const { data, error } = await supabase
    .from('visitas')
    .select('entrada_at, saida_at')
    .gte('entrada_at', start);

  const labels = [];
  const entradasMap = {};
  const saidasMap = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = daysAgoISO(i);
    labels.push(d);
    entradasMap[d] = 0;
    saidasMap[d] = 0;
  }

  if (!error && data) {
    data.forEach((v) => {
      const dEntrada = (v.entrada_at || '').slice(0, 10);
      if (entradasMap[dEntrada] !== undefined) entradasMap[dEntrada]++;
      if (v.saida_at) {
        const dSaida = v.saida_at.slice(0, 10);
        if (saidasMap[dSaida] !== undefined) saidasMap[dSaida]++;
      }
    });
  }

  const ctx = document.getElementById('chartMovimentacoes');
  if (chartMov) chartMov.destroy();
  chartMov = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.map(formatChartDate),
      datasets: [
        { label: 'Entradas', data: labels.map((d) => entradasMap[d]), backgroundColor: '#2563eb' },
        { label: 'Saídas', data: labels.map((d) => saidasMap[d]), backgroundColor: '#16a34a' },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function formatChartDate(isoDate) {
  const [, m, d] = isoDate.split('-');
  return `${d}/${m}`;
}

async function loadOcorrenciasChart() {
  const start = `${daysAgoISO(29)}T00:00:00`;
  const { data, error } = await supabase.from('ocorrencias').select('tipo').gte('data_hora', start);

  const counts = {};
  if (!error && data) {
    data.forEach((o) => {
      counts[o.tipo] = (counts[o.tipo] || 0) + 1;
    });
  }

  const labels = Object.keys(counts);
  const values = Object.values(counts);

  const ctx = document.getElementById('chartOcorrencias');
  if (chartOcorr) chartOcorr.destroy();

  if (!labels.length) {
    chartOcorr = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: ['Sem ocorrências'], datasets: [{ data: [1], backgroundColor: ['#e5e7eb'] }] },
      options: { plugins: { legend: { position: 'bottom' }, tooltip: { enabled: false } } },
    });
    return;
  }

  const palette = ['#dc2626', '#ca8a04', '#7c3aed', '#2563eb', '#16a34a', '#4b5563'];
  chartOcorr = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels.map((t) => statusLabel(t)),
      datasets: [{ data: values, backgroundColor: labels.map((_, i) => palette[i % palette.length]) }],
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
  });
}
