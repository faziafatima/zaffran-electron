const orderCrudState = {
  items: [],
  menuItems: [],
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
   <p><b>${getKitchenTypeLabel(kitchenType)}</b></p>
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

  return sections.join('');
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
  <p><b>Order No:</b> ${order.strOrderId || '-'}</p>
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

function refreshCloseOrderSummary(forceRecalculateAmounts = false) {
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

function renderOrderItemsViewTable(items, options = {}) {
  const emptyMessage = options.emptyMessage || 'No dishes added yet.';
  if (!items.length) {
    return `<tr><td colspan="3">${emptyMessage}</td></tr>`;
  }

  return items.map(item => `
    <tr>
        <td>${item.name} (${getPortionLabel(item.portion)})</td>
        <td>${item.quantity}</td>
        <td>${formatCurrency(item.price * item.quantity)}</td>
    </tr>
  `).join('');
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

  if (orderCrudState.items.length) {
    renderOrdersCards(orderCrudState.items);
  }
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

  body.innerHTML = items.map(order => {
    const orderItems = normalizeOrderItems(order);
    const itemCount = orderItems.reduce((total, item) => total + Number(item.quantity || 0), 0);

    return `
      <article class="order-card panel" data-order-id="${order.id}" style="margin-top: 20px;">
      <div class="order-card-kicker ${order.order_type}"><span>${(order.order_type === 'Dine-in' && order.tableId ? 'Table ' + order.tableId : '')}  ${order.order_type === 'car' ? 'Car'  : ''}  ${order.order_type === 'Takeaway' ? 'Takeaway'  : ''}</span> <br/>${order.strOrderId || '000'}</div>
         
        <div class="order-card-head">
             
           
          <span class="status-pill time">${formatDateTime(order.createdAt)}</span>
          <span class="status-pill ${statusClass(order.status)}">${order.status || 'Pending'}</span>
          <span class="status-pill info">${itemCount} dish${itemCount === 1 ? '' : 'es'}</span>
        </div>
            ${order.customer ? '<div style=""><b>Customer Name:</b> ' + order.customer.name + ' (' + order.customer.phone + ')</div>' : ''}
            ${order.server_name ? '<div style=""><b>Server: </b>' + order.server_name + '</div>' : ''}
        <table class="table">
        <thead>
          <tr>
            <th>Dish</th>
            <th>Qty</th>
            <th>Price</th>
          </tr>
        </thead>
          ${renderOrderItemsViewTable(orderItems, { orderId: order.id, allowRemove: false, emptyMessage: 'No dishes on this order yet.' })}
        </table>
    
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
  console.log('printKot called with orderId:', orderId);

  if (!window.electronAPI || typeof window.electronAPI.printReceipt !== 'function') {
    console.error('electronAPI.printReceipt is not available in renderer');
    showSaveMessage('kotPrintMessage', 'Printer bridge is not available. Please restart the app.', true);
    return;
  }

  const restaurant = JSON.parse(localStorage.getItem('restaurant_session') || '{}');
  let kot = orderKotStatus.get(orderId + IN_KITCHEN);
  let kotOut = orderKotStatus.get(orderId + OUT_KITCHEN);

  if (!kot && !kotOut) {
    const fallbackOrder = orderCrudState.items.find(item => Number(item.id) === Number(orderId));
    if (fallbackOrder) {
      const groupedItems = groupKotItems(normalizeOrderItems(fallbackOrder));
      const inKitchenItems = groupedItems
        .filter(item => normalizeKitchenType(item.kitchenType) === 'in-kitchen')
        .map(item => ({ ...item, quantityToPrint: Number(item.quantity || 0) }));
      const outKitchenItems = groupedItems
        .filter(item => normalizeKitchenType(item.kitchenType) === 'out-kitchen')
        .map(item => ({ ...item, quantityToPrint: Number(item.quantity || 0) }));

      if (inKitchenItems.length) {
        kot = { orderId: fallbackOrder.id, kitchenType: 'in-kitchen', order: fallbackOrder, items: inKitchenItems };
        orderKotStatus.set(orderId + IN_KITCHEN, kot);
      }
      if (outKitchenItems.length) {
        kotOut = { orderId: fallbackOrder.id, kitchenType: 'out-kitchen', order: fallbackOrder, items: outKitchenItems };
        orderKotStatus.set(orderId + OUT_KITCHEN, kotOut);
      }
    }
  }

  if (!kot && !kotOut) {
    console.error('No KOT payload available for order:', orderId);
    showSaveMessage('kotPrintMessage', 'No KOT items available to print.', true);
    return;
  }

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
      { type: 'raw', format: 'command', data: "KOT IN-Kitchen\n" },
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

    itemList.forEach(it => {
      receipt.push({ type: 'raw', format: 'command', data: formatRow(it.name, it.quantityToPrint, getPortionLabel(it.portion)) + "\n" });
    });

    receipt.push({ type: 'raw', format: 'command', data: "----------------------------------------------\n" });
    receipt.push({ type: 'raw', format: 'command', data: CUT_FULL });

    console.log('Sending IN KOT receipt via electronAPI.printReceipt');
    window.electronAPI.printReceipt(receipt, restaurant.printerName);
  }

  if (kotOut) {
    var outItemList = kotOut.items || [];
    var outOrder = kotOut.order;

    var outOrderType = outOrder.order_type == 'Dine-in' ? 'Dine-in\nTable:' + (outOrder.tableId || '-')
      : (outOrder.order_type == 'car' ? 'Car Number: ' + (outOrder.customer?.carNumber || '-')
        : '' + outOrder.order_type + '');

    const outReceipt = [
      { type: 'raw', format: 'command', data: ESC_INIT },
      { type: 'raw', format: 'command', data: ALIGN_CENTER },
      { type: 'raw', format: 'command', data: BOLD_ON },
      { type: 'raw', format: 'command', data: "KOT OUT-Kitchen\n" },
      { type: 'raw', format: 'command', data: getFormattedCurrentDateTime() + " Ghaziabad, India\n" },
      { type: 'raw', format: 'command', data: BOLD_OFF },
      { type: 'raw', format: 'command', data: "Order No: " + outOrder.strOrderId + "\n" },
      { type: 'raw', format: 'command', data: outOrderType + "\n" },
      { type: 'raw', format: 'command', data: "Server: " + (outOrder.server_name || '') + "\n" },
      { type: 'raw', format: 'command', data: "--------------------------------\n" },
      { type: 'raw', format: 'command', data: ALIGN_LEFT },
      { type: 'raw', format: 'command', data: "Item                         Qty   Portion\n" },
      { type: 'raw', format: 'command', data: "----------------------------------------------\n" },
    ];

    outItemList.forEach(it => {
      outReceipt.push({ type: 'raw', format: 'command', data: formatRow(it.name, it.quantityToPrint, getPortionLabel(it.portion)) + "\n" });
    });

    outReceipt.push({ type: 'raw', format: 'command', data: "----------------------------------------------\n" });
    outReceipt.push({ type: 'raw', format: 'command', data: CUT_FULL });

    console.log('Sending OUT KOT receipt via electronAPI.printReceipt');
    window.electronAPI.printReceipt(outReceipt, restaurant.printerName);
  }


  // const paperWidth = document.getElementById('kotPaperWidth')?.value || '58';
  // document.body.classList.remove('kot-print-58mm', 'kot-print-80mm');
  // document.body.classList.add(paperWidth === '80' ? 'kot-print-80mm' : 'kot-print-58mm');
  // document.body.classList.add('printing-kot-preview');
  // window.print();
  // window.setTimeout(() => {
  //   document.body.classList.remove('printing-kot-preview');
  //   document.body.classList.remove('kot-print-58mm', 'kot-print-80mm');
  // }, 250);

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
    { type: 'raw', format: 'image', flavor: 'file', data: '/img/logo-bw-small.png' },
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
window.electronAPI.printReceipt(receipt, restaurant.printerName);
  // qz.print(config, receipt).catch(err => console.error(err));

  // const paperWidth = document.getElementById('closeOrderPaperWidth')?.value || '58';
  // document.body.classList.remove('receipt-print-58mm', 'receipt-print-80mm');
  // document.body.classList.add(paperWidth === '80' ? 'receipt-print-80mm' : 'receipt-print-58mm');
  // document.body.classList.add('printing-close-order-preview');
  // window.print();
  // window.setTimeout(() => {
  //   document.body.classList.remove('printing-close-order-preview');
  //   document.body.classList.remove('receipt-print-58mm', 'receipt-print-80mm');
  // }, 250);
}

function setupOrderCrud() {
  const body = document.getElementById('ordersGrid');
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
      refreshCloseOrderSummary(true);
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
        closeKotPreviewModal();
      } catch (error) {
        showSaveMessage('kotPrintMessage', error.message, true);
      }
    });
  }

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
        if (action === 'edit') window.location.assign(`/orders/new?editId=${id}`);
        if (action === 'delete') await removeOrder(id);
        if (action === 'print-kot') openKotPreviewModal(id);
        if (action === 'close') openCloseOrderModal(id);
      } catch (error) {
        showSaveMessage('orderSaveMessage', error.message, true);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  if (window.electronAPI?.onPrintResult) {
    window.electronAPI.onPrintResult((result) => {
      if (result?.success) {
        console.log('Print result from main process:', result);
      } else {
        console.error('Print failed in main process:', result?.message || 'Unknown print error');
      }
    });
  }
  setupModalAwareForms();
  loadOrderMeta();
  setupOrderCrud();

  Promise.all([
    loadDiscounts().catch(() => {
      orderCrudState.discounts = [];
      renderDiscountOptions();
    }),
    loadMenuItems().catch(() => {
      orderCrudState.menuItems = [];
    }),
    loadOrders()
  ]).catch(() => renderOrdersCards([]));
});

