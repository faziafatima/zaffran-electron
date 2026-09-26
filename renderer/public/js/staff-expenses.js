const staffExpenseState = {
  items: [],
  editingId: null
};

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
      const selectStaff = document.getElementById('staffExpenseStaffId');
      if (selectStaff) {
        selectStaff.insertBefore(new Option('Select Staff', '-1'), selectStaff.firstChild);
        selectStaff.value = '-1';
      }
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

  const cancelEditButton = document.getElementById('cancelStaffExpenseEditButton');
  if (cancelEditButton) {
    cancelEditButton.addEventListener('click', clearStaffExpenseFormForNextEntry);
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const payload = {
      staffIdValue: Number(document.getElementById('staffExpenseStaffId')?.value || 0),
      dateValue: document.getElementById('staffExpenseDate')?.value,
      expenseAmount: Number(document.getElementById('staffExpenseAmount')?.value || 0),
      paymentMode: document.getElementById('staffExpensePaymentMode')?.value || 'cash',
      expenseDetails: document.getElementById('staffExpenseDetails')?.value?.trim() || ''
    };

    const isEdit = staffExpenseState.editingId !== null;
    const url = isEdit
      ? `/api/staff-expenses/${staffExpenseState.editingId}`
      : `/api/staff-expenses/${headerRestaurantId}`;

    try {
      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.message || `Save failed with status ${response.status}`);
      }

      showSaveMessage('staffExpenseSaveMessage', isEdit ? 'Staff expense updated successfully.' : 'Staff expense saved successfully.');
      clearStaffExpenseFormForNextEntry();
      await loadStaffExpenses();
    } catch (error) {
      showSaveMessage('staffExpenseSaveMessage', error.message, true);
    }
  });
}

function loadStaffExpenses() {
  return fetch(`/api/staff-expenses/${headerRestaurantId}`)
    .then(res => res.json())
    .then(data => {
      staffExpenseState.items = Array.isArray(data) ? data : [];
      renderStaffExpenses(staffExpenseState.items);
    })
    .catch(() => renderStaffExpenses([]));
}

function renderStaffExpenses(data) {
  const list = document.getElementById('staffExpensesTableBody');
  if (!list) return;

  const records = Array.isArray(data) ? data : [];
  const role = getServerContext().role || '';
  const canManage = ['admin', 'manager', 'super admin'].includes(role.toLowerCase());
  if (!records.length) {
    list.innerHTML = `<tr><td colspan="${canManage ? 6 : 5}" class="empty-state">No staff expenses recorded yet.</td></tr>`;
    return;
  }

  list.innerHTML = records.slice(0, 8).map(item => `
    <tr>
      <td>${item.staffMember?.fullName || 'Staff member'}</td>
      <td>${formatCurrency(Number(item.expenseAmount || 0))}</td>
      <td>${String(item.paymentMode || 'cash').toLowerCase() === 'upi' ? 'UPI' : 'Cash'}</td>
      <td>${item.expenseDetails ? escapeHtml(item.expenseDetails) : '—'}</td>
      <td>${item.date || '—'}</td>
      ${canManage ? `<td><div class="menu-actions">
        <button type="button" class="menu-action-btn edit" data-staff-expense-action="edit" data-staff-expense-id="${item.id}">Edit</button>
        <button type="button" class="menu-action-btn delete" data-staff-expense-action="delete" data-staff-expense-id="${item.id}">Delete</button>
      </div></td>` : ''}
    </tr>
  `).join('');

  list.onclick = async event => {
    const button = event.target.closest('[data-staff-expense-action]');
    if (!button) return;
    const id = Number(button.getAttribute('data-staff-expense-id'));
    const action = button.getAttribute('data-staff-expense-action');

    try {
      if (action === 'edit') {
        editStaffExpense(id);
      } else if (action === 'delete') {
        await deleteStaffExpense(id);
      }
    } catch (error) {
      showSaveMessage('staffExpenseSaveMessage', error.message || 'Unable to process staff expense.', true);
    }
  };
}

function editStaffExpense(id) {
  const item = staffExpenseState.items.find(expense => Number(expense.id) === id);
  if (!item) return;

  staffExpenseState.editingId = item.id;
  document.getElementById('staffExpenseStaffId').value = String(item.staffMember?.id || '');
  document.getElementById('staffExpenseDate').value = item.date || '';
  document.getElementById('staffExpenseAmount').value = item.expenseAmount ?? '';
  document.getElementById('staffExpensePaymentMode').value = item.paymentMode || 'cash';
  document.getElementById('staffExpenseDetails').value = item.expenseDetails || '';
  setStaffExpenseFormMode(true);
  showSaveMessage('staffExpenseSaveMessage', 'Editing staff expense.');
  document.getElementById('staffExpenseForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteStaffExpense(id) {
  if (!window.confirm('Delete this staff expense?')) return;

  const response = await fetch(`/api/staff-expenses/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `Delete failed with status ${response.status}`);
  }

  if (Number(staffExpenseState.editingId) === id) clearStaffExpenseFormForNextEntry();
  showSaveMessage('staffExpenseSaveMessage', 'Staff expense deleted successfully.');
  await loadStaffExpenses();
}

function setStaffExpenseFormMode(isEdit) {
  const submitButton = document.getElementById('staffExpenseSubmitButton');
  const cancelButton = document.getElementById('cancelStaffExpenseEditButton');
  if (submitButton) submitButton.textContent = isEdit ? 'Update expense' : 'Save expense';
  if (cancelButton) cancelButton.hidden = !isEdit;
}





function clearStaffExpenseFormForNextEntry() {
  const staffSelect = document.getElementById('staffExpenseStaffId');
  const dateInput = document.getElementById('staffExpenseDate');
  const amountInput = document.getElementById('staffExpenseAmount');
  const paymentModeInput = document.getElementById('staffExpensePaymentMode');
  const detailsInput = document.getElementById('staffExpenseDetails');

  if (staffSelect && staffSelect.options.length > 0) {
    staffSelect.selectedIndex = 0;
  }
  if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
  if (amountInput) amountInput.value = '0';
  if (paymentModeInput) paymentModeInput.value = 'cash';
  if (detailsInput) detailsInput.value = '';
  staffExpenseState.editingId = null;
  setStaffExpenseFormMode(false);
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