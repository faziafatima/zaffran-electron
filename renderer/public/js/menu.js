const menuCrudState = {
  editingId: null,
  imageMode: 'keep',
  imageBase64: '',
  imageContentType: ''
};

const MAX_MENU_IMAGE_BYTES = 2 * 1024 * 1024;

function setMenuFormMode(isEdit) {
  const title = document.getElementById('menuModalTitle');
  const submitButton = document.querySelector('#menuForm button[type="submit"]');
  if (title) title.textContent = isEdit ? 'Edit dish' : 'Add or edit dish';
  if (submitButton) submitButton.textContent = isEdit ? 'Update Dish' : 'Save Dish';
}

function clearMenuSaveMessage() {
  showSaveMessage('menuSaveMessage', '');
}

function getMenuImageDataUrl(item) {
  if (!item?.imageBase64) return '/img/no-image.png';
  const contentType = item.imageContentType || 'image/jpeg';
  return `data:${contentType};base64,${item.imageBase64}`;
}

function setMenuImagePreview(src, label) {
  const previewShell = document.getElementById('menuImageEditor');
  const previewImage = document.getElementById('menuImagePreview');
  const previewName = document.getElementById('menuImageName');
  const removeButton = document.getElementById('removeMenuImageButton');

  const hasImage = Boolean(src);
  if (previewShell) previewShell.hidden = !hasImage;
  if (previewImage) previewImage.src = hasImage ? src : '/img/no-image.png';
  if (previewName) previewName.textContent = label || 'Selected image';
  if (removeButton) removeButton.hidden = !hasImage;
}

function resetMenuImageState() {
  menuCrudState.imageMode = 'keep';
  menuCrudState.imageBase64 = '';
  menuCrudState.imageContentType = '';

  const imageInput = document.getElementById('menuImage');
  if (imageInput) imageInput.value = '';

  setMenuImagePreview('', 'Selected image');
}

function clearMenuImage() {
  menuCrudState.imageMode = 'clear';
  menuCrudState.imageBase64 = '';
  menuCrudState.imageContentType = '';

  const imageInput = document.getElementById('menuImage');
  if (imageInput) imageInput.value = '';

  setMenuImagePreview('', 'No image selected');
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read the selected image.'));
    reader.readAsDataURL(file);
  });
}

function openCreateMenuModal() {
  menuCrudState.editingId = null;
  setMenuFormMode(false);
  resetMenuImageState();
  clearMenuSaveMessage();
  toggleModal('menuModal', 'menuModalBackdrop', true);
}

function openEditMenuModal(id) {
  const item = menuState.items.find(menuItem => Number(menuItem.id) === Number(id));
  if (!item) {
    showSaveMessage('menuSaveMessage', 'Selected menu item not found.', true);
    return;
  }

  menuCrudState.editingId = item.id;
  setMenuFormMode(true);

  const name = document.getElementById('menuName');
  const category = document.getElementById('menuCategory');
  const type = document.getElementById('menuType');
  const qtrPrice = document.getElementById('qtrPrice');
  const halfPrice = document.getElementById('halfPrice');
  const fullPrice = document.getElementById('fullPrice');
  const status = document.getElementById('menuStatus');
  const kitchenType = document.getElementById('menuKitchenType');
  const isFavourite = document.getElementById('menuIsFavourite');
  const onMrp = document.getElementById('menuOnMrp');
  const description = document.getElementById('menuDescription');
  const imageInput = document.getElementById('menuImage');

  if (name) name.value = item.name || '';
  if (category) category.value = item.category || 'Main Course';
  if (type) type.value = item.type || 'Veg';
  if (qtrPrice) qtrPrice.value = Number(item.qtr_price || 0);
  if (halfPrice) halfPrice.value = Number(item.half_price || 0);
  if (fullPrice) fullPrice.value = Number(item.full_price || 0);
  if (status) status.value = item.available ? 'Available' : 'Out of stock';
  if (kitchenType) kitchenType.value = item.kitchen_type || 'in-kitchen';
  if (isFavourite) isFavourite.checked = Boolean(item.isFavourite);
  if (onMrp) onMrp.checked = Boolean(item.onMrp);
  if (description) description.value = item.description || '';
  if (imageInput) imageInput.value = '';

  menuCrudState.imageMode = 'keep';
  menuCrudState.imageBase64 = '';
  menuCrudState.imageContentType = '';
  setMenuImagePreview(getMenuImageDataUrl(item), item.name ? `${item.name} image` : 'Current image');

  clearMenuSaveMessage();
  toggleModal('menuModal', 'menuModalBackdrop', true);
}

async function refreshMenuList() {
  const response = await fetch(`/api/menu/${headerRestaurantId}`);
  const data = await response.json();
  renderMenu(data);
}

async function deleteMenuItem(id) {
  const item = menuState.items.find(menuItem => Number(menuItem.id) === Number(id));
  const itemName = item?.name || `ID ${id}`;
  if (!window.confirm(`Delete menu item "${itemName}"?`)) {
    return;
  }

  const response = await fetch(`/api/menu/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`Delete failed with status ${response.status}`);
  }

  await refreshMenuList();
}

function setupMenuActions() {
  const body = document.getElementById('menuTableBody');
  const addButton = document.getElementById('openMenuFormButton');
  const closeButton = document.getElementById('closeMenuFormButton');
  const cancelButton = document.getElementById('cancelMenuFormButton');
  const removeImageButton = document.getElementById('removeMenuImageButton');

  if (addButton) {
    addButton.addEventListener('click', () => {
      const form = document.getElementById('menuForm');
      if (form) form.reset();
      openCreateMenuModal();
    });
  }

  if (closeButton) {
    closeButton.addEventListener('click', () => {
      menuCrudState.editingId = null;
      setMenuFormMode(false);
    });
  }

  if (cancelButton) {
    cancelButton.addEventListener('click', () => {
      menuCrudState.editingId = null;
      setMenuFormMode(false);
    });
  }

  if (removeImageButton) {
    removeImageButton.addEventListener('click', () => {
      clearMenuImage();
    });
  }

  if (!body) return;

  body.addEventListener('click', async event => {
    const actionButton = event.target.closest('[data-menu-action]');
    if (!actionButton) return;

    const menuId = actionButton.getAttribute('data-menu-id');
    if (!menuId) return;

    const action = actionButton.getAttribute('data-menu-action');
    try {
      if (action === 'edit') {
        openEditMenuModal(menuId);
      } else if (action === 'delete') {
        await deleteMenuItem(menuId);
      }
    } catch (error) {
      showSaveMessage('menuSaveMessage', error.message || 'Action failed.', true);
    }
  });
}

function setupMenuSave() {
  const form = document.getElementById('menuForm');
  const imageInput = document.getElementById('menuImage');
  if (!form) return;

  if (imageInput) {
    imageInput.addEventListener('change', async event => {
      const file = event.target.files?.[0];
      if (!file) {
        if (menuCrudState.editingId === null) {
          resetMenuImageState();
        }
        return;
      }

      if (!file.type.startsWith('image/')) {
        event.target.value = '';
        showSaveMessage('menuSaveMessage', 'Only image files are allowed for dish photos.', true);
        return;
      }

      if (file.size > MAX_MENU_IMAGE_BYTES) {
        event.target.value = '';
        showSaveMessage('menuSaveMessage', 'Dish image must be 2 MB or smaller.', true);
        return;
      }

      try {
        const dataUrl = await readFileAsDataUrl(file);
        const commaIndex = dataUrl.indexOf(',');
        menuCrudState.imageMode = 'new';
        menuCrudState.imageContentType = file.type;
        menuCrudState.imageBase64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
        setMenuImagePreview(dataUrl, file.name);
        clearMenuSaveMessage();
      } catch (error) {
        event.target.value = '';
        menuCrudState.imageMode = 'keep';
        menuCrudState.imageBase64 = '';
        menuCrudState.imageContentType = '';
        showSaveMessage('menuSaveMessage', error.message || 'Image selection failed.', true);
      }
    });
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const payload = {
      name: document.getElementById('menuName')?.value?.trim(),
      category: document.getElementById('menuCategory')?.value || 'Main Course',
      type: document.getElementById('menuType')?.value || 'Veg',
      qtr_price: Number(document.getElementById('qtrPrice')?.value || 0),
      half_price: Number(document.getElementById('halfPrice')?.value || 0),
      full_price: Number(document.getElementById('fullPrice')?.value || 0),
      available: (document.getElementById('menuStatus')?.value || 'Available') === 'Available',
      kitchen_type: document.getElementById('menuKitchenType')?.value || 'in-kitchen',
      isFavourite: Boolean(document.getElementById('menuIsFavourite')?.checked),
      onMrp: Boolean(document.getElementById('menuOnMrp')?.checked),
      description: document.getElementById('menuDescription')?.value?.trim() || ''
    };

    if (menuCrudState.imageMode === 'new' && menuCrudState.imageBase64) {
      payload.imageBase64 = menuCrudState.imageBase64;
      payload.imageContentType = menuCrudState.imageContentType;
    }

    if (menuCrudState.imageMode === 'clear') {
      payload.clearImage = true;
    }

    const isEdit = menuCrudState.editingId !== null;
    const method = isEdit ? 'PUT' : 'POST';
    const url = isEdit ? `/api/menu/${menuCrudState.editingId}` : `/api/menu/${headerRestaurantId}`;

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Save failed with status ${response.status}`);
      }

      showSaveMessage('menuSaveMessage', isEdit ? 'Menu item updated successfully.' : 'Menu item saved successfully.');
      form.reset();
      menuCrudState.editingId = null;
      setMenuFormMode(false);
      resetMenuImageState();
      await refreshMenuList();
      modalCloseActions.menuModal?.();
    } catch (error) {
      showSaveMessage('menuSaveMessage', error.message, true);
    }
  });
}

function renderMenu(data) {
  const body = document.getElementById('menuTableBody');
  if (!body) return;

  const items = Array.isArray(data) ? data : [];
  menuState.items = items;
  menuState.filteredItems = items.filter(item => {
    const searchTerm = menuState.searchTerm.trim().toLowerCase();
    if (!searchTerm) return true;
    return [item.name, item.category, item.type, item.description]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(searchTerm));
  });

  const totalPages = Math.max(1, Math.ceil(menuState.filteredItems.length / menuState.pageSize));
  if (menuState.page > totalPages) {
    menuState.page = totalPages;
  }

  updateMenuSummary();

  const pageItems = getMenuItems().slice((menuState.page - 1) * menuState.pageSize, menuState.page * menuState.pageSize);

  if (!menuState.filteredItems.length) {
    body.innerHTML = '<tr><td colspan="8" class="empty-state">No menu items are available yet.</td></tr>';
    return;
  }

  const startIndex = (menuState.page - 1) * menuState.pageSize;
  body.innerHTML = pageItems.map((item, index) => {
    const availability = item.available ? 'Available' : 'Out of stock';
    const imageDataUrl = getMenuImageDataUrl(item);
    return `
      <tr>
        <td>${startIndex + index + 1}</td>
        <td>${imageDataUrl ? `<img src="${imageDataUrl}" alt="${item.name || 'Dish'}" class="menu-thumb" />` : '<span class="muted">No image</span>'}</td>
        <td>${item.name || 'Unnamed item'}</td>
        <td>${item.category || 'General'}</td>
        <td>${item.type || '—'}</td>
        <td>QTR: ${formatCurrency(item.qtr_price)}<br/>HALF: ${formatCurrency(item.half_price)}<br/>FULL: ${formatCurrency(item.full_price)}</td>
        <td><span class="status-pill ${item.available ? 'success' : 'danger'}">${availability}</span></br>
       ${item.isFavourite ? ' <span class="status-pill fav">Favourite</span></br>' : ''}
       ${item.onMrp ? ' <span class="status-pill fav">On MRP</span></br>' : ''}
         <span class="status-pill time">${item.kitchen_type}</span></td>
        <td>
          <div class="menu-actions">
            <button type="button" class="menu-action-btn edit" data-menu-action="edit" data-menu-id="${item.id}">Edit</button>
            <button type="button" class="menu-action-btn delete" data-menu-action="delete" data-menu-id="${item.id}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  setupMenuSave();
  setupModalAwareForms();
  setupMenuSearch();
  setupMenuActions();
  setMenuFormMode(false);
  resetMenuImageState();

  if (document.getElementById('menuTableBody')) {
    refreshMenuList().catch(() => renderMenu([]));
  }
});