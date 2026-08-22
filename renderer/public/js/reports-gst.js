const reportsState = {
  gst: null
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

function renderDemandItems(containerId, demandItems) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!Array.isArray(demandItems) || !demandItems.length) {
    container.innerHTML = '<div class="muted">No demand insights available for this period.</div>';
    return;
  }

  container.innerHTML = demandItems
    .slice(0, 5)
    .map(item => `<span class="demand-pill">${item.name} (${item.quantity})</span>`)
    .join('');
}

function renderSalesRows(rowsId, rows) {
  const tbody = document.getElementById(rowsId);
  if (!tbody) return;

  if (!Array.isArray(rows) || !rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No details this period.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${getMonthName(row.month) || '-'}</td>
      <td>${formatMoney(row.gstCollected || 0)}</td>
      <td>${formatMoney(row.taxableSales)}</td>
    </tr>
  `).join('');
}

function renderPeriod(period, report) {
  reportsState[period] = report;
  renderSalesRows(`${period}SalesRows`, report || []);
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvContent(period, report) {
  const rows = Array.isArray(report) ? report : [];
  const csvLines = [
    'GST Report',
    ['Month', 'GST Collected', 'Taxable Sales'].map(escapeCsvCell).join(',')
  ];

  rows.forEach(row => {
    csvLines.push([
      getMonthName(row?.month) || '-',
      Number(row?.gstCollected || 0),
      Number(row?.taxableSales || 0)
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

function exportPeriodCsv(period) {
  const report = reportsState[period];
  const selectedDate = getSelectedDate();
  const content = buildCsvContent(period, report);
  const filename = `gst-report-${period}-${selectedDate}.csv`;
  downloadCsv(filename, content);
  setReportsMessage(`${period.charAt(0).toUpperCase() + period.slice(1)} report exported as CSV.`);
}

async function loadReportsOverview() {
  const selectedDate = getSelectedDate();
  const selectedDateTo = getSelectedDateTo();
  setReportsMessage('Loading report data...');
const headerRestaurantId = document.getElementById('header-restaurant-id')?.value || '';
console.log('Server context:', headerRestaurantId);
  try {
    const response = await fetch(`/api/reports/gst/${headerRestaurantId}?dateFrom=${encodeURIComponent(selectedDate)}&dateTo=${encodeURIComponent(selectedDateTo)}`);
    if (!response.ok) {
      throw new Error(`Unable to load reports. Status ${response.status}`);
    }

    const data = await response.json();
    renderPeriod('gst', data || {});
    setReportsMessage('Reports refreshed successfully.');
  } catch (error) {
    setReportsMessage(error.message, true);
  }
}

function initializeReportsPage() {
  const dateInput = document.getElementById('reportReferenceDateFrom');
  const dateInputTo = document.getElementById('reportReferenceDateTo');
  const refreshButton = document.getElementById('refreshReportButton');
  const gstExportButton = document.getElementById('gstExportCsvButton');
  const today = new Date().toISOString().split('T')[0];

  if (dateInput && !dateInput.value) {
    dateInput.value = today;
  }
  if (dateInputTo && !dateInputTo.value) {
    dateInputTo.value = today;
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', loadReportsOverview);
  }

  // if (dateInput) {
  //   dateInput.addEventListener('change', loadReportsOverview);
  // }
  // if (dateInputTo) {
  //   dateInputTo.addEventListener('change', loadReportsOverview);
  // }

  if (gstExportButton) {
    gstExportButton.addEventListener('click', () => exportPeriodCsv('gst'));
  }

  // loadReportsOverview();
}

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  initializeReportsPage();
});