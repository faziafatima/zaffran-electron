const closedOrdersState = {
  items: [],
  filteredItems: [],
  selectedOrder: null,
  loading: false,
  searchTerm: '',
  page: 1,
  pageSize: 8
};

function formatDateTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsed);
}

function getClosedOrderItems(order) {
  return Array.isArray(order?.itemsPayload) ? order.itemsPayload : [];
}

function updateClosedOrdersSummary() {
  const total = closedOrdersState.items.length;
  const filtered = closedOrdersState.filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(filtered / closedOrdersState.pageSize));
  const currentPage = Math.min(closedOrdersState.page, totalPages);
  const startIndex = filtered === 0 ? 0 : ((currentPage - 1) * closedOrdersState.pageSize) + 1;
  const endIndex = Math.min(currentPage * closedOrdersState.pageSize, filtered);

  const summaryEl = document.getElementById('closedOrdersPageSummary');
  const indicatorEl = document.getElementById('closedOrdersPageIndicator');
  const prevButton = document.getElementById('closedOrdersPrevButton');
  const nextButton = document.getElementById('closedOrdersNextButton');

  if (summaryEl) {
    if (filtered === 0) {
      summaryEl.textContent = total ? `No matches for “${closedOrdersState.searchTerm}”` : 'No closed orders are available yet.';
    } else {
      summaryEl.textContent = `Showing ${startIndex}-${endIndex} of ${filtered} orders`;
    }
  }

  if (indicatorEl) {
    indicatorEl.textContent = `Page ${filtered ? currentPage : 0} of ${filtered ? totalPages : 0}`;
  }

  if (prevButton) prevButton.disabled = closedOrdersState.page <= 1 || filtered === 0;
  if (nextButton) nextButton.disabled = closedOrdersState.page >= totalPages || filtered === 0;
}

function renderClosedOrdersTable() {
  const body = document.getElementById('closedOrdersTableBody');
  const message = document.getElementById('closedOrdersMessage');
  if (!body) return;

  const orders = Array.isArray(closedOrdersState.items) ? closedOrdersState.items : [];
  const searchTerm = closedOrdersState.searchTerm.trim().toLowerCase();

  closedOrdersState.filteredItems = orders.filter(order => {
    if (!searchTerm) return true;
    const isSplitBill = Number(order.isSplitBill || 0) === 1;
    const paymentMode = isSplitBill ? 'Split bill' : String(order.payment_mode || 'cash');
    return [order.id, order.tableId, order.customer?.name, order.status, paymentMode]
      .filter(value => value !== null && value !== undefined && value !== '')
      .some(value => String(value).toLowerCase().includes(searchTerm));
  });

  const totalPages = Math.max(1, Math.ceil(closedOrdersState.filteredItems.length / closedOrdersState.pageSize));
  if (closedOrdersState.page > totalPages) {
    closedOrdersState.page = totalPages;
  }

  updateClosedOrdersSummary();

  if (!orders.length) {
    body.innerHTML = '<tr><td colspan="8" class="empty-state">No closed orders have been recorded yet.</td></tr>';
    if (message) message.textContent = 'No closed orders available right now.';
    return;
  }

  if (!closedOrdersState.filteredItems.length) {
    body.innerHTML = '<tr><td colspan="8" class="empty-state">No closed orders match your search.</td></tr>';
    if (message) message.textContent = `0 of ${orders.length} closed order${orders.length === 1 ? '' : 's'} match your search.`;
    return;
  }

  if (message) {
    message.textContent = `${closedOrdersState.filteredItems.length} of ${orders.length} closed order${orders.length === 1 ? '' : 's'} loaded.`;
  }

  const pageItems = closedOrdersState.filteredItems.slice(
    (closedOrdersState.page - 1) * closedOrdersState.pageSize,
    closedOrdersState.page * closedOrdersState.pageSize
  );

  body.innerHTML = pageItems.map(order => {
    const total = Number(order.total_payable_amount ?? order.item_price ?? 0);
    const isSplitBill = Number(order.isSplitBill || 0) === 1;
    const paymentMode = isSplitBill ? 'Split bill' : String(order.payment_mode || 'cash').toUpperCase();
    const closedAt = formatDateTime(order.updatedAt || order.createdAt);

    return `
      <tr>
        <td>#${order.id || '000'}</td>
        <td>${order.tableId || '—'}</td>
        <td>${order.customer?.name || 'Walk-in guest'}</td>
        <td><span class="status-pill ${statusClass(order.status)}">${order.status || 'Paid'}</span></td>
        <td>${paymentMode}</td>
        <td>${formatCurrency(total)}</td>
        <td>${closedAt}</td>
        <td><button type="button" class="menu-action-btn" data-order-action="view-closed-order" data-order-id="${order.id}">View</button></td>
      </tr>
    `;
  }).join('');
}

function renderClosedOrderDetails(order) {
  const content = document.getElementById('closedOrderDetailsContent');
  if (!content || !order) return;

  const items = getClosedOrderItems(order);
  const subtotal = Number(order.item_price || 0);
  const taxPercentage = Number(order.tax_percentage || 0);
  const taxAmount = Number(order.tax_amount || 0);
  const discountAmount = Number(order.discount_amount || 0);
  const discountPerc = Number(order.discount_perc || 0);
  const totalPayable = Number(order.total_payable_amount || 0);
  const isSplitBill = Number(order.isSplitBill || 0) === 1;
  const itemRows = items.length
    ? items.map(item => `
        <tr>
          <td>${item.name || `Item #${item.menuItemId || '-'}`}</td>
          <td>${item.portion || 'full'}</td>
          <td>${Number(item.quantity || 0)}</td>
          <td>${formatCurrency(item.price)}</td>
          <td>${formatCurrency(Number(item.price || 0) * Number(item.quantity || 0))}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="5" class="empty-state">No item details are available for this order.</td></tr>';

  content.innerHTML = `
    <div class="details-grid">
      <div class="details-card"><span>Order number</span><strong>#${order.id || '—'}</strong></div>
      <div class="details-card"><span>Status</span><strong><span class="status-pill ${statusClass(order.status)}">${order.status || 'Paid'}</span></strong></div>
      <div class="details-card"><span>Table</span><strong>${order.tableId || '—'}</strong></div>
      <div class="details-card"><span>Order type</span><strong>${order.order_type || 'Dine-in'}</strong></div>
      <div class="details-card"><span>Customer</span><strong>${order.customer?.name || 'Walk-in guest'}</strong></div>
      <div class="details-card"><span>Cashier</span><strong>${order.createdBy?.name || '—'}</strong></div>
      <div class="details-card"><span>Payment mode</span><strong>${isSplitBill ? 'Split bill' : String(order.payment_mode || 'cash').toUpperCase()}</strong></div>
      <div class="details-card"><span>Closed at</span><strong>${formatDateTime(order.updatedAt || order.createdAt)}</strong></div>
    </div>

    <div class="detail-section">
      <h4>Order Items</h4>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr><th>Item</th><th>Portion</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>
    </div>

    <div class="detail-section">
      <h4>Payment Summary</h4>
      <div class="receipt-summary">
        <div class="receipt-summary-row"><span>Subtotal</span><strong>${formatCurrency(subtotal)}</strong></div>
        <div class="receipt-summary-row"><span>Tax (${taxPercentage.toFixed(0)}%)</span><strong>${formatCurrency(taxAmount)}</strong></div>
        <div class="receipt-summary-row"><span>Discount${discountPerc ? ` (${discountPerc.toFixed(0)}%)` : ''}</span><strong>- ${formatCurrency(discountAmount)}</strong></div>
        <div class="receipt-summary-row receipt-summary-total"><span>Total payable</span><strong>${formatCurrency(totalPayable)}</strong></div>
        <div class="receipt-summary-row"><span>Cash payment</span><strong>${formatCurrency(order.cash_payment || 0)}</strong></div>
        <div class="receipt-summary-row"><span>Card payment</span><strong>${formatCurrency(order.card_payment || 0)}</strong></div>
        <div class="receipt-summary-row"><span>UPI payment</span><strong>${formatCurrency(order.upi_payment || 0)}</strong></div>
      </div>
    </div>
  `;
}

function openClosedOrderDetails(order) {
  closedOrdersState.selectedOrder = order;
  renderClosedOrderDetails(order);
  showSaveMessage('closedOrderPrintMessage', '');
  toggleModal('closedOrderDetailsModal', 'closedOrderDetailsBackdrop', true);
}

function closeClosedOrderDetails() {
  closedOrdersState.selectedOrder = null;
  const content = document.getElementById('closedOrderDetailsContent');
  if (content) {
    content.innerHTML = '<div class="empty-state">Select an order to inspect its details.</div>';
  }
  showSaveMessage('closedOrderPrintMessage', '');
  toggleModal('closedOrderDetailsModal', 'closedOrderDetailsBackdrop', false);
}

function getClosedOrderPortionLabel(portion) {
  const normalized = String(portion || 'full').toLowerCase();
  if (normalized === 'qtr') return 'Qtr';
  if (normalized === 'half') return 'Half';
  return 'Full';
}

function printClosedOrderReceipt(order) {
  if (!order) return;

  if (!window.electronAPI || typeof window.electronAPI.printReceipt !== 'function') {
    console.error('electronAPI.printReceipt is not available in renderer');
    showSaveMessage('closedOrderPrintMessage', 'Printer bridge is not available. Please restart the app.', true);
    return;
  }
console.log('Printing closed order receipt for order:', order);
  const restaurant = JSON.parse(localStorage.getItem('restaurant_session') || '{}');
  const items = getClosedOrderItems(order);
  const subtotal = Number(order.item_price || 0);
  const taxPercentage = Number(order.tax_percentage || 0);
  const taxAmount = Number(order.tax_amount || 0);
  const discountAmount = Number(order.discount_amount || 0);
  const discountPerc = Number(order.discount_perc || 0);
  const onSpotDiscount = Number(order.on_spot_discount || 0);
  const totalPayable = Number(order.total_payable_amount || 0);

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
    { type: 'raw', format: 'command', data: "Tax Invoice (Reprint)\n" },
    { type: 'raw', format: 'command', data: getFormattedCurrentDateTime() + "\n" },
    { type: 'raw', format: 'command', data: BOLD_OFF },
    { type: 'raw', format: 'command', data: "Order No: " + (order.strOrderId || order.id) + "\n" },
    { type: 'raw', format: 'command', data: "Customer: " + (order.customer?.name || 'Walk-in guest') + "\n" },
    { type: 'raw', format: 'command', data: "--------------------------------\n" },
    { type: 'raw', format: 'command', data: ALIGN_LEFT },
    { type: 'raw', format: 'command', data: "Item                Qty      price   Amount(Rs.)\n" },
    { type: 'raw', format: 'command', data: "-----------------------------------------------\n" },
  ];

  var mrpTotal = 0;
  var calculatedTotal = 0;
  items.forEach(it => {
    console.log('Processing item:', it);
    let price = formatCurrency(it.price);
    if(it.onMrp){
       price = "MRP";
       mrpTotal += Number(it.price || 0) * Number(it.quantity || 0);
    }
    calculatedTotal += Number(it.price || 0) * Number(it.quantity || 0);
    receipt.push({
      type: 'raw',
      format: 'command',
      data: formatRowInvoice(it.name || `Item #${it.menuItemId || '-'}`, it.quantity, getClosedOrderPortionLabel(it.portion),price , formatCurrency(Number(it.price || 0) * Number(it.quantity || 0))) + "\n"
    });
  });
calculatedTotal += taxAmount;
  receipt.push({ type: 'raw', format: 'command', data: "-----------------------------------------------\n" });
  receipt.push({ type: 'raw', format: 'command', data: formatTotals("Taxable Subtotal", formatCurrency(subtotal- mrpTotal)) + "\n" });
  receipt.push({ type: 'raw', format: 'command', data: formatTotals("Tax (" + taxPercentage.toFixed(0) + "%)", formatCurrency(taxAmount)) + "\n" });

  if(mrpTotal > 0) {
    receipt.push({ type: 'raw', format: 'command', data: formatTotals("MRP Items Total", formatCurrency(mrpTotal)) + "\n" });
  }

  if (discountAmount > 0) {
    const discountName = `Discount${discountPerc ? ` (${discountPerc.toFixed(0)}%)` : ''}`;
    receipt.push({ type: 'raw', format: 'command', data: formatTotals(discountName, `- ${formatCurrency(discountAmount)}`) + "\n" });
    calculatedTotal -= discountAmount;
  }

  if (onSpotDiscount > 0) {
    receipt.push({ type: 'raw', format: 'command', data: formatTotals("On Spot Discount", `- ${formatCurrency(onSpotDiscount)}`) + "\n" });
    calculatedTotal -= onSpotDiscount;
  }

  receipt.push({ type: 'raw', format: 'command', data: formatTotals("Total Amount", formatCurrency(calculatedTotal)) + "\n" });

  if(calculatedTotal < totalPayable){
    let adjustment = totalPayable - calculatedTotal;
    receipt.push({ type: 'raw', format: 'command', data: formatTotals("Adjustment", formatCurrency(adjustment)) + "\n" });
  }
  receipt.push({ type: 'raw', format: 'command', data: "===============================================\n" });
  receipt.push({ type: 'raw', format: 'command', data: BOLD_ON });
  receipt.push({ type: 'raw', format: 'command', data: formatTotals("Total Payable", formatCurrency(totalPayable)) + "\n" });
  receipt.push({ type: 'raw', format: 'command', data: BOLD_OFF });
  receipt.push({ type: 'raw', format: 'command', data: "===============================================\n" });

  receipt.push({ type: 'raw', format: 'command', data: ALIGN_CENTER });
  receipt.push({ type: 'raw', format: 'command', data: "Terms & Conditions applied\n" });
  receipt.push({ type: 'raw', format: 'command', data: CUT_FULL });

  window.electronAPI.printReceipt(receipt, restaurant.printerName);
  showSaveMessage('closedOrderPrintMessage', 'Receipt sent to printer.');
}

async function loadClosedOrderDetailsById(orderId) {
  try {
    const response = await fetch(`/api/orders/id/${orderId}`);
    if (!response.ok) {
      throw new Error(`Load failed with status ${response.status}`);
    }

    const order = await response.json();
    openClosedOrderDetails(order);
  } catch (error) {
    const fallbackOrder = closedOrdersState.items.find(item => Number(item.id) === Number(orderId));
    if (fallbackOrder) {
      openClosedOrderDetails(fallbackOrder);
      return;
    }

    showSaveMessage('closedOrdersMessage', error.message, true);
  }
}

async function loadClosedOrders() {
  const body = document.getElementById('closedOrdersTableBody');
  if (body) {
    body.innerHTML = '<tr><td colspan="8" class="empty-state">Loading closed orders...</td></tr>';
  }

  try {
    const response = await fetch(`/api/orders/closedOrders/${headerRestaurantId}`);
    if (!response.ok) {
      throw new Error(`Load failed with status ${response.status}`);
    }

    const data = await response.json();
    closedOrdersState.items = Array.isArray(data) ? data : [];
    renderClosedOrdersTable();
  } catch (error) {
    closedOrdersState.items = [];
    renderClosedOrdersTable();
    showSaveMessage('closedOrdersMessage', error.message, true);
  }
}

function setupClosedOrdersSearch() {
  const searchInput = document.getElementById('closedOrdersSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', event => {
      closedOrdersState.searchTerm = event.target.value || '';
      closedOrdersState.page = 1;
      renderClosedOrdersTable();
    });
  }

  const prevButton = document.getElementById('closedOrdersPrevButton');
  const nextButton = document.getElementById('closedOrdersNextButton');

  if (prevButton) {
    prevButton.addEventListener('click', () => {
      if (closedOrdersState.page > 1) {
        closedOrdersState.page -= 1;
        renderClosedOrdersTable();
      }
    });
  }

  if (nextButton) {
    nextButton.addEventListener('click', () => {
      const totalPages = Math.max(1, Math.ceil(closedOrdersState.filteredItems.length / closedOrdersState.pageSize));
      if (closedOrdersState.page < totalPages) {
        closedOrdersState.page += 1;
        renderClosedOrdersTable();
      }
    });
  }
}

function setupClosedOrdersPage() {
  const tableBody = document.getElementById('closedOrdersTableBody');
  const refreshButton = document.getElementById('refreshClosedOrdersButton');
  const closeButton = document.getElementById('closeClosedOrderDetailsButton');
  const closeFooterButton = document.getElementById('closeClosedOrderDetailsFooterButton');
  const backdrop = document.getElementById('closedOrderDetailsBackdrop');
  const printButton = document.getElementById('printClosedOrderReceiptButton');

  if (tableBody) {
    tableBody.addEventListener('click', event => {
      const button = event.target.closest('[data-order-action="view-closed-order"]');
      if (!button) return;
      const orderId = button.getAttribute('data-order-id');
      loadClosedOrderDetailsById(orderId);
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', () => loadClosedOrders());
  }

  if (closeButton) closeButton.addEventListener('click', closeClosedOrderDetails);
  if (closeFooterButton) closeFooterButton.addEventListener('click', closeClosedOrderDetails);
  if (backdrop) backdrop.addEventListener('click', closeClosedOrderDetails);

  if (printButton) {
    printButton.addEventListener('click', () => {
      if (!closedOrdersState.selectedOrder) return;
      try {
        printClosedOrderReceipt(closedOrdersState.selectedOrder);
      } catch (error) {
        showSaveMessage('closedOrderPrintMessage', error.message, true);
      }
    });
  }

  setupClosedOrdersSearch();
  loadClosedOrders();
}

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  setupClosedOrdersPage();
});
