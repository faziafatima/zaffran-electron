const reportsStateSalesv2 = {
  sales: null
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


function renderSalesRowsv2(rowsId, rows) {
  const tbody = document.getElementById(rowsId);
  if (!tbody) return;

  if (!Array.isArray(rows) || !rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No details this period.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${row.salesDate || '-'}</td>
      <td>${Number(row.totalOrders || 0)}</td>
      <td>${formatMoney(row.totalCashPayment || 0)}</td>
      <td>${formatMoney(row.totalCardPayment || 0)}</td>
      <td>${formatMoney(row.totalUpiPayment || 0)}</td>
      <td>${formatMoney(row.totalSales || 0)}</td>
      <td>${formatMoney(row.totalDiscounts || 0)}</td>
      <td>${formatMoney(row.totalTax || 0)}</td>
    </tr>
  `).join('');
}

function renderPeriodv2(period, report) {
  reportsStateSalesv2[period] = report;
  renderSalesRowsv2(`${period}SalesRows`, report || []);
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function rbuildCsvContentv2(period, report) {
  const rows = Array.isArray(report) ? report : [];
  const csvLines = [
    'Sales Report',
    ['Sales Date', 'Total Orders', 'Total Cash Payments', 'Total Card Payments', 'Total UPI Payments', 'Total Sales', 'Total Discounts', 'Total Tax'].map(escapeCsvCell).join(',')
  ];

  rows.forEach(row => {
    csvLines.push([
      row?.salesDate || '-',
      Number(row?.totalOrders || 0),
      Number(row?.totalCashPayment || 0),
      Number(row?.totalCardPayment || 0),
      Number(row?.totalUpiPayment || 0),
      Number(row?.totalSales || 0),
      Number(row?.totalDiscounts || 0),
      Number(row?.totalTax || 0)
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

function exportPeriodCsvV2(period) {
  const report = reportsStateSalesv2[period];
  const selectedDate = getSelectedDate();
  const content = rbuildCsvContentv2(period, report);
  const filename = `sales-report-${period}-${selectedDate}.csv`;
  downloadCsv(filename, content);
  setReportsMessage(`${period.charAt(0).toUpperCase() + period.slice(1)} report exported as CSV.`);
}

async function loadReportsOverviewv2() {
  const selectedDate = getSelectedDate();
  const selectedDateTo = getSelectedDateTo();
  setReportsMessage('Loading report data...');
console.log('Server context:', headerRestaurantId);
  try {
    const response = await fetch(`/api/reports/sales/${headerRestaurantId}?dateFrom=${encodeURIComponent(selectedDate)}&dateTo=${encodeURIComponent(selectedDateTo)}`);
    if (!response.ok) {
      throw new Error(`Unable to load reports. Status ${response.status}`);
    }

    const data = await response.json();
    renderPeriodv2('sales', data || {});
    setReportsMessage('Reports refreshed successfully.');
  } catch (error) {
    setReportsMessage(error.message, true);
  }
}

function initializeReportsPagev2() {
  const dateInput = document.getElementById('reportReferenceDateFrom');
  const dateInputTo = document.getElementById('reportReferenceDateTo');
  const refreshButton = document.getElementById('refreshReportButton');
  const salesExportButton = document.getElementById('salesExportCsvButton');
  const today = new Date().toISOString().split('T')[0];

  if (dateInput && !dateInput.value) {
    dateInput.value = today;
  }
  if (dateInputTo && !dateInputTo.value) {
    dateInputTo.value = today;
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', loadReportsOverviewv2);
  }

  if (salesExportButton) {
    salesExportButton.addEventListener('click', () => exportPeriodCsvV2('sales'));
  }

  // loadReportsOverviewv2();
}

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  initializeReportsPagev2();
});