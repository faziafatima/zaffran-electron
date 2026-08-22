const customerCrudState = {
  items: [],
  editingId: null
};

function setCustomerFormMode(isEdit) {
  const title = document.getElementById('customerModalTitle');
  const submitButton = document.querySelector('#customerForm button[type="submit"]');
  if (title) title.textContent = isEdit ? 'Edit customer' : 'Add customer';
  if (submitButton) submitButton.textContent = isEdit ? 'Update Customer' : 'Save Customer';
}

function resetCustomerForm() {
  const form = document.getElementById('customerForm');
  if (form) form.reset();

  const loyaltyPoints = document.getElementById('customerLoyaltyPoints');
  if (loyaltyPoints) loyaltyPoints.value = '0';

  customerCrudState.editingId = null;
  setCustomerFormMode(false);
  showSaveMessage('customerSaveMessage', '');
}

function renderCustomerTable(items) {
  const body = document.getElementById('customersTableBody');
  if (!body) return;

  if (!items.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty-state">No customers available.</td></tr>';
    return;
  }

  body.innerHTML = items.map(item => `
    <tr>
      <td>${item.name || 'Unnamed customer'}</td>
      <td>${item.phone || '-'}</td>
      <td>${Number(item.loyaltyPoints || 0)}</td>
      <td>${Number(item.orderCount || 0)}</td>
      <td>${formatCurrency(item.totalSpent || 0)}</td>
      <td>${item.preferences || '-'}</td>
      <td>
        <div class="menu-actions">
          <button type="button" class="menu-action-btn edit" data-customer-action="edit" data-customer-id="${item.id}">Edit</button>
          <button type="button" class="menu-action-btn delete" data-customer-action="delete" data-customer-id="${item.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function loadCustomers() {
  const response = await fetch('/api/customers');
  const data = await response.json();
  customerCrudState.items = Array.isArray(data) ? data : [];
  renderCustomerTable(customerCrudState.items);
}

function openCustomerForEdit(id) {
  const item = customerCrudState.items.find(customer => Number(customer.id) === Number(id));
  if (!item) return;

  customerCrudState.editingId = item.id;
  setCustomerFormMode(true);

  const name = document.getElementById('customerName');
  const phone = document.getElementById('customerPhone');
  const loyaltyPoints = document.getElementById('customerLoyaltyPoints');
  const preferences = document.getElementById('customerPreferences');

  if (name) name.value = item.name || '';
  if (phone) phone.value = item.phone || '';
  if (loyaltyPoints) loyaltyPoints.value = Number(item.loyaltyPoints || 0);
  if (preferences) preferences.value = item.preferences || '';

  toggleModal('customerModal', 'customerModalBackdrop', true);
}

async function removeCustomer(id) {
  if (!window.confirm('Delete this customer?')) return;
  const response = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `Delete failed with status ${response.status}`);
  }
  await loadCustomers();
}

function buildCustomerPayload(existing = null) {
  const loyaltyPointsRaw = document.getElementById('customerLoyaltyPoints')?.value;

  return {
    name: document.getElementById('customerName')?.value?.trim(),
    phone: document.getElementById('customerPhone')?.value?.trim(),
    loyaltyPoints: loyaltyPointsRaw === '' ? 0 : Number(loyaltyPointsRaw),
    preferences: document.getElementById('customerPreferences')?.value?.trim() || '',
    orderCount: Number(existing?.orderCount || 0),
    totalSpent: Number(existing?.totalSpent || 0),
    lastOrderDate: existing?.lastOrderDate || null
  };
}

function setupCustomerCrud() {
  const form = document.getElementById('customerForm');
  const body = document.getElementById('customersTableBody');
  const openButton = document.getElementById('openCustomerFormButton');
  const closeButton = document.getElementById('closeCustomerFormButton');
  const cancelButton = document.getElementById('cancelCustomerFormButton');
  const backdrop = document.getElementById('customerModalBackdrop');

  if (openButton) {
    openButton.addEventListener('click', () => {
      resetCustomerForm();
      toggleModal('customerModal', 'customerModalBackdrop', true);
    });
  }

  if (closeButton) closeButton.addEventListener('click', () => toggleModal('customerModal', 'customerModalBackdrop', false));
  if (cancelButton) cancelButton.addEventListener('click', () => toggleModal('customerModal', 'customerModalBackdrop', false));
  if (backdrop) backdrop.addEventListener('click', () => toggleModal('customerModal', 'customerModalBackdrop', false));

  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();

      const isEdit = customerCrudState.editingId !== null;
      const existing = isEdit
        ? customerCrudState.items.find(item => Number(item.id) === Number(customerCrudState.editingId))
        : null;
      const payload = buildCustomerPayload(existing);
      const url = isEdit ? `/api/customers/${customerCrudState.editingId}` : '/api/customers';
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

        showSaveMessage('customerSaveMessage', isEdit ? 'Customer updated successfully.' : 'Customer saved successfully.');
        await loadCustomers();
        resetCustomerForm();
        toggleModal('customerModal', 'customerModalBackdrop', false);
      } catch (error) {
        showSaveMessage('customerSaveMessage', error.message, true);
      }
    });
  }

  if (body) {
    body.addEventListener('click', async event => {
      const button = event.target.closest('[data-customer-action]');
      if (!button) return;

      const id = button.getAttribute('data-customer-id');
      const action = button.getAttribute('data-customer-action');

      try {
        if (action === 'edit') openCustomerForEdit(id);
        if (action === 'delete') await removeCustomer(id);
      } catch (error) {
        showSaveMessage('customerSaveMessage', error.message, true);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  setupCustomerCrud();
  setCustomerFormMode(false);

  loadCustomers().catch(() => {
    renderCustomerTable([]);
    showSaveMessage('customerSaveMessage', 'Unable to load customers.', true);
  });
});
