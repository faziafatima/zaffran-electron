const reportsState = {
  daily: null,
  weekly: null,
  monthly: null
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

function buildSummaryCard(title, value, hint) {
  return `
    <div class="card">
      <div class="label">${title}</div>
      <div class="value">${value}</div>
      <div class="hint">${hint}</div>
    </div>
  `;
}

function renderSummaryCards(overview) {
  const container = document.getElementById('reportsSummaryCards');
  if (!container) return;

  const daily = overview?.daily || {};
  const weekly = overview?.weekly || {};
  const monthly = overview?.monthly || {};

  container.innerHTML = [
    buildSummaryCard('Daily sales', formatMoney(daily.totalSales), `${daily.totalItemsSold || 0} items sold`),
    buildSummaryCard('Weekly sales', formatMoney(weekly.totalSales), `${weekly.totalItemsSold || 0} items sold`),
    buildSummaryCard('Monthly sales', formatMoney(monthly.totalSales), `${monthly.totalItemsSold || 0} items sold`),
    buildSummaryCard('Top demand item', daily?.insights?.mostSoldItem?.name || 'No data', `Qty ${daily?.insights?.mostSoldItem?.quantity || 0}`)
  ].join('');
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
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No sales found for this period.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${row.name || '-'}</td>
      <td>${Number(row.quantity || 0)}</td>
      <td>${formatMoney(row.revenue)}</td>
      <td>${Number(row.sharePercent || 0).toFixed(2)}%</td>
      <td><span class="demand-pill demand-${String(row.demandLevel || 'low').toLowerCase()}">${row.demandLevel || 'Low'}</span></td>
    </tr>
  `).join('');
}

function renderPeriod(period, report) {
  reportsState[period] = report;

  const rangeText = `${report.rangeStart || '-'} to ${report.rangeEnd || '-'}`;
  const rangeEl = document.getElementById(`${period}ReportRange`);
  if (rangeEl) {
    rangeEl.textContent = `${rangeText} • Orders: ${report.ordersCount || 0} • Sales: ${formatMoney(report.totalSales)}`;
  }

  renderDemandItems(`${period}DemandItems`, report.highDemandItems || []);
  renderSalesRows(`${period}SalesRows`, report.menuSales || []);
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvContent(period, report) {
  const rows = Array.isArray(report?.menuSales) ? report.menuSales : [];
  const csvLines = [
    ['Period', period].map(escapeCsvCell).join(','),
    ['Range Start', report?.rangeStart || ''].map(escapeCsvCell).join(','),
    ['Range End', report?.rangeEnd || ''].map(escapeCsvCell).join(','),
    ['Orders Count', Number(report?.ordersCount || 0)].map(escapeCsvCell).join(','),
    ['Total Items Sold', Number(report?.totalItemsSold || 0)].map(escapeCsvCell).join(','),
    ['Total Sales', Number(report?.totalSales || 0)].map(escapeCsvCell).join(','),
    '',
    ['Menu Item', 'Qty Sold', 'Sales', 'Share Percent', 'Demand Level'].map(escapeCsvCell).join(',')
  ];

  rows.forEach(row => {
    csvLines.push([
      row?.name || '-',
      Number(row?.quantity || 0),
      Number(row?.revenue || 0),
      Number(row?.sharePercent || 0).toFixed(2),
      row?.demandLevel || 'Low'
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
  if (!report || !Array.isArray(report.menuSales) || !report.menuSales.length) {
    setReportsMessage(`No ${period} sales data available to export.`, true);
    return;
  }

  const selectedDate = getSelectedDate();
  const content = buildCsvContent(period, report);
  const filename = `menu-sales-${period}-${selectedDate}.csv`;
  downloadCsv(filename, content);
  setReportsMessage(`${period.charAt(0).toUpperCase() + period.slice(1)} report exported as CSV.`);
}

async function loadReportsOverview() {
  const selectedDate = getSelectedDate();
  const selectedDateTo = getSelectedDateTo();
  setReportsMessage('Loading report data...');

  try {
    const response = await fetch(`/api/reports/menu-sales/overview/${headerRestaurantId}?date=${encodeURIComponent(selectedDate)}&dateTo=${encodeURIComponent(selectedDateTo)}`);
    if (!response.ok) {
      throw new Error(`Unable to load reports. Status ${response.status}`);
    }

    const data = await response.json();
    renderSummaryCards(data);
    renderPeriod('daily', data.daily || {});
    renderPeriod('weekly', data.weekly || {});
    renderPeriod('monthly', data.monthly || {});
    setReportsMessage('Reports refreshed successfully.');
  } catch (error) {
    setReportsMessage(error.message, true);
  }
}

function initializeReportsPage() {
  const dateInput = document.getElementById('reportReferenceDateFrom');
  const dateInputTo = document.getElementById('reportReferenceDateTo');
  const refreshButton = document.getElementById('refreshReportButton');
  const dailyExportButton = document.getElementById('dailyExportCsvButton');
  const weeklyExportButton = document.getElementById('weeklyExportCsvButton');
  const monthlyExportButton = document.getElementById('monthlyExportCsvButton');
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

  if (dailyExportButton) {
    dailyExportButton.addEventListener('click', () => exportPeriodCsv('daily'));
  }

  if (weeklyExportButton) {
    weeklyExportButton.addEventListener('click', () => exportPeriodCsv('weekly'));
  }

  if (monthlyExportButton) {
    monthlyExportButton.addEventListener('click', () => exportPeriodCsv('monthly'));
  }

  // loadReportsOverview();
}

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  initializeReportsPage();
});