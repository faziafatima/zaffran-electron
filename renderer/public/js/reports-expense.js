let expenseReportRows = [];

function formatMoney(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function setReportsMessage(message, isError = false) {
  const messageEl = document.getElementById('reportsMessage');
  if (!messageEl) return;
  messageEl.textContent = message || '';
  messageEl.style.color = isError ? '#b91c1c' : '#0f766e';
}

function getSelectedDate() {
  const dateInput = document.getElementById('reportReferenceDateFrom');
  return dateInput?.value || new Date().toISOString().split('T')[0];
}
function getSelectedDateTo() {
  const dateInputTo = document.getElementById('reportReferenceDateTo');
  return dateInputTo?.value || new Date().toISOString().split('T')[0];
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function formatReportDate(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).split('-');
  return year && month && day ? `${day}/${month}/${year}` : escapeHtml(value);
}

function renderExpenseRows(rows) {
  const tbody = document.getElementById('expenseReportRows');
  if (!tbody) return;

  const total = Array.isArray(rows)
    ? rows.reduce((sum, row) => sum + Number(row?.amount || 0), 0)
    : 0;
  const totalElement = document.getElementById('expenseTotalAmount');
  if (totalElement) totalElement.textContent = formatMoney(total);

  if (!Array.isArray(rows) || !rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No expenses found for this period.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${formatReportDate(row.date)}</td>
      <td>${escapeHtml(row.expenseType || '-')}</td>
      <td>${escapeHtml(row.details || '-')}</td>
      <td>${escapeHtml(row.staffName || '-')}</td>
      <td>${escapeHtml(row.paymentMode || '-')}</td>
      <td>${formatMoney(row.amount)}</td>
    </tr>
  `).join('');
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvContent(rows) {
  const csvLines = [
    ['Date', 'Category', 'Details', 'Staff Member', 'Payment Mode', 'Amount'].map(escapeCsvCell).join(',')
  ];

  rows.forEach(row => {
    csvLines.push([
      row?.date || '-',
      row?.expenseType || '-',
      row?.details || '-',
      row?.staffName || '-',
      row?.paymentMode || '-',
      Number(row?.amount || 0)
    ].map(escapeCsvCell).join(','));
  });

  return csvLines.join('\n');
}

function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportExpenseReportCsv() {
  const selectedDate = getSelectedDate();
  const selectedDateTo = getSelectedDateTo();
  const content = buildCsvContent(expenseReportRows);
  const filename = `expense-report-${selectedDate}-to-${selectedDateTo}.csv`;
  downloadCsv(filename, content);
  setReportsMessage('Expense details exported as CSV.');
}

async function loadExpenseReport() {
  const selectedDate = getSelectedDate();
  const selectedDateTo = getSelectedDateTo();
  setReportsMessage('Loading report data...');
  const headerRestaurantId = document.getElementById('header-restaurant-id')?.value || '';
  try {
    const response = await fetch(`/api/reports/expenses/${headerRestaurantId}?dateFrom=${encodeURIComponent(selectedDate)}&dateTo=${encodeURIComponent(selectedDateTo)}`);
    if (!response.ok) {
      throw new Error(`Unable to load reports. Status ${response.status}`);
    }

    const data = await response.json();
  expenseReportRows = Array.isArray(data) ? data : [];
  renderExpenseRows(expenseReportRows);
    setReportsMessage('Reports refreshed successfully.');
  } catch (error) {
    setReportsMessage(error.message, true);
  }
}

function initializeReportsPage() {
  const dateInput = document.getElementById('reportReferenceDateFrom');
  const dateInputTo = document.getElementById('reportReferenceDateTo');
  const refreshButton = document.getElementById('refreshReportButton');
  const expenseExportButton = document.getElementById('expenseExportCsvButton');
  const today = new Date().toISOString().split('T')[0];

  if (dateInput && !dateInput.value) {
    dateInput.value = today;
  }
  if (dateInputTo && !dateInputTo.value) {
    dateInputTo.value = today;
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', loadExpenseReport);
  }

  if (expenseExportButton) {
    expenseExportButton.addEventListener('click', exportExpenseReportCsv);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  initializeReportsPage();
});