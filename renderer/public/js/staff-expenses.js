document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  setupStaffExpenseSave();
  loadAttendanceMeta();
  loadStaffExpenseMeta();
  loadStaffExpenses();

  if (document.getElementById('attendanceList')) {
    fetch(`/api/attendance/${headerRestaurantId}`)
      .then(res => res.json())
      .then(data => renderAttendance(data))
      .catch(() => renderAttendance([]));
  }
});



function loadAttendanceMeta() {
  const expenseStaffSelect = document.getElementById('staffExpenseStaffId');
  if (!expenseStaffSelect) return;

  fetch(`/api/attendance/meta/${headerRestaurantId}`)
    .then(res => res.json())
    .then(meta => {
      const staffOptions = meta.staff || [];
      fillSelect('staffExpenseStaffId', staffOptions);
    })
    .catch(() => {
      showSaveMessage('staffExpenseSaveMessage', 'Unable to load staff list for expenses.', true);
    });
}

function loadStaffExpenseMeta() {
  const dateInput = document.getElementById('staffExpenseDate');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }
}

function setupStaffExpenseSave() {
  const form = document.getElementById('staffExpenseForm');
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const payload = {
      staffIdValue: Number(document.getElementById('staffExpenseStaffId')?.value || 0),
      dateValue: document.getElementById('staffExpenseDate')?.value,
      expenseAmount: Number(document.getElementById('staffExpenseAmount')?.value || 0),
      expenseDetails: document.getElementById('staffExpenseDetails')?.value?.trim() || ''
    };

    try {
      await saveJson(`/api/staff-expenses/${headerRestaurantId}`, payload);
      showSaveMessage('staffExpenseSaveMessage', 'Staff expense saved successfully.');
      clearStaffExpenseFormForNextEntry();
      loadStaffExpenses();
    } catch (error) {
      showSaveMessage('staffExpenseSaveMessage', error.message, true);
    }
  });
}

function loadStaffExpenses() {
  fetch(`/api/staff-expenses/${headerRestaurantId}`)
    .then(res => res.json())
    .then(data => renderStaffExpenses(data))
    .catch(() => renderStaffExpenses([]));
}

function renderStaffExpenses(data) {
  const list = document.getElementById('staffExpensesTableBody');
  if (!list) return;

  const records = Array.isArray(data) ? data : [];
  if (!records.length) {
    list.innerHTML = '<tr><td colspan="4" class="empty-state">No staff expenses recorded yet.</td></tr>';
    return;
  }

  list.innerHTML = records.slice(0, 8).map(item => `
    <tr>
      <td>${item.staffMember?.fullName || 'Staff member'}</td>
      <td>${formatCurrency(Number(item.expenseAmount || 0))}</td>
      <td>${item.expenseDetails ? escapeHtml(item.expenseDetails) : '—'}</td>
      <td>${item.date || '—'}</td>
    </tr>
  `).join('');
}






function clearStaffExpenseFormForNextEntry() {
  const staffSelect = document.getElementById('staffExpenseStaffId');
  const dateInput = document.getElementById('staffExpenseDate');
  const amountInput = document.getElementById('staffExpenseAmount');
  const detailsInput = document.getElementById('staffExpenseDetails');

  if (staffSelect && staffSelect.options.length > 0) {
    staffSelect.selectedIndex = 0;
  }
  if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
  if (amountInput) amountInput.value = '0';
  if (detailsInput) detailsInput.value = '';
}


function formatTimeValue(value) {
  if (!value) return '--:--';
  const asString = String(value);
  const timeMatch = asString.match(/T(\d{2}:\d{2})/);
  if (timeMatch) return timeMatch[1];
  const plainTimeMatch = asString.match(/(\d{2}:\d{2})/);
  return plainTimeMatch ? plainTimeMatch[1] : '--:--';
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}