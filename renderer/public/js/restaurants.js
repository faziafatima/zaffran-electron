const restaurantCrudState = {
  items: [],
  editingId: null
};

function setRestaurantFormMode(isEdit) {
  const title = document.getElementById('restaurantModalTitle');
  const submitButton = document.querySelector('#restaurantForm button[type="submit"]');
  if (title) title.textContent = isEdit ? 'Edit restaurant' : 'Add restaurant';
  if (submitButton) submitButton.textContent = isEdit ? 'Update Restaurant' : 'Save Restaurant';
}

function resetRestaurantForm() {
  const form = document.getElementById('restaurantForm');
  if (form) form.reset();
  restaurantCrudState.editingId = null;
  setRestaurantFormMode(false);
  showSaveMessage('restaurantSaveMessage', '');
}

function renderRestaurantTable(items) {
  const body = document.getElementById('restaurantsTableBody');
  if (!body) return;

  if (!items.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty-state">No restaurants available.</td></tr>';
    return;
  }

  body.innerHTML = items.map(item => `
    <tr>
      <td>${item.name || 'Unnamed restaurant'}</td>
      <td>${item.address || '-'}</td>
      <td>${item.phoneNumber || '-'}</td>
      <td>${item.gstin || '-'}</td>
      <td>${item.fssai || '-'}</td>
      <td>${Number(item.taxRate || 0).toFixed(2)}%</td>
      <td>
        <div class="menu-actions">
          <button type="button" class="menu-action-btn edit" data-restaurant-action="edit" data-restaurant-id="${item.id}">Edit</button>
          <button type="button" class="menu-action-btn delete" data-restaurant-action="delete" data-restaurant-id="${item.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function loadRestaurants() {
  const response = await fetch('/api/restaurants');
  const data = await response.json();
  restaurantCrudState.items = Array.isArray(data) ? data : [];
  renderRestaurantTable(restaurantCrudState.items);
}

function openRestaurantForEdit(id) {
  const item = restaurantCrudState.items.find(restaurant => Number(restaurant.id) === Number(id));
  if (!item) return;

  restaurantCrudState.editingId = item.id;
  setRestaurantFormMode(true);

  const name = document.getElementById('restaurantName');
  const address = document.getElementById('restaurantAddress');
  const phoneNumber = document.getElementById('restaurantPhoneNumber');
  const gstin = document.getElementById('restaurantGstin');
  const fssai = document.getElementById('restaurantFssai');
  const taxRate = document.getElementById('restaurantTaxRate');
  const prefix = document.getElementById('restaurantPrefix');
console.log('Editing restaurant:', item);
  if (name) name.value = item.name || '';
  if (address) address.value = item.address || '';
  if (phoneNumber) phoneNumber.value = item.phoneNumber || '';
  if (gstin) gstin.value = item.gstin || '';
  if (fssai) fssai.value = item.fssai || '';
  if (taxRate) taxRate.value = Number(item.taxRate || 0);
  if (prefix) prefix.value = item.orderPrefix || '';

  toggleModal('restaurantModal', 'restaurantModalBackdrop', true);
}

async function removeRestaurant(id) {
  if (!window.confirm('Delete this restaurant?')) return;
  const response = await fetch(`/api/restaurants/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`Delete failed with status ${response.status}`);
  }
  await loadRestaurants();
}

function setupRestaurantCrud() {
  const form = document.getElementById('restaurantForm');
  const body = document.getElementById('restaurantsTableBody');
  const openButton = document.getElementById('openRestaurantFormButton');
  const closeButton = document.getElementById('closeRestaurantFormButton');
  const cancelButton = document.getElementById('cancelRestaurantFormButton');
  const backdrop = document.getElementById('restaurantModalBackdrop');

  if (openButton) {
    openButton.addEventListener('click', () => {
      resetRestaurantForm();
      toggleModal('restaurantModal', 'restaurantModalBackdrop', true);
    });
  }

  if (closeButton) closeButton.addEventListener('click', () => toggleModal('restaurantModal', 'restaurantModalBackdrop', false));
  if (cancelButton) cancelButton.addEventListener('click', () => toggleModal('restaurantModal', 'restaurantModalBackdrop', false));
  if (backdrop) backdrop.addEventListener('click', () => toggleModal('restaurantModal', 'restaurantModalBackdrop', false));

  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();

      const payload = {
        name: document.getElementById('restaurantName')?.value?.trim(),
        address: document.getElementById('restaurantAddress')?.value?.trim(),
        phoneNumber: document.getElementById('restaurantPhoneNumber')?.value?.trim(),
        gstin: document.getElementById('restaurantGstin')?.value?.trim(),
        fssai: document.getElementById('restaurantFssai')?.value?.trim(),
        taxRate: Number(document.getElementById('restaurantTaxRate')?.value || 0),
        orderPrefix: document.getElementById('restaurantPrefix')?.value?.trim()
      };

      const isEdit = restaurantCrudState.editingId !== null;
      const url = isEdit ? `/api/restaurants/${restaurantCrudState.editingId}` : '/api/restaurants';
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

        showSaveMessage('restaurantSaveMessage', isEdit ? 'Restaurant updated successfully.' : 'Restaurant saved successfully.');
        await loadRestaurants();
        resetRestaurantForm();
        toggleModal('restaurantModal', 'restaurantModalBackdrop', false);
      } catch (error) {
        showSaveMessage('restaurantSaveMessage', error.message, true);
      }
    });
  }

  if (body) {
    body.addEventListener('click', async event => {
      const button = event.target.closest('[data-restaurant-action]');
      if (!button) return;

      const id = button.getAttribute('data-restaurant-id');
      const action = button.getAttribute('data-restaurant-action');

      try {
        if (action === 'edit') openRestaurantForEdit(id);
        if (action === 'delete') await removeRestaurant(id);
      } catch (error) {
        showSaveMessage('restaurantSaveMessage', error.message, true);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  setupRestaurantCrud();
  setRestaurantFormMode(false);
  loadRestaurants().catch(() => renderRestaurantTable([]));
});
