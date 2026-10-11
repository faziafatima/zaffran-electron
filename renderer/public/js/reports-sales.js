const reportsStateSalesv2 = {
  summary: null,
  items: []
};

function formatMoney(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function setReportsMessage(message, isError = false) {
  const messageEl = document.getElementById('reportsMessage');
  if (!messageEl) return;
  messageEl.textContent = message || '';
  messageEl.style.color = isError ? '#b91c1c' : '#0f766e';
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function getSelectedDate() {
  return document.getElementById('reportReferenceDateFrom')?.value || today();
}

function getSelectedDateTo() {
  return document.getElementById('reportReferenceDateTo')?.value || today();
}

function getSelectedCategory() {
  return document.getElementById('reportCategoryFilter')?.value || '';
}

function renderSummary(summary) {
  const tbody = document.getElementById('salesSummaryRows');
  if (!tbody) return;
  const s = summary || {};
  tbody.innerHTML = `
    <tr>
      <td>${Number(s.totalOrders || 0)}</td>
      <td>${Number(s.totalItemsSold || 0)}</td>
      <td>${formatMoney(s.totalCashPayment)}</td>
      <td>${formatMoney(s.totalCardPayment)}</td>
      <td>${formatMoney(s.totalUpiPayment)}</td>
      <td>${formatMoney(s.totalSales)}</td>
      <td>${formatMoney(s.totalDiscounts)}</td>
      <td>${formatMoney(s.totalTax)}</td>
    </tr>`;
}

function renderItems(items) {
  const tbody = document.getElementById('salesItemRows');
  if (!tbody) return;

  if (!Array.isArray(items) || !items.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No items sold in this period.</td></tr>';
    return;
  }

  tbody.innerHTML = items.map(row => `
    <tr>
      <td>${escapeHtml(row.name || '-')}</td>
      <td>${escapeHtml(row.category || '-')}</td>
      <td>${Number(row.quantity || 0)}</td>
      <td>${formatMoney(row.revenue)}</td>
      <td>${Number(row.sharePercent || 0).toFixed(2)}%</td>
    </tr>`).join('');
}

function populateCategories(categories) {
  const select = document.getElementById('reportCategoryFilter');
  if (!select) return;
  const current = select.value;
  const list = Array.isArray(categories) ? categories : [];
  select.innerHTML = '<option value="">All categories</option>' +
    list.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  select.value = list.includes(current) ? current : '';
}

function escapeCsvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function buildCsvContent() {
  const s = reportsStateSalesv2.summary || {};
  const lines = [
    ['Total Orders', 'Items Sold', 'Total Cash Payments', 'Total Card Payments', 'Total UPI Payments', 'Total Sales', 'Total Discounts', 'Total Tax'].map(escapeCsvCell).join(','),
    [s.totalOrders, s.totalItemsSold, s.totalCashPayment, s.totalCardPayment, s.totalUpiPayment, s.totalSales, s.totalDiscounts, s.totalTax].map(v => escapeCsvCell(Number(v || 0))).join(','),
    '',
    ['Menu Item', 'Category', 'Qty Sold', 'Sales', 'Share Percent'].map(escapeCsvCell).join(',')
  ];
  reportsStateSalesv2.items.forEach(row => {
    lines.push([row.name, row.category, row.quantity, row.revenue, Number(row.sharePercent || 0).toFixed(2)].map(escapeCsvCell).join(','));
  });
  return lines.join('\n');
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

async function loadReportsOverviewv2(refreshCategories = true) {
  const params = new URLSearchParams({ dateFrom: getSelectedDate(), dateTo: getSelectedDateTo() });
  const category = getSelectedCategory();
  if (category) params.set('category', category);

  setReportsMessage('Loading report data...');
  try {
    const response = await fetch(`/api/reports/sales-items/${headerRestaurantId}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Unable to load reports. Status ${response.status}`);
    }

    const data = await response.json();
    reportsStateSalesv2.summary = data.summary || {};
    reportsStateSalesv2.items = data.items || [];
    if (refreshCategories) populateCategories(data.categories);
    renderSummary(reportsStateSalesv2.summary);
    renderItems(reportsStateSalesv2.items);
    setReportsMessage(category ? 'Amounts for the selected category are apportioned from each order.' : 'Reports refreshed successfully.');
  } catch (error) {
    setReportsMessage(error.message, true);
  }
}

function initializeReportsPagev2() {
  const from = document.getElementById('reportReferenceDateFrom');
  const to = document.getElementById('reportReferenceDateTo');
  if (from && !from.value) from.value = today();
  if (to && !to.value) to.value = today();

  // Changing dates reloads the category list; changing category keeps it.
  document.getElementById('refreshReportButton')?.addEventListener('click', () => loadReportsOverviewv2(true));
  document.getElementById('reportCategoryFilter')?.addEventListener('change', () => loadReportsOverviewv2(false));
  document.getElementById('salesExportCsvButton')?.addEventListener('click', () => {
    downloadCsv(`sales-report-${getSelectedDate()}-to-${getSelectedDateTo()}.csv`, buildCsvContent());
    setReportsMessage('Report exported as CSV.');
  });

  loadReportsOverviewv2(true);
}

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  initializeReportsPagev2();
});
