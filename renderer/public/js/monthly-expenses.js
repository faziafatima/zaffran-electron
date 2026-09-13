const monthlyExpenseCrudState = {
  items: [],
  editingId: null
};

function setMonthlyExpenseFormMode(isEdit) {
  const submitButton = document.getElementById('monthlyExpenseSubmitButton');
  const cancelButton = document.getElementById('cancelMonthlyExpenseEditButton');
  if (submitButton) submitButton.textContent = isEdit ? 'Update Expense' : 'Save Expense';
  if (cancelButton) cancelButton.hidden = !isEdit;
}

function resetMonthlyExpenseForm() {
  const form = document.getElementById('monthlyExpenseForm');
  if (form) form.reset();
  monthlyExpenseCrudState.editingId = null;
  setMonthlyExpenseFormMode(false);
  showSaveMessage('monthlyExpenseSaveMessage', '');
}

function toMonthInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 7);
}

function formatExpenseMonth(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function renderMonthlyExpenseTable(items) {
  const body = document.getElementById('monthlyExpensesTableBody');
  if (!body) return;

  if (!items.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty-state">No monthly expenses recorded yet.</td></tr>';
    return;
  }

  const role = getServerContext().role || 'Guest';
  body.innerHTML = items.map(item => `
    <tr>
      <td>${formatExpenseMonth(item.expenseMonth)}</td>
      <td>${item.category || '-'}</td>
      <td>${item.expenseDetails || '-'}</td>
      <td>${formatCurrency(item.amount)}</td>
      ${(role === 'Admin' || role === 'Super Admin') ? `
      <td>
        <div class="menu-actions">
          <button type="button" class="menu-action-btn edit" data-monthly-expense-action="edit" data-monthly-expense-id="${item.id}">Edit</button>
          <button type="button" class="menu-action-btn delete" data-monthly-expense-action="delete" data-monthly-expense-id="${item.id}">Delete</button>
        </div>
      </td>
      ` : ''}
    </tr>
  `).join('');
}

async function loadMonthlyExpenses() {
  const response = await fetch(`/api/monthly-expenses/${headerRestaurantId}`);
  const data = await response.json();
  monthlyExpenseCrudState.items = Array.isArray(data) ? data : [];
  renderMonthlyExpenseTable(monthlyExpenseCrudState.items);
}

function openMonthlyExpenseForEdit(id) {
  const item = monthlyExpenseCrudState.items.find(expense => Number(expense.id) === Number(id));
  if (!item) return;

  monthlyExpenseCrudState.editingId = item.id;
  setMonthlyExpenseFormMode(true);

  const category = document.getElementById('monthlyExpenseCategory');
  const month = document.getElementById('monthlyExpenseMonth');
  const amount = document.getElementById('monthlyExpenseAmount');
  const details = document.getElementById('monthlyExpenseDetails');

  if (category) category.value = item.category || '';
  if (month) month.value = toMonthInputValue(item.expenseMonth);
  if (amount) amount.value = item.amount ?? '';
  if (details) details.value = item.expenseDetails || '';
}

async function removeMonthlyExpense(id) {
  if (!window.confirm('Delete this monthly expense?')) return;
  const response = await fetch(`/api/monthly-expenses/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `Delete failed with status ${response.status}`);
  }
  await loadMonthlyExpenses();
}

function buildMonthlyExpensePayload() {
  const monthValue = document.getElementById('monthlyExpenseMonth')?.value;
  return {
    category: document.getElementById('monthlyExpenseCategory')?.value?.trim(),
    amount: Number(document.getElementById('monthlyExpenseAmount')?.value || 0),
    expenseMonth: monthValue ? `${monthValue}-01` : null,
    expenseDetails: document.getElementById('monthlyExpenseDetails')?.value?.trim() || null
  };
}

function setupMonthlyExpenseCrud() {
  const form = document.getElementById('monthlyExpenseForm');
  const body = document.getElementById('monthlyExpensesTableBody');
  const cancelButton = document.getElementById('cancelMonthlyExpenseEditButton');

  if (cancelButton) {
    cancelButton.addEventListener('click', resetMonthlyExpenseForm);
  }

  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();

      const payload = buildMonthlyExpensePayload();
      const isEdit = monthlyExpenseCrudState.editingId !== null;
      const url = isEdit ? `/api/monthly-expenses/${monthlyExpenseCrudState.editingId}` : `/api/monthly-expenses/${headerRestaurantId}`;
      const method = isEdit ? 'PUT' : 'POST';

      try {
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(errorBody.message || `Save failed with status ${response.status}`);
        }

        showSaveMessage('monthlyExpenseSaveMessage', isEdit ? 'Monthly expense updated successfully.' : 'Monthly expense saved successfully.');
        await loadMonthlyExpenses();
        resetMonthlyExpenseForm();
      } catch (error) {
        showSaveMessage('monthlyExpenseSaveMessage', error.message, true);
      }
    });
  }

  if (body) {
    body.addEventListener('click', async event => {
      const button = event.target.closest('[data-monthly-expense-action]');
      if (!button) return;

      const id = button.getAttribute('data-monthly-expense-id');
      const action = button.getAttribute('data-monthly-expense-action');

      try {
        if (action === 'edit') openMonthlyExpenseForEdit(id);
        if (action === 'delete') await removeMonthlyExpense(id);
      } catch (error) {
        showSaveMessage('monthlyExpenseSaveMessage', error.message, true);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  setupMonthlyExpenseCrud();
  setMonthlyExpenseFormMode(false);
  loadMonthlyExpenses().catch(() => {
    renderMonthlyExpenseTable([]);
    showSaveMessage('monthlyExpenseSaveMessage', 'Unable to load monthly expenses.', true);
  });
});
