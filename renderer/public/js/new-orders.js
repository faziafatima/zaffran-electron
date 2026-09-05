const orderCrudState = {
  menuItems: [],
  draftItems: [],
  activeCategory: 'All',
  searchTerm: '',
  editingOrderId: null
};

const TOTAL_TABLE_COUNT = 25;

// Rebuilds the Table dropdown, hiding tables already occupied by other open Dine-in orders.
async function refreshTableOptions() {
  const select = document.getElementById('orderTableId');
  if (!select) return;

  let occupiedTableIds = [];
  try {
    const response = await fetch(`/api/orders/openOrders/${headerRestaurantId}`);
    if (response.ok) {
      const data = await response.json();
      const items = Array.isArray(data) ? data : [];
      occupiedTableIds = items
        .filter(order => order.order_type === 'Dine-in'
          && Number(order.tableId || 0) > 0
          && Number(order.id) !== Number(orderCrudState.editingOrderId))
        .map(order => Number(order.tableId));
    }
  } catch (error) {
    occupiedTableIds = [];
  }

  const occupied = new Set(occupiedTableIds);
  const previousValue = Number(select.value || 0);

  const options = ['<option value="0">No Table</option>'];
  for (let tableNumber = 1; tableNumber <= TOTAL_TABLE_COUNT; tableNumber += 1) {
    if (occupied.has(tableNumber)) continue;
    options.push(`<option value="${tableNumber}">Table ${tableNumber}</option>`);
  }
  select.innerHTML = options.join('');

  const nextValue = select.querySelector(`option[value="${previousValue}"]`) ? String(previousValue) : '0';
  select.value = nextValue;
  if (window.jQuery) {
    $(select).val(nextValue).trigger('change');
  }
}

function isCarOrderSelected() {
  const orderType = String(document.getElementById('orderType')?.value || '').trim().toLowerCase();
  return orderType === 'car';
}

function isTakeawayOrderSelected() {
  const orderType = String(document.getElementById('orderType')?.value || '').trim().toLowerCase();
  return orderType === 'takeaway';
}

function shouldCaptureCustomerDetails() {
  return isCarOrderSelected() || isTakeawayOrderSelected();
}

function setCustomerLookupMessage(message, isError = false) {
  const node = document.getElementById('orderCustomerLookupMessage');
  if (!node) return;
  node.textContent = message || '';
  node.style.color = isError ? '#b91c1c' : '';
}

function normalizeCarNumber(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizePhoneNumber(value) {
  return String(value || '').trim();
}

function setCarOrderFieldsVisibility() {
  const shell = document.getElementById('carOrderFields');
  const carField = document.getElementById('orderCarNumberField');
  const carInput = document.getElementById('orderCarNumber');
  const phoneInput = document.getElementById('orderCustomerPhone');
  const nameInput = document.getElementById('orderCustomerName');

  const visible = shouldCaptureCustomerDetails();
  const showCarField = isCarOrderSelected();
  if (shell) shell.hidden = !visible;
  if (carField) {
    carField.hidden = !showCarField;
    carField.style.display = showCarField ? '' : 'none';
  }

  if (!carInput || !phoneInput || !nameInput) return;

  carInput.required = showCarField;
  // phoneInput.required = visible;
  // nameInput.required = visible;

  if (!showCarField) {
    carInput.value = '';
  }

  if (!visible) {
    const customerId = document.getElementById('orderCustomerId');
    if (customerId) customerId.value = '';
    setCustomerLookupMessage('');
  }
}

function applyCustomerToForm(customer) {
  const idInput = document.getElementById('orderCustomerId');
  const nameInput = document.getElementById('orderCustomerName');
  const phoneInput = document.getElementById('orderCustomerPhone');
  const carInput = document.getElementById('orderCarNumber');

  if (idInput) idInput.value = customer?.id ? String(customer.id) : '';
  if (nameInput && customer?.name) nameInput.value = customer.name;
  if (phoneInput && customer?.phone) phoneInput.value = customer.phone;
  if (carInput && customer?.carNumber) carInput.value = customer.carNumber;
}

async function lookupCustomerByIdentifier() {
  if (!shouldCaptureCustomerDetails()) return;

  const phoneInput = document.getElementById('orderCustomerPhone');
  const carInput = document.getElementById('orderCarNumber');
  const idInput = document.getElementById('orderCustomerId');

  const phone = normalizePhoneNumber(phoneInput?.value);
  const carNumber = normalizeCarNumber(carInput?.value);

  if (!phone && !carNumber) {
    // if (idInput) idInput.value = '';
    // setCustomerLookupMessage('');
    return;
  }

  const params = new URLSearchParams();
  if (phone) params.set('phone', phone);
  if (carNumber) params.set('carNumber', carNumber);

  try {
    const response = await fetch(`/api/customers/search?${params.toString()}`);
    if (response.status === 404) {
      if (idInput) idInput.value = '';
      setCustomerLookupMessage('No existing customer found. Enter details to create one.');
      return;
    }
    if (!response.ok) {
      throw new Error(`Customer search failed (${response.status}).`);
    }

    const customer = await response.json();
    applyCustomerToForm(customer);
    setCustomerLookupMessage('Customer details auto-filled from existing record.');
  } catch (error) {
    setCustomerLookupMessage(error.message || 'Customer lookup failed.', true);
  }
}

async function resolveCustomerForCarOrder() {
  if (!shouldCaptureCustomerDetails()) return 0;

  const name = String(document.getElementById('orderCustomerName')?.value || '').trim();
  const phone = normalizePhoneNumber(document.getElementById('orderCustomerPhone')?.value);
  const carNumber = normalizeCarNumber(document.getElementById('orderCarNumber')?.value);

  
  if (isCarOrderSelected() && !carNumber) {
    return;
  }
  
  if (!name && !phone) {
    return;
  }

  const response = await fetch('/api/customers/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone, carNumber: isCarOrderSelected() ? carNumber : '' })
  });

  if (!response.ok) {
    let message = `Unable to save customer details (${response.status}).`;
    try {
      const data = await response.json();
      if (data?.message) message = data.message;
    } catch (_error) {
      // Ignore JSON parsing errors and keep default message.
    }
    throw new Error(message);
  }

  const customer = await response.json();
  applyCustomerToForm(customer);
  setCustomerLookupMessage('Customer details saved.');
  return Number(customer?.id || 0);
}

function normalizePortion(value) {
  const portion = String(value || '').toLowerCase();
  if (portion === 'qtr' || portion === 'half' || portion === 'full') return portion;
  return 'full';
}

function getPortionLabel(portion) {
  const normalized = normalizePortion(portion);
  if (normalized === 'qtr') return 'Qtr';
  if (normalized === 'half') return 'Half';
  return 'Full';
}

function getMenuItemPriceByPortion(menuItem, portion) {
  const normalized = normalizePortion(portion);

  if (normalized === 'qtr') {
    return Number(menuItem?.qtr_price ?? menuItem?.half_price ?? menuItem?.full_price ?? 0);
  }

  if (normalized === 'half') {
    return Number(menuItem?.half_price ?? menuItem?.full_price ?? menuItem?.qtr_price ?? 0);
  }

  return Number(menuItem?.full_price ?? menuItem?.half_price ?? menuItem?.qtr_price ?? 0);
}

function getMenuItemById(menuItemId) {
  return orderCrudState.menuItems.find(item => Number(item.id) === Number(menuItemId));
}

function getDishImageSrc(dish) {
  if (dish?.imageBase64) {
    const contentType = dish.imageContentType || 'image/jpeg';
    return `data:${contentType};base64,${dish.imageBase64}`;
  }
  return '/img/no-image.png';
}

function sumOrderItems(items) {
  return items.reduce((total, item) => total + (Number(item.price || 0) * Number(item.quantity || 0)), 0);
}

function renderOrderItems(items) {
  if (!items.length) {
    return `
      <div class="empty-state">
        <div class="empty-icon">🛒</div>
        <div class="empty-title">No items yet</div>
        <div class="empty-text">Select items from the menu to add them here.</div>
      </div>
    `;
  }

  return items.map(item => `
    <div class="cart-line">
      <div class="cart-line-top">
        <div>
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-meta">${getPortionLabel(item.portion)} • ${formatCurrency(item.price)} each</div>
        </div>
        <div class="cart-item-price">${formatCurrency(item.price * item.quantity)}</div>
      </div>
      <div class="qty-control">
        <button
          type="button"
          class="qty-btn"
          data-order-action="decrement-draft-item"
          data-menu-item-id="${item.menuItemId}"
          data-portion="${item.portion}">−</button>
        <span class="qty-value">${item.quantity}</span>
        <button
          type="button"
          class="qty-btn"
          data-order-action="increment-draft-item"
          data-menu-item-id="${item.menuItemId}"
          data-portion="${item.portion}">+</button>
        <button
          type="button"
          class="remove-item"
          data-order-action="remove-draft-item"
          data-menu-item-id="${item.menuItemId}"
          data-portion="${item.portion}">✕</button>
      </div>
    </div>
  `).join('');
}

function updateOrderTotals() {
  const subtotal = sumOrderItems(orderCrudState.draftItems);

  const amountInput = document.getElementById('orderAmount');
  if (amountInput) amountInput.value = subtotal.toFixed(0);

  const totalNode = document.getElementById('order-total');
  if (totalNode) totalNode.textContent = subtotal.toFixed(0);
}

function renderDraftItems() {
  const container = document.getElementById('orderDraftItems');
  if (!container) return;

  container.innerHTML = renderOrderItems(orderCrudState.draftItems);
  updateOrderTotals();
}

function setDraftItems(items) {
  orderCrudState.draftItems = Array.isArray(items) ? items : [];
  renderDraftItems();
}

function addItemToDraft(menuItemId, quantity, portion) {
  const menuItem = getMenuItemById(menuItemId);
  if (!menuItem) return false;

  const normalizedPortion = normalizePortion(portion);
  const normalizedQuantity = Math.max(1, Number(quantity || 1));
  const price = getMenuItemPriceByPortion(menuItem, normalizedPortion);

  const nextItems = orderCrudState.draftItems.map(item => ({ ...item }));
  const existing = nextItems.find(item => (
    Number(item.menuItemId) === Number(menuItemId)
      && normalizePortion(item.portion) === normalizedPortion
  ));

  if (existing) {
    existing.quantity += normalizedQuantity;
  } else {
    nextItems.push({
      menuItemId: Number(menuItem.id),
      name: menuItem.name || `Dish #${menuItem.id}`,
      quantity: normalizedQuantity,
      portion: normalizedPortion,
      price
    });
  }

  setDraftItems(nextItems);
  return true;
}

function removeItemFromDraft(menuItemId, portion) {
  const normalizedPortion = normalizePortion(portion);
  setDraftItems(orderCrudState.draftItems.filter(item => {
    if (Number(item.menuItemId) !== Number(menuItemId)) return true;
    return normalizePortion(item.portion) !== normalizedPortion;
  }));
}

function adjustDraftItemQuantity(menuItemId, portion, delta) {
  const normalizedPortion = normalizePortion(portion);
  const nextItems = orderCrudState.draftItems.map(item => ({ ...item }));
  const index = nextItems.findIndex(item => (
    Number(item.menuItemId) === Number(menuItemId)
      && normalizePortion(item.portion) === normalizedPortion
  ));
  if (index === -1) return;

  nextItems[index].quantity += delta;
  if (nextItems[index].quantity <= 0) {
    nextItems.splice(index, 1);
  }
  setDraftItems(nextItems);
}

function buildOrderPayload(customerIdOverride = null) {
  const subtotal = sumOrderItems(orderCrudState.draftItems);
  const customerIdInput = Number(document.getElementById('orderCustomerId')?.value || 0);
  const customerId = customerIdOverride !== null ? Number(customerIdOverride || 0) : customerIdInput;

  return {
    tableId: Number(document.getElementById('orderTableId')?.value || 0),
    order_type: document.getElementById('orderType')?.value || 'Dine-in',
    status: document.getElementById('orderStatus')?.value || 'Pending',
    item_price: subtotal,
    server_name: document.getElementById('serverName')?.value || '',
    tax_percentage: 5,
    discount_perc: 0,
    discount_amount: 0,
    isSplitBill: 0,
    payment_mode: 'cash',
    cash_payment: subtotal,
    card_payment: 0,
    upi_payment: 0,
    createdByUserId: Number(document.getElementById('orderCreatedBy')?.value || 0),
    customerId,
    itemsPayload: orderCrudState.draftItems.map(item => ({
      menuItemId: Number(item.menuItemId),
      quantity: Number(item.quantity || 1),
      price: Number(item.price || 0),
      portion: normalizePortion(item.portion)
    })),
    items: orderCrudState.draftItems.map(item => ({
      menuItemId: Number(item.menuItemId),
      quantity: Number(item.quantity || 1),
      price: Number(item.price || 0),
      portion: normalizePortion(item.portion)
    }))
  };
}

function getOrderItemsFromOrder(order) {
  const items = Array.isArray(order?.orderItems)
    ? order.orderItems
    : (Array.isArray(order?.itemsPayload) ? order.itemsPayload : []);

  return items.map(item => {
    const menuItemId = Number(item.menuItem?.id ?? item.menuItemId ?? item.menu_item_id ?? 0);
    if (!menuItemId) return null;
    const menuItem = item.menuItem || getMenuItemById(menuItemId) || {};
    const portion = normalizePortion(item.portion);

    return {
      menuItemId,
      name: menuItem.name || item.name || `Item #${menuItemId}`,
      quantity: Number(item.quantity || 1),
      portion,
      price: Number(item.price ?? getMenuItemPriceByPortion(menuItem, portion))
    };
  }).filter(Boolean);
}

function setOrderFormModeForEdit(order) {
  const heading = document.querySelector('.panel-title');
  if (heading) heading.textContent = `Edit Order ${order?.strOrderId || ''}`.trim();

  const submitButton = document.querySelector('#orderForm button[type="submit"]');
  if (submitButton) submitButton.textContent = 'Update Order';

  const cancelButton = document.getElementById('cancelOrderFormButton');
  if (cancelButton) cancelButton.hidden = true;
}

function populateOrderFormForEdit(order) {
  const orderType = document.getElementById('orderType');
  const orderStatus = document.getElementById('orderStatus');
  const serverName = document.getElementById('serverName');
  const customerId = document.getElementById('orderCustomerId');
  const customerName = document.getElementById('orderCustomerName');
  const customerPhone = document.getElementById('orderCustomerPhone');
  const carNumber = document.getElementById('orderCarNumber');

  if (orderType) orderType.value = order.order_type || 'Dine-in';
  if (orderStatus) orderStatus.value = order.status || 'Pending';
  if (serverName) serverName.value = order.server_name || '';
  if (customerId) customerId.value = order.customer?.id ? String(order.customer.id) : '';
  if (customerName) customerName.value = order.customer?.name || '';
  if (customerPhone) customerPhone.value = order.customer?.phone || '';
  if (carNumber) carNumber.value = order.customer?.carNumber || '';

  $('#orderTableId').val(String(order.tableId ?? 0)).trigger('change');

  setCarOrderFieldsVisibility();
  setCustomerLookupMessage('');
  setDraftItems(getOrderItemsFromOrder(order));
  setOrderFormModeForEdit(order);
}

async function loadOrderForEdit(orderId) {
  const response = await fetch(`/api/orders/id/${orderId}`);
  if (!response.ok) {
    throw new Error(`Unable to load order (${response.status}).`);
  }

  const order = await response.json();
  populateOrderFormForEdit(order);
}

function getMenuCategories() {
  const categories = new Set();
  let hasFavourites = false;
  orderCrudState.menuItems.forEach(dish => {
    if (dish?.isFavourite) hasFavourites = true;
    const category = String(dish?.category || 'Uncategorized').trim() || 'Uncategorized';
    categories.add(category);
  });
  return {
    hasFavourites,
    categories: Array.from(categories).sort((a, b) => a.localeCompare(b))
  };
}

function renderCategories() {
  const categoryList = document.getElementById('categoryList');
  if (!categoryList) return;

  const { hasFavourites, categories } = getMenuCategories();
  const buttons = ['All', ...(hasFavourites ? ['Favourites'] : []), ...categories];

  categoryList.innerHTML = buttons.map(category => `
    <button
      type="button"
      class="category-btn ${orderCrudState.activeCategory === category ? 'active' : ''}"
      data-category="${category}">${category}</button>
  `).join('');
}

function renderDishCard(dish) {
  const portions = [
    { key: 'qtr', label: 'Qtr', price: dish.qtr_price },
    { key: 'half', label: 'Half', price: dish.half_price },
    { key: 'full', label: 'Full', price: dish.full_price }
  ].filter(p => Number(p.price || 0) > 0);

  const availablePortions = portions.length ? portions : [{ key: 'full', label: 'Full', price: 0 }];
  const showLabels = availablePortions.length > 1;

  const options = availablePortions.map(portion => (
    `<option value="${portion.key}">${showLabels ? `${portion.label} - ` : ''}${formatCurrency(Number(portion.price || 0))}</option>`
  )).join('');

  return `
    <div class="menu-card" data-dish-id="${dish.id}">
      <div class="menu-thumb"><img src="${getDishImageSrc(dish)}" alt="${dish.name || 'Dish'}" /></div>
      <div class="menu-card-body">
        <div class="menu-item-name">${dish.name || 'Unnamed dish'}</div>
        <div class="menu-item-category">${dish.category || 'Uncategorized'}</div>
        <select data-dish-portion="${dish.id}">${options}</select>
        <div class="menu-item-footer">
          <input type="number" data-dish-qty="${dish.id}" min="1" value="1" style="width:44px;">
          <button type="button" class="add-btn" data-dish-add="${dish.id}">+</button>
        </div>
      </div>
    </div>
  `;
}

function renderDishes(filter = orderCrudState.searchTerm) {
  const dishList = document.getElementById('dish-list');
  if (!dishList) return;

  orderCrudState.searchTerm = String(filter || '');
  const normalizedFilter = orderCrudState.searchTerm.trim().toLowerCase();
  const activeCategory = orderCrudState.activeCategory;

  const items = orderCrudState.menuItems.filter(dish => {
    if (!dish?.name) return false;
    if (normalizedFilter && !dish.name.toLowerCase().includes(normalizedFilter)) return false;

    if (activeCategory === 'All') return true;
    if (activeCategory === 'Favourites') return Boolean(dish?.isFavourite);

    const category = String(dish?.category || 'Uncategorized').trim() || 'Uncategorized';
    return category === activeCategory;
  });

  if (!items.length) {
    dishList.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-icon">\uD83D\uDD0E</div>
        <div class="empty-title">No items found</div>
        <div class="empty-text">Try another search or category.</div>
      </div>
    `;
    return;
  }

  if (activeCategory !== 'All') {
    dishList.innerHTML = items.map(renderDishCard).join('');
    return;
  }

  const favouriteItems = items.filter(dish => Boolean(dish?.isFavourite));
  const remainingItems = items.filter(dish => !dish?.isFavourite);

  const groupedByCategory = remainingItems.reduce((acc, dish) => {
    const category = String(dish?.category || 'Uncategorized').trim() || 'Uncategorized';
    if (!acc.has(category)) acc.set(category, []);
    acc.get(category).push(dish);
    return acc;
  }, new Map());

  const favouritesSection = favouriteItems.length ? `
    <div class="dish-category-title">Favourites</div>
    ${favouriteItems.map(renderDishCard).join('')}
  ` : '';

  const categorySections = Array.from(groupedByCategory.entries()).map(([category, categoryItems]) => `
    <div class="dish-category-title">${category}</div>
    ${categoryItems.map(renderDishCard).join('')}
  `).join('');

  dishList.innerHTML = favouritesSection + categorySections;
}

async function loadMenuItems() {
  const response = await fetch(`/api/menu/active/${headerRestaurantId}`);
  if (!response.ok) {
    throw new Error(`Unable to load menu items (${response.status}).`);
  }

  const data = await response.json();
  orderCrudState.menuItems = Array.isArray(data) ? data : [];
  renderCategories();
  renderDishes();

  const menuMessage = document.getElementById('orderMenuMessage');
  if (menuMessage) {
    menuMessage.textContent = orderCrudState.menuItems.length
      ? ''
      : 'No menu items found.';
  }
}

function resetOrderForm() {
  const form = document.getElementById('orderForm');
  if (form) form.reset();

  const customerId = document.getElementById('orderCustomerId');
  const customerName = document.getElementById('orderCustomerName');
  const customerPhone = document.getElementById('orderCustomerPhone');
  const carNumber = document.getElementById('orderCarNumber');
  if (customerId) customerId.value = '';
  if (customerName) customerName.value = '';
  if (customerPhone) customerPhone.value = '';
  if (carNumber) carNumber.value = '';

  setCustomerLookupMessage('');
  setDraftItems([]);
  setCarOrderFieldsVisibility();
  showSaveMessage('orderSaveMessage', '');
}

function setupOrderPage() {
  const dishList = document.getElementById('dish-list');
  const categoryList = document.getElementById('categoryList');
  const searchInput = document.getElementById('search');
  const draftItemsContainer = document.getElementById('orderDraftItems');
  const cancelButton = document.getElementById('cancelOrderFormButton');
  const form = document.getElementById('orderForm');
  const orderType = document.getElementById('orderType');
  const customerPhone = document.getElementById('orderCustomerPhone');
  const carNumber = document.getElementById('orderCarNumber');

  if (categoryList) {
    categoryList.addEventListener('click', event => {
      const button = event.target.closest('[data-category]');
      if (!button) return;

      orderCrudState.activeCategory = button.getAttribute('data-category') || 'All';
      renderCategories();
      renderDishes();
    });
  }

  if (orderType) {
    orderType.addEventListener('change', () => {
      setCarOrderFieldsVisibility();
    });
  }

  if (customerPhone) {
    customerPhone.addEventListener('blur', () => {
      lookupCustomerByIdentifier();
    });
  }

  if (carNumber) {
    carNumber.addEventListener('blur', () => {
      const normalized = normalizeCarNumber(carNumber.value);
      carNumber.value = normalized;
      lookupCustomerByIdentifier();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', event => {
      renderDishes(event.target.value || '');
    });
  }

  if (dishList) {
    dishList.addEventListener('click', event => {
      const addButton = event.target.closest('[data-dish-add]');
      if (!addButton) return;

      const dishId = Number(addButton.getAttribute('data-dish-add') || 0);
      const portionSelect = document.querySelector(`[data-dish-portion="${dishId}"]`);
      const qtyInput = document.querySelector(`[data-dish-qty="${dishId}"]`);

      const portion = normalizePortion(portionSelect?.value);
      const quantity = Math.max(1, Number(qtyInput?.value || 1));

      const added = addItemToDraft(dishId, quantity, portion);
      if (!added) {
        showSaveMessage('orderSaveMessage', 'Unable to add this dish.', true);
        return;
      }

    //   if (qtyInput) qtyInput.value = '1';
    //   showSaveMessage('orderSaveMessage', `${getPortionLabel(portion)} portion added to draft order.`);
    });
  }

  if (draftItemsContainer) {
    draftItemsContainer.addEventListener('click', event => {
      const actionButton = event.target.closest('[data-order-action]');
      if (!actionButton) return;

      const action = actionButton.getAttribute('data-order-action');
      const menuItemId = Number(actionButton.getAttribute('data-menu-item-id') || 0);
      const portion = actionButton.getAttribute('data-portion') || 'full';

      if (action === 'remove-draft-item') {
        removeItemFromDraft(menuItemId, portion);
      } else if (action === 'increment-draft-item') {
        adjustDraftItemQuantity(menuItemId, portion, 1);
      } else if (action === 'decrement-draft-item') {
        adjustDraftItemQuantity(menuItemId, portion, -1);
      }
    });
  }

  if (cancelButton) {
    cancelButton.addEventListener('click', () => {
      resetOrderForm();
    });
  }

  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();

      if (!orderCrudState.draftItems.length) {
        showSaveMessage('orderSaveMessage', 'Add at least one dish before creating the order.', true);
        return;
      }

      const isEdit = orderCrudState.editingOrderId !== null;
      const url = isEdit ? `/api/orders/${orderCrudState.editingOrderId}` : `/api/orders/${headerRestaurantId}`;
      const method = isEdit ? 'PUT' : 'POST';

      try {
        const resolvedCustomerId = await resolveCustomerForCarOrder();
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildOrderPayload(shouldCaptureCustomerDetails() ? resolvedCustomerId : null))
        });

        if (!response.ok) {
          throw new Error(`Save failed with status ${response.status}`);
        }

        window.location.assign('/orders/open');
      } catch (error) {
        showSaveMessage('orderSaveMessage', error.message || 'Unable to save order.', true);
      }
    });
  }
}

 

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();

  const editId = new URLSearchParams(window.location.search).get('editId');
  if (editId) orderCrudState.editingOrderId = Number(editId);

  setupOrderPage();
  setDraftItems([]);
  setCarOrderFieldsVisibility();

  refreshTableOptions();

  loadMenuItems().then(() => {
    if (orderCrudState.editingOrderId) {
      return loadOrderForEdit(orderCrudState.editingOrderId).catch(error => {
        showSaveMessage('orderSaveMessage', error.message || 'Unable to load order for editing.', true);
      });
    }
  }).catch(error => {
    const dishList = document.getElementById('dish-list');
    if (dishList) {
      dishList.innerHTML = '<div class="muted">Unable to load dishes right now.</div>';
    }
    showSaveMessage('orderSaveMessage', error.message || 'Unable to load menu items.', true);
  });
});
