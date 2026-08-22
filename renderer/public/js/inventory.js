const inventoryCrudState = {
  items: [],
  filteredItems: [],
  editingId: null,
  searchTerm: '',
  page: 1,
  pageSize: 8
};

function updateInventorySummary() {
  const summaryEl = document.getElementById('inventoryPageSummary');
  const indicatorEl = document.getElementById('inventoryPageIndicator');
  const prevButton = document.getElementById('inventoryPrevButton');
  const nextButton = document.getElementById('inventoryNextButton');
  if (!summaryEl && !indicatorEl && !prevButton && !nextButton) return;

  const total = inventoryCrudState.items.length;
  const filtered = inventoryCrudState.filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(filtered / inventoryCrudState.pageSize));
  const currentPage = Math.min(inventoryCrudState.page, totalPages);
  const startIndex = filtered === 0 ? 0 : ((currentPage - 1) * inventoryCrudState.pageSize) + 1;
  const endIndex = Math.min(currentPage * inventoryCrudState.pageSize, filtered);

  if (summaryEl) {
    if (filtered === 0) {
      summaryEl.textContent = total ? `No matches for “${inventoryCrudState.searchTerm}”` : 'No inventory items are available yet.';
    } else {
      summaryEl.textContent = `Showing ${startIndex}-${endIndex} of ${filtered} items`;
    }
  }

  if (indicatorEl) {
    indicatorEl.textContent = `Page ${filtered ? currentPage : 0} of ${filtered ? totalPages : 0}`;
  }

  if (prevButton) prevButton.disabled = inventoryCrudState.page <= 1 || filtered === 0;
  if (nextButton) nextButton.disabled = inventoryCrudState.page >= totalPages || filtered === 0;
}

function setInventoryFormMode(isEdit) {
  const title = document.getElementById('inventoryModalTitle');
  const submitButton = document.querySelector('#inventoryForm button[type="submit"]');
  if (title) title.textContent = isEdit ? 'Edit stock item' : 'Stock update';
  if (submitButton) submitButton.textContent = isEdit ? 'Update Item' : 'Update Inventory';
}

function resetInventoryForm() {
  const form = document.getElementById('inventoryForm');
  if (form) form.reset();
  inventoryCrudState.editingId = null;
  setInventoryFormMode(false);
  showSaveMessage('inventorySaveMessage', '');
}

function renderInventoryTable(items) {
  const body = document.getElementById('inventoryTableBody');
  const alertList = document.getElementById('inventoryAlerts');
  if (!body && !alertList) return;

  inventoryCrudState.items = Array.isArray(items) ? items : [];
  const searchTerm = inventoryCrudState.searchTerm.trim().toLowerCase();
  inventoryCrudState.filteredItems = inventoryCrudState.items.filter(item => {
    if (!searchTerm) return true;
    return [item.itemName, item.hsnNumber, item.status, item.unit]
      .filter(value => value !== null && value !== undefined && value !== '')
      .some(value => String(value).toLowerCase().includes(searchTerm));
  });

  const totalPages = Math.max(1, Math.ceil(inventoryCrudState.filteredItems.length / inventoryCrudState.pageSize));
  if (inventoryCrudState.page > totalPages) {
    inventoryCrudState.page = totalPages;
  }

  updateInventorySummary();

  if (body) {
    if (!inventoryCrudState.filteredItems.length) {
      const message = inventoryCrudState.items.length ? 'No inventory items match your search.' : 'No inventory items available.';
      body.innerHTML = `<tr><td colspan="4" class="empty-state">${message}</td></tr>`;
    } else {
      const pageItems = inventoryCrudState.filteredItems.slice(
        (inventoryCrudState.page - 1) * inventoryCrudState.pageSize,
        inventoryCrudState.page * inventoryCrudState.pageSize
      );

      body.innerHTML = pageItems.map(item => `
        <tr>
          <td>${item.itemName || 'Unnamed item'}</td>
          <td>${item.quantity ?? 0} ${item.unit || ''}</td>
          <td><span class="status-pill ${statusClass(item.status)}">${item.status || 'Available'}</span></td>
          <td>
            <div class="menu-actions">
              ${roleHeader == 'super admin' || roleHeader == 'admin' ? `<button type="button" class="menu-action-btn edit" data-inventory-action="edit" data-inventory-id="${item.id}">Edit</button>` : ''}
              <button type="button" class="menu-action-btn update" data-inventory-action="update" data-inventory-id="${item.id}">Update Inventory</button>
              <button type="button" class="menu-action-btn delete" data-inventory-action="delete" data-inventory-id="${item.id}">Delete</button>
            </div>
          </td>
        </tr>
      `).join('');
    }
  }

  if (alertList) {
    alertList.innerHTML = inventoryCrudState.items.length
      ? inventoryCrudState.items.slice(0, 4).map(item => `
        <div class="list-item"><span>${item.itemName || 'Unnamed item'}</span><strong>${item.quantity ?? 0}${item.unit ? ` ${item.unit}` : ''}</strong></div>
      `).join('')
      : '<div class="empty-state">Stock is looking healthy.</div>';
  }
}

function setupInventorySearch() {
  const searchInput = document.getElementById('inventorySearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', event => {
      inventoryCrudState.searchTerm = event.target.value || '';
      inventoryCrudState.page = 1;
      renderInventoryTable(inventoryCrudState.items);
    });
  }

  const prevButton = document.getElementById('inventoryPrevButton');
  const nextButton = document.getElementById('inventoryNextButton');

  if (prevButton) {
    prevButton.addEventListener('click', () => {
      if (inventoryCrudState.page > 1) {
        inventoryCrudState.page -= 1;
        renderInventoryTable(inventoryCrudState.items);
      }
    });
  }

  if (nextButton) {
    nextButton.addEventListener('click', () => {
      const totalPages = Math.max(1, Math.ceil(inventoryCrudState.filteredItems.length / inventoryCrudState.pageSize));
      if (inventoryCrudState.page < totalPages) {
        inventoryCrudState.page += 1;
        renderInventoryTable(inventoryCrudState.items);
      }
    });
  }
}

async function loadInventory() {
  const response = await fetch(`/api/inventory/${headerRestaurantId}`);
  const data = await response.json();
  inventoryCrudState.items = Array.isArray(data) ? data : [];
  renderInventoryTable(inventoryCrudState.items);
}

function openInventoryForEdit(id) {
  const item = inventoryCrudState.items.find(inventoryItem => Number(inventoryItem.id) === Number(id));
  if (!item) return;

  inventoryCrudState.editingId = item.id;
  setInventoryFormMode(true);

  const name = document.getElementById('inventoryName');
  const description = document.getElementById('inventoryDescription');
  const quantity = document.getElementById('inventoryQuantity');
  const unit = document.getElementById('inventoryUnit');
  const category = document.getElementById('inventoryCategory');
  const price = document.getElementById('inventoryPrice');
  const status = document.getElementById('inventoryStatus');
  const hsnNumber = document.getElementById('hsnNumber');

  if (name) name.value = item.itemName || '';
  if (description) description.value = item.itemDescription || '';
  if (quantity) quantity.value = Number(item.quantity || 0);
  if (unit) unit.value = item.unit || 'kg';
  if (category) category.value = item.category || 'Food';
  if (price) price.value = Number(item.price || 0);
  if (status) status.value = item.status || 'Available';
  if (hsnNumber) hsnNumber.value = item.hsnNumber || '';

  toggleModal('inventoryModal', 'inventoryModalBackdrop', true);
}

async function removeInventoryItem(id) {
  if (!window.confirm('Delete this inventory item?')) return;
  const response = await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`Delete failed with status ${response.status}`);
  }
  await loadInventory();
}

function setupInventoryCrud() {
  const form = document.getElementById('inventoryForm');
  const body = document.getElementById('inventoryTableBody');
  const openButton = document.getElementById('openInventoryFormButton');
  const closeButton = document.getElementById('closeInventoryFormButton');
  const cancelButton = document.getElementById('cancelInventoryFormButton');

  if (openButton) {
    openButton.addEventListener('click', () => {
      resetInventoryForm();
      toggleModal('inventoryModal', 'inventoryModalBackdrop', true);
    });
  }

  if (closeButton) closeButton.addEventListener('click', resetInventoryForm);
  if (cancelButton) cancelButton.addEventListener('click', resetInventoryForm);

  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();

      const payload = {
        itemName: document.getElementById('inventoryName')?.value?.trim(),
        itemDescription: document.getElementById('inventoryDescription')?.value?.trim(),
        quantity: Number(document.getElementById('inventoryQuantity')?.value || 0),
        unit: document.getElementById('inventoryUnit')?.value || 'kg',
        category: document.getElementById('inventoryCategory')?.value || 'Food',
        price: Number(document.getElementById('inventoryPrice')?.value || 0),
        status: document.getElementById('inventoryStatus')?.value || 'Available',
        hsnNumber: document.getElementById('hsnNumber')?.value?.trim()
      };

      const isEdit = inventoryCrudState.editingId !== null;
      const url = isEdit ? `/api/inventory/${inventoryCrudState.editingId}` : `/api/inventory/${headerRestaurantId}`;
      const method = isEdit ? 'PUT' : 'POST';

      try {
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`Save failed with status ${response.status}`);
        }

        showSaveMessage('inventorySaveMessage', isEdit ? 'Inventory item updated successfully.' : 'Inventory item saved successfully.');
        await loadInventory();
        resetInventoryForm();
        modalCloseActions.inventoryModal?.();
      } catch (error) {
        showSaveMessage('inventorySaveMessage', error.message, true);
      }
    });
  }

  if (body) {
    body.addEventListener('click', async event => {
      const button = event.target.closest('[data-inventory-action]');
      if (!button) return;

      const id = button.getAttribute('data-inventory-id');
      const action = button.getAttribute('data-inventory-action');

      try {
        if (action === 'edit') openInventoryForEdit(id);
        if (action === 'update') openInventoryForUpdate(id);
        if (action === 'delete') await removeInventoryItem(id);
      } catch (error) {
        showSaveMessage('inventorySaveMessage', error.message, true);
      }
     
    });
  }
}

function openInventoryForUpdate(id) {
  const item = inventoryCrudState.items.find(inventoryItem => Number(inventoryItem.id) === Number(id));
  if (!item) return;

  inventoryCrudState.editingId = item.id;
  showSaveMessage('inventoryUpdateSaveMessage', '');

  const name = document.getElementById('inventoryUpdateName');
  const quantity = document.getElementById('inventoryUpdateQuantity');

  if (name) name.value = item.itemName || '';
  if (quantity) quantity.value = Number(item.quantity || 0);

  toggleModal('inventoryUpdateModal', 'inventoryUpdateModalBackdrop', true);
}

function resetInventoryUpdateForm() {
  const form = document.getElementById('inventoryUpdateForm');
  if (form) form.reset();
  inventoryCrudState.editingId = null;
  showSaveMessage('inventoryUpdateSaveMessage', '');
}



function setupInventoryUpdateForm() {
  const form = document.getElementById('inventoryUpdateForm');
  const closeButton = document.getElementById('closeInventoryUpdateFormButton');
  const cancelButton = document.getElementById('cancelInventoryUpdateFormButton');
  const backdrop = document.getElementById('inventoryUpdateModalBackdrop');

  const closeUpdateModal = () => {
    resetInventoryUpdateForm();
    toggleModal('inventoryUpdateModal', 'inventoryUpdateModalBackdrop', false);
  };

  if (closeButton) closeButton.addEventListener('click', closeUpdateModal);
  if (cancelButton) cancelButton.addEventListener('click', closeUpdateModal);
  if (backdrop) backdrop.addEventListener('click', closeUpdateModal);

  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();

      const payload = {
        itemName: document.getElementById('inventoryUpdateName')?.value?.trim(),
        quantity: Number(document.getElementById('inventoryUpdateQuantity')?.value || 0),
      };

      const url = `/api/inventory/daily/${inventoryCrudState.editingId}`;
      const method = 'PUT';

      try {
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`Save failed with status ${response.status}`);
        }

        showSaveMessage('inventoryUpdateSaveMessage', 'Inventory updated successfully.');
        await loadInventory();
        closeUpdateModal();
      } catch (error) {
        showSaveMessage('inventoryUpdateSaveMessage', error.message, true);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  setupModalAwareForms();
  setupInventoryCrud();
  setInventoryFormMode(false);
  setupInventoryUpdateForm();
  setupInventorySearch();

  loadInventory().catch(() => renderInventoryTable([]));
});
