const discountCrudState = {
  items: [],
  editingId: null
};

function setDiscountFormMode(isEdit) {
  const title = document.getElementById('discountModalTitle');
  const submitButton = document.querySelector('#discountForm button[type="submit"]');
  if (title) title.textContent = isEdit ? 'Edit discount' : 'Add discount';
  if (submitButton) submitButton.textContent = isEdit ? 'Update Discount' : 'Save Discount';
}

function resetDiscountForm() {
  const form = document.getElementById('discountForm');
  if (form) form.reset();
  discountCrudState.editingId = null;
  setDiscountFormMode(false);
  showSaveMessage('discountSaveMessage', '');
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function toDateTimeLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function renderDiscountTable(items) {
  const body = document.getElementById('discountsTableBody');
  if (!body) return;

  if (!items.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty-state">No discounts available.</td></tr>';
    return;
  }

  body.innerHTML = items.map(item => `
    <tr>
      <td>${item.discountName || 'Unnamed discount'}</td>
      <td>${item.discountDesc || '-'}</td>
      <td>${Number(item.discountPerc || 0).toFixed(2)}%</td>
      <td>${formatDateTime(item.startDate)}</td>
      <td>${formatDateTime(item.endDate)}</td>
      <td>
        <div class="menu-actions">
          <button type="button" class="menu-action-btn edit" data-discount-action="edit" data-discount-id="${item.id}">Edit</button>
          <button type="button" class="menu-action-btn delete" data-discount-action="delete" data-discount-id="${item.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function loadDiscounts() {
  const response = await fetch(`/api/discounts/${headerRestaurantId}`);
  const data = await response.json();
  discountCrudState.items = Array.isArray(data) ? data : [];
  renderDiscountTable(discountCrudState.items);
}

function openDiscountForEdit(id) {
  const item = discountCrudState.items.find(discount => Number(discount.id) === Number(id));
  if (!item) return;

  discountCrudState.editingId = item.id;
  setDiscountFormMode(true);

  const name = document.getElementById('discountName');
  const desc = document.getElementById('discountDesc');
  const perc = document.getElementById('discountPerc');
  const startDate = document.getElementById('discountStartDate');
  const endDate = document.getElementById('discountEndDate');

  if (name) name.value = item.discountName || '';
  if (desc) desc.value = item.discountDesc || '';
  if (perc) perc.value = item.discountPerc ?? '';
  if (startDate) startDate.value = toDateTimeLocalValue(item.startDate);
  if (endDate) endDate.value = toDateTimeLocalValue(item.endDate);

  toggleModal('discountModal', 'discountModalBackdrop', true);
}

async function removeDiscount(id) {
  if (!window.confirm('Delete this discount?')) return;
  const response = await fetch(`/api/discounts/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `Delete failed with status ${response.status}`);
  }
  await loadDiscounts();
}

function buildDiscountPayload() {
  const discountName = document.getElementById('discountName')?.value?.trim();
  const discountDesc = document.getElementById('discountDesc')?.value?.trim() || '';
  const discountPercRaw = document.getElementById('discountPerc')?.value;
  const startDateRaw = document.getElementById('discountStartDate')?.value;
  const endDateRaw = document.getElementById('discountEndDate')?.value;

  return {
    discountName,
    discountDesc,
    discountPerc: discountPercRaw === '' ? null : Number(discountPercRaw),
    startDate: startDateRaw || null,
    endDate: endDateRaw || null
  };
}

function setupDiscountCrud() {
  const form = document.getElementById('discountForm');
  const body = document.getElementById('discountsTableBody');
  const openButton = document.getElementById('openDiscountFormButton');
  const closeButton = document.getElementById('closeDiscountFormButton');
  const cancelButton = document.getElementById('cancelDiscountFormButton');
  const backdrop = document.getElementById('discountModalBackdrop');

  if (openButton) {
    openButton.addEventListener('click', () => {
      resetDiscountForm();
      toggleModal('discountModal', 'discountModalBackdrop', true);
    });
  }

  if (closeButton) closeButton.addEventListener('click', () => toggleModal('discountModal', 'discountModalBackdrop', false));
  if (cancelButton) cancelButton.addEventListener('click', () => toggleModal('discountModal', 'discountModalBackdrop', false));
  if (backdrop) backdrop.addEventListener('click', () => toggleModal('discountModal', 'discountModalBackdrop', false));

  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();

      const payload = buildDiscountPayload();
      const isEdit = discountCrudState.editingId !== null;
      const url = isEdit ? `/api/discounts/${discountCrudState.editingId}` : `/api/discounts/${headerRestaurantId}`;
      const method = isEdit ? 'PUT' : 'POST';

      try {
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(errorBody.message || `Save failed with status ${response.status}`);
        }

        showSaveMessage('discountSaveMessage', isEdit ? 'Discount updated successfully.' : 'Discount saved successfully.');
        await loadDiscounts();
        resetDiscountForm();
        toggleModal('discountModal', 'discountModalBackdrop', false);
      } catch (error) {
        showSaveMessage('discountSaveMessage', error.message, true);
      }
    });
  }

  if (body) {
    body.addEventListener('click', async event => {
      const button = event.target.closest('[data-discount-action]');
      if (!button) return;

      const id = button.getAttribute('data-discount-id');
      const action = button.getAttribute('data-discount-action');

      try {
        if (action === 'edit') openDiscountForEdit(id);
        if (action === 'delete') await removeDiscount(id);
      } catch (error) {
        showSaveMessage('discountSaveMessage', error.message, true);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  setupDiscountCrud();
  setDiscountFormMode(false);
  loadDiscounts().catch(() => {
    renderDiscountTable([]);
    showSaveMessage('discountSaveMessage', 'Unable to load discounts.', true);
  });
});
