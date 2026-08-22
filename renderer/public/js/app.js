function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
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

function renderDashboard(data) {
  const cards = [
    ['revenueValue', formatCurrency(data.revenue), 'revenueHint', `+${Math.round((data.revenue / 1000) || 0)}k this week`],
    ['reservationValue', data.reservations || 0, 'reservationHint', 'Booked for the week'],
    ['orderValue', data.orders || 0, 'orderHint', 'Orders in motion'],
    ['inventoryValue', data.inventoryAlerts || 0, 'inventoryHint', 'Stock items need review']
  ];

  cards.forEach(([valueId, valueText, hintId, hintText]) => {
    const valueEl = document.getElementById(valueId);
    const hintEl = document.getElementById(hintId);
    if (valueEl) valueEl.textContent = valueText;
    if (hintEl) hintEl.textContent = hintText;
  });

  const pulseList = document.getElementById('pulseList');
  if (pulseList) {
    const occupancy = Array.isArray(data.occupancy) && data.occupancy.length ? data.occupancy[0] : 82;
    pulseList.innerHTML = `
      <div class="list-item"><span>Table occupancy</span><strong>${occupancy}%</strong></div>
      <div class="list-item"><span>Inventory alerts</span><strong>${data.inventoryAlerts || 0}</strong></div>
      <div class="list-item"><span>Reservations today</span><strong>${data.reservations || 0}</strong></div>
      <div class="list-item"><span>Kitchen activity</span><strong>Steady</strong></div>
    `;
  }

  const chartCanvas = document.getElementById('dashboardChart');
  if (chartCanvas && window.Chart) {
    const ctx = chartCanvas.getContext('2d');
    new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [{
          label: 'Revenue',
          data: Array.isArray(data.salesTrend) ? data.salesTrend : [76, 89, 84, 95, 108, 122, 136],
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.18)',
          tension: 0.35,
          fill: true
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } } }
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

// function renderMenu(data) {
//   const body = document.getElementById('menuTableBody');
//   if (!body) return;

//   const items = Array.isArray(data) ? data : [];
//   menuState.items = items;
//   menuState.filteredItems = items.filter(item => {
//     const searchTerm = menuState.searchTerm.trim().toLowerCase();
//     if (!searchTerm) return true;
//     return [item.name, item.category, item.type, item.description]
//       .filter(Boolean)
//       .some(value => String(value).toLowerCase().includes(searchTerm));
//   });

//   const totalPages = Math.max(1, Math.ceil(menuState.filteredItems.length / menuState.pageSize));
//   if (menuState.page > totalPages) {
//     menuState.page = totalPages;
//   }

//   updateMenuSummary();

//   const pageItems = getMenuItems().slice((menuState.page - 1) * menuState.pageSize, menuState.page * menuState.pageSize);

//   if (!menuState.filteredItems.length) {
//     body.innerHTML = '<tr><td colspan="5" class="empty-state">No menu items are available yet.</td></tr>';
//     return;
//   }

//   body.innerHTML = pageItems.map(item => {
//     const price = item.full_price ?? item.half_price ?? item.qtr_price ?? item.price ?? 0;
//     const availability = item.available ? 'Available' : 'Out of stock';
//     return `
//       <tr>
//         <td>${item.name || 'Unnamed item'}</td>
//         <td>${item.category || 'General'}</td>
//         <td>${item.type || '—'}</td>
//         <td>${formatCurrency(price)}</td>
//         <td><span class="status-pill ${item.available ? 'success' : 'danger'}">${availability}</span></td>
//       </tr>
//     `;
//   }).join('');
// }

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

function renderAttendance(data) {
  const list = document.getElementById('attendanceList');
  const countEl = document.getElementById('attendanceCount');
  if (!list) return;

  const records = Array.isArray(data) ? data : [];
  if (countEl) countEl.textContent = `${records.length} records`;

  if (!records.length) {
    list.innerHTML = '<div class="empty-state">No attendance records have been logged yet.</div>';
    return;
  }

  list.innerHTML = records.slice(0, 8).map(item => `
    <div class="list-item">
      <div>
        <strong>${item.staffName || item.staffMember?.user?.name || 'Staff member'}</strong>
        <div class="muted">${item.date || 'Today'} • ${item.checkIn || '--:--'} to ${item.checkOut || '--:--'}</div>
      </div>
      <span class="status-pill ${statusClass(item.status)}">${item.status || 'Present'}</span>
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

  fetch(`/api/orders/meta/${headerRestaurantId}`)
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

  fetch(`/api/staff/meta/${headerRestaurantId}`)
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

function loadAttendanceMeta() {
  const staffSelect = document.getElementById('attendanceStaffId');
  if (!staffSelect) return;

  fetch('/api/attendance/meta')
    .then(res => res.json())
    .then(meta => {
      fillSelect('attendanceStaffId', meta.staff || []);
    })
    .catch(() => {
      showSaveMessage('attendanceSaveMessage', 'Unable to load staff list for attendance.', true);
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
      full_price: Number(document.getElementById('menuPrice')?.value || 0),
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

function setupAttendanceSave() {
  const form = document.getElementById('attendanceForm');
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const payload = {
      staffId: Number(document.getElementById('attendanceStaffId')?.value || 0),
      date: document.getElementById('attendanceDate')?.value,
      checkIn: document.getElementById('attendanceCheckIn')?.value,
      checkOut: document.getElementById('attendanceCheckOut')?.value,
      status: document.getElementById('attendanceStatus')?.value || 'Present'
    };

    try {
      await saveJson('/api/attendance', payload);
      showSaveMessage('attendanceSaveMessage', 'Attendance saved successfully.');
      fetch('/api/attendance').then(res => res.json()).then(data => renderAttendance(data));
    } catch (error) {
      showSaveMessage('attendanceSaveMessage', error.message, true);
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

function getServerContext() {
  const appContext = window.__APP_CONTEXT__ || {};
  const bodyRole = document.body?.dataset?.role;
  const bodyUser = document.body?.dataset?.user;

  return {
    role: appContext.role || bodyRole || null,
    user: appContext.user || bodyUser || null
  };
}

function getRole() {
  const serverRole = getServerContext().role;
  const savedRole = localStorage.getItem('restaurantRole');
  const activeRole = serverRole || savedRole || 'Admin';

  if (serverRole && serverRole !== savedRole) {
    localStorage.setItem('restaurantRole', serverRole);
  }

  return String(activeRole).toLowerCase();
}

function renderSidebar() {
  const nav = document.querySelector('.nav-list');
  if (!nav) return;

  const role = getRole();
  const menuMap = {
    admin: [
      { label: 'Dashboard', path: '/dashboard', icon: '📊' },
      { label: 'Menu', path: '/menu', icon: '🍽️' },
      { label: 'Orders', path: '/orders', icon: '🧾' },
      { label: 'Reservations', path: '/reservations', icon: '📅' },
      { label: 'Billing', path: '/billing', icon: '💳' },
      { label: 'Inventory', path: '/inventory', icon: '📦' },
      { label: 'Attendance', path: '/attendance', icon: '🕒' },
      { label: 'Staff', path: '/staff', icon: '👥' },
      { label: 'Customers', path: '/customers', icon: '🤝' },
      { label: 'Reports', path: '/reports', icon: '📈' },
      { label: 'Settings', path: '/settings', icon: '⚙️' }
    ],
    manager: [
      { label: 'Dashboard', path: '/dashboard', icon: '📊' },
      { label: 'Menu', path: '/menu', icon: '🍽️' },
      { label: 'Orders', path: '/orders', icon: '🧾' },
      { label: 'Reservations', path: '/reservations', icon: '📅' },
      { label: 'Inventory', path: '/inventory', icon: '📦' },
      { label: 'Attendance', path: '/attendance', icon: '🕒' },
      { label: 'Reports', path: '/reports', icon: '📈' }
    ],
    staff: [
      { label: 'Dashboard', path: '/dashboard', icon: '📊' },
      { label: 'Attendance', path: '/attendance', icon: '🕒' },
      { label: 'Orders', path: '/orders', icon: '🧾' },
      { label: 'Reservations', path: '/reservations', icon: '📅' }
    ]
  };

  const items = menuMap[role] || menuMap.admin;
  nav.innerHTML = items.map(item => `
    <a class="nav-item ${window.location.pathname === item.path ? 'active' : ''}" href="${item.path}">${item.icon} ${item.label}</a>
  `).join('') + '<a class="nav-item" href="/">🚪 Logout</a>';
}

document.addEventListener('DOMContentLoaded', () => {
  renderSidebar();
  setupMenuSave();
  setupModalAwareForms();
  setupMenuSearch();
  setupInventorySave();
  setupReservationSave();
  setupOrderSave();
  // setupStaffSave();
  setupAttendanceSave();
  setupSettingsSave();
  loadOrderMeta();
  loadStaffMeta();
  loadAttendanceMeta();
  loadSettings();

  const context = getServerContext();
  const userChip = document.querySelector('.user-chip');
  if (userChip && context.role && !userChip.textContent.trim()) {
    userChip.textContent = context.role;
  }

  const path = window.location.pathname;
  document.querySelectorAll('.nav-item').forEach(item => {
    const href = item.getAttribute('href');
    if (href === path) item.classList.add('active');
  });

  if (document.getElementById('dashboardChart')) {
    fetch('/api/dashboard')
      .then(res => res.json())
      .then(data => renderDashboard(data))
      .catch(() => renderDashboard({}));
  }

  if (document.getElementById('menuTableBody')) {
    fetch('/api/menu')
      .then(res => res.json())
      .then(data => renderMenu(data))
      .catch(() => renderMenu([]));
  }

  if (document.getElementById('ordersTableBody')) {
    fetch('/api/orders')
      .then(res => res.json())
      .then(data => renderOrders(data))
      .catch(() => renderOrders([]));
  }

  if (document.getElementById('inventoryTableBody') || document.getElementById('inventoryAlerts')) {
    fetch('/api/inventory')
      .then(res => res.json())
      .then(data => renderInventory(data))
      .catch(() => renderInventory([]));
  }

  if (document.getElementById('reservationList')) {
    fetch('/api/reservations')
      .then(res => res.json())
      .then(data => renderReservations(data))
      .catch(() => renderReservations([]));
  }

  if (document.getElementById('attendanceList')) {
    fetch('/api/attendance')
      .then(res => res.json())
      .then(data => renderAttendance(data))
      .catch(() => renderAttendance([]));
  }

  if (document.getElementById('calendar')) {
    const calendarEl = document.getElementById('calendar');
    if (window.FullCalendar?.Calendar) {
      const calendar = new window.FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        events: [
          { title: 'Private Party', date: '2026-07-12' },
          { title: 'Romantic Dinner', date: '2026-07-14' },
          { title: 'Staff Training', date: '2026-07-20' }
        ]
      });
      calendar.render();
    }
  }
});
