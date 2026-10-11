const expenseCrudState = {
  items: [],
  filteredItems: [],
  editingId: null,
  searchTerm: '',
  dateFrom: '',
  dateTo: '',
  page: 1,
  pageSize: 8
};

function isExpenseWithinDateRange(value) {
  const date = String(value || '').slice(0, 10);
  return Boolean(date)
    && (!expenseCrudState.dateFrom || date >= expenseCrudState.dateFrom)
    && (!expenseCrudState.dateTo || date <= expenseCrudState.dateTo);
}

async function downloadExpenseReport() {
  const params = new URLSearchParams();
  if (expenseCrudState.dateFrom) params.set('from', expenseCrudState.dateFrom);
  if (expenseCrudState.dateTo) params.set('to', expenseCrudState.dateTo);
  const query = params.toString();
  const response = await fetch(`/api/expenses/export/${headerRestaurantId}${query ? `?${query}` : ''}`);
  if (!response.ok) throw new Error(`Unable to download report (${response.status}).`);

  const link = document.createElement('a');
  link.href = URL.createObjectURL(await response.blob());
  link.download = 'restaurant-expenses.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function updateExpensePagination() {
  const summary = document.getElementById('expensesPageSummary');
  const indicator = document.getElementById('expensesPageIndicator');
  const previousButton = document.getElementById('expensesPrevButton');
  const nextButton = document.getElementById('expensesNextButton');
  const filtered = expenseCrudState.filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(filtered / expenseCrudState.pageSize));
  const start = filtered ? ((expenseCrudState.page - 1) * expenseCrudState.pageSize) + 1 : 0;
  const end = Math.min(expenseCrudState.page * expenseCrudState.pageSize, filtered);

  if (summary) {
    summary.textContent = filtered
      ? `Showing ${start}-${end} of ${filtered} expenses`
      : (expenseCrudState.items.length ? 'No expenses match your search.' : 'No expenses available.');
  }
  if (indicator) indicator.textContent = `Page ${filtered ? expenseCrudState.page : 0} of ${filtered ? totalPages : 0}`;
  if (previousButton) previousButton.disabled = expenseCrudState.page <= 1 || !filtered;
  if (nextButton) nextButton.disabled = expenseCrudState.page >= totalPages || !filtered;
}

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
  const paymentMode = document.getElementById('expensePaymentMode');
  if (paymentMode) paymentMode.value = 'cash';
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

function formatPaymentMode(value) {
  return value === 'upi' ? 'UPI' : 'Cash';
}

function renderExpenseTable(items) {
  const body = document.getElementById('expensesTableBody');
  if (!body) return;

  expenseCrudState.items = Array.isArray(items) ? items : [];
  const query = expenseCrudState.searchTerm.trim().toLowerCase();
  expenseCrudState.filteredItems = expenseCrudState.items.filter(item => {
    const matchesSearch = !query || [item.expenseDetails, item.paymentMode, item.expenseDate, item.amount]
      .filter(value => value !== null && value !== undefined)
      .some(value => String(value).toLowerCase().includes(query));
    return matchesSearch && isExpenseWithinDateRange(item.expenseDate);
  });
  const totalPages = Math.max(1, Math.ceil(expenseCrudState.filteredItems.length / expenseCrudState.pageSize));
  if (expenseCrudState.page > totalPages) expenseCrudState.page = totalPages;
  const pageItems = expenseCrudState.filteredItems.slice(
    (expenseCrudState.page - 1) * expenseCrudState.pageSize,
    expenseCrudState.page * expenseCrudState.pageSize
  );

  updateExpensePagination();

  if (!pageItems.length) {
    body.innerHTML = `<tr><td colspan="5" class="empty-state">${expenseCrudState.items.length ? 'No expenses match your search.' : 'No expenses available.'}</td></tr>`;
    return;
  }
  const role = getServerContext().role || 'Guest';
  body.innerHTML = pageItems.map(item => `
    <tr>
      <td>${item.expenseDetails || 'Untitled expense'}</td>
      <td>${formatCurrency(item.amount)}</td>
      <td>${formatPaymentMode(item.paymentMode)}</td>
      <td>${formatDateTime(item.expenseDate)}</td>
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
  renderExpenseTable(data);
}

function openExpenseForEdit(id) {
  const item = expenseCrudState.items.find(expense => Number(expense.id) === Number(id));
  if (!item) return;

  expenseCrudState.editingId = item.id;
  setExpenseFormMode(true);

  const details = document.getElementById('expenseDetails');
  const amount = document.getElementById('expenseAmount');
  const expenseDate = document.getElementById('expenseDate');
  const paymentMode = document.getElementById('expensePaymentMode');

  if (details) details.value = item.expenseDetails || '';
  if (amount) amount.value = item.amount ?? '';
  if (expenseDate) expenseDate.value = toDateInputValue(item.expenseDate);
  if (paymentMode) paymentMode.value = item.paymentMode || 'cash';

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
    expenseDate: document.getElementById('expenseDate')?.value || null,
    paymentMode: document.getElementById('expensePaymentMode')?.value || 'cash'
  };
}

function setupExpenseCrud() {
  const form = document.getElementById('expenseForm');
  const body = document.getElementById('expensesTableBody');
  const openButton = document.getElementById('openExpenseFormButton');
  const closeButton = document.getElementById('closeExpenseFormButton');
  const cancelButton = document.getElementById('cancelExpenseFormButton');
  const backdrop = document.getElementById('expenseModalBackdrop');
  const searchInput = document.getElementById('expensesSearchInput');
  const previousButton = document.getElementById('expensesPrevButton');
  const nextButton = document.getElementById('expensesNextButton');
  const fromInput = document.getElementById('expensesDateFrom');
  const toInput = document.getElementById('expensesDateTo');
  const downloadButton = document.getElementById('downloadExpensesReportButton');

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

  if (searchInput) {
    searchInput.addEventListener('input', event => {
      expenseCrudState.searchTerm = event.target.value || '';
      expenseCrudState.page = 1;
      renderExpenseTable(expenseCrudState.items);
    });
  }
  [fromInput, toInput].filter(Boolean).forEach(input => {
    input.addEventListener('change', () => {
      expenseCrudState.dateFrom = fromInput?.value || '';
      expenseCrudState.dateTo = toInput?.value || '';
      expenseCrudState.page = 1;
      renderExpenseTable(expenseCrudState.items);
    });
  });
  if (downloadButton) {
    downloadButton.addEventListener('click', async () => {
      try {
        await downloadExpenseReport();
        showSaveMessage('expenseSaveMessage', 'Restaurant expense report downloaded.');
      } catch (error) {
        showSaveMessage('expenseSaveMessage', error.message, true);
      }
    });
  }
  if (previousButton) {
    previousButton.addEventListener('click', () => {
      if (expenseCrudState.page > 1) {
        expenseCrudState.page -= 1;
        renderExpenseTable(expenseCrudState.items);
      }
    });
  }
  if (nextButton) {
    nextButton.addEventListener('click', () => {
      const totalPages = Math.ceil(expenseCrudState.filteredItems.length / expenseCrudState.pageSize);
      if (expenseCrudState.page < totalPages) {
        expenseCrudState.page += 1;
        renderExpenseTable(expenseCrudState.items);
      }
    });
  }

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