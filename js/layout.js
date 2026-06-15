// =====================================================================
// Sidebar / topbar comuns a todas as paginas autenticadas
// =====================================================================
import { logout, isAdmin } from './auth.js';
import { escapeHtml } from './utils.js';

const NAV_ITEMS = [
  { id: 'dashboard', href: 'index.html', icon: 'bi-speedometer2', label: 'Dashboard' },
  { id: 'movimentacao', href: 'movimentacao.html', icon: 'bi-truck', label: 'Entrada / Saída' },
  { id: 'entregas', href: 'entregas.html', icon: 'bi-box-seam', label: 'Entregas Esperadas' },
  { id: 'ocorrencias', href: 'ocorrencias.html', icon: 'bi-exclamation-triangle', label: 'Ocorrências' },
  { id: 'ponto', href: 'ponto.html', icon: 'bi-clock-history', label: 'Bate-ponto' },
  { id: 'relatorios', href: 'relatorios.html', icon: 'bi-graph-up', label: 'Relatórios' },
  { id: 'cadastros', href: 'cadastros.html', icon: 'bi-gear', label: 'Cadastros', adminOnly: true },
];

// Monta a sidebar e a topbar dentro de #sidebar e #topbar.
// params: { profile, active, title }
export function renderLayout({ profile, active, title }) {
  const sidebar = document.getElementById('sidebar');
  const topbar = document.getElementById('topbar');
  if (!sidebar || !topbar) return;

  const admin = isAdmin(profile);

  sidebar.innerHTML = `
    <div class="sidebar-logo"><span class="logo-icon"><i class="bi bi-building"></i></span> Portaria Galpão</div>
    <nav class="sidebar-nav">
      ${NAV_ITEMS.filter((item) => !item.adminOnly || admin)
        .map(
          (item) => `
        <a href="${item.href}" class="${item.id === active ? 'active' : ''}">
          <span class="icon"><i class="bi ${item.icon}"></i></span> ${escapeHtml(item.label)}
        </a>`
        )
        .join('')}
    </nav>
    <div class="sidebar-footer">Sistema de Portaria<br>v1.0</div>
  `;

  topbar.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px;">
      <button class="sidebar-toggle" id="sidebarToggle" aria-label="Abrir menu"><i class="bi bi-list"></i></button>
      <div class="topbar-title">${escapeHtml(title || '')}</div>
    </div>
    <div class="topbar-right">
      <div class="topbar-user">
        <span class="name">${escapeHtml(profile?.nome || '')}</span>
        <span class="role">${admin ? 'Administrador' : 'Porteiro'}</span>
      </div>
      <button class="btn btn-secondary btn-sm" id="logoutBtn">Sair</button>
    </div>
  `;

  document.getElementById('logoutBtn')?.addEventListener('click', () => logout());

  const toggle = document.getElementById('sidebarToggle');
  toggle?.addEventListener('click', () => sidebar.classList.toggle('open'));

  sidebar
    .querySelectorAll('a')
    .forEach((a) => a.addEventListener('click', () => sidebar.classList.remove('open')));
}
