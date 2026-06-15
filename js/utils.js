// =====================================================================
// Funcoes utilitarias compartilhadas
// =====================================================================

// ---- Datas e horas -------------------------------------------------

// Formata um timestamp ISO (com hora) para "dd/mm/aaaa HH:mm"
export function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

// Formata um timestamp ISO para "HH:mm"
export function formatTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Formata uma data "yyyy-mm-dd" (coluna DATE, sem hora) para "dd/mm/aaaa"
// sem sofrer deslocamento de fuso horario.
export function formatDateOnly(value) {
  if (!value) return '-';
  const [y, m, d] = String(value).split('-');
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

// Retorna a data de hoje no formato "yyyy-mm-dd" (horario local)
export function todayISO() {
  return localISODate(new Date());
}

// Retorna a data de N dias atras no formato "yyyy-mm-dd"
export function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localISODate(d);
}

// Soma N dias a uma data "yyyy-mm-dd" e retorna no mesmo formato
export function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d + n);
  return localISODate(date);
}

function localISODate(d) {
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

// Calcula a duracao entre duas datas/horas no formato "Xh Ymin"
export function formatDuration(startISO, endISO) {
  if (!startISO) return '-';
  const start = new Date(startISO);
  const end = endISO ? new Date(endISO) : new Date();
  const diffMs = end - start;
  if (Number.isNaN(diffMs) || diffMs < 0) return '-';
  const totalMin = Math.floor(diffMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

// ---- Badges de status -----------------------------------------------

export const STATUS_LABELS = {
  // entregas
  pendente: { label: 'Pendente', cls: 'badge-amarelo' },
  em_andamento: { label: 'Em andamento', cls: 'badge-azul' },
  concluida: { label: 'Concluída', cls: 'badge-verde' },
  atrasada: { label: 'Atrasada', cls: 'badge-vermelho' },
  cancelada: { label: 'Cancelada', cls: 'badge-cinza' },
  // visitas
  no_patio: { label: 'No pátio', cls: 'badge-azul' },
  finalizado: { label: 'Finalizado', cls: 'badge-verde' },
  // ocorrencias
  aberta: { label: 'Aberta', cls: 'badge-vermelho' },
  resolvida: { label: 'Resolvida', cls: 'badge-verde' },
  // gravidade
  baixa: { label: 'Baixa', cls: 'badge-verde' },
  media: { label: 'Média', cls: 'badge-amarelo' },
  alta: { label: 'Alta', cls: 'badge-vermelho' },
  // tipos de operacao / entrega
  entrega: { label: 'Entrega', cls: 'badge-azul' },
  coleta: { label: 'Coleta', cls: 'badge-roxo' },
  devolucao: { label: 'Devolução', cls: 'badge-amarelo' },
  outro: { label: 'Outro', cls: 'badge-cinza' },
  // tipos de ocorrencia
  avaria: { label: 'Avaria', cls: 'badge-vermelho' },
  atraso: { label: 'Atraso', cls: 'badge-amarelo' },
  divergencia: { label: 'Divergência', cls: 'badge-roxo' },
  seguranca: { label: 'Segurança', cls: 'badge-vermelho' },
  acidente: { label: 'Acidente', cls: 'badge-vermelho' },
  // cargos
  admin: { label: 'Administrador', cls: 'badge-roxo' },
  porteiro: { label: 'Porteiro', cls: 'badge-azul' },
};

export function badgeHtml(status) {
  const info = STATUS_LABELS[status] || { label: status ?? '-', cls: 'badge-cinza' };
  return `<span class="badge ${info.cls}">${escapeHtml(info.label)}</span>`;
}

export function statusLabel(status) {
  return (STATUS_LABELS[status] || { label: status ?? '-' }).label;
}

// ---- Seguranca / HTML ------------------------------------------------

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- Mensagens de feedback -------------------------------------------

// Mostra uma mensagem em um elemento (alerta de sucesso/erro/info)
export function showMessage(el, message, type = 'info') {
  if (!el) return;
  el.textContent = message;
  el.className = message ? `alert alert-${type}` : '';
  el.style.display = message ? 'block' : 'none';
  if (message && type !== 'error') {
    setTimeout(() => {
      el.style.display = 'none';
    }, 4000);
  }
}

// ---- Outros ------------------------------------------------------------

export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Exporta uma lista de objetos para um arquivo CSV (separador ";",
// compativel com Excel em pt-BR)
export function exportToCSV(filename, columns, rows) {
  const header = columns.map((c) => csvEscape(c.label)).join(';');
  const lines = rows.map((row) =>
    columns
      .map((c) => csvEscape(typeof c.value === 'function' ? c.value(row) : row[c.key]))
      .join(';')
  );
  const csv = [header, ...lines].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[;"\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ---- Upload de fotos -----------------------------------------------

// Redimensiona e comprime uma imagem no navegador antes do upload,
// mantendo o uso do storage gratuito do Supabase baixo.
export async function compressImage(file, maxSize = 1280, quality = 0.7) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao processar imagem.'))),
      'image/jpeg',
      quality
    );
  });
}

// Comprime e envia uma imagem para um bucket do Supabase Storage,
// retornando a URL publica do arquivo.
export async function uploadFoto(supabase, bucket, file) {
  const compressed = await compressImage(file);
  const path = `${crypto.randomUUID()}.jpg`;

  const { error } = await supabase.storage.from(bucket).upload(path, compressed, {
    contentType: 'image/jpeg',
  });
  if (error) throw error;

  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
