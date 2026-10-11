document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  setupAttendanceSave();
  setupStaffExpenseSave();
  setupAttendanceInteractions();
  loadAttendanceMeta();
  loadStaffExpenseMeta();
  loadWeeklyAttendanceSummary();
  loadStaffExpenses();

  if (document.getElementById('attendanceList')) {
    const from = document.getElementById('attendanceFilterFrom');
    const to = document.getElementById('attendanceFilterTo');
    const todayStr = new Date().toISOString().slice(0, 10);
    if (to && !to.value) to.value = todayStr;
    if (from && !from.value) from.value = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    document.getElementById('attendanceSearchButton')?.addEventListener('click', searchAttendance);
    document.getElementById('attendanceExportButton')?.addEventListener('click', exportAttendanceCsv);
    document.getElementById('attendancePager')?.addEventListener('click', event => {
      const btn = event.target.closest('button[data-page]');
      if (!btn) return;
      attendancePage += btn.dataset.page === 'next' ? 1 : -1;
      renderAttendancePage();
    });
    loadAttendanceRecords();
  }
});

let attendanceRecords = [];
let attendanceSearchResults = [];
let attendancePage = 1;
let attendanceAllowPrefill = false;
const ATTENDANCE_PAGE_SIZE = 10;

function loadAttendanceRecords() {
  return fetch(`/api/attendance/attendance-weekly/${headerRestaurantId}`)
    .then(res => res.json())
    .then(data => {
      attendanceRecords = Array.isArray(data) ? data : [];
    })
    .catch(() => {
      attendanceRecords = [];
    })
    .finally(() => {
      syncAttendanceFormByStatus();
      searchAttendance();
    });
}

function findSavedAttendance() {
  const staffId = Number(document.getElementById('attendanceStaffId')?.value || 0);
  const date = document.getElementById('attendanceDate')?.value;
  return attendanceRecords.find(r => Number(r.staffMember?.id) === staffId && r.date === date) || null;
}

function renderAttendance(data) {
  attendanceSearchResults = (Array.isArray(data) ? data : []).slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  attendancePage = 1;
  renderAttendancePage();
}

function renderAttendancePage() {
  const list = document.getElementById('attendanceList');
  const countEl = document.getElementById('attendanceCount');
  const pager = document.getElementById('attendancePager');
  if (!list) return;

  const records = attendanceSearchResults;
  const totalPages = Math.max(1, Math.ceil(records.length / ATTENDANCE_PAGE_SIZE));
  attendancePage = Math.min(Math.max(1, attendancePage), totalPages);
  if (countEl) countEl.textContent = `${records.length} records`;

  if (pager) {
    pager.hidden = records.length <= ATTENDANCE_PAGE_SIZE;
    pager.innerHTML = `
      <button type="button" class="secondary" data-page="prev" ${attendancePage <= 1 ? 'disabled' : ''}>Previous</button>
      <span class="muted">Page ${attendancePage} of ${totalPages}</span>
      <button type="button" class="secondary" data-page="next" ${attendancePage >= totalPages ? 'disabled' : ''}>Next</button>`;
  }

  if (!records.length) {
    list.innerHTML = '<tr><td colspan="6" class="empty-state">No attendance records found for this period.</td></tr>';
    return;
  }

  const start = (attendancePage - 1) * ATTENDANCE_PAGE_SIZE;
  list.innerHTML = records.slice(start, start + ATTENDANCE_PAGE_SIZE).map(item => {
    const isPresent = String(item.status || '').toLowerCase() === 'present';
    return `
    <tr>
      <td>${escapeHtml(item.date || '-')}</td>
      <td>${escapeHtml(item.staffName || item.staffMember?.fullName || 'Staff member')}</td>
      <td><span class="status-pill ${attendanceStatusClass(item.status)}">${escapeHtml(item.status || 'Present')}</span></td>
      <td>${isPresent ? formatTimeValue(item.checkIn) : '-'}</td>
      <td>${isPresent ? formatTimeValue(item.checkOut) : '-'}</td>
      <td>${escapeHtml(item.remarks || '')}</td>
    </tr>`;
  }).join('');
}

function exportAttendanceCsv() {
  if (!attendanceSearchResults.length) {
    showSaveMessage('attendanceSearchMessage', 'No records to export.', true);
    return;
  }
  const cell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [['Date', 'Staff', 'Status', 'Check-in', 'Check-out', 'Remarks'].map(cell).join(',')];
  attendanceSearchResults.forEach(item => {
    const isPresent = String(item.status || '').toLowerCase() === 'present';
    lines.push([
      item.date || '',
      item.staffName || item.staffMember?.fullName || '',
      item.status || 'Present',
      isPresent ? formatTimeValue(item.checkIn) : '',
      isPresent ? formatTimeValue(item.checkOut) : '',
      item.remarks || ''
    ].map(cell).join(','));
  });

  const from = document.getElementById('attendanceFilterFrom')?.value || '';
  const to = document.getElementById('attendanceFilterTo')?.value || '';
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `attendance-${from}-to-${to}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function searchAttendance() {
  const from = document.getElementById('attendanceFilterFrom')?.value;
  const to = document.getElementById('attendanceFilterTo')?.value;
  const staffId = Number(document.getElementById('attendanceFilterStaffId')?.value || 0);
  if (!from || !to) {
    showSaveMessage('attendanceSearchMessage', 'Select both From and To dates.', true);
    return Promise.resolve();
  }

  showSaveMessage('attendanceSearchMessage', '');
  return fetch(`/api/attendance/range/${headerRestaurantId}?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`)
    .then(res => {
      if (!res.ok) throw new Error(`Search failed (${res.status}).`);
      return res.json();
    })
    .then(data => {
      const rows = Array.isArray(data) ? data : [];
      renderAttendance(staffId ? rows.filter(r => Number(r.staffMember?.id) === staffId) : rows);
    })
    .catch(error => {
      renderAttendance([]);
      showSaveMessage('attendanceSearchMessage', error.message, true);
    });
}

function setupAttendanceSave() {
  const form = document.getElementById('attendanceForm');
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const payload = {
      staffIdValue: Number(document.getElementById('attendanceStaffId')?.value || 0),
      dateValue: document.getElementById('attendanceDate')?.value,
      checkInValue: document.getElementById('attendanceCheckIn')?.value || '',
      checkOutValue: document.getElementById('attendanceCheckOut')?.value || '',
      status: document.getElementById('attendanceStatus')?.value || 'Present',
      remarksValue: document.getElementById('attendanceRemarks')?.value?.trim() || ''
    };

    const normalizedStatus = payload.status.toLowerCase();
    if (!payload.staffIdValue) {
      showSaveMessage('attendanceSaveMessage', 'Select a staff member.', true);
      return;
    }
    if ((normalizedStatus === 'absent' || normalizedStatus === 'leave') && !payload.remarksValue) {
      showSaveMessage('attendanceSaveMessage', 'Remarks are required for Absent or Leave status.', true);
      return;
    }

    try {
      await saveJson(`/api/attendance`, payload);
      showSaveMessage('attendanceSaveMessage', 'Attendance saved successfully.');
      clearAttendanceFormForNextEntry();
      loadAttendanceRecords();
      loadWeeklyAttendanceSummary();
    } catch (error) {
      showSaveMessage('attendanceSaveMessage', error.message, true);
    }
  });
}

function loadAttendanceMeta() {
  const staffSelect = document.getElementById('attendanceStaffId');
  const expenseStaffSelect = document.getElementById('staffExpenseStaffId');
  if (!staffSelect && !expenseStaffSelect) return;

  fetch(`/api/attendance/meta/${headerRestaurantId}`)
    .then(res => res.json())
    .then(meta => {
      const staffOptions = meta.staff || [];
      fillSelect('attendanceStaffId', staffOptions);
      const attendanceStaffSelect = document.getElementById('attendanceStaffId');
      if (attendanceStaffSelect) {
        attendanceStaffSelect.insertAdjacentHTML('afterbegin', '<option value="">Select staff</option>');
        attendanceStaffSelect.value = '';
      }
      fillSelect('staffExpenseStaffId', staffOptions);
      const filterSelect = document.getElementById('attendanceFilterStaffId');
      if (filterSelect) {
        filterSelect.innerHTML = '<option value="">All staff</option>' + staffOptions
          .map(s => `<option value="${s.id}">${escapeHtml(s.name || `#${s.id}`)}</option>`).join('');
      }
      syncAttendanceFormByStatus();
    })
    .catch(() => {
      showSaveMessage('attendanceSaveMessage', 'Unable to load staff list for attendance.', true);
      showSaveMessage('staffExpenseSaveMessage', 'Unable to load staff list for expenses.', true);
    });
}

function loadStaffExpenseMeta() {
  const dateInput = document.getElementById('staffExpenseDate');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }
}

function setupStaffExpenseSave() {
  const form = document.getElementById('staffExpenseForm');
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const payload = {
      staffIdValue: Number(document.getElementById('staffExpenseStaffId')?.value || 0),
      dateValue: document.getElementById('staffExpenseDate')?.value,
      expenseAmount: Number(document.getElementById('staffExpenseAmount')?.value || 0),
      expenseDetails: document.getElementById('staffExpenseDetails')?.value?.trim() || ''
    };

    try {
      await saveJson(`/api/staff-expenses/${headerRestaurantId}`, payload);
      showSaveMessage('staffExpenseSaveMessage', 'Staff expense saved successfully.');
      clearStaffExpenseFormForNextEntry();
      loadStaffExpenses();
    } catch (error) {
      showSaveMessage('staffExpenseSaveMessage', error.message, true);
    }
  });
}

function loadStaffExpenses() {
  fetch(`/api/staff-expenses/${headerRestaurantId}`)
    .then(res => res.json())
    .then(data => renderStaffExpenses(data))
    .catch(() => renderStaffExpenses([]));
}

function renderStaffExpenses(data) {
  const list = document.getElementById('staffExpenseList');
  if (!list) return;

  const records = Array.isArray(data) ? data : [];
  if (!records.length) {
    list.innerHTML = '<div class="empty-state">No staff expenses recorded yet.</div>';
    return;
  }

  list.innerHTML = records.slice(0, 8).map(item => `
    <div class="list-item">
      <div>
        <strong>${item.staffMember?.fullName || 'Staff member'}</strong>
        <div class="muted">${item.date || '—'} • ${formatCurrency(Number(item.expenseAmount || 0))}</div>
        ${item.expenseDetails ? `<div class="muted attendance-remarks">Details: ${escapeHtml(item.expenseDetails)}</div>` : ''}
      </div>
      <span class="status-pill warning">Expense</span>
    </div>
  `).join('');
}

function loadWeeklyAttendanceSummary() {
  const graph = document.getElementById('attendanceWeekGraph');
  if (!graph) return;

  fetch(`/api/attendance/weekly-summary/${headerRestaurantId}`)
    .then(res => res.json())
    .then(data => renderWeeklyAttendanceGraph(data))
    .catch(() => {
      graph.innerHTML = '<div class="empty-state">Unable to load weekly attendance graph.</div>';
    });
}

function renderWeeklyAttendanceGraph(data) {
  const graph = document.getElementById('attendanceWeekGraph');
  if (!graph) return;

  // The API appends a non-day entry ({ userAtt }) to the list; keep only dated entries.
  const week = (Array.isArray(data) ? data : []).filter(day => day && day.date);
  if (!week.length) {
    graph.innerHTML = '<div class="empty-state">No attendance data for the last 7 days.</div>';
    return;
  }

  const maxCount = Math.max(1, ...week.map(day => Math.max(day.present || 0, day.absent || 0, day.leave || 0)));
  const columns = week.map(day => {
    const present = Number(day.present || 0);
    const absent = Number(day.absent || 0);
    const leave = Number(day.leave || 0);
    const presentNames = toNameArray(day.presentNames);
    const absentNames = toNameArray(day.absentNames);
    const leaveNames = toNameArray(day.leaveNames);
    const dayLabel = shortDay(day.date);
    const presentHeight = Math.max(present > 0 ? 6 : 0, Math.round((present / maxCount) * 50));
    const absentHeight = Math.max(absent > 0 ? 6 : 0, Math.round((absent / maxCount) * 50));
    const leaveHeight = Math.max(leave > 0 ? 6 : 0, Math.round((leave / maxCount) * 50));

    const presentTooltip = buildStatusTooltip(day.date, 'Present', present, presentNames);
    const absentTooltip = buildStatusTooltip(day.date, 'Absent', absent, absentNames);
    const leaveTooltip = buildStatusTooltip(day.date, 'Leave', leave, leaveNames);

    return `
      <div class="attendance-week-col">
        <div class="attendance-week-bars">
          ${weekBar('present', present, presentHeight, presentTooltip)}
          ${weekBar('absent', absent, absentHeight, absentTooltip)}
          ${weekBar('leave', leave, leaveHeight, leaveTooltip)}
        </div>
        <div class="attendance-week-day">${dayLabel}</div>
      </div>
    `;
  }).join('');

  graph.innerHTML = `<div class="attendance-week-graph-inner">${columns}</div>`;
}

function weekBar(kind, count, height, tooltip) {
  const label = kind.charAt(0).toUpperCase() + kind.slice(1);
  return `
    <div class="attendance-week-bar-wrap">
      <span class="attendance-bar-value">${count > 0 ? count : ''}</span>
      <div class="attendance-week-bar ${kind}" style="height:${height}px" aria-label="${label} ${count}" title="${escapeHtml(tooltip)}"></div>
    </div>`;
}

function toNameArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildStatusTooltip(date, label, count, names) {
  const nameLine = names.length ? names.join(', ') : 'None';
  return `${date}\n${label}: ${count}\nPeople: ${nameLine}`;
}

function shortDay(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  return `${day}-${month}`;
}

function setupAttendanceInteractions() {
  const dateInput = document.getElementById('attendanceDate');
  const statusSelect = document.getElementById('attendanceStatus');
  const checkInNowButton = document.getElementById('attendanceCheckInNow');
  const checkOutNowButton = document.getElementById('attendanceCheckOutNow');

  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }

  if (statusSelect) {
    statusSelect.addEventListener('change', syncAttendanceFormByStatus);
  }

  ['attendanceStaffId', 'attendanceDate'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      const checkInInput = document.getElementById('attendanceCheckIn');
      const checkOutInput = document.getElementById('attendanceCheckOut');
      if (checkInInput) checkInInput.value = '';
      if (checkOutInput) checkOutInput.value = '';
      attendanceAllowPrefill = true;
      syncAttendanceFormByStatus();
      attendanceAllowPrefill = false;
    });
  });

  if (checkInNowButton) {
    checkInNowButton.addEventListener('click', () => setCurrentTime('attendanceCheckIn'));
  }

  if (checkOutNowButton) {
    checkOutNowButton.addEventListener('click', () => setCurrentTime('attendanceCheckOut'));
  }

  syncAttendanceFormByStatus();
}

function syncAttendanceFormByStatus() {
  const status = (document.getElementById('attendanceStatus')?.value || 'Present').toLowerCase();
  const checkInField = document.getElementById('attendanceCheckInField');
  const checkOutField = document.getElementById('attendanceCheckOutField');
  const remarksField = document.getElementById('attendanceRemarksField');
  const checkInInput = document.getElementById('attendanceCheckIn');
  const checkOutInput = document.getElementById('attendanceCheckOut');
  const remarksInput = document.getElementById('attendanceRemarks');
  const checkInNowButton = document.getElementById('attendanceCheckInNow');
  const checkOutNowButton = document.getElementById('attendanceCheckOutNow');

  const isPresent = status === 'present';
  const needsRemarks = status === 'absent' || status === 'leave';

  const todayStr = new Date().toISOString().slice(0, 10);
  const selectedDate = document.getElementById('attendanceDate')?.value || todayStr;
  const isPastDate = selectedDate < todayStr;
  const saved = findSavedAttendance();
  const hasCheckIn = Boolean(saved?.checkIn);
  // Check-out is offered once a check-in exists for the day, or always for past dates.
  const showCheckOut = isPresent && (isPastDate || hasCheckIn);

  if (attendanceAllowPrefill && isPresent && hasCheckIn && checkInInput && !checkInInput.value) {
    checkInInput.value = formatTimeValue(saved.checkIn);
  }
  if (attendanceAllowPrefill && isPresent && saved?.checkOut && checkOutInput && !checkOutInput.value) {
    checkOutInput.value = formatTimeValue(saved.checkOut);
  }

  if (checkInField) checkInField.hidden = !isPresent;
  if (checkOutField) checkOutField.hidden = !showCheckOut;
  if (remarksField) remarksField.hidden = !needsRemarks;
  if (checkInNowButton) checkInNowButton.disabled = !isPresent;
  if (checkOutNowButton) {
    checkOutNowButton.hidden = !showCheckOut;
    checkOutNowButton.disabled = !showCheckOut;
  }

  if (checkInInput) checkInInput.required = isPresent;
  if (checkOutInput) checkOutInput.required = false;
  if (remarksInput) remarksInput.required = needsRemarks;

  if (!isPresent) {
    if (checkInInput) checkInInput.value = '';
    if (checkOutInput) checkOutInput.value = '';
  }
  if (!showCheckOut && checkOutInput) {
    checkOutInput.value = '';
  }

  if (!needsRemarks && remarksInput) {
    remarksInput.value = '';
  }
}

function setCurrentTime(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  input.value = `${hours}:${minutes}`;
}

function clearAttendanceFormForNextEntry() {
  const staffSelect = document.getElementById('attendanceStaffId');
  const dateInput = document.getElementById('attendanceDate');
  const statusSelect = document.getElementById('attendanceStatus');
  const remarksInput = document.getElementById('attendanceRemarks');

  if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);

  if (statusSelect) statusSelect.value = 'Present';
  if (remarksInput) remarksInput.value = '';
  if (staffSelect && staffSelect.options.length > 0) {
    staffSelect.selectedIndex = 0;
  }

  const checkInInput = document.getElementById('attendanceCheckIn');
  const checkOutInput = document.getElementById('attendanceCheckOut');
  if (checkInInput) checkInInput.value = '';
  if (checkOutInput) checkOutInput.value = '';
  syncAttendanceFormByStatus();
}

function clearStaffExpenseFormForNextEntry() {
  const staffSelect = document.getElementById('staffExpenseStaffId');
  const dateInput = document.getElementById('staffExpenseDate');
  const amountInput = document.getElementById('staffExpenseAmount');
  const detailsInput = document.getElementById('staffExpenseDetails');

  if (staffSelect && staffSelect.options.length > 0) {
    staffSelect.selectedIndex = 0;
  }
  if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
  if (amountInput) amountInput.value = '0';
  if (detailsInput) detailsInput.value = '';
}

function formatAttendanceTime(item) {
  const status = (item.status || '').toLowerCase();
  if (status === 'absent' || status === 'leave') {
    return 'No check-in/check-out';
  }
  return `${formatTimeValue(item.checkIn)} to ${formatTimeValue(item.checkOut)}`;
}

function formatTimeValue(value) {
  if (!value) return '--:--';
  const asString = String(value);
  const timeMatch = asString.match(/T(\d{2}:\d{2})/);
  if (timeMatch) return timeMatch[1];
  const plainTimeMatch = asString.match(/(\d{2}:\d{2})/);
  return plainTimeMatch ? plainTimeMatch[1] : '--:--';
}

function attendanceStatusClass(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'present') return 'success';
  if (normalized === 'leave') return 'warning';
  return 'danger';
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}