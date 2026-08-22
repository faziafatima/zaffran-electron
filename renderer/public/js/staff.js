const staffCrudState = {
  items: [],
  filteredItems: [],
  editingId: null,
  searchTerm: '',
  page: 1,
  pageSize: 8
};

const salaryViewState = {
  selectedStaffId: null,
  selectedMonth: '',
  includeUntilToday: true,
  preset: 'mtd'
};

function getNumericValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeExpenseStaffId(expense) {
  return Number(expense?.staffMember?.id || 0);
}

function formatExpenseDate(value) {
  if (!value) return '-';
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return value;
  return parsedDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function getTodayLocalDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseMonthInput(monthValue) {
  if (!/^\d{4}-\d{2}$/.test(String(monthValue || ''))) {
    return null;
  }

  const [yearText, monthText] = String(monthValue).split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }

  return { year, monthIndex: month - 1 };
}

function toDateOnly(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function getMonthRange(monthValue, includeUntilToday) {
  const parsedMonth = parseMonthInput(monthValue);
  if (!parsedMonth) return null;

  const start = new Date(parsedMonth.year, parsedMonth.monthIndex, 1);
  const endOfMonth = new Date(parsedMonth.year, parsedMonth.monthIndex + 1, 0);
  const today = getTodayLocalDate();

  let end = endOfMonth;
  if (includeUntilToday) {
    end = today < endOfMonth ? today : endOfMonth;
  }

  if (end < start) {
    return { start, end: new Date(start.getTime() - 86400000) };
  }

  return { start, end };
}

function formatDateShort(value) {
  return value.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function updateSalaryPeriodLabel(range) {
  const labelEl = document.getElementById('salaryPeriodLabel');
  if (!labelEl) return;

  if (!range) {
    labelEl.textContent = 'Period: -';
    return;
  }

  if (range.end < range.start) {
    labelEl.textContent = `Period: ${formatDateShort(range.start)} to today (no eligible dates)`;
    return;
  }

  labelEl.textContent = `Period: ${formatDateShort(range.start)} to ${formatDateShort(range.end)}`;
}

function updateSalaryPeriodLabelFromResponse(data) {
  const labelEl = document.getElementById('salaryPeriodLabel');
  if (!labelEl) return;

  const start = data?.periodStart ? formatExpenseDate(data.periodStart) : '-';
  const end = data?.periodEnd ? formatExpenseDate(data.periodEnd) : '-';
  const daysPresent = Number(data?.daysPresent || 0);
  const daysInMonth = Number(data?.daysInMonth || 0);

  labelEl.textContent = `Period: ${start} to ${end} • Present: ${daysPresent}/${daysInMonth} days`;
}

function setSalaryPresetActiveState(preset) {
  const fullMonthButton = document.getElementById('salaryPresetFullMonthButton');
  const mtdButton = document.getElementById('salaryPresetMtdButton');

  if (fullMonthButton) {
    fullMonthButton.classList.toggle('active', preset === 'full-month');
  }
  if (mtdButton) {
    mtdButton.classList.toggle('active', preset === 'mtd');
  }
}

function syncPresetFromControls() {
  salaryViewState.preset = salaryViewState.includeUntilToday ? 'mtd' : 'full-month';
  setSalaryPresetActiveState(salaryViewState.preset);
}

function renderStaffSalaryModal(staffMember, salaryData) {
  const salaryTotal = getNumericValue(salaryData?.salaryForPresentDays);
  const totalExpenses = getNumericValue(salaryData?.totalExpenses);
  const eligibleSalary = getNumericValue(salaryData?.eligibleSalary);
  const daysInMonth = Number(salaryData?.daysInMonth || 0);
  const daysPresent = Number(salaryData?.daysPresent || 0);
  const perDaySalary = getNumericValue(salaryData?.perDaySalary);
  const monthlySalary = getNumericValue(salaryData?.monthlySalary);
  const projectedSalary = getNumericValue(salaryData?.projectedSalaryIfPresentRemainingDays);
  const expenses = Array.isArray(salaryData?.expenses) ? salaryData.expenses : [];

  const nameEl = document.getElementById('salaryStaffName');
  const totalSalaryEl = document.getElementById('salaryTotalValue');
  const expenseEl = document.getElementById('salaryExpenseValue');
  const eligibleEl = document.getElementById('salaryEligibleValue');
  const daysInMonthEl = document.getElementById('salaryDaysInMonthValue');
  const presentDaysEl = document.getElementById('salaryPresentDaysValue');
  const perDayEl = document.getElementById('salaryPerDayValue');
  const monthlyEl = document.getElementById('salaryMonthlyValue');
  const projectedEl = document.getElementById('salaryProjectedValue');
  const tableBody = document.getElementById('salaryExpenseTableBody');

  if (nameEl) nameEl.textContent = staffMember?.fullName || 'Staff member';
  if (totalSalaryEl) totalSalaryEl.textContent = formatCurrency(salaryTotal);
  if (expenseEl) expenseEl.textContent = formatCurrency(totalExpenses);
  if (eligibleEl) eligibleEl.textContent = formatCurrency(eligibleSalary);
  if (daysInMonthEl) daysInMonthEl.textContent = String(daysInMonth);
  if (presentDaysEl) presentDaysEl.textContent = String(daysPresent);
  if (perDayEl) perDayEl.textContent = formatCurrency(perDaySalary);
  if (monthlyEl) monthlyEl.textContent = formatCurrency(monthlySalary);
  if (projectedEl) projectedEl.textContent = formatCurrency(projectedSalary);

  if (!tableBody) return;

  if (!expenses.length) {
    tableBody.innerHTML = '<tr><td colspan="3" class="empty-state">No expenses recorded for this staff member.</td></tr>';
    return;
  }

  tableBody.innerHTML = expenses.map(item => `
    <tr>
      <td>${formatExpenseDate(item?.date)}</td>
      <td>${formatCurrency(item?.expenseAmount || 0)}</td>
      <td>${item?.expenseDetails || '-'}</td>
    </tr>
  `).join('');
}

function getCurrentMonthValue() {
  const today = getTodayLocalDate();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  return `${today.getFullYear()}-${month}`;
}

async function fetchEligibleSalaryForSelectedPeriod(staffId) {
  const month = encodeURIComponent(salaryViewState.selectedMonth || getCurrentMonthValue());
  const untilToday = salaryViewState.includeUntilToday ? 'true' : 'false';
  const response = await fetch(`/api/staff-expenses/${staffId}/eligible-salary?month=${month}&untilToday=${untilToday}`);
  if (!response.ok) {
    throw new Error(`Unable to calculate eligible salary (${response.status})`);
  }
  return response.json();
}

async function refreshSalaryViewForSelectedPeriod() {
  const staffId = Number(salaryViewState.selectedStaffId || 0);
  if (!staffId) return;

  const staffMember = staffCrudState.items.find(staff => Number(staff.id) === staffId);
  if (!staffMember) return;

  syncPresetFromControls();

  try {
    const salaryData = await fetchEligibleSalaryForSelectedPeriod(staffId);
    updateSalaryPeriodLabelFromResponse(salaryData);
    renderStaffSalaryModal(staffMember, salaryData);
    showSaveMessage('staffSaveMessage', '');
  } catch (error) {
    showSaveMessage('staffSaveMessage', error.message, true);
  }
}

async function openSalaryView(id) {
  const staffMember = staffCrudState.items.find(staff => Number(staff.id) === Number(id));
  if (!staffMember) {
    throw new Error('Staff member not found.');
  }

  const monthSelector = document.getElementById('salaryMonthSelector');
  const untilTodayToggle = document.getElementById('salaryUntilTodayToggle');
  const currentMonth = getCurrentMonthValue();

  salaryViewState.selectedStaffId = Number(id);
  salaryViewState.selectedMonth = currentMonth;
  salaryViewState.includeUntilToday = true;
  salaryViewState.preset = 'mtd';

  if (monthSelector) {
    monthSelector.max = currentMonth;
    monthSelector.value = currentMonth;
  }
  if (untilTodayToggle) {
    untilTodayToggle.checked = true;
  }

  await refreshSalaryViewForSelectedPeriod();
  toggleModal('salaryModal', 'salaryModalBackdrop', true);
}

function setupSalaryModalActions() {
  const closeHeaderButton = document.getElementById('closeSalaryModalButton');
  const closeFooterButton = document.getElementById('closeSalaryModalFooterButton');
  const backdrop = document.getElementById('salaryModalBackdrop');
  const monthSelector = document.getElementById('salaryMonthSelector');
  const untilTodayToggle = document.getElementById('salaryUntilTodayToggle');
  const fullMonthButton = document.getElementById('salaryPresetFullMonthButton');
  const mtdButton = document.getElementById('salaryPresetMtdButton');
  const closeModal = () => toggleModal('salaryModal', 'salaryModalBackdrop', false);

  if (closeHeaderButton) closeHeaderButton.addEventListener('click', closeModal);
  if (closeFooterButton) closeFooterButton.addEventListener('click', closeModal);
  if (backdrop) backdrop.addEventListener('click', closeModal);

  if (monthSelector) {
    monthSelector.addEventListener('change', async event => {
      const value = String(event.target?.value || '').trim();
      salaryViewState.selectedMonth = value || getCurrentMonthValue();
      await refreshSalaryViewForSelectedPeriod();
    });
  }

  if (untilTodayToggle) {
    untilTodayToggle.addEventListener('change', async event => {
      salaryViewState.includeUntilToday = Boolean(event.target?.checked);
      await refreshSalaryViewForSelectedPeriod();
    });
  }

  if (fullMonthButton) {
    fullMonthButton.addEventListener('click', async () => {
      salaryViewState.includeUntilToday = false;
      salaryViewState.preset = 'full-month';
      if (untilTodayToggle) untilTodayToggle.checked = false;
      await refreshSalaryViewForSelectedPeriod();
    });
  }

  if (mtdButton) {
    mtdButton.addEventListener('click', async () => {
      salaryViewState.includeUntilToday = true;
      salaryViewState.preset = 'mtd';
      if (untilTodayToggle) untilTodayToggle.checked = true;
      await refreshSalaryViewForSelectedPeriod();
    });
  }
}

function setStaffFormMode(isEdit) {
  const title = document.getElementById('staffModalTitle');
  const submitButton = document.querySelector('#staffForm button[type="submit"]');
  if (title) title.textContent = isEdit ? 'Edit staff' : 'Add staff';
  if (submitButton) submitButton.textContent = isEdit ? 'Update Staff' : 'Save Staff';
}

function resetStaffForm() {
  const form = document.getElementById('staffForm');
  if (form) form.reset();
  staffCrudState.editingId = null;
  setStaffFormMode(false);
  showSaveMessage('staffSaveMessage', '');
}

function updateStaffSummary() {
  const summaryEl = document.getElementById('staffPageSummary');
  const indicatorEl = document.getElementById('staffPageIndicator');
  const prevButton = document.getElementById('staffPrevButton');
  const nextButton = document.getElementById('staffNextButton');
  if (!summaryEl && !indicatorEl && !prevButton && !nextButton) return;

  const total = staffCrudState.items.length;
  const filtered = staffCrudState.filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(filtered / staffCrudState.pageSize));
  const currentPage = Math.min(staffCrudState.page, totalPages);
  const startIndex = filtered === 0 ? 0 : ((currentPage - 1) * staffCrudState.pageSize) + 1;
  const endIndex = Math.min(currentPage * staffCrudState.pageSize, filtered);

  if (summaryEl) {
    if (filtered === 0) {
      summaryEl.textContent = total ? `No matches for “${staffCrudState.searchTerm}”` : 'No staff records found.';
    } else {
      summaryEl.textContent = `Showing ${startIndex}-${endIndex} of ${filtered} staff`;
    }
  }

  if (indicatorEl) {
    indicatorEl.textContent = `Page ${filtered ? currentPage : 0} of ${filtered ? totalPages : 0}`;
  }

  if (prevButton) prevButton.disabled = staffCrudState.page <= 1 || filtered === 0;
  if (nextButton) nextButton.disabled = staffCrudState.page >= totalPages || filtered === 0;
}

function renderStaffTable(items) {
  const body = document.getElementById('staffTableBody');
  if (!body) return;

  staffCrudState.items = Array.isArray(items) ? items : [];
  const searchTerm = staffCrudState.searchTerm.trim().toLowerCase();
  staffCrudState.filteredItems = staffCrudState.items.filter(item => {
    if (!searchTerm) return true;
    return [item.fullName, item.phoneNumber, item.shift]
      .filter(value => value !== null && value !== undefined && value !== '')
      .some(value => String(value).toLowerCase().includes(searchTerm));
  });

  const totalPages = Math.max(1, Math.ceil(staffCrudState.filteredItems.length / staffCrudState.pageSize));
  if (staffCrudState.page > totalPages) {
    staffCrudState.page = totalPages;
  }

  updateStaffSummary();

  if (!staffCrudState.filteredItems.length) {
    const message = staffCrudState.items.length ? 'No staff match your search.' : 'No staff records found.';
    body.innerHTML = `<tr><td colspan="4" class="empty-state">${message}</td></tr>`;
    teamChip.textContent = `Team • ${staffCrudState.items.length} members`;
    return;
  }

  const pageItems = staffCrudState.filteredItems.slice(
    (staffCrudState.page - 1) * staffCrudState.pageSize,
    staffCrudState.page * staffCrudState.pageSize
  );

  body.innerHTML = pageItems.map(item => `
    <tr>
      <td>${item.fullName || 'Staff member'}</td>
      <td>${item.phoneNumber || 'Unknown role'}</td>
      <td>${item.shift || 'General'}</td>
      <td>
        <div class="menu-actions">
          <button type="button" class="menu-action-btn salary" data-staff-action="salary" data-staff-id="${item.id}">Eligible Salary</button>
          <button type="button" class="menu-action-btn edit" data-staff-action="edit" data-staff-id="${item.id}">Edit</button>
          <button type="button" class="menu-action-btn delete" data-staff-action="delete" data-staff-id="${item.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');


  teamChip.textContent = `Team • ${staffCrudState.items.length} members`;
}

function setupStaffSearch() {
  const searchInput = document.getElementById('staffSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', event => {
      staffCrudState.searchTerm = event.target.value || '';
      staffCrudState.page = 1;
      renderStaffTable(staffCrudState.items);
    });
  }

  const prevButton = document.getElementById('staffPrevButton');
  const nextButton = document.getElementById('staffNextButton');

  if (prevButton) {
    prevButton.addEventListener('click', () => {
      if (staffCrudState.page > 1) {
        staffCrudState.page -= 1;
        renderStaffTable(staffCrudState.items);
      }
    });
  }

  if (nextButton) {
    nextButton.addEventListener('click', () => {
      const totalPages = Math.max(1, Math.ceil(staffCrudState.filteredItems.length / staffCrudState.pageSize));
      if (staffCrudState.page < totalPages) {
        staffCrudState.page += 1;
        renderStaffTable(staffCrudState.items);
      }
    });
  }
}

async function loadStaffMembers() {
  const response = await fetch(`/api/staff/${headerRestaurantId}`);
  const data = await response.json();
  staffCrudState.items = Array.isArray(data) ? data : [];
  renderStaffTable(staffCrudState.items);
}

function openStaffForEdit(id) {
  const item = staffCrudState.items.find(staff => Number(staff.id) === Number(id));
  if (!item) return;

  staffCrudState.editingId = item.id;
  setStaffFormMode(true);

  const fullName = document.getElementById('fullName');
  const address = document.getElementById('address');
  const adhaarNumber = document.getElementById('adhaarNumber');
  const joiningDate = document.getElementById('joiningDate');
  const phoneNumber = document.getElementById('phoneNumber');
  const bankAccountNumber = document.getElementById('bankAccountNumber');
  const bankName = document.getElementById('bankName');
  const bankIFSC = document.getElementById('bankIFSC');
  const bankBranch = document.getElementById('bankBranch');
  const shift = document.getElementById('shift');
  const salary = document.getElementById('salary');

  if (fullName) fullName.value = item.fullName || '';
  if (address) address.value = item.address || '';
  if (adhaarNumber) adhaarNumber.value = item.adhaarNumber || '';
  if (phoneNumber) phoneNumber.value = item.phoneNumber || '';
  if (joiningDate) joiningDate.value = item.joiningDate || '';
  if (bankAccountNumber) bankAccountNumber.value = item.bankAccountNumber || '';
  if (bankName) bankName.value = item.bankName || '';
  if (bankIFSC) bankIFSC.value = item.bankIFSC || '';
  if (bankBranch) bankBranch.value = item.bankBranch || '';
  if (shift) shift.value = item.shift || '';
  if (salary) salary.value = Number(item.salary || 0);

  toggleModal('staffModal', 'staffModalBackdrop', true);
}

async function removeStaffMember(id) {
  if (!window.confirm('Delete this staff record?')) return;
  const response = await fetch(`/api/staff/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`Delete failed with status ${response.status}`);
  }
  await loadStaffMembers();
}

function setupStaffCrud() {
  const form = document.getElementById('staffForm');
  const body = document.getElementById('staffTableBody');
  const openButton = document.getElementById('openStaffFormButton');
  const closeButton = document.getElementById('closeStaffFormButton');
  const cancelButton = document.getElementById('cancelStaffFormButton');

  if (openButton) {
    openButton.addEventListener('click', () => {
      resetStaffForm();
      toggleModal('staffModal', 'staffModalBackdrop', true);
    });
  }

  if (closeButton) closeButton.addEventListener('click', resetStaffForm);
  if (cancelButton) cancelButton.addEventListener('click', resetStaffForm);

  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();

      const payload = {
        fullName: document.getElementById('fullName')?.value?.trim(),
        phoneNumber: document.getElementById('phoneNumber')?.value?.trim(),
        joiningDate: document.getElementById('joiningDate')?.value?.trim(),
        shift: document.getElementById('shift')?.value || 'General',
        salary: Number(document.getElementById('salary')?.value || 0),
        address: document.getElementById('address')?.value || 'Not provided',
        adhaarNumber: document.getElementById('adhaarNumber')?.value || 'N/A',
        bankAccountNumber: document.getElementById('bankAccountNumber')?.value || 'N/A',
        bankName: document.getElementById('bankName')?.value || 'N/A',
        bankIFSC: document.getElementById('bankIFSC')?.value || 'N/A',
        bankBranch: document.getElementById('bankBranch')?.value || 'N/A'
      };

      const isEdit = staffCrudState.editingId !== null;
      const url = isEdit ? `/api/staff/${staffCrudState.editingId}` : `/api/staff/${headerRestaurantId}`;
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

        showSaveMessage('staffSaveMessage', isEdit ? 'Staff member updated successfully.' : 'Staff member saved successfully.');
        await loadStaffMembers();
        resetStaffForm();
        modalCloseActions.staffModal?.();
      } catch (error) {
        showSaveMessage('staffSaveMessage', error.message, true);
      }
    });
  }

  if (body) {
    body.addEventListener('click', async event => {
      const button = event.target.closest('[data-staff-action]');
      if (!button) return;

      const id = button.getAttribute('data-staff-id');
      const action = button.getAttribute('data-staff-action');

      try {
        if (action === 'edit') openStaffForEdit(id);
        if (action === 'delete') await removeStaffMember(id);
        if (action === 'salary') await openSalaryView(id);
      } catch (error) {
        showSaveMessage('staffSaveMessage', error.message, true);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  setupModalAwareForms();
  setupSalaryModalActions();
  loadStaffMeta();
  setupStaffCrud();
  setStaffFormMode(false);
  setupStaffSearch();

  loadStaffMembers().catch(() => renderStaffTable([]));
});
