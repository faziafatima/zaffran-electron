const expenseCrudState = {
  items: [],
  editingId: null
};

function setExpenseFormMode(isEdit) {
  const title = document.getElementById('expenseModalTitle');
  const submitButton = document.querySelector('#expenseForm button[type="submit"]');
  if (title) title.textContent = isEdit ? 'Edit expense' : 'Add expense';
  if (submitButton) submitButton.textContent = isEdit ? 'Update Expense' : 'Save Expense';
}

function resetExpenseForm() {
  const form = document.getElementById('expenseForm');
  if (form) form.reset();
  const expenseDate = document.getElementById('expenseDate');
  if (expenseDate) expenseDate.value = new Date().toISOString().split('T')[0];
  expenseCrudState.editingId = null;
  setExpenseFormMode(false);
  showSaveMessage('expenseSaveMessage', '');
}

function formatExpenseDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function toDateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function renderExpenseTable(items) {
  const body = document.getElementById('expensesTableBody');
  if (!body) return;

  if (!items.length) {
    body.innerHTML = '<tr><td colspan="4" class="empty-state">No expenses available.</td></tr>';
    return;
  }
  const role = getServerContext().role || 'Guest';
  body.innerHTML = items.map(item => `
    <tr>
      <td>${item.expenseDetails || 'Untitled expense'}</td>
      <td>${formatCurrency(item.amount)}</td>
      <td>${formatExpenseDate(item.expenseDate)}</td>
        ${(role === 'Admin' || role === 'Super Admin') ? `
      <td>
        <div class="menu-actions">
          <button type="button" class="menu-action-btn edit" data-expense-action="edit" data-expense-id="${item.id}">Edit</button>
          <button type="button" class="menu-action-btn delete" data-expense-action="delete" data-expense-id="${item.id}">Delete</button>
        </div>
      </td>
        ` : ''}
    </tr>
  `).join('');
}

async function loadExpenses() {
  const response = await fetch(`/api/expenses/${headerRestaurantId}`);
  const data = await response.json();
  expenseCrudState.items = Array.isArray(data) ? data : [];
  renderExpenseTable(expenseCrudState.items);
}

function openExpenseForEdit(id) {
  const item = expenseCrudState.items.find(expense => Number(expense.id) === Number(id));
  if (!item) return;

  expenseCrudState.editingId = item.id;
  setExpenseFormMode(true);

  const details = document.getElementById('expenseDetails');
  const amount = document.getElementById('expenseAmount');
  const expenseDate = document.getElementById('expenseDate');

  if (details) details.value = item.expenseDetails || '';
  if (amount) amount.value = item.amount ?? '';
  if (expenseDate) expenseDate.value = toDateInputValue(item.expenseDate);

  // toggleModal('expenseModal', 'expenseModalBackdrop', true);
}

async function removeExpense(id) {
  if (!window.confirm('Delete this expense?')) return;
  const response = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `Delete failed with status ${response.status}`);
  }
  await loadExpenses();
}

function buildExpensePayload() {
  return {
    expenseDetails: document.getElementById('expenseDetails')?.value?.trim(),
    amount: Number(document.getElementById('expenseAmount')?.value || 0),
    expenseDate: document.getElementById('expenseDate')?.value || null
  };
}

function setupExpenseCrud() {
  const form = document.getElementById('expenseForm');
  const body = document.getElementById('expensesTableBody');
  const openButton = document.getElementById('openExpenseFormButton');
  const closeButton = document.getElementById('closeExpenseFormButton');
  const cancelButton = document.getElementById('cancelExpenseFormButton');
  const backdrop = document.getElementById('expenseModalBackdrop');

  const closeModal = () => {
    resetExpenseForm();
    toggleModal('expenseModal', 'expenseModalBackdrop', false);
  };

  if (openButton) {
    openButton.addEventListener('click', () => {
      resetExpenseForm();
      toggleModal('expenseModal', 'expenseModalBackdrop', true);
    });
  }

  if (closeButton) closeButton.addEventListener('click', closeModal);
  if (cancelButton) cancelButton.addEventListener('click', closeModal);
  if (backdrop) backdrop.addEventListener('click', closeModal);

  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();

      const payload = buildExpensePayload();
      const isEdit = expenseCrudState.editingId !== null;
      const url = isEdit ? `/api/expenses/${expenseCrudState.editingId}` : `/api/expenses/${headerRestaurantId}`;
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

        showSaveMessage('expenseSaveMessage', isEdit ? 'Expense updated successfully.' : 'Expense saved successfully.');
        await loadExpenses();
        closeModal();
      } catch (error) {
        showSaveMessage('expenseSaveMessage', error.message, true);
      }
    });
  }

  if (body) {
    body.addEventListener('click', async event => {
      const button = event.target.closest('[data-expense-action]');
      if (!button) return;

      const id = button.getAttribute('data-expense-id');
      const action = button.getAttribute('data-expense-action');

      try {
        if (action === 'edit') openExpenseForEdit(id);
        if (action === 'delete') await removeExpense(id);
      } catch (error) {
        showSaveMessage('expenseSaveMessage', error.message, true);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  setupExpenseCrud();
  setExpenseFormMode(false);
  loadExpenses().catch(() => {
    renderExpenseTable([]);
    showSaveMessage('expenseSaveMessage', 'Unable to load expenses.', true);
  });
});