const reportsStateStaff = {
  staffExpense: null
};

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


function renderSalesRowsStaff(rowsId, rows) {
  const tbody = document.getElementById(rowsId);
  if (!tbody) return;

  if (!Array.isArray(rows) || !rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No details this period.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${getMonthName(row.date) || '-'}</td>
      <td>${row.staffName || '-'}</td>
      <td>${formatMoney(row.expenseAmount)}</td>
    </tr>
  `).join('');
}

function renderPeriodStaff(period, report) {
  reportsStateStaff[period] = report;
  renderSalesRowsStaff(`${period}SalesRows`, report || []);
}

function escapeCsvCellStaff(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvContentStaff(period, report) {
  const rows = Array.isArray(report) ? report : [];
  const csvLines = [
    'Staff Expense Report',
    ['Month', 'staffExpense Collected', 'Taxable Sales'].map(escapeCsvCellStaff).join(',')
  ];

  rows.forEach(row => {
    csvLines.push([
      getMonthName(row?.date) || '-',
      row?.staffName || '-',
      Number(row?.expenseAmount || 0)
    ].map(escapeCsvCellStaff).join(','));
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

function exportPeriodCsv(period) {
  const report = reportsStateStaff[period];
  const selectedDate = getSelectedDate();
  const content = buildCsvContentStaff(period, report);
  const filename = `staffExpense-report-${period}-${selectedDate}.csv`;
  downloadCsv(filename, content);
  setReportsMessage(`${period.charAt(0).toUpperCase() + period.slice(1)} report exported as CSV.`);
}

async function loadReportsOverviewStaff() {
  const selectedDate = getSelectedDate();
  const selectedDateTo = getSelectedDateTo();
  setReportsMessage('Loading report data...');
const headerRestaurantId = document.getElementById('header-restaurant-id')?.value || '';
console.log('Server context:', headerRestaurantId);
  try {
    const response = await fetch(`/api/reports/staff-expenses/${headerRestaurantId}?dateFrom=${encodeURIComponent(selectedDate)}&dateTo=${encodeURIComponent(selectedDateTo)}`);
    if (!response.ok) {
      throw new Error(`Unable to load reports. Status ${response.status}`);
    }

    const data = await response.json();
    renderPeriodStaff('staffExpense', data || {});
    setReportsMessage('Reports refreshed successfully.');
  } catch (error) {
    setReportsMessage(error.message, true);
  }
}

function initializeReportsPageStaff() {
  const dateInput = document.getElementById('reportReferenceDateFrom');
  const dateInputTo = document.getElementById('reportReferenceDateTo');
  const refreshButton = document.getElementById('refreshReportButton');
  const staffExpenseExportButton = document.getElementById('staffExpenseExportCsvButton');
  const today = new Date().toISOString().split('T')[0];

  if (dateInput && !dateInput.value) {
    dateInput.value = today;
  }
  if (dateInputTo && !dateInputTo.value) {
    dateInputTo.value = today;
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', loadReportsOverviewStaff);
  }

  // if (dateInput) {
  //   dateInput.addEventListener('change', loadReportsOverviewStaff);
  // }
  // if (dateInputTo) {
  //   dateInputTo.addEventListener('change', loadReportsOverviewStaff);
  // }

  if (staffExpenseExportButton) {
    staffExpenseExportButton.addEventListener('click', () => exportPeriodCsv('staffExpense'));
  }

  // loadReportsOverviewStaff();
}

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  initializeReportsPageStaff();
});