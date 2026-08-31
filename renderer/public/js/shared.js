// function formatCurrency(value) {
//   return new Intl.NumberFormat('en-US', {
//     style: 'currency',
//     currency: 'INR',
//     maximumFractionDigits: 2
//   }).format(Number(value || 0));
// }

function formatCurrency(value) {
  return " " + Number(value || 0).toFixed(2);
}

function formatCurrencyPrint(value) {
  return Number(value || 0);
}



// function formatDateTime(dateString) {
//   const date = new Date(dateString);

//   // Day with leading zero
//   const day = String(date.getDate()).padStart(2, '0');

//   // Month abbreviation
//   const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", 
//                       "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
//   const month = monthNames[date.getMonth()];

//   // Year
//   const year = date.getFullYear();

//   // Hours, Minutes, Seconds
//   let hours = date.getHours();
//   const minutes = String(date.getMinutes()).padStart(2, '0');
//   const seconds = String(date.getSeconds()).padStart(2, '0');

//   // AM/PM logic
//   const ampm = hours >= 12 ? 'PM' : 'AM';
//   hours = hours % 12;         // convert to 12-hour format
//   hours = hours ? hours : 12; // 0 becomes 12

//   // Leading zero for hours if needed
//   const formattedHours = String(hours).padStart(2, '0');

//   return `${day}-${month}-${year} ${formattedHours}:${minutes} ${ampm}`;
// }


// function getFormattedCurrentDateTime() {
//    const now = new Date();

//   // Day with leading zero
//   const day = String(now.getDate()).padStart(2, '0');

//   // Month abbreviation
//   const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", 
//                       "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
//   const month = monthNames[now.getMonth()];

//   // Year
//   const year = now.getFullYear();

//   // Hours, Minutes, Seconds
//   let hour = now.getHours();
//   const minutes = String(now.getMinutes()).padStart(2, '0');
//   const seconds = String(now.getSeconds()).padStart(2, '0');

//   // AM/PM logic
//   const ampm = hour >= 12 ? 'PM' : 'AM';
//   hour = hour % 12;
//   if (hour === 0) {
//     hour = 12;
//   }

//   // Leading zero for hours
//   const formattedHour = String(hour).padStart(2, '0');

//   return `${day}-${month}-${year} ${formattedHour}:${minutes} ${ampm}`
// }


function formatDateTime(dateString) {
  const date = new Date(dateString.endsWith("Z") ? dateString : dateString + "Z");

  const options = {
    timeZone: "Asia/Kolkata",   // 👈 force IST
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  };

  return new Intl.DateTimeFormat("en-US", options).format(date);
}

// Get current date-time formatted in browser's timezone
function getFormattedCurrentDateTime(timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
 const now = new Date();

  const options = {
    timeZone: "Asia/Kolkata",   // 👈 force IST
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  };

  return new Intl.DateTimeFormat("en-US", options).format(now);
}

function statusClass(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('ready') || normalized.includes('available') || normalized.includes('paid')) return 'success';
  if (normalized.includes('pending') || normalized.includes('low') || normalized.includes('incomplete')) return 'warning';
  return 'danger';
}

const menuState = {
  items: [],
  filteredItems: [],
  page: 1,
  pageSize: 8,
  searchTerm: ''
};

const modalCloseActions = {};
const SIDEBAR_STORAGE_KEY = 'restaurantSidebarCollapsed';
let dashboardSalesChartInstance = null;
let dashboardInventoryChartInstance = null;

function renderDashboard(data) {
  const weeklySales = Number(data.weeklySales ?? data.revenue ?? 0);
  const ordersServed = Number(data.ordersServed ?? data.orders ?? 0);
  const cashInHandToday = Number(data.cashInHandToday ?? 0);
  const expensesToday = Number(data.totalExpensesToday ?? 0);
  const expensesWeek = Number(data.totalExpensesWeek ?? 0);
  const cashIncomeToday = Number(data.cashIncomeToday ?? 0);

  const inventoryBreakdown = data.inventoryBreakdown || {};
  const inStockCount = Number(inventoryBreakdown.inStock ?? 0);
  const outOfStockCount = Number(inventoryBreakdown.outOfStock ?? 0);
  const totalInventory = Number(inventoryBreakdown.total ?? (inStockCount + outOfStockCount));

  const cards = [
    ['weeklySalesValue', formatCurrency(weeklySales), 'weeklySalesHint', `${(Array.isArray(data.salesLabels) ? data.salesLabels.length : 7)}-day performance`],
    ['orderValue', ordersServed, 'orderHint', 'Paid orders served this week'],
    ['cashInHandValue', formatCurrency(cashInHandToday), 'cashInHandHint', `Cash income today ${formatCurrency(cashIncomeToday)}`],
    ['expensesValue', formatCurrency(expensesToday), 'expensesHint', `Weekly expenses ${formatCurrency(expensesWeek)}`]
  ];

  cards.forEach(([valueId, valueText, hintId, hintText]) => {
    const valueEl = document.getElementById(valueId);
    const hintEl = document.getElementById(hintId);
    if (valueEl) valueEl.textContent = valueText;
    if (hintEl) hintEl.textContent = hintText;
  });

  const pulseList = document.getElementById('pulseList');
  if (pulseList) {
    const avgDailySales = weeklySales / 7;
    pulseList.innerHTML = `
      <div class="list-item"><span>Inventory items tracked</span><strong>${totalInventory}</strong></div>
      <div class="list-item"><span>Average daily sales</span><strong>${formatCurrency(avgDailySales)}</strong></div>
      <div class="list-item"><span>Cash in hand</span><strong>${formatCurrency(cashInHandToday)}</strong></div>
      <div class="list-item"><span>Weekly expenses</span><strong>${formatCurrency(expensesWeek)}</strong></div>
    `;
  }

  const inventoryLegend = document.getElementById('inventoryLegend');
  if (inventoryLegend) {
    inventoryLegend.innerHTML = `
      <div class="list-item"><span>In stock</span><strong>${inStockCount}</strong></div>
      <div class="list-item"><span>Out of stock</span><strong>${outOfStockCount}</strong></div>
    `;
  }

  const chartCanvas = document.getElementById('dashboardChart');
  if (chartCanvas && window.Chart) {
    const ctx = chartCanvas.getContext('2d');
    const labels = Array.isArray(data.salesLabels) && data.salesLabels.length
      ? data.salesLabels
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const trend = Array.isArray(data.salesTrend) && data.salesTrend.length
      ? data.salesTrend
      : [0, 0, 0, 0, 0, 0, 0];

    if (dashboardSalesChartInstance) {
      dashboardSalesChartInstance.destroy();
    }

    dashboardSalesChartInstance = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Total sale',
          data: trend,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.18)',
          tension: 0.35,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            ticks: {
              callback: value => formatCurrency(value)
            }
          }
        }
      }
    });
  }

  const inventoryCanvas = document.getElementById('inventoryChart');
  if (inventoryCanvas && window.Chart) {
    const inventoryCtx = inventoryCanvas.getContext('2d');

    if (dashboardInventoryChartInstance) {
      dashboardInventoryChartInstance.destroy();
    }

    dashboardInventoryChartInstance = new window.Chart(inventoryCtx, {
      type: 'pie',
      data: {
        labels: ['In stock', 'Out of stock'],
        datasets: [{
          data: [inStockCount, outOfStockCount],
          backgroundColor: ['#0f766e', '#c2410c'],
          borderColor: ['#0b5f58', '#9a3412'],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }
}

function getMenuItems() {
  return Array.isArray(menuState.filteredItems) ? menuState.filteredItems : [];
}

function updateMenuSummary() {
  const total = menuState.items.length;
  const filtered = menuState.filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(filtered / menuState.pageSize));
  const currentPage = Math.min(menuState.page, totalPages);
  const startIndex = filtered === 0 ? 0 : ((currentPage - 1) * menuState.pageSize) + 1;
  const endIndex = Math.min(currentPage * menuState.pageSize, filtered);

  const countEl = document.getElementById('menuCount');
  const summaryEl = document.getElementById('menuPageSummary');
  const indicatorEl = document.getElementById('menuPageIndicator');
  const prevButton = document.getElementById('menuPrevButton');
  const nextButton = document.getElementById('menuNextButton');

  if (countEl) {
    countEl.textContent = `${total} dishes`;
  }

  if (summaryEl) {
    if (filtered === 0) {
      summaryEl.textContent = total ? `No matches for “${menuState.searchTerm}”` : 'No menu items are available yet.';
    } else {
      summaryEl.textContent = `Showing ${startIndex}-${endIndex} of ${filtered} items`;
    }
  }

  if (indicatorEl) {
    indicatorEl.textContent = `Page ${filtered ? currentPage : 0} of ${filtered ? totalPages : 0}`;
  }

  if (prevButton) prevButton.disabled = menuState.page <= 1 || filtered === 0;
  if (nextButton) nextButton.disabled = menuState.page >= totalPages || filtered === 0;
}

function renderOrders(data) {
  const body = document.getElementById('ordersTableBody');
  if (!body) return;

  const orders = Array.isArray(data) ? data : [];
  if (!orders.length) {
    body.innerHTML = '<tr><td colspan="4" class="empty-state">No orders have been posted yet.</td></tr>';
    return;
  }

  body.innerHTML = orders.map(order => `
    <tr>
      <td>#${order.id || '000'}</td>
      <td>${order.tableId || '—'}</td>
      <td><span class="status-pill ${statusClass(order.status)}">${order.status || 'Pending'}</span></td>
      <td>${formatCurrency(order.total_payable_amount ?? order.item_price ?? 0)}</td>
    </tr>
  `).join('');
}

function renderInventory(data) {
  const body = document.getElementById('inventoryTableBody');
  const alertList = document.getElementById('inventoryAlerts');
  if (!body && !alertList) return;

  const inventory = Array.isArray(data) ? data : [];
  if (body) {
    if (!inventory.length) {
      body.innerHTML = '<tr><td colspan="3" class="empty-state">No inventory items available.</td></tr>';
    } else {
      body.innerHTML = inventory.map(item => `
        <tr>
          <td>${item.itemName || 'Unnamed item'}</td>
          <td>${item.quantity ?? 0} ${item.unit || ''}</td>
          <td><span class="status-pill ${statusClass(item.status)}">${item.status || 'Available'}</span></td>
        </tr>
      `).join('');
    }
  }

  if (alertList) {
    alertList.innerHTML = inventory.length ? inventory.slice(0, 4).map(item => `
      <div class="list-item"><span>${item.itemName || 'Unnamed item'}</span><strong>${item.quantity ?? 0}${item.unit ? ` ${item.unit}` : ''}</strong></div>
    `).join('') : '<div class="empty-state">Stock is looking healthy.</div>';
  }
}

function renderReservations(data) {
  const list = document.getElementById('reservationList');
  const countEl = document.getElementById('reservationCount');
  if (!list) return;

  const reservations = Array.isArray(data) ? data : [];
  if (countEl) countEl.textContent = `${reservations.length} bookings`;

  if (!reservations.length) {
    list.innerHTML = '<div class="empty-state">No reservations have been created yet.</div>';
    return;
  }

  list.innerHTML = reservations.slice(0, 5).map(item => `
    <div class="list-item">
      <div>
        <strong>${item.customerName || item.customer || 'Guest'}</strong>
        <div class="muted">${item.date || item.reservationDate || 'TBD'} • ${item.tableNumber || item.tableId || 'Table'}</div>
      </div>
      <span class="status-pill success">${item.status || 'Confirmed'}</span>
    </div>
  `).join('');
}


async function saveJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  let responseBody = null;
  try {
    responseBody = await response.json();
  } catch (error) {
    responseBody = null;
  }

  if (!response.ok) {
    const message = responseBody?.message || `Save failed with status ${response.status}`;
    throw new Error(message);
  }

  return responseBody;
}

function showSaveMessage(elementId, message, isError = false) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = message;
  element.style.color = isError ? '#b91c1c' : '#166534';
}

function fillSelect(selectId, items, labelKey = 'name') {
  const select = document.getElementById(selectId);
  if (!select) return;

  const options = Array.isArray(items) ? items : [];
  select.innerHTML = options.map(item => `<option value="${item.id}">${item[labelKey] || `#${item.id}`}</option>`).join('');
}

function loadOrderMeta() {
  const createdBySelect = document.getElementById('orderCreatedBy');
  const customerSelect = document.getElementById('orderCustomerId');
  if (!createdBySelect || !customerSelect) return;

  fetch('/api/orders/meta')
    .then(res => res.json())
    .then(meta => {
      fillSelect('orderCreatedBy', meta.users || []);
      fillSelect('orderCustomerId', meta.customers || []);
    })
    .catch(() => {
      showSaveMessage('orderSaveMessage', 'Unable to load order metadata. Add users/customers first.', true);
    });
}

function loadStaffMeta() {
  const userSelect = document.getElementById('staffUserId');
  const roleSelect = document.getElementById('staffRoleId');
  const restaurantSelect = document.getElementById('staffRestaurantId');
  if (!userSelect || !roleSelect || !restaurantSelect) return;

  fetch('/api/staff/meta')
    .then(res => res.json())
    .then(meta => {
      fillSelect('staffUserId', meta.users || []);
      fillSelect('staffRoleId', meta.roles || []);
      fillSelect('staffRestaurantId', meta.restaurants || []);
    })
    .catch(() => {
      showSaveMessage('staffSaveMessage', 'Unable to load staff metadata. Verify users, roles, and restaurants.', true);
    });
}


function loadSettings() {
  const restaurantNameInput = document.getElementById('settingsRestaurantName');
  const openingHoursInput = document.getElementById('settingsOpeningHours');
  const currencyInput = document.getElementById('settingsCurrency');

  if (!restaurantNameInput || !openingHoursInput || !currencyInput) {
    return;
  }

  fetch('/api/settings')
    .then(res => res.json())
    .then(data => {
      restaurantNameInput.value = data.restaurantName || '';
      openingHoursInput.value = data.openingHours || '';
      currencyInput.value = data.currency || 'USD';
    })
    .catch(() => {
      showSaveMessage('settingsSaveMessage', 'Unable to load saved settings.', true);
    });
}

function setupMenuSave() {
  const form = document.getElementById('menuForm');
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const payload = {
      name: document.getElementById('menuName')?.value?.trim(),
      category: document.getElementById('menuCategory')?.value || 'Main',
      type: document.getElementById('menuType')?.value || 'Veg',
      qtr_price: Number(document.getElementById('qtrPrice')?.value || 0),
      half_price: Number(document.getElementById('halfPrice')?.value || 0),
      full_price: Number(document.getElementById('fullPrice')?.value || 0),
      available: (document.getElementById('menuStatus')?.value || 'Available') === 'Available',
      description: document.getElementById('menuDescription')?.value?.trim() || ''
    };

    try {
      await saveJson('/api/menu', payload);
      showSaveMessage('menuSaveMessage', 'Menu item saved successfully.');
      form.reset();
      fetch('/api/menu').then(res => res.json()).then(data => renderMenu(data));
      modalCloseActions.menuModal?.();
    } catch (error) {
      showSaveMessage('menuSaveMessage', error.message, true);
    }
  });
}

function toggleModal(modalId, backdropId, shouldOpen) {
  const modal = document.getElementById(modalId);
  const backdrop = document.getElementById(backdropId);
  if (modal) modal.hidden = !shouldOpen;
  if (backdrop) backdrop.hidden = !shouldOpen;
}

function setupModal(modalConfig) {
  const openButton = document.getElementById(modalConfig.openButtonId);
  const closeButton = document.getElementById(modalConfig.closeButtonId);
  const cancelButton = document.getElementById(modalConfig.cancelButtonId);
  const backdrop = document.getElementById(modalConfig.backdropId);

  const openModal = () => toggleModal(modalConfig.modalId, modalConfig.backdropId, true);
  const closeModal = () => toggleModal(modalConfig.modalId, modalConfig.backdropId, false);

  if (openButton) openButton.addEventListener('click', openModal);
  if (closeButton) closeButton.addEventListener('click', closeModal);
  if (cancelButton) cancelButton.addEventListener('click', closeModal);
  if (backdrop) backdrop.addEventListener('click', closeModal);

  modalCloseActions[modalConfig.modalId] = closeModal;

  return closeModal;
}

function setupModalGroup(modalConfigs) {
  const closeHandlers = modalConfigs
    .map(setupModal)
    .filter(Boolean);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeHandlers.forEach(closeModal => closeModal());
    }
  });
}

function setupMenuSearch() {
  const searchInput = document.getElementById('menuSearchInput');
  if (!searchInput) return;

  searchInput.addEventListener('input', event => {
    menuState.searchTerm = event.target.value || '';
    menuState.page = 1;
    renderMenu(menuState.items);
  });

  const prevButton = document.getElementById('menuPrevButton');
  const nextButton = document.getElementById('menuNextButton');

  if (prevButton) {
    prevButton.addEventListener('click', () => {
      if (menuState.page > 1) {
        menuState.page -= 1;
        renderMenu(menuState.items);
      }
    });
  }

  if (nextButton) {
    nextButton.addEventListener('click', () => {
      const totalPages = Math.max(1, Math.ceil(menuState.filteredItems.length / menuState.pageSize));
      if (menuState.page < totalPages) {
        menuState.page += 1;
        renderMenu(menuState.items);
      }
    });
  }
}

function setupModalAwareForms() {
  setupModalGroup([
    {
      openButtonId: 'openMenuFormButton',
      closeButtonId: 'closeMenuFormButton',
      cancelButtonId: 'cancelMenuFormButton',
      modalId: 'menuModal',
      backdropId: 'menuModalBackdrop'
    },
    {
      openButtonId: 'openOrderFormButton',
      closeButtonId: 'closeOrderFormButton',
      cancelButtonId: 'cancelOrderFormButton',
      modalId: 'orderModal',
      backdropId: 'orderModalBackdrop'
    },
    {
      openButtonId: 'openInventoryFormButton',
      closeButtonId: 'closeInventoryFormButton',
      cancelButtonId: 'cancelInventoryFormButton',
      modalId: 'inventoryModal',
      backdropId: 'inventoryModalBackdrop'
    },
    {
      openButtonId: 'openStaffFormButton',
      closeButtonId: 'closeStaffFormButton',
      cancelButtonId: 'cancelStaffFormButton',
      modalId: 'staffModal',
      backdropId: 'staffModalBackdrop'
    }
  ]);
}

function setupInventorySave() {
  const form = document.getElementById('inventoryForm');
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const payload = {
      itemName: document.getElementById('inventoryName')?.value?.trim(),
      itemDescription: document.getElementById('inventoryDescription')?.value?.trim(),
      quantity: Number(document.getElementById('inventoryQuantity')?.value || 0),
      unit: document.getElementById('inventoryUnit')?.value || 'kg',
      category: document.getElementById('inventoryCategory')?.value || 'Food',
      price: Number(document.getElementById('inventoryPrice')?.value || 0),
      status: document.getElementById('inventoryStatus')?.value || 'Available'
    };

    try {
      await saveJson('/api/inventory', payload);
      showSaveMessage('inventorySaveMessage', 'Inventory item saved successfully.');
      form.reset();
      fetch('/api/inventory').then(res => res.json()).then(data => renderInventory(data));
      modalCloseActions.inventoryModal?.();
    } catch (error) {
      showSaveMessage('inventorySaveMessage', error.message, true);
    }
  });
}

function setupReservationSave() {
  const form = document.getElementById('reservationForm');
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const payload = {
      customerName: document.getElementById('reservationCustomer')?.value?.trim(),
      customerPhone: document.getElementById('reservationPhone')?.value?.trim(),
      reservationDate: document.getElementById('reservationDate')?.value,
      reservationTime: document.getElementById('reservationTime')?.value,
      tableId: Number(document.getElementById('reservationTable')?.value || 0),
      partySize: Number(document.getElementById('reservationPartySize')?.value || 1)
    };

    try {
      await saveJson('/api/reservations', payload);
      showSaveMessage('reservationSaveMessage', 'Reservation saved successfully.');
      form.reset();
      fetch('/api/reservations').then(res => res.json()).then(data => renderReservations(data));
    } catch (error) {
      showSaveMessage('reservationSaveMessage', error.message, true);
    }
  });
}

function setupOrderSave() {
  const form = document.getElementById('orderForm');
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const payload = {
      tableId: Number(document.getElementById('orderTableId')?.value || 0),
      item_price: Number(document.getElementById('orderAmount')?.value || 0),
      status: document.getElementById('orderStatus')?.value || 'Pending',
      order_type: document.getElementById('orderType')?.value || 'Dine-in',
      createdByUserId: Number(document.getElementById('orderCreatedBy')?.value || 0),
      customerId: Number(document.getElementById('orderCustomerId')?.value || 0)
    };

    try {
      const result = await saveJson('/api/orders', payload);
      const posStatus = result?.posDispatch?.status || 'unknown';
      let message = 'Order saved successfully.';
      let isError = false;

      if (posStatus === 'sent') {
        message = 'Order saved and final receipt sent to the POS machine.';
      } else if (posStatus === 'skipped') {
        message = 'Order saved. POS integration is not configured yet.';
      } else if (posStatus === 'failed') {
        message = `Order saved, but POS dispatch failed: ${result?.posDispatch?.message || 'Unknown error'}`;
        isError = true;
      }

      showSaveMessage('orderSaveMessage', message, isError);
      fetch('/api/orders').then(res => res.json()).then(data => renderOrders(data));
      modalCloseActions.orderModal?.();
    } catch (error) {
      showSaveMessage('orderSaveMessage', error.message, true);
    }
  });
}

function setupStaffSave() {
  const form = document.getElementById('staffForm');
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const payload = {
      userId: Number(document.getElementById('staffUserId')?.value || 0),
      roleId: Number(document.getElementById('staffRoleId')?.value || 0),
      restaurantId: Number(document.getElementById('staffRestaurantId')?.value || 0),
      shift: document.getElementById('staffShift')?.value || 'General',
      salary: Number(document.getElementById('staffSalary')?.value || 0),
      address: document.getElementById('staffAddress')?.value || 'Not provided',
      adhaar_number: document.getElementById('staffAadhaar')?.value || 'N/A',
      bank_account_details: document.getElementById('staffBank')?.value || 'N/A',
      attendanceStatus: document.getElementById('staffAttendanceStatus')?.value || 'Present'
    };

    try {
      await saveJson('/api/staff', payload);
      showSaveMessage('staffSaveMessage', 'Staff member saved successfully.');
      form.reset();
      loadStaffMeta();
      modalCloseActions.staffModal?.();
    } catch (error) {
      showSaveMessage('staffSaveMessage', error.message, true);
    }
  });
}

function setupSettingsSave() {
  const form = document.getElementById('settingsForm');
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const payload = {
      restaurantName: document.getElementById('settingsRestaurantName')?.value || '',
      openingHours: document.getElementById('settingsOpeningHours')?.value || '',
      currency: document.getElementById('settingsCurrency')?.value || 'USD'
    };

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Save failed with status ${response.status}`);
      }

      showSaveMessage('settingsSaveMessage', 'Settings saved successfully.');
    } catch (error) {
      showSaveMessage('settingsSaveMessage', error.message, true);
    }
  });
}

function getMonthName(dateString) {
  if(!dateString) return '-';
  const date = new Date(dateString); 
  return date.toLocaleString('default', { month: 'long' });
}

function getServerContext() {
  const appContext = window.__APP_CONTEXT__ || {};
  const bodyRole = document.body?.dataset?.role;
  const bodyUser = document.body?.dataset?.user;
  const bodyRestaurant = document.body?.dataset?.restaurant;
  const restaurantId = bodyRestaurant?.restaurantId;
  // console.log(document.body?.dataset);
  // console.log(appContext.restaurant);

  return {
    role: appContext.role || bodyRole || null,
    user: appContext.user || bodyUser || null,
    restaurant: appContext.restaurant || bodyRestaurant || null,
    restaurantId: restaurantId
  };
}

function getUserDisplayText() {
  const context = getServerContext();
  if (!context.user && !context.role) return '';
  if (!context.user) return context.role;
  if (!context.role) return context.user;
  return `${context.user} • ${context.role}`;
}

function getUserInitials() {
  const context = getServerContext();
  const source = String(context.user || context.role || 'RU').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (!parts.length) return 'RU';
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('');
}

function setNavGroupExpanded(group, shouldExpand) {
  if (!group) return;

  const toggle = group.querySelector('[data-nav-toggle]');
  const sublist = group.querySelector('.nav-sublist');
  if (!toggle || !sublist) return;

  group.classList.toggle('expanded', shouldExpand);
  toggle.setAttribute('aria-expanded', shouldExpand ? 'true' : 'false');

  if (shouldExpand) {
    sublist.hidden = false;
    sublist.style.maxHeight = `${sublist.scrollHeight}px`;
    return;
  }

  sublist.style.maxHeight = `${sublist.scrollHeight}px`;
  requestAnimationFrame(() => {
    sublist.style.maxHeight = '0px';
  });
  window.setTimeout(() => {
    if (!group.classList.contains('expanded')) {
      sublist.hidden = true;
    }
  }, 220);
}

function setupSidebarSubmenus() {
  document.querySelectorAll('[data-nav-group]').forEach(group => {
    const toggle = group.querySelector('[data-nav-toggle]');
    const sublist = group.querySelector('.nav-sublist');
    if (!toggle || !sublist) return;

    const isExpanded = group.classList.contains('expanded');
    sublist.hidden = !isExpanded;
    sublist.style.maxHeight = isExpanded ? `${sublist.scrollHeight}px` : '0px';

    toggle.addEventListener('click', () => {
      if (document.body.classList.contains('sidebar-collapsed') && window.innerWidth > 900) {
        setSidebarCollapsed(false);
      }

      setNavGroupExpanded(group, !group.classList.contains('expanded'));
    });
  });
}

function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0');
}

function closeMobileSidebar() {
  document.body.classList.remove('sidebar-open');
}

function toggleSidebarState() {
  if (window.innerWidth <= 900) {
    document.body.classList.toggle('sidebar-open');
    return;
  }

  setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
}

function hydrateSidebarState() {
  if (window.innerWidth <= 900) {
    document.body.classList.remove('sidebar-collapsed');
    return;
  }

  const collapsed = localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  setSidebarCollapsed(collapsed);
}

function ensureSidebarChrome() {
  const sidebar = document.querySelector('.header');
  if (!sidebar) return;

  // const brand = sidebar.querySelector('.brand');
  // if (brand) {
  //   let brandCopy = brand.querySelector('div:not(.brand-badge):not(.sidebar-toggle-wrap)');
  //   if (brandCopy && !brandCopy.classList.contains('brand-copy')) {
  //     brandCopy.classList.add('brand-copy');
  //   }

  //   if (!brand.querySelector('.sidebar-toggle')) {
  //     const toggleButton = document.createElement('button');
  //     toggleButton.type = 'button';
  //     toggleButton.className = 'sidebar-toggle';
  //     toggleButton.setAttribute('aria-label', 'Toggle side menu');
  //     toggleButton.textContent = '≡';
  //     toggleButton.addEventListener('click', toggleSidebarState);
  //     brand.appendChild(toggleButton);
  //   }
  // }


  const profileAvatar = sidebar.querySelector('.sidebar-profile-avatar');
  const profileName = sidebar.querySelector('.sidebar-profile-name');
  const profileRole = sidebar.querySelector('.sidebar-profile-role');
  const context = getServerContext();

  if (profileAvatar) profileAvatar.textContent = getUserInitials();
  if (profileName) profileName.textContent = context.user || 'Logged-in user';
  if (profileRole) profileRole.textContent = context.role || 'Authenticated';

  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.addEventListener('click', closeMobileSidebar);
    document.body.appendChild(overlay);
  }

  const topbar = document.querySelector('.topbar');
  if (topbar && !topbar.querySelector('.sidebar-mobile-toggle')) {
    const mobileToggle = document.createElement('button');
    mobileToggle.type = 'button';
    mobileToggle.className = 'sidebar-mobile-toggle';
    mobileToggle.setAttribute('aria-label', 'Open side menu');
    mobileToggle.textContent = '≡';
    mobileToggle.addEventListener('click', toggleSidebarState);
    topbar.insertBefore(mobileToggle, topbar.firstChild);
  }

  hydrateSidebarState();
  window.addEventListener('resize', hydrateSidebarState, { passive: true });
}

function ensureSessionUserChip() {
  const displayText = getUserDisplayText();
  if (!displayText) return;

  const topbarActions = document.querySelector('.topbar-actions');
  const topbar = document.querySelector('.topbar');
  const existingSessionChip = document.querySelector('.user-session-chip');
  if (existingSessionChip) {
    existingSessionChip.textContent = displayText;
    return;
  }

  if (!topbarActions) {
    const topbarChip = topbar?.querySelector('.user-chip');
    if (topbarChip && !topbarChip.id) {
      topbarChip.textContent = displayText;
      topbarChip.classList.add('user-session-chip');
      return;
    }
  }

  const chip = document.createElement('div');
  chip.className = 'user-chip user-session-chip';
  chip.textContent = displayText;

  if (topbarActions) {
    topbarActions.prepend(chip);
    return;
  }

  if (topbar) {
    topbar.appendChild(chip);
  }
}

function ensureTabsScript() {
    const tabs = document.querySelectorAll('.tab');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        // remove active from all
        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));

        // add active to clicked tab and its content
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
      });
    });
}

function bindCommonChrome() {
  setupSidebarSubmenus();
  ensureSidebarChrome();
  // ensureSessionUserChip();
  ensureTabsScript();

  const context = getServerContext();
  const userChip = document.querySelector('.user-chip');
  if (userChip && context.role && !userChip.textContent.trim()) {
    userChip.textContent = context.role;
  }


  // const path = window.location.pathname;
  // document.querySelectorAll('.nav-item').forEach(item => {
  //   const href = item.getAttribute('href');
  //   if (href === path) item.classList.add('active');
  //   item.addEventListener('click', () => {
  //     if (window.innerWidth <= 900) {
  //       closeMobileSidebar();
  //     }
  //   });
  // });
}


 if (typeof $ !== 'undefined') {
   $(document).ready(function() {
     $('.select2-js').select2({
     // theme: "classic"
   });
   });
 }


// Utility functions for padding
function padRight(text, length) {
  return text.length >= length ? text.substring(0, length) : text + ' '.repeat(length - text.length);
}

function padLeft(text, length) {
  return text.length >= length ? text.substring(0, length) : ' '.repeat(length - text.length) + text;
}

// Format a row for 80mm (48 chars per line)
function formatRow(item, qty, portion) {
  // Example column widths: Item 28, Qty 6, Portion 14 = 48 total
  return padRight(item, 28) + padLeft(qty, 6) + padLeft(portion, 14);
}

function formatRowInvoice(item, qty, portion,price,amount) {
 // Target: 48 characters total
  // Suggested widths: Item+Portion 20, Qty 4, Price 10, Amount 14
  // 20 + 4 + 10 + 14 = 48

  var itemPortion = item + " (" + portion + ")";
  if(portion === "" || portion === null || portion === undefined) {
    itemPortion = item;
  }
  return padRight(itemPortion, 20) 
       + padLeft(" " + qty, 4)
       + padLeft(price, 10) 
       + padLeft(amount, 13);
}

function formatTotals(label, value) {
  // Target: 48 characters total
  // Suggested widths: Label 34, Value 14 = 48
  return padRight(label, 31) + padLeft(value, 16);
}

//qztray print 
const PRINTER_NAME = "POS80 Printer(3)";

// =========================
// ESC/POS Command Constants
// =========================
const ESC_INIT = [0x1B, 0x40];
const ALIGN_CENTER = [0x1B, 0x61, 0x01];
const ALIGN_LEFT = [0x1B, 0x61, 0x00];
const BOLD_ON = [0x1B, 0x45, 0x01];
const BOLD_OFF = [0x1B, 0x45, 0x00];
const CUT_FULL = [0x1D, 0x56, 0x42, 0x00];

// Initialization
// const ESC_INIT = "\x1B\x40";   // Initialize printer (reset)

// // Line & Spacing
// const LF = "\x0A";             // Line feed (new line)

// // Alignment
// const ALIGN_LEFT   = "\x1B\x61\x00";
// const ALIGN_CENTER = "\x1B\x61\x01";
// const ALIGN_RIGHT  = "\x1B\x61\x02";

// // Font Styles
// const FONT_NORMAL       = "\x1B\x21\x00";
// const FONT_BOLD         = "\x1B\x21\x08";
// const FONT_DOUBLE_HEIGHT= "\x1B\x21\x10";
// const FONT_DOUBLE_WIDTH = "\x1B\x21\x20";
// const FONT_BIG          = "\x1B\x21\x30"; // Double height + width

// // Bold
// const BOLD_ON  = "\x1B\x45\x01";
// const BOLD_OFF = "\x1B\x45\x00";

// // Underline
// const UNDERLINE_OFF    = "\x1B\x2D\x00";
// const UNDERLINE_SINGLE = "\x1B\x2D\x01";
// const UNDERLINE_DOUBLE = "\x1B\x2D\x02";

// // Fonts
// const FONT_A = "\x1B\x4D\x00"; // 12x24
// const FONT_B = "\x1B\x4D\x01"; // 9x17
// const FONT_C = "\x1B\x4D\x02"; // 8x16

// // Paper Cut
// const CUT_PARTIAL = "\x1D\x56\x00";
// const CUT_FULL    = "\x1D\x56\x01";

// // Reverse (Black/White Invert)
// const REVERSE_ON  = "\x1D\x42\x01";
// const REVERSE_OFF = "\x1D\x42\x00";

// // Cash Drawer
// const OPEN_DRAWER = "\x1B\x70\x00\x19\xFA";

// // =========================
// // Advanced Features
// // =========================

// // Barcode (example: EAN13)
// const BARCODE_EAN13 = "\x1D\x6B\x02"; // Followed by data + \x00 terminator

// // QR Code (store + print sequence)
// const QR_STORE = "\x1D\x28\x6B\x03\x00\x31\x43\x03"; // Store data