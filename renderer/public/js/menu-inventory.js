const menuInventoryState = {
  items: [],
  filteredItems: [],
  searchTerm: '',
  page: 1,
  pageSize: 8
};

function updateMenuInventoryPagination() {
  const summary = document.getElementById('menuInventoryPageSummary');
  const indicator = document.getElementById('menuInventoryPageIndicator');
  const previousButton = document.getElementById('menuInventoryPrevButton');
  const nextButton = document.getElementById('menuInventoryNextButton');
  const filtered = menuInventoryState.filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(filtered / menuInventoryState.pageSize));
  const start = filtered ? ((menuInventoryState.page - 1) * menuInventoryState.pageSize) + 1 : 0;
  const end = Math.min(menuInventoryState.page * menuInventoryState.pageSize, filtered);

  if (summary) {
    summary.textContent = filtered
      ? `Showing ${start}-${end} of ${filtered} dishes`
      : (menuInventoryState.items.length ? 'No dishes match your search.' : 'No menu items are available yet.');
  }
  if (indicator) indicator.textContent = `Page ${filtered ? menuInventoryState.page : 0} of ${filtered ? totalPages : 0}`;
  if (previousButton) previousButton.disabled = menuInventoryState.page <= 1 || !filtered;
  if (nextButton) nextButton.disabled = menuInventoryState.page >= totalPages || !filtered;
}

function renderMenuInventory() {
  const body = document.getElementById('menuInventoryTableBody');
  if (!body) return;
  const query = menuInventoryState.searchTerm.trim().toLowerCase();
  menuInventoryState.filteredItems = menuInventoryState.items.filter(item => !query || [item.name, item.category]
    .filter(Boolean).some(value => String(value).toLowerCase().includes(query)));
  const totalPages = Math.max(1, Math.ceil(menuInventoryState.filteredItems.length / menuInventoryState.pageSize));
  if (menuInventoryState.page > totalPages) menuInventoryState.page = totalPages;
  const items = menuInventoryState.filteredItems.slice(
    (menuInventoryState.page - 1) * menuInventoryState.pageSize,
    menuInventoryState.page * menuInventoryState.pageSize
  );

  updateMenuInventoryPagination();

  body.innerHTML = items.length ? items.map(item => {
    const stock = Math.max(0, Number(item.stockQuantity || 0));
    return `<tr>
      <td>${item.name || 'Unnamed dish'}</td>
      <td>${item.category || 'General'}</td>
      <td><span class="status-pill ${item.available ? 'success' : 'danger'}">${item.available ? 'Available' : 'Unavailable'}</span></td>
      <td><input class="menu-stock-input" type="number" min="0" step="1" value="${stock}" data-menu-stock-input="${item.id}" aria-label="Stock for ${item.name || 'dish'}" /></td>
      <td><button type="button" class="menu-action-btn update" data-menu-stock-save="${item.id}">Save</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" class="empty-state">No menu items match your search.</td></tr>';
}

async function loadMenuInventory() {
  const response = await fetch(`/api/menu/${headerRestaurantId}`);
  if (!response.ok) throw new Error(`Unable to load menu inventory (${response.status}).`);
  menuInventoryState.items = await response.json();
  renderMenuInventory();
}

async function saveMenuStock(id) {
  const input = document.querySelector(`[data-menu-stock-input="${id}"]`);
  const message = document.getElementById('menuInventoryMessage');
  const stockQuantity = Math.max(0, Math.floor(Number(input?.value || 0)));
  const response = await fetch(`/api/menu/${id}/stock`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stockQuantity })
  });
  if (!response.ok) throw new Error((await response.json())?.message || `Save failed (${response.status}).`);
  if (message) message.textContent = 'Menu inventory saved.';
  await loadMenuInventory();
}

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  document.getElementById('menuInventorySearch')?.addEventListener('input', event => {
    menuInventoryState.searchTerm = event.target.value || '';
    menuInventoryState.page = 1;
    renderMenuInventory();
  });
  document.getElementById('menuInventoryPrevButton')?.addEventListener('click', () => {
    if (menuInventoryState.page > 1) {
      menuInventoryState.page -= 1;
      renderMenuInventory();
    }
  });
  document.getElementById('menuInventoryNextButton')?.addEventListener('click', () => {
    const totalPages = Math.ceil(menuInventoryState.filteredItems.length / menuInventoryState.pageSize);
    if (menuInventoryState.page < totalPages) {
      menuInventoryState.page += 1;
      renderMenuInventory();
    }
  });
  document.getElementById('menuInventoryTableBody')?.addEventListener('click', async event => {
    const button = event.target.closest('[data-menu-stock-save]');
    if (!button) return;
    try { await saveMenuStock(button.getAttribute('data-menu-stock-save')); }
    catch (error) { showSaveMessage('menuInventoryMessage', error.message, true); }
  });
  loadMenuInventory().catch(error => showSaveMessage('menuInventoryMessage', error.message, true));
});