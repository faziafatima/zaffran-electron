const reportsStateStaffAttendance = {
  rows: []
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
  const dateInput = document.getElementById('reportReferenceDateTo');
  return dateInput?.value || new Date().toISOString().split('T')[0];
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

function renderSummaryCards(rows) {
  const container = document.getElementById('staffAttendanceSummaryCards');
  if (!container) return;

  const data = Array.isArray(rows) ? rows : [];
  const totalStaff = data.length;
  const totalPresent = data.reduce((sum, row) => sum + Number(row.presentDays || 0), 0);
  const totalAbsent = data.reduce((sum, row) => sum + Number(row.absentDays || 0), 0);
  const totalLeave = data.reduce((sum, row) => sum + Number(row.leaveDays || 0), 0);
  const totalPayable = data.reduce((sum, row) => sum + Number(row.payableSalary || 0), 0);

  container.innerHTML = [
    buildSummaryCard('Staff covered', totalStaff, 'Total active staff in this range'),
    buildSummaryCard('Present days', totalPresent, `${totalAbsent} absent • ${totalLeave} leave`),
    buildSummaryCard('Salary payable', formatMoney(totalPayable), 'Present-day salary across staff')
  ].join('');
}

function renderReportRows(rows) {
  const tbody = document.getElementById('staffAttendanceRows');
  if (!tbody) return;

  if (!Array.isArray(rows) || !rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No attendance or salary data found for this period.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${row.staffName || '-'}</td>
      <td>${row.roleName || '-'}</td>
      <td>${Number(row.presentDays || 0)}</td>
      <td>${Number(row.absentDays || 0)}</td>
      <td>${Number(row.leaveDays || 0)}</td>
      <td>${Number(row.unmarkedDays || 0)}</td>
      <td>${formatMoney(row.monthlySalary || 0)}</td>
      <td>${formatMoney(row.perDaySalary || 0)}</td>
      <td>${formatMoney(row.payableSalary || 0)}</td>
    </tr>
  `).join('');
}

function renderReportRange(rows) {
  const rangeEl = document.getElementById('staffAttendanceReportRange');
  if (!rangeEl) return;

  const from = getSelectedDate();
  const to = getSelectedDateTo();
  const totalPayable = (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + Number(row.payableSalary || 0), 0);
  rangeEl.textContent = `${from} to ${to} • Staff: ${(rows || []).length} • Payable: ${formatMoney(totalPayable)}`;
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvContent(rows) {
  const data = Array.isArray(rows) ? rows : [];
  const lines = [
    'Staff Attendance and Salary Report',
    ['From', getSelectedDate()].map(escapeCsvCell).join(','),
    ['To', getSelectedDateTo()].map(escapeCsvCell).join(','),
    '',
    ['Staff Name', 'Role', 'Present', 'Absent', 'Leave', 'Unmarked', 'Monthly Salary', 'Per Day Salary', 'Payable Salary'].map(escapeCsvCell).join(',')
  ];

  data.forEach(row => {
    lines.push([
      row.staffName || '-',
      row.roleName || '-',
      Number(row.presentDays || 0),
      Number(row.absentDays || 0),
      Number(row.leaveDays || 0),
      Number(row.unmarkedDays || 0),
      Number(row.monthlySalary || 0),
      Number(row.perDaySalary || 0),
      Number(row.payableSalary || 0)
    ].map(escapeCsvCell).join(','));
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

function exportCsv() {
  if (!reportsStateStaffAttendance.rows.length) {
    setReportsMessage('No staff attendance data available to export.', true);
    return;
  }

  const filename = `staff-attendance-salary-${getSelectedDate()}-${getSelectedDateTo()}.csv`;
  downloadCsv(filename, buildCsvContent(reportsStateStaffAttendance.rows));
  setReportsMessage('Staff attendance report exported as CSV.');
}

async function loadStaffAttendanceReport() {
 
  const dateFrom = getSelectedDate();
  const dateTo = getSelectedDateTo();

  setReportsMessage('Loading report data...');

  try {
    const response = await fetch(`/api/reports/staff-attendance-salary/${headerRestaurantId}?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`);
    if (!response.ok) {
      throw new Error(`Unable to load reports. Status ${response.status}`);
    }

    const data = await response.json();
    reportsStateStaffAttendance.rows = Array.isArray(data) ? data : [];
    renderSummaryCards(reportsStateStaffAttendance.rows);
    renderReportRows(reportsStateStaffAttendance.rows);
    renderReportRange(reportsStateStaffAttendance.rows);
    setReportsMessage('Reports refreshed successfully.');
  } catch (error) {
    setReportsMessage(error.message || 'Unable to load report.', true);
  }
}

function initializeStaffAttendanceReportPage() {
  const dateInputFrom = document.getElementById('reportReferenceDateFrom');
  const dateInputTo = document.getElementById('reportReferenceDateTo');
  const refreshButton = document.getElementById('refreshReportButton');
  const exportButton = document.getElementById('staffAttendanceExportCsvButton');
  const today = new Date().toISOString().split('T')[0];
  const currentMonthStart = new Date();
  currentMonthStart.setDate(1);
  const monthStart = currentMonthStart.toISOString().split('T')[0];

  if (dateInputFrom && !dateInputFrom.value) {
    dateInputFrom.value = monthStart;
  }
  if (dateInputTo && !dateInputTo.value) {
    dateInputTo.value = today;
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', loadStaffAttendanceReport);
  }

  if (exportButton) {
    exportButton.addEventListener('click', exportCsv);
  }

  loadStaffAttendanceReport();
}

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  initializeStaffAttendanceReportPage();
});
