const orderCrudState = {
  items: [],
  editingId: null,
  menuItems: [],
  draftItems: [],
  closingId: null,
  discounts: [],
  kotPreviewId: null,
  kotPrintHistory: null,
  customerLookupTimerId: null
};

const orderKotStatus = new Map();
const orderInvoicePrintMap = new Map();
const IN_KITCHEN = 'in-kitchen';
const OUT_KITCHEN = 'out-kitchen';

const KOT_PRINT_STATE_KEY = 'zaffaran.kot.printHistory.v1';

function trimValue(value) {
  return String(value || '').trim();
}

function isOrderCarSelected() {
  const orderType = String(document.getElementById('orderType')?.value || '').trim().toLowerCase();
  return orderType === 'car';
}

function isOrderTakeawaySelected() {
  const orderType = String(document.getElementById('orderType')?.value || '').trim().toLowerCase();
  return orderType === 'takeaway';
}

function shouldCaptureOrderCustomerDetails() {
  return isOrderCarSelected() || isOrderTakeawaySelected();
}

function setOrderCustomerMessage(message, isError = false) {
  showSaveMessage('orderCustomerLookupMessage', message, isError);
}

function normalizeOrderCarNumber(value) {
  return String(value || '').trim().toUpperCase();
}

function setOrderCustomerFieldsVisibility() {
  const shell = document.getElementById('orderCustomerFields');
  const carField = document.getElementById('orderCarNumberField');
  const carInput = document.getElementById('orderCarNumber');
  const phoneInput = document.getElementById('orderCustomerPhone');
  const nameInput = document.getElementById('orderCustomerName');
  const customerId = document.getElementById('orderCustomerId');

  const visible = shouldCaptureOrderCustomerDetails();
  const showCarField = isOrderCarSelected();

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
    if (customerId) customerId.value = '';
    phoneInput.value = '';
    nameInput.value = '';
    setOrderCustomerMessage('');
  }
}

function applyOrderResolvedCustomer(customer) {
  const idInput = document.getElementById('orderCustomerId');
  const phoneInput = document.getElementById('orderCustomerPhone');
  const nameInput = document.getElementById('orderCustomerName');
  const carInput = document.getElementById('orderCarNumber');

  if (idInput) idInput.value = customer?.id ? String(customer.id) : '';
  if (phoneInput && customer?.phone) phoneInput.value = customer.phone;
  if (nameInput) nameInput.value = customer?.name || '';
  if (carInput && customer?.carNumber) carInput.value = customer.carNumber;
}

async function lookupOrderCustomerByIdentifier() {
  if (!shouldCaptureOrderCustomerDetails()) return null;

  const phone = trimValue(document.getElementById('orderCustomerPhone')?.value);
  const carNumber = normalizeOrderCarNumber(document.getElementById('orderCarNumber')?.value);
  const idInput = document.getElementById('orderCustomerId');

  if (!phone && !carNumber) {
    if (idInput) idInput.value = '';
    setOrderCustomerMessage('');
    return null;
  }

  const params = new URLSearchParams();
  if (phone) params.set('phone', phone);
  if (carNumber) params.set('carNumber', carNumber);

  try {
    const response = await fetch(`/api/customers/search?${params.toString()}`);
    if (response.status === 404) {
      if (idInput) idInput.value = '';
      setOrderCustomerMessage('No customer found. Enter details to create one.');
      return null;
    }

    if (!response.ok) {
      throw new Error(`Customer lookup failed with status ${response.status}`);
    }

    const customer = await response.json();
    applyOrderResolvedCustomer(customer);
    setOrderCustomerMessage('Customer details loaded from existing profile.');
    return customer;
  } catch (error) {
    setOrderCustomerMessage(error.message || 'Customer lookup failed.', true);
    return null;
  }
}

async function resolveCustomerForOrder(defaultCustomerId = 0) {
  if (!shouldCaptureOrderCustomerDetails()) return Number(defaultCustomerId || 0);

  const phone = trimValue(document.getElementById('orderCustomerPhone')?.value);
  const name = trimValue(document.getElementById('orderCustomerName')?.value);
  const carInput = document.getElementById('orderCarNumber');
  const carNumber = normalizeOrderCarNumber(carInput?.value);

  if (!name && !phone) {
    return;
  }
  // if (!phone) {
  //   throw new Error('Mobile number is required for takeaway and car orders.');
  // }
  if (isOrderCarSelected() && !carNumber) {
    throw new Error('Car number is required for car orders.');
  }

  if (carInput) {
    carInput.value = isOrderCarSelected() ? carNumber : '';
  }

  const response = await fetch('/api/customers/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone,
      name,
      carNumber: isOrderCarSelected() ? carNumber : ''
    })
  });

  let responseBody = null;
  try {
    responseBody = await response.json();
  } catch (error) {
    responseBody = null;
  }

  if (!response.ok) {
    throw new Error(responseBody?.message || `Customer resolve failed with status ${response.status}`);
  }

  applyOrderResolvedCustomer(responseBody);
  setOrderCustomerMessage('Customer details attached to this order.');
  return Number(responseBody?.id || defaultCustomerId || 0);
}

function setCloseOrderCustomerMessage(message, isError = false) {
  showSaveMessage('closeOrderCustomerLookupMessage', message, isError);
}

function applyResolvedCustomer(customer) {
  const phoneInput = document.getElementById('closeOrderCustomerPhone');
  const nameInput = document.getElementById('closeOrderCustomerName');
  const idInput = document.getElementById('closeOrderCustomerId');

  if (phoneInput && customer?.phone) phoneInput.value = customer.phone;
  if (nameInput) nameInput.value = customer?.name || '';
  if (idInput) idInput.value = customer?.id ? String(customer.id) : '';
}

async function lookupCustomerByPhone(phoneValue, silentIfMissing = false) {
  const phone = trimValue(phoneValue);
  const nameInput = document.getElementById('closeOrderCustomerName');
  const idInput = document.getElementById('closeOrderCustomerId');

  if (!phone) {
    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';
    if (!silentIfMissing) setCloseOrderCustomerMessage('');
    return null;
  }

  try {
    const response = await fetch(`/api/customers/search?phone=${encodeURIComponent(phone)}`);

    if (response.status === 404) {
      if (idInput) idInput.value = '';
      if (!silentIfMissing) {
        // setCloseOrderCustomerMessage('Customer not found for this phone. Enter name to create new customer.', true);
      }
      return null;
    }

    if (!response.ok) {
      throw new Error(`Customer lookup failed with status ${response.status}`);
    }

    const customer = await response.json();
    applyResolvedCustomer(customer);
    if (!silentIfMissing) {
      // setCloseOrderCustomerMessage('Existing customer found and loaded.');
    }
    return customer;
  } catch (error) {
    setCloseOrderCustomerMessage(error.message, true);
    return null;
  }
}

async function resolveCustomerForCloseOrder(defaultCustomerId = 0) {
  const phoneInput = document.getElementById('closeOrderCustomerPhone');
  const nameInput = document.getElementById('closeOrderCustomerName');
  const idInput = document.getElementById('closeOrderCustomerId');

  const phone = trimValue(phoneInput?.value);
  const name = trimValue(nameInput?.value);

  if (!phone && !name) {
    return Number(defaultCustomerId || 0);
  }

 const response = await fetch('/api/customers/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, name })
  });

  let responseBody = null;
  try {
    responseBody = await response.json();
  } catch (error) {
    responseBody = null;
  }

  if (!response.ok) {
    throw new Error(responseBody?.message || `Customer resolve failed with status ${response.status}`);
  }

  applyResolvedCustomer(responseBody);
  if (idInput && responseBody?.id) idInput.value = String(responseBody.id);
  setCloseOrderCustomerMessage('Customer details attached to this order.');
  return Number(responseBody?.id || defaultCustomerId || 0);
}

function getMenuItemPrice(menuItem) {
  return getMenuItemPriceByPortion(menuItem, 'full');
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

function inferPortionFromPrice(menuItem, price) {
  const target = Number(price || 0);
  const epsilon = 0.001;

  if (Math.abs(target - Number(menuItem?.qtr_price ?? Number.NaN)) < epsilon) return 'qtr';
  if (Math.abs(target - Number(menuItem?.half_price ?? Number.NaN)) < epsilon) return 'half';
  if (Math.abs(target - Number(menuItem?.full_price ?? Number.NaN)) < epsilon) return 'full';

  return 'full';
}

function normalizeOrderItem(item, menuItems = []) {
  if (!item) return null;

  const menuItemId = Number(item.menuItem?.id ?? item.menuItemId ?? item.menu_item_id ?? 0);
  const menuItem = item.menuItem || menuItems.find(candidate => Number(candidate.id) === menuItemId) || {};
  if (!menuItemId) return null;

  return {
    menuItemId,
    name: menuItem.name || item.name || `Item #${menuItemId}`,
    quantity: Number(item.quantity || 1),
    portion: normalizePortion(item.portion || inferPortionFromPrice(menuItem, item.price)),
    price: Number(item.price ?? getMenuItemPrice(menuItem)),
    kitchenType: normalizeKitchenType(menuItem.kitchen_type || item.kitchenType),
    onMrp: Boolean(menuItem.onMrp ?? item.onMrp)
  };
}

function normalizeKitchenType(value) {
  const kitchenType = String(value || '').trim().toLowerCase();
  return kitchenType === 'out-kitchen' ? 'out-kitchen' : 'in-kitchen';
}

function getKitchenTypeLabel(kitchenType) {
  return normalizeKitchenType(kitchenType) === 'out-kitchen' ? 'Out Kitchen' : 'In Kitchen';
}

function normalizeOrderItems(order) {
  const items = Array.isArray(order?.orderItems)
    ? order.orderItems
    : (Array.isArray(order?.itemsPayload) ? order.itemsPayload : []);
  return items.map(item => normalizeOrderItem(item, order?.menuItems || [])).filter(Boolean);
}

function getKotItemSignature(item) {
  return `${Number(item.menuItemId || 0)}:${normalizePortion(item.portion)}:${Number(item.price || 0).toFixed(2)}`;
}

function groupKotItems(items) {
  const grouped = new Map();

  items.forEach(item => {
    const signature = getKotItemSignature(item);
    const existing = grouped.get(signature);

    if (existing) {
      existing.quantity += Number(item.quantity || 0);
      return;
    }

    grouped.set(signature, {
      ...item,
      quantity: Number(item.quantity || 0),
      signature
    });
  });

  return Array.from(grouped.values());
}

function loadKotPrintHistory() {
  if (orderCrudState.kotPrintHistory) return orderCrudState.kotPrintHistory;

  try {
    const raw = window.localStorage.getItem(KOT_PRINT_STATE_KEY);
    orderCrudState.kotPrintHistory = raw ? JSON.parse(raw) : {};
  } catch (error) {
    orderCrudState.kotPrintHistory = {};
  }

  return orderCrudState.kotPrintHistory;
}

function saveKotPrintHistory(history) {
  orderCrudState.kotPrintHistory = history;

  try {
    window.localStorage.setItem(KOT_PRINT_STATE_KEY, JSON.stringify(history));
  } catch (error) {
    // Ignore storage failures and keep the in-memory state for this session.
  }
}

function getKotPrintedQuantityMap(orderId) {
  const history = loadKotPrintHistory();
  return history[String(orderId)] || {};
}

function getKotPreviewItems(order) {
  const groupedItems = groupKotItems(normalizeOrderItems(order));
  const printedQuantityMap = getKotPrintedQuantityMap(order?.id);

  return groupedItems.map(item => {
    const printedQuantity = Number(printedQuantityMap[item.signature] || 0);
    const remainingQuantity = Math.max(Number(item.quantity || 0) - printedQuantity, 0);

    return {
      ...item,
      printedQuantity,
      remainingQuantity,
      isAlreadyPrinted: remainingQuantity <= 0
    };
  });
}

function getSelectedKotItems(order) {
  const selectionElements = Array.from(document.querySelectorAll('#kotSelectionPanel .kot-selection-checkbox'));
  const selectedSignatures = new Set(
    selectionElements
      .filter(checkbox => checkbox.checked)
      .map(checkbox => checkbox.getAttribute('data-kot-item-signature'))
      .filter(Boolean)
  );

  return getKotPreviewItems(order)
    .filter(item => selectedSignatures.has(item.signature))
    .map(item => ({
      ...item,
      quantityToPrint: item.isAlreadyPrinted ? item.quantity : item.remainingQuantity,
      historyIncrement: item.isAlreadyPrinted ? 0 : item.remainingQuantity
    }));
}

function getKotSelectionSignatures() {
  return new Set(
    Array.from(document.querySelectorAll('#kotSelectionPanel .kot-selection-checkbox'))
      .filter(checkbox => checkbox.checked)
      .map(checkbox => checkbox.getAttribute('data-kot-item-signature'))
      .filter(Boolean)
  );
}

function buildKotTicketSectionMarkup(order, kitchenType, items) {
  var jsonOrdersKot = {
    "orderId": order.id,
    "kitchenType": kitchenType,
    "order": order,
    "items": items.map(item => ({
      "name": item.name,
      "portion": item.portion,
      "quantityToPrint": item.quantityToPrint
    }))
  };
  var key = order.id + (kitchenType === 'in-kitchen' ? IN_KITCHEN : OUT_KITCHEN);
  orderKotStatus.set(key, jsonOrdersKot);

  const itemRows = items.length
    ? items.map(item => `
      <tr><td>${item.name}</td><td>${getPortionLabel(item.portion)}</td><td>${item.quantityToPrint}</td></tr>
      `).join('')
    : `<div class="kot-ticket-note">No ${getKitchenTypeLabel(kitchenType)} items selected.</div>`;

  return `
   <div class="text-center kot-ticket-section">
  <p><b>Kitchen Order Ticket</b></p>
  <p><b>${getKitchenTypeLabel(kitchenType)}</b></p>
  <p>${getFormattedCurrentDateTime()}</p>
  <p><b>Order No:</b> ${order.strOrderId || '-'}</p>
  <p> ${order.order_type == 'Dine-in' ? '<b>Dine-in</b> <br/><b>Table: </b>'+ (order.tableId || '-') : (order.order_type == 'car' ? '<b>Car Number:</b> '+ (order.customer?.carNumber || '-') : '<b>'+order.order_type+'</b>')}</p>
  <p> ${order.server_name ? '<b>Server:</b> ' + order.server_name : ''}</p>
  <hr/>
  <table class="table kot-table">
  <tr><th>Item</th><th>Portion</th><th>Qty</th></tr>
  ${itemRows}
  </table>
  </div>
  `;
}

function splitKotItemsByKitchenType(selectedItems) {
  const inKitchenItems = selectedItems.filter(item => normalizeKitchenType(item.kitchenType) === 'in-kitchen');
  const outKitchenItems = selectedItems.filter(item => normalizeKitchenType(item.kitchenType) === 'out-kitchen');
  return { inKitchenItems, outKitchenItems };
}

function buildKotTicketMarkup(order, selectedItems) {
  const { inKitchenItems, outKitchenItems } = splitKotItemsByKitchenType(selectedItems);

  const sections = [];
  if (inKitchenItems.length) sections.push(buildKotTicketSectionMarkup(order, 'in-kitchen', inKitchenItems));
  if (outKitchenItems.length) sections.push(buildKotTicketSectionMarkup(order, 'out-kitchen', outKitchenItems));

  if (!sections.length) {
    return buildKotTicketSectionMarkup(order, 'in-kitchen', []);
  }

  return sections.join('<div class="kot-ticket-page-break"></div>');
}

function renderKotSelectionMarkup(previewItems, selectedSignatures = null) {
  const visibleItems = previewItems;
  const selectionCount = visibleItems.length;
  const selectedCount = previewItems.filter(item => {
    if (!selectedSignatures) return item.remainingQuantity > 0;
    return selectedSignatures.has(item.signature);
  }).length;

  if (!visibleItems.length) {
    return `
      <div class="empty-state">No items available for this order.</div>
      <p class="muted" id="kotSelectionMessage">This order has no printable dishes right now. Turn on reprint mode to include old items.</p>
    `;
  }

  const rows = visibleItems.map(item => {
    const disabled = item.remainingQuantity <= 0;
    const checked = selectedSignatures ? selectedSignatures.has(item.signature) : item.remainingQuantity > 0;
    const remainingLabel = disabled
      ? 'Already printed'
      : `${item.remainingQuantity} remaining`;

    return `
      <label class="kot-selection-row ${disabled ? 'is-printed' : ''}">
        <input type="checkbox" class="kot-selection-checkbox" data-kot-item-signature="${item.signature}" ${checked ? 'checked' : ''} />
        <span class="kot-selection-copy">
          <span class="kot-selection-name">${item.name}</span>
          <span class="kot-selection-meta">${getKitchenTypeLabel(item.kitchenType)} • ${getPortionLabel(item.portion)} • Qty ${item.quantity} • ${remainingLabel}</span>
        </span>
      </label>
    `;
  }).join('');

  return `
    <div class="kot-selection-summary">${selectedCount} item${selectedCount === 1 ? '' : 's'} selected • ${selectionCount} printable total</div>
    <div class="kot-selection-list">${rows}</div>
    <p class="muted" id="kotSelectionMessage">Select the dishes to include in this KOT. Already printed items start unchecked, but you can select them to reprint if needed.</p>
  `;





}

function updateKotPreviewContent(order) {
  const preview = document.getElementById('kotPreviewContent');
  const selection = document.getElementById('kotItemSelection');
  const submitButton = document.querySelector('#kotPreviewForm button[type="submit"]');
  if (!preview || !selection || !order) return;

  const previewItems = getKotPreviewItems(order);
  const selectedSignatures = selection.querySelectorAll('.kot-selection-checkbox').length ? getKotSelectionSignatures() : null;
  selection.innerHTML = renderKotSelectionMarkup(previewItems, selectedSignatures);

  const selectedItems = getSelectedKotItems(order);
  preview.innerHTML = buildKotTicketMarkup(order, selectedItems);

  if (submitButton) submitButton.disabled = selectedItems.length === 0;

  const message = document.getElementById('kotSelectionMessage');
  if (message) {
    const remaining = previewItems.filter(item => item.remainingQuantity > 0).length;
    message.textContent = remaining
      ? `Select from ${remaining} unprinted item${remaining === 1 ? '' : 's'}. You can also check already printed items to reprint them.`
      : 'All items in this order were already printed. Check any item to reprint it.';
  }
}

function markKotItemsAsPrinted(orderId, selectedItems) {
  if (!selectedItems.length) return;

  const history = loadKotPrintHistory();
  const orderHistory = { ...(history[String(orderId)] || {}) };

  selectedItems.forEach(item => {
    const existingQuantity = Number(orderHistory[item.signature] || 0);
    orderHistory[item.signature] = existingQuantity + Number(item.historyIncrement ?? item.quantityToPrint ?? 0);
  });

  history[String(orderId)] = orderHistory;
  saveKotPrintHistory(history);
}

function sumOrderItems(items) {
  return items.reduce((total, item) => total + (Number(item.price || 0) * Number(item.quantity || 0)), 0);
}

// Dishes marked "on MRP" are excluded from the tax-able amount.
function sumTaxableOrderItems(items) {
  return items.reduce((total, item) => total + (item.onMrp ? 0 : Number(item.price || 0) * Number(item.quantity || 0)), 0);
}

function calculateOrderSummary(subtotal, taxPercentage, discountPerc, onSpotDiscount, taxableSubtotal = subtotal) {
  const safeSubtotal = Number(subtotal || 0);
  const safeTaxableSubtotal = Number(taxableSubtotal ?? subtotal ?? 0);
  const safeTaxPercentage = Number(taxPercentage || 0);
  const safeDiscountPerc = Number(discountPerc || 0);
  const safeOnSpotDiscount = Number(onSpotDiscount || 0);
  const taxAmount = (safeTaxableSubtotal * safeTaxPercentage) / 100;
  const discountAmount = (safeTaxableSubtotal * safeDiscountPerc) / 100;
  const totalAmount = Math.max(safeSubtotal + taxAmount - discountAmount - safeOnSpotDiscount, 0);
  const totalPayable = Math.round(totalAmount);
  const adjustment = (totalPayable - totalAmount).toFixed(2);
  // const adjustment = difference.toFixed(2) < 0.50 ? "+"+difference.toFixed(2) : "-"+difference.toFixed(2);
  

  return {
    subtotal: safeSubtotal,
    taxableSubtotal: safeTaxableSubtotal,
    mrpSubtotal: Math.max(safeSubtotal - safeTaxableSubtotal, 0),
    taxPercentage: safeTaxPercentage,
    taxAmount,
    discountPerc: safeDiscountPerc,
    discountAmount,
    onSpotDiscount: safeOnSpotDiscount,
    totalPayable,
    totalAmount,adjustment
  };
}

function getDiscountById(discountId) {
  return orderCrudState.discounts.find(item => Number(item.id) === Number(discountId));
}

function renderDiscountOptions() {
  const select = document.getElementById('closeOrderDiscountId');
  if (!select) return;

  const options = ['<option value="">No discount</option>'];
  orderCrudState.discounts.forEach(discount => {
    options.push(`<option value="${discount.id}">${discount.discountName || 'Discount'} (${Number(discount.discountPerc || 0).toFixed(0)}%)</option>`);
  });

  select.innerHTML = options.join('');
}

async function loadDiscounts() {
  const response = await fetch(`/api/discounts/${headerRestaurantId}`);
  const data = await response.json();
  orderCrudState.discounts = Array.isArray(data) ? data : [];
  renderDiscountOptions();
}

function renderKotPreview(order) {
  updateKotPreviewContent(order);
}



function resetKotPreview() {
  const form = document.getElementById('kotPreviewForm');
  if (form) form.reset();
  orderCrudState.kotPreviewId = null;
  showSaveMessage('kotPrintMessage', '');
  const selection = document.getElementById('kotItemSelection');
  if (selection) selection.innerHTML = '';
  const preview = document.getElementById('kotPreviewContent');
  if (preview) preview.innerHTML = '';
}

function closeKotPreviewModal() {
  resetKotPreview();
  toggleModal('kotPreviewModal', 'kotPreviewModalBackdrop', false);
}

function openKotPreviewModal(orderId) {
  const order = orderCrudState.items.find(item => Number(item.id) === Number(orderId));
  if (!order) return;

  orderCrudState.kotPreviewId = order.id;
  renderKotPreview(order);

  showSaveMessage('kotPrintMessage', '');
  toggleModal('kotPreviewModal', 'kotPreviewModalBackdrop', true);
}

function getSelectedCloseDiscount() {
  const discountId = document.getElementById('closeOrderDiscountId')?.value;
  if (!discountId) return null;
  return getDiscountById(discountId) || null;
}

function getCloseOrderCustomerSnapshot(order) {
  const formPhone = trimValue(document.getElementById('closeOrderCustomerPhone')?.value);
  const formName = trimValue(document.getElementById('closeOrderCustomerName')?.value);
  const formId = trimValue(document.getElementById('closeOrderCustomerId')?.value);

  const customerName = formName || trimValue(order?.customer?.name || '');
  const customerPhone = formPhone || trimValue(order?.customer?.phone || '');
  const customerId = formId || (order?.customer?.id ? String(order.customer.id) : '');

  return {
    customerName: customerName || 'Walk-in guest',
    customerPhone,
    customerId
  };
}

function renderCloseOrderPreview(order, summary, discount) {
  const preview = document.getElementById('closeOrderPreview');
  if (!preview || !order) return;

  const customer = getCloseOrderCustomerSnapshot(order);
  const customerPhoneMarkup = customer.customerPhone
    ? `<p><b>Phone:</b> ${customer.customerPhone}</p>`
    : '';
  const customerIdMarkup = customer.customerId
    ? `<p><b>Customer ID:</b> ${customer.customerId}</p>`
    : '';

  const items = normalizeOrderItems(order);
  const taxableItems = items.filter(item => !item.onMrp);
  const mrpItems = items.filter(item => item.onMrp);
  const renderItemRow = item => `
        <tr>
          <td>${item.name}<br/><small>${getPortionLabel(item.portion)} x ${item.quantity}</small></td>
          <td class="text-end">${formatCurrency(item.price)}</td>
          <td class="text-end">${formatCurrency(Number(item.price || 0) * Number(item.quantity || 0))}</td>
        </tr>
      `;

  // Taxable items are listed first; MRP (no-tax) items get their own labeled section below.
  const itemRows = items.length
    ? taxableItems.map(renderItemRow).join('')
      + (mrpItems.length
          ? `<tr class="receipt-section-row"><td colspan="3"><b>MRP Items</b> <span class="muted">(Tax not applicable)</span></td></tr>${mrpItems.map(renderItemRow).join('')}`
          : '')
    : '<tr><td colspan="5" class="empty-state">No items available for this order.</td></tr>';

  // var discountDetails = `<div class="receipt-summary-row"><span>Discount${discount ? ` - ${discount.discountName}` : ''}${summary.discountPerc ? ` (${summary.discountPerc.toFixed(0)}%)` : ''}</span><strong>- ${formatCurrency(summary.discountAmount)}</strong></div>`;
  var discountDetails =`<tr><td>Discount${discount ? ` - ${discount.discountName}` : ''}${summary.discountPerc ? ` (${summary.discountPerc.toFixed(0)}%)` : ''}</td><td>:</td><td class="text-end"><strong>- ${formatCurrency(summary.discountAmount)}</strong></td></tr>
        `;
  if(summary.discountAmount === 0){
    discountDetails = '';
  }
  var onSpotDiscountDetails = `<tr><td>On-Spot discount</td><td>:</td><td class="text-end"><strong>- ${formatCurrency(summary.onSpotDiscount)}</strong></td></tr>
        `;
  if (!summary.onSpotDiscount) {
    onSpotDiscountDetails = '';
  }
  var mrpSubtotalDetails = `<tr><td>MRP Items <span class="muted">(No Tax)</span></td><td>:</td><td class="text-end"><strong>${formatCurrency(summary.mrpSubtotal)}</strong></td></tr>
        `;
  if (!summary.mrpSubtotal) {
    mrpSubtotalDetails = '';
  }
   var invoiceJson = {
    "order": order,
    "customer": customer,
    "taxableItems":taxableItems,
    "mrpItems":mrpItems,
    "summary": summary,
    "discount": discount
  };
  orderInvoicePrintMap.set(order.id, invoiceJson);
  
  preview.innerHTML = `
  <div class="text-center kot-panel">
  <p>${getFormattedCurrentDateTime()}</p>
  <p><b>Order No:</b> ${order.strOrderId || '-'}</p>
  <p><b>Customer:</b> ${customer.customerName}</p>
  ${customerPhoneMarkup}
  
  </div>
  <hr/>
    <div class="table-responsive">
      <table class="table kot-table" style="margin-top:0px;">
        <thead>
          <tr><th>Item<br/>Qty</th><th class="text-end">Rate</th><th class="text-end">Amount</th></tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
        <tr><td>Taxable Subtotal</td><td>:</td><td class="text-end"><strong>${formatCurrency(summary.taxableSubtotal)}</strong></td></tr>
        <tr><td>Tax (${summary.taxPercentage.toFixed(0)}%)</td><td>:</td><td class="text-end"><strong>${formatCurrency(summary.taxAmount)}</strong></td></tr>
        ${mrpSubtotalDetails}
        ${discountDetails}
        ${onSpotDiscountDetails}
        <tr><td>Total Amount</td><td>:</td><td class="text-end"><strong>${formatCurrency(summary.totalAmount)}</strong></td></tr>
        <tr><td>Adjustment</td><td>:</td><td class="text-end"><strong>${formatCurrency(summary.adjustment || 0)}</strong></td></tr>
        <tr style="border-top: 2px solid;"><td><b>Total Payable</b></td><td>:</td><td class="text-end"><strong>${formatCurrency(summary.totalPayable)}</strong></td></tr>
        </tfoot>
      </table>
    </div>
    <p>Terms & Conditions applied</p>
  `;


 
}

function getCloseOrderNoTax() {
  return Boolean(document.getElementById('closeOrderNoTax')?.checked);
}

function refreshCloseOrderSummary(forceRecalculateAmounts = true) {
  const order = orderCrudState.items.find(item => Number(item.id) === Number(orderCrudState.closingId));
  if (!order) return null;

  const orderItems = normalizeOrderItems(order);
  const subtotal = Number(order.item_price || sumOrderItems(orderItems) || 0);
  const taxableSubtotal = sumTaxableOrderItems(orderItems);
  const noTax = getCloseOrderNoTax();
  const taxPercentage = noTax ? 0 : Number(document.getElementById('closeOrderTaxPercentage')?.value || order.tax_percentage || 0);
  const discount = getSelectedCloseDiscount();
  const discountPerc = Number(discount?.discountPerc ?? 0);
  const onSpotDiscount = Number(document.getElementById('closeOrderOnSpotDiscount')?.value || 0);
  const summary = calculateOrderSummary(subtotal, taxPercentage, discountPerc, onSpotDiscount, taxableSubtotal);
  const discountAmountInput = document.getElementById('closeOrderDiscountAmount');
  const totalPayableInput = document.getElementById('closeOrderTotalPayable');
  const taxAmountInput = document.getElementById('closeOrderTaxAmount');

  if (discountAmountInput) discountAmountInput.value = summary.discountAmount.toFixed(0);
  if (taxAmountInput) taxAmountInput.value = summary.taxAmount.toFixed(2);
  if (totalPayableInput) totalPayableInput.value = summary.totalPayable.toFixed(0);

  syncCloseOrderPaymentInputs(forceRecalculateAmounts);

  renderCloseOrderPreview(order, summary, discount);
  return { summary, discount };
}

function getCloseOrderOnSpotDiscount() {
  return Number(document.getElementById('closeOrderOnSpotDiscount')?.value || 0);
}

function renderMenuOptionsMarkup() {
  if (!orderCrudState.menuItems.length) {
    return '<option value="">No dishes available</option>';
  }

  return orderCrudState.menuItems.map(menuItem => {
    const price = formatCurrency(getMenuItemPrice(menuItem));
    return `<option value="${menuItem.id}">${menuItem.name || `Dish #${menuItem.id}`}</option>`;
  }).join('');
}

function buildMenuOptions() {
  const menuSelect = document.getElementById('orderMenuItemId');
  const menuMessage = document.getElementById('orderMenuMessage');
  if (!menuSelect) return;

  // menuSelect.innerHTML = renderMenuOptionsMarkup();
  menuSelect.disabled = !orderCrudState.menuItems.length;

  const dishSelect = $('#orderMenuItemId');

  // Clear existing options
  dishSelect.empty();

  // Populate from array
    orderCrudState.menuItems.forEach(item => {
    const option = new Option(item.name, item.id, false, false);
    dishSelect.append(option);
  });

  // Activate Select2
  dishSelect.select2();

  if (menuMessage) {
    menuMessage.textContent = orderCrudState.menuItems.length ? '' : 'Load menu items first before adding dishes.';
  }

  updateDraftPriceHint();
}

function getSelectedPortion(orderId = null) {
  if (orderId === null) {
    const selected = document.querySelector('input[name="orderPortion"]:checked');
    return normalizePortion(selected?.value);
  }

  const selected = document.querySelector(`input[name="orderPortion-${orderId}"]:checked`);
  return normalizePortion(selected?.value);
}

function updateDraftPriceHint() {
  const priceHint = document.getElementById('orderSelectedPrice');
  const menuSelect = document.getElementById('orderMenuItemId');
  if (!priceHint || !menuSelect) return;

  const menuItem = getMenuItemById(menuSelect.value);
  if (!menuItem) {
    priceHint.textContent = '';
    return;
  }

  const portion = getSelectedPortion();
  const portionPrice = getMenuItemPriceByPortion(menuItem, portion);
  priceHint.textContent = `${getPortionLabel(portion)} portion price: ${formatCurrency(portionPrice)}`;
}

function updateInlinePriceHint(orderId) {
  const hint = document.querySelector(`[data-order-price-hint="${orderId}"]`);
  const menuSelect = document.querySelector(`[data-order-menu-select="${orderId}"]`);
  if (!hint || !menuSelect) return;

  const menuItem = getMenuItemById(menuSelect.value);
  if (!menuItem) {
    hint.textContent = '';
    return;
  }

  const portion = getSelectedPortion(orderId);
  const portionPrice = getMenuItemPriceByPortion(menuItem, portion);
  hint.textContent = `${getPortionLabel(portion)}: ${formatCurrency(portionPrice)}`;
}

function renderOrderItems(items, options = {}) {
  const emptyMessage = options.emptyMessage || 'No dishes added yet.';
  const orderId = options.orderId ?? null;
  const allowRemove = Boolean(options.allowRemove);

  if (!items.length) {
    return `<div class="order-empty">${emptyMessage}</div>`;
  }

  return items.map(item => `
    <div class="order-item-row">
      <div>
        <strong>${item.quantity} x ${item.name}</strong>
        <div class="muted">${getPortionLabel(item.portion)} • ${formatCurrency(item.price)} each</div>
      </div>
      <div class="order-item-row-actions">
        <div class="btn-group">
        ${allowRemove && orderId !== null ? `<button type="button" class="menu-action-btn minus" data-order-action="${orderId === 'draft' ? 'decrement-draft-item' : 'decrement-item'}" data-order-id="${orderId}" data-menu-item-id="${item.menuItemId}" data-portion="${item.portion}">-</button>` : ''}
        ${allowRemove && orderId !== null ? `<button type="button" class="menu-action-btn plus" data-order-action="${orderId === 'draft' ? 'add-draft-item' : 'increment-item'}" data-order-id="${orderId}" data-menu-item-id="${item.menuItemId}" data-portion="${item.portion}">+</button>` : ''}
       
        </div>
        
         <strong>${formatCurrency(item.price * item.quantity)}</strong>
      </div>
    </div>
  `).join('');
}

function getMenuItemById(menuItemId) {
  return orderCrudState.menuItems.find(item => Number(item.id) === Number(menuItemId));
}

function addItemToCollection(items, menuItemId, quantity, portion) {
  const menuItem = getMenuItemById(menuItemId);
  if (!menuItem) return null;

  const nextItems = items.map(item => ({ ...item }));
  const normalizedPortion = normalizePortion(portion);
  const existing = nextItems.find(item => Number(item.menuItemId) === Number(menuItemId) && normalizePortion(item.portion) === normalizedPortion);
  const normalizedQuantity = Math.max(1, Number(quantity || 1));
  const price = getMenuItemPriceByPortion(menuItem, normalizedPortion);

  if (existing) {
    existing.quantity += normalizedQuantity;
  } else {
    nextItems.push({
      menuItemId: Number(menuItem.id),
      name: menuItem.name || `Dish #${menuItem.id}`,
      quantity: normalizedQuantity,
      portion: normalizedPortion,
      price,
      kitchenType: normalizeKitchenType(menuItem.kitchen_type)
    });
  }

  return nextItems;
}

function removeItemFromCollection(items, menuItemId, portion = null) {
  const normalizedPortion = portion === null ? null : normalizePortion(portion);
  return items.filter(item => {
    if (Number(item.menuItemId) !== Number(menuItemId)) return true;
    if (normalizedPortion === null) return false;
    return normalizePortion(item.portion) !== normalizedPortion;
  });
}

// Decrements quantity by 1; drops the line entirely once it would hit 0.
function decrementItemInCollection(items, menuItemId, portion) {
  const normalizedPortion = normalizePortion(portion);
  const nextItems = items.map(item => ({ ...item }));
  const existing = nextItems.find(item => Number(item.menuItemId) === Number(menuItemId) && normalizePortion(item.portion) === normalizedPortion);
  if (!existing) return nextItems;

  existing.quantity -= 1;
  if (existing.quantity <= 0) {
    return nextItems.filter(item => item !== existing);
  }

  return nextItems;
}

function updateOrderAmountField(items) {
  const amount = document.getElementById('orderAmount');
  if (!amount) return;
  amount.value = sumOrderItems(items).toFixed(0);
}

function renderDraftItems(items) {
  const container = document.getElementById('orderDraftItems');
  if (!container) return;
  container.innerHTML = renderOrderItems(items, { orderId: 'draft', allowRemove: true, emptyMessage: 'Add dishes to build this order.' });
  updateOrderAmountField(items);
}

function setDraftItems(items) {
  orderCrudState.draftItems = Array.isArray(items) ? items : [];
  renderDraftItems(orderCrudState.draftItems);
}

function buildOrderPayload(baseOrder, items) {
  const orderItems = Array.isArray(items) ? items : [];
  const subtotal = sumOrderItems(orderItems);

  return {
    tableId: Number(baseOrder.tableId || 0),
    order_type: baseOrder.order_type || 'Dine-in',
    status: baseOrder.status || 'Pending',
    item_price: subtotal,
    server_name: baseOrder.server_name ?? document.getElementById('serverName')?.value ?? '',
    tax_percentage: Number(baseOrder.tax_percentage ?? 5),
    discount_perc: Number(baseOrder.discount_perc ?? 0),
    discount_amount: Number(baseOrder.discount_amount ?? 0),
    on_spot_discount: Number(baseOrder.on_spot_discount ?? 0),
    isSplitBill: Number(baseOrder.isSplitBill ?? 0),
    payment_mode: baseOrder.payment_mode || 'cash',
    cash_payment: Number(baseOrder.cash_payment ?? subtotal),
    card_payment: Number(baseOrder.card_payment ?? 0),
    upi_payment: Number(baseOrder.upi_payment ?? 0),
    createdByUserId: Number(baseOrder.createdBy?.id || document.getElementById('orderCreatedBy')?.value || 0),
    customerId: Number((baseOrder.customerId ?? baseOrder.customer?.id) || document.getElementById('orderCustomerId')?.value || 0),
    no_tax: Boolean(baseOrder.no_tax),
    itemsPayload: orderItems.map(item => ({
      menuItemId: Number(item.menuItemId),
      quantity: Number(item.quantity || 1),
      price: Number(item.price || 0),
      portion: normalizePortion(item.portion)
    })),
    items: orderItems.map(item => ({
      menuItemId: Number(item.menuItemId),
      quantity: Number(item.quantity || 1),
      price: Number(item.price || 0),
      portion: normalizePortion(item.portion)
    }))
  };
}

async function loadMenuItems() {
  const response = await fetch(`/api/menu/${headerRestaurantId}`);
  const data = await response.json();
  orderCrudState.menuItems = Array.isArray(data) ? data : [];
  buildMenuOptions();

  if (orderCrudState.items.length) {
    renderOrdersCards(orderCrudState.items);
  }
}

function setOrderFormMode(isEdit) {
  const title = document.getElementById('orderModalTitle');
  const submitButton = document.querySelector('#orderForm button[type="submit"]');
  if (title) title.textContent = isEdit ? 'Edit order' : 'New order';
  if (submitButton) submitButton.textContent = isEdit ? 'Update Order' : 'Create Order';
}

function resetCloseOrderForm() {
  const form = document.getElementById('closeOrderForm');
  if (form) form.reset();

  const splitHint = document.getElementById('closeOrderSplitHint');
  if (splitHint) splitHint.textContent = '';

  showSaveMessage('closeOrderSaveMessage', '');
  showSaveMessage('closeOrderPrintMessage', '');
  setCloseOrderCustomerMessage('');
  orderCrudState.closingId = null;
  renderCloseOrderPreview(null, calculateOrderSummary(0, 0, 0), null);
  syncCloseOrderPaymentInputs();
}

function closeCloseOrderModal() {
  resetCloseOrderForm();
  toggleModal('closeOrderModal', 'closeOrderModalBackdrop', false);
}

function syncCloseOrderPaymentInputs(forceRecalculateAmounts = false) {
  const setVisibility = (element, shouldShow) => {
    if (!element) return;
    element.hidden = !shouldShow;
    element.style.display = shouldShow ? '' : 'none';
  };

  const splitCheckbox = document.getElementById('closeOrderSplitBill');
  const isSplit = Boolean(splitCheckbox?.checked);
  const paymentModeSelect = document.getElementById('closeOrderPaymentMode');
  const paymentModeField = document.getElementById('closeOrderPaymentModeField');
  const singleAmountField = document.getElementById('closeOrderSingleAmountField');
  const singleAmountInput = document.getElementById('closeOrderSingleAmount');
  const cardField = document.getElementById('closeOrderCardField');
  const cashField = document.getElementById('closeOrderCashField');
  const upiField = document.getElementById('closeOrderUpiField');
  const cardInput = document.getElementById('closeOrderCardPayment');
  const cashInput = document.getElementById('closeOrderCashPayment');
  const upiInput = document.getElementById('closeOrderUpiPayment');
  const totalPayable = Number(document.getElementById('closeOrderTotalPayable')?.value || 0);
  const selectedMode = String(paymentModeSelect?.value || 'cash').toLowerCase();

  setVisibility(paymentModeField, !isSplit);
  setVisibility(singleAmountField, false);
  setVisibility(cardField, !isSplit && selectedMode === 'card');
  setVisibility(cashField, isSplit || (!isSplit && selectedMode === 'cash'));
  setVisibility(upiField, isSplit || (!isSplit && selectedMode === 'upi'));

  if (paymentModeSelect) paymentModeSelect.disabled = isSplit;
  if (singleAmountInput) singleAmountInput.required = false;
  if (cardInput) cardInput.required = !isSplit && selectedMode === 'card';
  if (cashInput) cashInput.required = isSplit || (!isSplit && selectedMode === 'cash');
  if (upiInput) upiInput.required = isSplit || (!isSplit && selectedMode === 'upi');

  if (isSplit) {
    if (forceRecalculateAmounts) {
      if (cashInput) cashInput.value = totalPayable.toFixed(0);
      if (upiInput) upiInput.value = '0';
      if (cardInput) cardInput.value = '0';
      if (singleAmountInput) singleAmountInput.value = totalPayable.toFixed(0);
    }
  } else {
    if (cashInput) cashInput.value = selectedMode === 'cash' ? totalPayable.toFixed(0) : '0';
    if (cardInput) cardInput.value = selectedMode === 'card' ? totalPayable.toFixed(0) : '0';
    if (upiInput) upiInput.value = selectedMode === 'upi' ? totalPayable.toFixed(0) : '0';
    if (singleAmountInput) singleAmountInput.value = totalPayable.toFixed(0);
  }

  updateCloseOrderSplitHint();
}

function updateCloseOrderSplitHint() {
  const splitHint = document.getElementById('closeOrderSplitHint');
  const splitCheckbox = document.getElementById('closeOrderSplitBill');
  const totalPayable = Number(document.getElementById('closeOrderTotalPayable')?.value || 0);
  const cashValue = Number(document.getElementById('closeOrderCashPayment')?.value || 0);
  const upiValue = Number(document.getElementById('closeOrderUpiPayment')?.value || 0);

  if (!splitHint) return;

  if (!splitCheckbox?.checked) {
    splitHint.textContent = '';
    return;
  }
console.log('Total Payable:', totalPayable, 'Cash:', cashValue, 'UPI:', upiValue);
  const splitTotal = cashValue + upiValue;
  const delta = totalPayable - splitTotal;
  console.log('Split Total:', splitTotal, 'Delta:', delta);
  if (Math.abs(delta) < 0.01) {
    splitHint.textContent = 'Split total matches payable amount.';
    splitHint.style.color = '#166534';
  } else {
    splitHint.textContent = `Split total is short by ${formatCurrency(Math.max(delta, 0))} or excess by ${formatCurrency(Math.max(-delta, 0))}.`;
    splitHint.style.color = '#b91c1c';
  }
}

  document.getElementById("closeOrderCashPayment").addEventListener("blur", function() {
    console.log("Final value:", this.value);
     const splitHint = document.getElementById('closeOrderSplitHint');
      const splitCheckbox = document.getElementById('closeOrderSplitBill');
      const totalPayable = Number(document.getElementById('closeOrderTotalPayable')?.value || 0);
      const cashValue = Number(document.getElementById('closeOrderCashPayment')?.value || 0);
      const upiValue = Number(document.getElementById('closeOrderUpiPayment')?.value || 0);

    console.log('Total Payable:', totalPayable, 'Cash:', cashValue, 'UPI:', upiValue);
      const splitTotal = cashValue + upiValue;
      const delta = totalPayable - splitTotal;
      console.log('Split Total:', splitTotal, 'Delta:', delta);
      if (Math.abs(delta) < 0.01) {
        splitHint.textContent = 'Split total matches payable amount.';
        splitHint.style.color = '#166534';
      } else {
        splitHint.textContent = `Split total is short by ${formatCurrency(Math.max(delta, 0))} or excess by ${formatCurrency(Math.max(-delta, 0))}.`;
        splitHint.style.color = '#b91c1c';
      }
  });

    document.getElementById("closeOrderUpiPayment").addEventListener("blur", function() {
       console.log("Final value:", this.value);
     const splitHint = document.getElementById('closeOrderSplitHint');
      const splitCheckbox = document.getElementById('closeOrderSplitBill');
      const totalPayable = Number(document.getElementById('closeOrderTotalPayable')?.value || 0);
      const cashValue = Number(document.getElementById('closeOrderCashPayment')?.value || 0);
      const upiValue = Number(document.getElementById('closeOrderUpiPayment')?.value || 0);

    console.log('Total Payable:', totalPayable, 'Cash:', cashValue, 'UPI:', upiValue);
      const splitTotal = cashValue + upiValue;
      const delta = totalPayable - splitTotal;
      console.log('Split Total:', splitTotal, 'Delta:', delta);
      if (Math.abs(delta) < 0.01) {
        splitHint.textContent = 'Split total matches payable amount.';
        splitHint.style.color = '#166534';
      } else {
        splitHint.textContent = `Split total is short by ${formatCurrency(Math.max(delta, 0))} or excess by ${formatCurrency(Math.max(-delta, 0))}.`;
        splitHint.style.color = '#b91c1c';
      }

  });

function openCloseOrderModal(id) {
  const order = orderCrudState.items.find(item => Number(item.id) === Number(id));
  if (!order) return;

  orderCrudState.closingId = order.id;

  const subtotal = Number(order.item_price || 0);
  const taxPercentage = Number(order.tax_percentage || 0);
  const taxAmount = Number(order.tax_amount || 0);
  const discountAmount = Number(order.discount_amount || 0);
  const onSpotDiscount = Number(order.on_spot_discount || 0);
  const amountInTotal =Number(order.total_payable_amount || (subtotal + taxAmount - discountAmount - onSpotDiscount));

  const totalPayable = Number(order.total_payable_amount || (subtotal + taxAmount - discountAmount - onSpotDiscount));

  const subtotalInput = document.getElementById('closeOrderSubtotal');
  const taxPercentageInput = document.getElementById('closeOrderTaxPercentage');
  const taxAmountInput = document.getElementById('closeOrderTaxAmount');
  const discountInput = document.getElementById('closeOrderDiscountAmount');
  const discountSelect = document.getElementById('closeOrderDiscountId');
  const onSpotDiscountInput = document.getElementById('closeOrderOnSpotDiscount');
  const totalInput = document.getElementById('closeOrderTotalPayable');
  const modeInput = document.getElementById('closeOrderPaymentMode');
  const singleAmountInput = document.getElementById('closeOrderSingleAmount');
  const cardInput = document.getElementById('closeOrderCardPayment');
  const splitCheckbox = document.getElementById('closeOrderSplitBill');
  const cashInput = document.getElementById('closeOrderCashPayment');
  const upiInput = document.getElementById('closeOrderUpiPayment');
  const customerPhoneInput = document.getElementById('closeOrderCustomerPhone');
  const customerNameInput = document.getElementById('closeOrderCustomerName');
  const customerIdInput = document.getElementById('closeOrderCustomerId');
  const noTaxCheckbox = document.getElementById('closeOrderNoTax');

  if (noTaxCheckbox) noTaxCheckbox.checked = Boolean(order.no_tax);

  if (subtotalInput) subtotalInput.value = subtotal.toFixed(0);
  if (taxPercentageInput) taxPercentageInput.value = taxPercentage.toFixed(2);
  if (taxAmountInput) taxAmountInput.value = taxAmount.toFixed(2);
  const matchedDiscount = orderCrudState.discounts.find(discount => Math.abs(Number(discount.discountPerc || 0) - Number(order.discount_perc || 0)) < 0.001) || null;
  if (discountSelect) discountSelect.value = matchedDiscount ? String(matchedDiscount.id) : '';
  if (discountInput) discountInput.value = discountAmount.toFixed(0);
  if (onSpotDiscountInput) onSpotDiscountInput.value = onSpotDiscount.toFixed(0);
  if (totalInput) totalInput.value = totalPayable.toFixed(0);

  const isSplit = Number(order.isSplitBill || 0) === 1;
  if (splitCheckbox) splitCheckbox.checked = isSplit;

  const paymentMode = String(order.payment_mode || 'cash').toLowerCase();
  if (modeInput) modeInput.value = isSplit ? 'cash' : paymentMode;

  if (isSplit) {
    const currentCash = Number(order.cash_payment || 0);
    const currentUpi = Number(order.upi_payment || 0);
    if (cashInput) cashInput.value = totalPayable.toFixed(0);
    if (upiInput) upiInput.value = currentUpi.toFixed(0);
    if (singleAmountInput) singleAmountInput.value = totalPayable.toFixed(0);
    if (cardInput) cardInput.value = Number(order.card_payment || 0).toFixed(0);
  } else {
    if (paymentMode === 'cash') {
      if (singleAmountInput) singleAmountInput.value = totalPayable.toFixed(0);
      if (cashInput) cashInput.value = totalPayable.toFixed(0);
    } else if (paymentMode === 'card') {
      if (cardInput) cardInput.value = totalPayable.toFixed(0);
    } else if (paymentMode === 'upi') {
      if (upiInput) upiInput.value = totalPayable.toFixed(0);
    }
  }

  if (customerPhoneInput) customerPhoneInput.value = trimValue(order.customer?.phone || '');
  if (customerNameInput) customerNameInput.value = trimValue(order.customer?.name || '');
  if (customerIdInput) customerIdInput.value = order.customer?.id ? String(order.customer.id) : '';
  setCloseOrderCustomerMessage('');

  refreshCloseOrderSummary();
  syncCloseOrderPaymentInputs(true);
  toggleModal('closeOrderModal', 'closeOrderModalBackdrop', true);
}

function resetOrderForm() {
  const form = document.getElementById('orderForm');
  if (form) form.reset();

  const orderCustomerId = document.getElementById('orderCustomerId');
  const orderCustomerPhone = document.getElementById('orderCustomerPhone');
  const orderCustomerName = document.getElementById('orderCustomerName');
  const orderCarNumber = document.getElementById('orderCarNumber');
  if (orderCustomerId) orderCustomerId.value = '';
  if (orderCustomerPhone) orderCustomerPhone.value = '';
  if (orderCustomerName) orderCustomerName.value = '';
  if (orderCarNumber) orderCarNumber.value = '';

  orderCrudState.editingId = null;
  setDraftItems([]);
  setOrderFormMode(false);
  setOrderCustomerFieldsVisibility();
  setOrderCustomerMessage('');
  showSaveMessage('orderSaveMessage', '');
}

async function loadOrders() {
  const res = await fetch(`/api/orders/openOrders/${headerRestaurantId}`);
  const data = await res.json();
  orderCrudState.items = Array.isArray(data) ? data : [];
  renderOrdersCards(orderCrudState.items);
}

function renderOrdersCards(items) {
  const body = document.getElementById('ordersGrid');
  if (!body) return;

  if (!items.length) {
    body.innerHTML = '<div class="empty-state order-empty-card">No orders have been posted yet.</div>';
    return;
  }

  const menuOptions = renderMenuOptionsMarkup();

  body.innerHTML = items.map(order => {
    const orderItems = normalizeOrderItems(order);
    const itemCount = orderItems.reduce((total, item) => total + Number(item.quantity || 0), 0);

    return `
      <article class="order-card panel" data-order-id="${order.id}" style="margin-top: 20px;">
      <div class="order-card-kicker ${order.order_type}"><span style="font-size:14px; font-weight:bold;">${(order.order_type === 'Dine-in' && order.tableId ? 'Table ' + order.tableId : '')}  ${order.order_type === 'car' ? 'Car'  : ''}  ${order.order_type === 'Takeaway' ? 'Takeaway'  : ''}</span> <br/>${order.strOrderId || '000'}</div>
         
        <div class="order-card-head">
             
           
          <span class="status-pill time">${formatDateTime(order.createdAt)}</span>
          <span class="status-pill ${statusClass(order.status)}">${order.status || 'Pending'}</span>
          <span class="status-pill info">${itemCount} dish${itemCount === 1 ? '' : 'es'}</span>
        </div>
        <div class="order-card-head">
        <div>
            <div style="">${order.customer ? '<b>Customer Name:</b> ' + order.customer.name + ' (' + order.customer.phone + ')' : ''}</div>
            <div style=""> ${order.server_name ? '<b>Server: </b>' + order.server_name : ''}</div>
        <div>
        </div>
        <div class="order-card-items">
          ${renderOrderItems(orderItems, { orderId: order.id, allowRemove: false, emptyMessage: 'No dishes on this order yet.' })}
        </div>
    
        <div class="order-card-footer">
          <div>
            <span class="section-tag">Total payable</span>
            <strong>${formatCurrency(order.total_payable_amount ?? order.item_price ?? 0)}</strong>
          </div>
          </div>
          <div class="order-card-actions">
          <div class="menu-actions">
            <button type="button" class="menu-action-btn edit" data-order-action="edit" data-order-id="${order.id}">Edit</button>
            <!--button type="button" class="menu-action-btn delete" data-order-action="delete" data-order-id="${order.id}">Delete</button>-->
              <button type="button" class="menu-action-btn print" data-order-action="print-kot" data-order-id="${order.id}">Print KOT</button>
            <button type="button" class="menu-action-btn close" data-order-action="close" data-order-id="${order.id}">Pay & Close</button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  items.forEach(order => updateInlinePriceHint(order.id));
}

function openOrderForEdit(id) {
  const order = orderCrudState.items.find(item => Number(item.id) === Number(id));
  if (!order) return;

  orderCrudState.editingId = order.id;
  setOrderFormMode(true);

  const table = document.getElementById('orderTableId');
  const amount = document.getElementById('orderAmount');
  const status = document.getElementById('orderStatus');
  const type = document.getElementById('orderType');
  const serverName = document.getElementById('serverName');
  const createdBy = document.getElementById('orderCreatedBy');
  const customer = document.getElementById('orderCustomerId');
  const customerPhone = document.getElementById('orderCustomerPhone');
  const customerName = document.getElementById('orderCustomerName');
  const carNumber = document.getElementById('orderCarNumber');

  if (table) table.value = order.tableId ?? 1;
  if (amount) amount.value = Number(order.item_price || 0).toFixed(0);
  if (status) status.value = order.status || 'Pending';
  if (type) type.value = order.order_type || 'Dine-in';
  if (serverName) serverName.value = order.server_name || '';
  if (createdBy && order.createdBy?.id) createdBy.value = String(order.createdBy.id);
  if (customer && order.customer?.id) customer.value = String(order.customer.id);
  if (customerPhone) customerPhone.value = order.customer?.phone || '';
  if (customerName) customerName.value = order.customer?.name || '';
  if (carNumber) carNumber.value = order.customer?.carNumber || '';

  setOrderCustomerFieldsVisibility();
  setOrderCustomerMessage('');

  setDraftItems(normalizeOrderItems(order));
  toggleModal('orderModal', 'orderModalBackdrop', true);
}

async function removeOrder(id) {
  if (!window.confirm('Delete this order?')) return;
  const response = await fetch(`/api/orders/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`Delete failed with status ${response.status}`);
  }
  await loadOrders();
}

function printKot(orderId) {
  var kot = orderKotStatus.get(orderId + IN_KITCHEN);


  if (kot) {
    var itemList = kot.items || [];
    var order = kot.order;

   var orderType = order.order_type == 'Dine-in' ? 'Dine-in\nTable:' + (order.tableId || '-')
      : (order.order_type == 'car' ? 'Car Number: ' + (order.customer?.carNumber || '-')
        : '' + order.order_type + '');


        const receipt = [
    { type: 'raw', format: 'command', data: ESC_INIT },
    { type: 'raw', format: 'command', data: ALIGN_CENTER },
    { type: 'raw', format: 'command', data: BOLD_ON },
    { type: 'raw', format: 'command', data: "KOT - " + kot.kitchenType + "\n" },
    { type: 'raw', format: 'command', data: getFormattedCurrentDateTime() + " Ghaziabad, India\n" },
    { type: 'raw', format: 'command', data: BOLD_OFF },
    { type: 'raw', format: 'command', data: "Order No: " + order.strOrderId + "\n" },
    { type: 'raw', format: 'command', data: orderType + "\n" },
    { type: 'raw', format: 'command', data: "Server: " + (order.server_name || '') + "\n" },
    { type: 'raw', format: 'command', data: "--------------------------------\n" },
    { type: 'raw', format: 'command', data: ALIGN_LEFT },
    { type: 'raw', format: 'command', data: "Item                         Qty   Portion\n" },
    { type: 'raw', format: 'command', data: "----------------------------------------------\n" },
  ];

  // Add each item row
  itemList.forEach(it => {
    receipt.push({ type: 'raw', format: 'command', data: formatRow(it.name, it.quantityToPrint, getPortionLabel(it.portion))+"\n" });
  });

  receipt.push({ type: 'raw', format: 'command', data: "----------------------------------------------\n" });
  receipt.push({ type: 'raw', format: 'command', data: CUT_FULL });




    // qz.print(config, receipt).catch(err => console.error(err));
  }

  
  var kotOut = orderKotStatus.get(orderId + OUT_KITCHEN);
if (kotOut) {
    var itemList = kotOut.items || [];
    var order = kotOut.order;

   var orderType = order.order_type == 'Dine-in' ? 'Dine-in\nTable:' + (order.tableId || '-')
      : (order.order_type == 'car' ? 'Car Number: ' + (order.customer?.carNumber || '-')
        : '' + order.order_type + '');


        const receipt = [
    { type: 'raw', format: 'command', data: ESC_INIT },
    { type: 'raw', format: 'command', data: ALIGN_CENTER },
    { type: 'raw', format: 'command', data: BOLD_ON },
    { type: 'raw', format: 'command', data: "KOT - " + kotOut.kitchenType + "\n" },
    { type: 'raw', format: 'command', data: getFormattedCurrentDateTime() + " Ghaziabad, India\n" },
    { type: 'raw', format: 'command', data: BOLD_OFF },
    { type: 'raw', format: 'command', data: "Order No: " + order.strOrderId + "\n" },
    { type: 'raw', format: 'command', data: orderType + "\n" },
    { type: 'raw', format: 'command', data: "Server: " + (order.server_name || '') + "\n" },
    { type: 'raw', format: 'command', data: "--------------------------------\n" },
    { type: 'raw', format: 'command', data: ALIGN_LEFT },
    { type: 'raw', format: 'command', data: "Item                         Qty   Portion\n" },
    { type: 'raw', format: 'command', data: "----------------------------------------------\n" },
  ];

  // Add each item row
  itemList.forEach(it => {
    receipt.push({ type: 'raw', format: 'command', data: formatRow(it.name, it.quantityToPrint, getPortionLabel(it.portion))+"\n" });
  });

  receipt.push({ type: 'raw', format: 'command', data: "----------------------------------------------\n" });
  receipt.push({ type: 'raw', format: 'command', data: CUT_FULL });



  
    // qz.print(config, receipt).catch(err => console.error(err));
  }



  const paperWidth = document.getElementById('kotPaperWidth')?.value || '58';
  document.body.classList.remove('kot-print-58mm', 'kot-print-80mm');
  document.body.classList.add(paperWidth === '80' ? 'kot-print-80mm' : 'kot-print-58mm');
  document.body.classList.add('printing-kot-preview');
  window.print();
  window.setTimeout(() => {
    document.body.classList.remove('printing-kot-preview');
    document.body.classList.remove('kot-print-58mm', 'kot-print-80mm');
  }, 250);

}

function printCloseOrderReceipt() {


  const invoiceJson = orderInvoicePrintMap.get(orderCrudState.closingId);

  var restaurant = JSON.parse(localStorage.getItem('restaurant_session') || '{}');
  var taxableItems = invoiceJson.taxableItems || [];
  var mrpItems = invoiceJson.mrpItems || [];
  var customer = invoiceJson.customer || {};
  var discount = invoiceJson.discount || {};
  var summary = invoiceJson.summary || [];
  var order = invoiceJson.order;

  //  var orderType = order.order_type == 'Dine-in' ? 'Dine-in\nTable:' + (order.tableId || '-')
  //     : (order.order_type == 'car' ? 'Car Number: ' + (order.customer?.carNumber || '-')
  //       : '' + order.order_type + '');

  const receipt = [
    { type: 'raw', format: 'command', data: ESC_INIT },
    { type: 'raw', format: 'command', data: ALIGN_CENTER },
    { type: 'raw', format: 'image', flavor: 'file', data: 'https://thezaffran.in/img/logo-bw-small.png', options: { language: "ESCPOS", dotDensity: 'double' } },
    { type: 'raw', format: 'command', data: BOLD_ON },
    { type: 'raw', format: 'command', data: restaurant.name + "\n" },
    { type: 'raw', format: 'command', data: restaurant.address + "\n" },
    { type: 'raw', format: 'command', data: "Phone - " + restaurant.phoneNumber + "\n" },
    { type: 'raw', format: 'command', data: "GSTIN - " + restaurant.gstin + "\n" },
    { type: 'raw', format: 'command', data: "FSSAI - " + restaurant.fssai + "\n" },
    { type: 'raw', format: 'command', data: "Tax Invoice\n" },
    { type: 'raw', format: 'command', data: getFormattedCurrentDateTime() + "\n" },
    { type: 'raw', format: 'command', data: BOLD_OFF },
    { type: 'raw', format: 'command', data: "Order No: " + order.strOrderId + "\n" },
    { type: 'raw', format: 'command', data: "Customer: " + (customer?.customerName || '-') + "\n" },
    { type: 'raw', format: 'command', data: "--------------------------------\n" },
    { type: 'raw', format: 'command', data: ALIGN_LEFT },
    { type: 'raw', format: 'command', data: "Item                Qty      price   Amount(Rs.)\n" },
    { type: 'raw', format: 'command', data: "-----------------------------------------------\n" },
  ];

  // Add each item row
  taxableItems.forEach(it => {
    receipt.push({ type: 'raw', format: 'command', data: formatRowInvoice(it.name, it.quantity, getPortionLabel(it.portion), formatCurrency(it.price), formatCurrency(Number(it.price || 0) * Number(it.quantity || 0))) + "\n" });
  });

  if (mrpItems.length > 0) {
    mrpItems.forEach(it => {
      receipt.push({ type: 'raw', format: 'command', data: formatRowInvoice(it.name, it.quantity, "", "MRP", formatCurrency(Number(it.price || 0) * Number(it.quantity || 0))) + "\n" });
    });

  }

  receipt.push({ type: 'raw', format: 'command', data: "-----------------------------------------------\n" });
  receipt.push({ type: 'raw', format: 'command', data: formatTotals("Taxable Subtotal", formatCurrency(summary.taxableSubtotal)) + "\n" });
  receipt.push({ type: 'raw', format: 'command', data: formatTotals("Tax (" + summary.taxPercentage.toFixed(0) + "%)", formatCurrency(summary.taxAmount)) + "\n" });

  if (mrpItems.length > 0) {
    receipt.push({ type: 'raw', format: 'command', data: formatTotals("MRP Items Total", formatCurrency(summary.mrpSubtotal)) + "\n" });
  }

  if (summary.discountAmount > 0) {
    var discountName = `Discount${discount ? ` - ${discount.discountName}` : ''}${summary.discountPerc ? ` (${summary.discountPerc.toFixed(0)}%)` : ''}`;
    var discountTotal = `- ${formatCurrency(summary.discountAmount)}`;
    receipt.push({ type: 'raw', format: 'command', data: formatTotals(discountName, discountTotal) + "\n" });
  }

  if (summary.onSpotDiscount && summary.onSpotDiscount > 0) {
    var onSpotDiscountName = `On Spot Discount`;
    var onSpotDiscountTotal = `- ${formatCurrency(summary.onSpotDiscount)}`;
    receipt.push({ type: 'raw', format: 'command', data: formatTotals(onSpotDiscountName, onSpotDiscountTotal) + "\n" });
  }

  receipt.push({ type: 'raw', format: 'command', data: formatTotals("Total Amount", formatCurrency(summary.totalAmount)) + "\n" });
  receipt.push({ type: 'raw', format: 'command', data: formatTotals("Adjustment", formatCurrency(summary.adjustment || 0)) + "\n" });
  receipt.push({ type: 'raw', format: 'command', data: "===============================================\n" });
  receipt.push({ type: 'raw', format: 'command', data: BOLD_ON });
  receipt.push({ type: 'raw', format: 'command', data: formatTotals("Total Payable", formatCurrency(summary.totalPayable || 0)) + "\n" });
  receipt.push({ type: 'raw', format: 'command', data: BOLD_OFF });
  receipt.push({ type: 'raw', format: 'command', data: "===============================================\n" });

  receipt.push({ type: 'raw', format: 'command', data: ALIGN_CENTER });
  receipt.push({ type: 'raw', format: 'command', data: "Terms & Conditions applied\n" });
  receipt.push({ type: 'raw', format: 'command', data: CUT_FULL });

  //fazia

  // qz.print(config, receipt).catch(err => console.error(err));

  const paperWidth = document.getElementById('closeOrderPaperWidth')?.value || '58';
  document.body.classList.remove('receipt-print-58mm', 'receipt-print-80mm');
  document.body.classList.add(paperWidth === '80' ? 'receipt-print-80mm' : 'receipt-print-58mm');
  document.body.classList.add('printing-close-order-preview');
  window.print();
  window.setTimeout(() => {
    document.body.classList.remove('printing-close-order-preview');
    document.body.classList.remove('receipt-print-58mm', 'receipt-print-80mm');
  }, 250);
}

function buildFormBaseOrder() {
  return {
    tableId: Number(document.getElementById('orderTableId')?.value || 0),
    order_type: document.getElementById('orderType')?.value || 'Dine-in',
    status: document.getElementById('orderStatus')?.value || 'Pending',
    server_name: document.getElementById('serverName')?.value || '',
    tax_percentage: 5,
    discount_perc: 0,
    discount_amount: 0,
    isSplitBill: 0,
    payment_mode: 'cash'
  };
}

async function persistOrder(order, items) {
  const isEdit = order?.id !== null && order?.id !== undefined;
  const payload = buildOrderPayload(order, items);
  const url = isEdit ? `/api/orders/${order.id}` : `/api/orders/${headerRestaurantId}`;
  const method = isEdit ? 'PUT' : 'POST';

  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Save failed with status ${response.status}`);
  }

  return response.json();
}

function getCurrentDraftItems() {
  return Array.isArray(orderCrudState.draftItems) ? orderCrudState.draftItems : [];
}

// Draft edits only live in memory until the form is submitted; when editing an
// already-existing order, push each +/- change straight to the backend too so
// the order itself reflects the new quantity right away, not just the UI.
async function persistDraftItemsIfEditing(items) {
  if (orderCrudState.editingId === null || orderCrudState.editingId === undefined) return;

  const order = orderCrudState.items.find(item => Number(item.id) === Number(orderCrudState.editingId));
  const baseOrder = { ...(order || {}), ...buildFormBaseOrder() };

  try {
    await persistOrder({ ...baseOrder, id: orderCrudState.editingId }, items);
    await loadOrders();
  } catch (error) {
    showSaveMessage('orderSaveMessage', error.message, true);
  }
}

async function addDishToInlineOrder(orderId) {
  const order = orderCrudState.items.find(item => Number(item.id) === Number(orderId));
  if (!order) return;

  const select = document.querySelector(`[data-order-menu-select="${orderId}"]`);
  const quantityInput = document.querySelector(`[data-order-quantity="${orderId}"]`);
  const menuItemId = Number(select?.value || 0);
  const quantity = Number(quantityInput?.value || 1);
  const portion = getSelectedPortion(orderId);

  const items = addItemToCollection(normalizeOrderItems(order), menuItemId, quantity, portion);
  if (!items) {
    showSaveMessage('orderSaveMessage', 'Select a dish before adding it to the order.', true);
    return;
  }

  try {
    await persistOrder(order, items);
    showSaveMessage('orderSaveMessage', 'Dish added to order successfully.');
    await loadOrders();
  } catch (error) {
    showSaveMessage('orderSaveMessage', error.message, true);
  }
}

async function removeDishFromInlineOrder(orderId, menuItemId, portion) {
  const order = orderCrudState.items.find(item => Number(item.id) === Number(orderId));
  if (!order) return;

  const items = removeItemFromCollection(normalizeOrderItems(order), menuItemId, portion);

  try {
    await persistOrder(order, items);
    showSaveMessage('orderSaveMessage', 'Dish removed from order successfully.');
    await loadOrders();
  } catch (error) {
    showSaveMessage('orderSaveMessage', error.message, true);
  }
}

async function incrementDishInInlineOrder(orderId, menuItemId, portion) {
  const order = orderCrudState.items.find(item => Number(item.id) === Number(orderId));
  if (!order) return;

  const items = addItemToCollection(normalizeOrderItems(order), menuItemId, 1, portion);
  if (!items) return;

  try {
    await persistOrder(order, items);
    showSaveMessage('orderSaveMessage', 'Dish quantity increased.');
    await loadOrders();
  } catch (error) {
    showSaveMessage('orderSaveMessage', error.message, true);
  }
}

async function decrementDishInInlineOrder(orderId, menuItemId, portion) {
  const order = orderCrudState.items.find(item => Number(item.id) === Number(orderId));
  if (!order) return;

  const items = decrementItemInCollection(normalizeOrderItems(order), menuItemId, portion);

  try {
    await persistOrder(order, items);
    showSaveMessage('orderSaveMessage', 'Dish quantity decreased.');
    await loadOrders();
  } catch (error) {
    showSaveMessage('orderSaveMessage', error.message, true);
  }
}

function setupOrderCrud() {
  const form = document.getElementById('orderForm');
  const body = document.getElementById('ordersGrid');
  const draftItemsContainer = document.getElementById('orderDraftItems');
  const openButton = document.getElementById('openOrderFormButton');
  const closeButton = document.getElementById('closeOrderFormButton');
  const cancelButton = document.getElementById('cancelOrderFormButton');
  const addItemButton = document.getElementById('addOrderItemButton');
  const closeOrderForm = document.getElementById('closeOrderForm');
  const kotPreviewForm = document.getElementById('kotPreviewForm');
  const printCloseOrderReceiptButton = document.getElementById('printCloseOrderReceiptButton');
  const closeCloseOrderButton = document.getElementById('closeCloseOrderFormButton');
  const cancelCloseOrderButton = document.getElementById('cancelCloseOrderFormButton');
  const closeKotPreviewButton = document.getElementById('closeKotPreviewButton');
  const cancelKotPreviewButton = document.getElementById('cancelKotPreviewButton');
  const closeOrderBackdrop = document.getElementById('closeOrderModalBackdrop');
  const kotPreviewBackdrop = document.getElementById('kotPreviewModalBackdrop');
  const splitCheckbox = document.getElementById('closeOrderSplitBill');
  const cashSplitInput = document.getElementById('closeOrderCashPayment');
  const upiSplitInput = document.getElementById('closeOrderUpiPayment');
  const paymentModeSelect = document.getElementById('closeOrderPaymentMode');
  const discountSelect = document.getElementById('closeOrderDiscountId');
  const cardInput = document.getElementById('closeOrderCardPayment');
  const closeCustomerPhoneInput = document.getElementById('closeOrderCustomerPhone');
  const closeCustomerNameInput = document.getElementById('closeOrderCustomerName');
  const closeCustomerIdInput = document.getElementById('closeOrderCustomerId');
  const orderTypeInput = document.getElementById('orderType');
  const orderCustomerPhoneInput = document.getElementById('orderCustomerPhone');
  const orderCustomerNameInput = document.getElementById('orderCustomerName');
  const orderCustomerIdInput = document.getElementById('orderCustomerId');
  const orderCarNumberInput = document.getElementById('orderCarNumber');

  if (openButton) {
    openButton.addEventListener('click', () => {
      resetOrderForm();
      toggleModal('orderModal', 'orderModalBackdrop', true);
    });
  }

  if (orderTypeInput) {
    orderTypeInput.addEventListener('change', () => {
      setOrderCustomerFieldsVisibility();
    });
  }

  if (orderCustomerPhoneInput) {
    orderCustomerPhoneInput.addEventListener('input', () => {
      if (orderCustomerIdInput) orderCustomerIdInput.value = '';
    });
    orderCustomerPhoneInput.addEventListener('blur', () => {
      lookupOrderCustomerByIdentifier();
    });
  }

  if (orderCustomerNameInput) {
    orderCustomerNameInput.addEventListener('input', () => {
      if (orderCustomerIdInput) orderCustomerIdInput.value = '';
    });
  }

  if (orderCarNumberInput) {
    orderCarNumberInput.addEventListener('input', () => {
      if (orderCustomerIdInput) orderCustomerIdInput.value = '';
    });
    orderCarNumberInput.addEventListener('blur', () => {
      orderCarNumberInput.value = normalizeOrderCarNumber(orderCarNumberInput.value);
      lookupOrderCustomerByIdentifier();
    });
  }

  if (closeButton) closeButton.addEventListener('click', resetOrderForm);
  if (cancelButton) cancelButton.addEventListener('click', resetOrderForm);

  if (closeCloseOrderButton) closeCloseOrderButton.addEventListener('click', closeCloseOrderModal);
  if (cancelCloseOrderButton) cancelCloseOrderButton.addEventListener('click', closeCloseOrderModal);
  if (closeKotPreviewButton) closeKotPreviewButton.addEventListener('click', closeKotPreviewModal);
  if (cancelKotPreviewButton) cancelKotPreviewButton.addEventListener('click', closeKotPreviewModal);
  if (closeOrderBackdrop) closeOrderBackdrop.addEventListener('click', closeCloseOrderModal);
  if (kotPreviewBackdrop) kotPreviewBackdrop.addEventListener('click', closeKotPreviewModal);
  if (splitCheckbox) splitCheckbox.addEventListener('change', () => syncCloseOrderPaymentInputs(true));
  if (cashSplitInput) cashSplitInput.addEventListener('input', updateCloseOrderSplitHint);
  if (upiSplitInput) upiSplitInput.addEventListener('input', updateCloseOrderSplitHint);
  if (paymentModeSelect) paymentModeSelect.addEventListener('change', () => syncCloseOrderPaymentInputs(true));
  if (cardInput) cardInput.addEventListener('input', updateCloseOrderSplitHint);
  if (discountSelect) {
    discountSelect.addEventListener('change', () => {
      refreshCloseOrderSummary();
    });
  }

  const onSpotDiscountInput = document.getElementById('closeOrderOnSpotDiscount');
  if (onSpotDiscountInput) {
    onSpotDiscountInput.addEventListener('input', () => {
      refreshCloseOrderSummary();
    });
  }

  const noTaxCheckbox = document.getElementById('closeOrderNoTax');
  if (noTaxCheckbox) {
    noTaxCheckbox.addEventListener('change', () => {
      refreshCloseOrderSummary(true);
    });
  }

  if (closeCustomerPhoneInput) {
    closeCustomerPhoneInput.addEventListener('input', () => {
      if (closeCustomerIdInput) closeCustomerIdInput.value = '';

      const phone = trimValue(closeCustomerPhoneInput.value);
      if (!phone) {
        if (closeCustomerNameInput) closeCustomerNameInput.value = '';
        setCloseOrderCustomerMessage('');
        return;
      }

      if (orderCrudState.customerLookupTimerId) {
        clearTimeout(orderCrudState.customerLookupTimerId);
      }

      orderCrudState.customerLookupTimerId = window.setTimeout(() => {
        lookupCustomerByPhone(phone, true);
      }, 2000);
    });

    closeCustomerPhoneInput.addEventListener('blur', () => {
      lookupCustomerByPhone(closeCustomerPhoneInput.value, false);
    });
  }

  if (closeCustomerNameInput) {
    closeCustomerNameInput.addEventListener('input', () => {
      if (closeCustomerIdInput) closeCustomerIdInput.value = '';
    });
  }

  if (printCloseOrderReceiptButton) {
    printCloseOrderReceiptButton.addEventListener('click', () => {
      if (!orderCrudState.closingId) {
        showSaveMessage('closeOrderPrintMessage', 'Open a close-order preview first.', true);
        return;
      }

      refreshCloseOrderSummary();
      try {
        printCloseOrderReceipt();
        showSaveMessage('closeOrderPrintMessage', 'Browser print dialog opened. Select the required printer there.');
      } catch (error) {
        showSaveMessage('closeOrderPrintMessage', error.message, true);
      }
    });
  }

  if (kotPreviewForm) {
    kotPreviewForm.addEventListener('submit', async event => {
      event.preventDefault();

      const order = orderCrudState.items.find(item => Number(item.id) === Number(orderCrudState.kotPreviewId));
      if (!order) {
        showSaveMessage('kotPrintMessage', 'Order not found for KOT printing.', true);
        return;
      }

      const selectedItems = getSelectedKotItems(order);
      if (!selectedItems.length) {
        showSaveMessage('kotPrintMessage', 'Select at least one item to print.', true);
        return;
      }

      try {
        printKot(order.id);
        markKotItemsAsPrinted(order.id, selectedItems);
        const selection = document.getElementById('kotItemSelection');
        if (selection) selection.innerHTML = '';
        updateKotPreviewContent(order);
        showSaveMessage('kotPrintMessage', 'Browser print dialog opened. Select the required printer there.');
      } catch (error) {
        showSaveMessage('kotPrintMessage', error.message, true);
      }
    });
  }

  if (addItemButton) {
    addItemButton.addEventListener('click', () => {
      const menuItemId = Number(document.getElementById('orderMenuItemId')?.value || 0);
      const quantity = Number(document.getElementById('orderItemQuantity')?.value || 1);
      const portion = getSelectedPortion();
      const nextItems = addItemToCollection(getCurrentDraftItems(), menuItemId, quantity, portion);

      if (!nextItems) {
        showSaveMessage('orderSaveMessage', 'Select a dish before adding it to the order.', true);
        return;
      }
      $('#orderMenuItemId').val(null).trigger('change');
      document.querySelector(`input[name="orderPortion"][value="full"]`).checked = true;
      const priceHint = document.getElementById('orderSelectedPrice');
      priceHint.textContent = '';
      setDraftItems(nextItems);
      showSaveMessage('orderSaveMessage', `${getPortionLabel(portion)} portion added to the draft order.`);

      const qty = document.getElementById('orderItemQuantity');
      if (qty) qty.value = 1;
    });
  }

  const draftMenuSelect = document.getElementById('orderMenuItemId');
  if (draftMenuSelect) {
    $('#orderMenuItemId').on('select2:select', function(e) {
    updateDraftPriceHint();
});
    draftMenuSelect.addEventListener('change', updateDraftPriceHint);
  }

  document.querySelectorAll('input[name="orderPortion"]').forEach(radio => {
    radio.addEventListener('change', updateDraftPriceHint);
  });

  if (kotPreviewForm) {
    kotPreviewForm.addEventListener('change', event => {
      if (event.target.closest('.kot-selection-checkbox')) {
        const order = orderCrudState.items.find(item => Number(item.id) === Number(orderCrudState.kotPreviewId));
        if (order) {
          updateKotPreviewContent(order);
        }
      }
    });
  }

  if (draftItemsContainer) {
    draftItemsContainer.addEventListener('click', async event => {
      const addButton = event.target.closest('[data-order-action="add-draft-item"]');
      if (addButton) {
        const menuItemId = addButton.getAttribute('data-menu-item-id');
        const portion = addButton.getAttribute('data-portion');
        const updated = addItemToCollection(getCurrentDraftItems(), menuItemId, 1, portion);
        if (updated) {
          setDraftItems(updated);
          showSaveMessage('orderSaveMessage', 'Dish quantity increased.');
          await persistDraftItemsIfEditing(updated);
        }
        return;
      }

      const decrementButton = event.target.closest('[data-order-action="decrement-draft-item"]');
      if (decrementButton) {
        const menuItemId = decrementButton.getAttribute('data-menu-item-id');
        const portion = decrementButton.getAttribute('data-portion');
        const updated = decrementItemInCollection(getCurrentDraftItems(), menuItemId, portion);
        setDraftItems(updated);
        showSaveMessage('orderSaveMessage', 'Dish quantity decreased.');
        await persistDraftItemsIfEditing(updated);
        return;
      }

      const button = event.target.closest('[data-order-action="remove-draft-item"]');
      if (!button) return;

      const menuItemId = button.getAttribute('data-menu-item-id');
      const portion = button.getAttribute('data-portion');
      const updated = removeItemFromCollection(getCurrentDraftItems(), menuItemId, portion);
      setDraftItems(updated);
      showSaveMessage('orderSaveMessage', 'Dish removed from the draft order.');
      await persistDraftItemsIfEditing(updated);
    });
  }

  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();

      const draftItems = getCurrentDraftItems();
      if (!draftItems.length) {
        showSaveMessage('orderSaveMessage', 'Add at least one dish before submitting the order.', true);
        return;
      }

      const isEdit = orderCrudState.editingId !== null;
      const baseOrder = buildFormBaseOrder();
      const url = isEdit ? `/api/orders/${orderCrudState.editingId}` : `/api/orders/${headerRestaurantId}`;
      const method = isEdit ? 'PUT' : 'POST';

      try {
        const defaultCustomerId = Number(document.getElementById('orderCustomerId')?.value || 0);
        const resolvedCustomerId = await resolveCustomerForOrder(defaultCustomerId);
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildOrderPayload({
            ...baseOrder,
            customerId: shouldCaptureOrderCustomerDetails() ? resolvedCustomerId : defaultCustomerId
          }, draftItems))
        });

        if (!response.ok) {
          throw new Error(`Save failed with status ${response.status}`);
        }

        showSaveMessage('orderSaveMessage', isEdit ? 'Order updated successfully.' : 'Order saved successfully.');
        await loadOrders();
        resetOrderForm();
        modalCloseActions.orderModal?.();
      } catch (error) {
        showSaveMessage('orderSaveMessage', error.message, true);
      }
    });
  }

  if (closeOrderForm) {
    closeOrderForm.addEventListener('submit', async event => {
      event.preventDefault();

      const closingOrder = orderCrudState.items.find(item => Number(item.id) === Number(orderCrudState.closingId));
      if (!closingOrder) {
        showSaveMessage('closeOrderSaveMessage', 'Order not found for closing.', true);
        return;
      }

      const isSplit = Boolean(document.getElementById('closeOrderSplitBill')?.checked);
      const totalPayable = Number(document.getElementById('closeOrderTotalPayable')?.value || 0);
      const cardPayment = Number(document.getElementById('closeOrderCardPayment')?.value || 0);
      const cashPayment = Number(document.getElementById('closeOrderCashPayment')?.value || 0);
      const upiPayment = Number(document.getElementById('closeOrderUpiPayment')?.value || 0);
      const cashSplit = Number(document.getElementById('closeOrderCashPayment')?.value || 0);
      const upiSplit = Number(document.getElementById('closeOrderUpiPayment')?.value || 0);

      if (isSplit && Math.abs((cashSplit + upiSplit) - totalPayable) > 0.01) {
        showSaveMessage('closeOrderSaveMessage', 'For split payment, Cash + UPI must match total payable.', true);
        return;
      }
      const paymentMode = (document.getElementById('closeOrderPaymentMode')?.value || 'cash').toLowerCase();
      const selectedAmount = paymentMode === 'cash'
        ? cashPayment
        : (paymentMode === 'card' ? cardPayment : upiPayment);

      if (!isSplit && Math.abs(selectedAmount - totalPayable) > 0.01) {
        showSaveMessage('closeOrderSaveMessage', `${paymentMode.toUpperCase()} amount must match total payable.`, true);
        return;
      }
      const closeSummary = refreshCloseOrderSummary(false);
      const appliedDiscount = closeSummary?.discount || null;
      const calculatedDiscountAmount = Number(closeSummary?.summary?.discountAmount ?? 0);
      const onSpotDiscountAmount = Number(closeSummary?.summary?.onSpotDiscount ?? getCloseOrderOnSpotDiscount());
      const noTax = getCloseOrderNoTax();
      const resolvedCustomerId = await resolveCustomerForCloseOrder(Number(closingOrder.customer?.id || 0));
      const paymentPayload = {
        cash_payment: isSplit ? cashSplit : (paymentMode === 'cash' ? cashPayment : 0),
        card_payment: isSplit ? 0 : (paymentMode === 'card' ? cardPayment : 0),
        upi_payment: isSplit ? upiSplit : (paymentMode === 'upi' ? upiPayment : 0)
      };
      const closePayload = buildOrderPayload({
        tableId: closingOrder.tableId,
        order_type: closingOrder.order_type,
        status: 'Served',
        tax_percentage: noTax ? 0 : Number(document.getElementById('closeOrderTaxPercentage')?.value || closingOrder.tax_percentage || 0),
        discount_perc: Number(appliedDiscount?.discountPerc || 0),
        discount_amount: calculatedDiscountAmount,
        on_spot_discount: onSpotDiscountAmount,
        no_tax: noTax,
        isSplitBill: isSplit ? 1 : 0,
        payment_mode: isSplit ? 'split' : paymentMode,
        cash_payment: paymentPayload.cash_payment,
        card_payment: paymentPayload.card_payment,
        upi_payment: paymentPayload.upi_payment,
        customerId: resolvedCustomerId
      }, normalizeOrderItems(closingOrder));

      try {
        const response = await fetch(`/api/orders/close/${orderCrudState.closingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(closePayload)
        });

        if (!response.ok) {
          throw new Error(`Close order failed with status ${response.status}`);
        }

        showSaveMessage('closeOrderSaveMessage', 'Order closed successfully.');
        closeCloseOrderModal();
        await loadOrders();
      } catch (error) {
        showSaveMessage('closeOrderSaveMessage', error.message, true);
      }
    });
  }

  if (body) {
    body.addEventListener('click', async event => {
      const button = event.target.closest('[data-order-action]');
      if (!button) return;

      const id = button.getAttribute('data-order-id');
      const action = button.getAttribute('data-order-action');

      try {
        if (action === 'edit') openOrderForEdit(id);
        if (action === 'delete') await removeOrder(id);
        if (action === 'print-kot') openKotPreviewModal(id);
        if (action === 'close') openCloseOrderModal(id);
        if (action === 'add-item') await addDishToInlineOrder(id);
        if (action === 'increment-item') await incrementDishInInlineOrder(id, button.getAttribute('data-menu-item-id'), button.getAttribute('data-portion'));
        if (action === 'decrement-item') await decrementDishInInlineOrder(id, button.getAttribute('data-menu-item-id'), button.getAttribute('data-portion'));
        if (action === 'remove-item') await removeDishFromInlineOrder(id, button.getAttribute('data-menu-item-id'), button.getAttribute('data-portion'));
      } catch (error) {
        showSaveMessage('orderSaveMessage', error.message, true);
      }
    });

    body.addEventListener('change', event => {
      const select = event.target.closest('[data-order-menu-select]');
      if (select) {
        updateInlinePriceHint(select.getAttribute('data-order-menu-select'));
        return;
      }

      const portionRadio = event.target.closest('input[type="radio"][name^="orderPortion-"]');
      if (portionRadio) {
        const orderId = String(portionRadio.name || '').replace('orderPortion-', '');
        if (orderId) updateInlinePriceHint(orderId);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  setupModalAwareForms();
  loadOrderMeta();
  setupOrderCrud();
  setOrderFormMode(false);
  setOrderCustomerFieldsVisibility();

  Promise.all([
    loadDiscounts().catch(() => {
      orderCrudState.discounts = [];
      renderDiscountOptions();
    }),
    loadMenuItems().catch(() => {
      orderCrudState.menuItems = [];
      buildMenuOptions();
    }),
    loadOrders()
  ]).catch(() => renderOrdersCards([]));
});

