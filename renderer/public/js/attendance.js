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
    fetch(`/api/attendance/attendance-weekly/${headerRestaurantId}`)
      .then(res => res.json())
      .then(data => renderAttendance(data))
      .catch(() => renderAttendance([]));
  }
});

function renderAttendance(data) {
  const list = document.getElementById('attendanceList');
  const countEl = document.getElementById('attendanceCount');
  if (!list) return;

  const records = Array.isArray(data) ? data : [];
  if (countEl) countEl.textContent = `${records.length} records`;

  if (!records.length) {
    list.innerHTML = '<div class="empty-state">No attendance records have been logged yet.</div>';
    return;
  }

  list.innerHTML = records.slice(0, 8).map(item => `
    <div class="list-item">
      <div>
        <strong>${item.staffName || item.staffMember?.fullName || 'Staff member'}</strong>
        <div class="muted">${item.date || 'Today'} • ${formatAttendanceTime(item)}</div>
        ${item.remarks ? `<div class="muted attendance-remarks">Remarks: ${escapeHtml(item.remarks)}</div>` : ''}
      </div>
      <span class="status-pill ${attendanceStatusClass(item.status)}">${item.status || 'Present'}</span>
    </div>
  `).join('');
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
    if ((normalizedStatus === 'absent' || normalizedStatus === 'leave') && !payload.remarksValue) {
      showSaveMessage('attendanceSaveMessage', 'Remarks are required for Absent or Leave status.', true);
      return;
    }

    try {
      await saveJson(`/api/attendance`, payload);
      showSaveMessage('attendanceSaveMessage', 'Attendance saved successfully.');
      clearAttendanceFormForNextEntry();
      fetch(`/api/attendance/attendance-weekly/${headerRestaurantId}`).then(res => res.json()).then(data => renderAttendance(data));
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
      fillSelect('staffExpenseStaffId', staffOptions);
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

  const week = Array.isArray(data) ? data : [];
  if (!week.length) {
    graph.innerHTML = '<div class="empty-state">No attendance data for the last 7 days.</div>';
    return;
  }

  const maxCount = Math.max(1, ...week.map(day => Math.max(day.present || 0, day.absent || 0, day.leave || 0)));
  const ticks = buildAxisTicks(maxCount);
  const columns = week.map(day => {
    const present = Number(day.present || 0);
    const absent = Number(day.absent || 0);
    const leave = Number(day.leave || 0);
    const presentNames = toNameArray(day.presentNames);
    const absentNames = toNameArray(day.absentNames);
    const leaveNames = toNameArray(day.leaveNames);
    const dayLabel = shortDay(day.date);
    const presentHeight = Math.max(present > 0 ? 6 : 0, Math.round((present / maxCount) * 88));
    const absentHeight = Math.max(absent > 0 ? 6 : 0, Math.round((absent / maxCount) * 88));
    const leaveHeight = Math.max(leave > 0 ? 6 : 0, Math.round((leave / maxCount) * 88));

    const presentTooltip = buildStatusTooltip(day.date, 'Present', present, presentNames);
    const absentTooltip = buildStatusTooltip(day.date, 'Absent', absent, absentNames);
    const leaveTooltip = buildStatusTooltip(day.date, 'Leave', leave, leaveNames);

    return `
      <div class="attendance-week-col">
        <div class="attendance-week-bars">
          <div class="attendance-week-bar present" style="height:${presentHeight}px" aria-label="Present ${present}" title="${escapeHtml(presentTooltip)}"></div>
          <div class="attendance-week-bar absent" style="height:${absentHeight}px" aria-label="Absent ${absent}" title="${escapeHtml(absentTooltip)}"></div>
          <div class="attendance-week-bar leave" style="height:${leaveHeight}px" aria-label="Leave ${leave}" title="${escapeHtml(leaveTooltip)}"></div>
        </div>
        <div class="attendance-week-day">${dayLabel}</div>
      </div>
    `;
  }).join('');

  graph.innerHTML = `
    <div class="attendance-chart-layout">
      <div class="attendance-y-axis">
        ${ticks.map(tick => `<div class="attendance-y-tick">${tick}</div>`).join('')}
      </div>
      <div class="attendance-week-graph-inner">
        ${columns}
      </div>
    </div>
  `;
}

function buildAxisTicks(maxCount) {
  return [maxCount, Math.round(maxCount * 0.75), Math.round(maxCount * 0.5), Math.round(maxCount * 0.25), 0];
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

  if (checkInField) checkInField.hidden = !isPresent;
  if (checkOutField) checkOutField.hidden = !isPresent;
  if (remarksField) remarksField.hidden = !needsRemarks;
  if (checkInNowButton) checkInNowButton.disabled = !isPresent;
  if (checkOutNowButton) checkOutNowButton.disabled = !isPresent;

  if (checkInInput) checkInInput.required = isPresent;
  if (checkOutInput) checkOutInput.required = isPresent;
  if (remarksInput) remarksInput.required = needsRemarks;

  if (!isPresent) {
    if (checkInInput) checkInInput.value = '';
    if (checkOutInput) checkOutInput.value = '';
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
  const statusSelect = document.getElementById('attendanceStatus');
  const remarksInput = document.getElementById('attendanceRemarks');

  if (statusSelect) statusSelect.value = 'Present';
  if (remarksInput) remarksInput.value = '';
  if (staffSelect && staffSelect.options.length > 0) {
    staffSelect.selectedIndex = 0;
  }

  setCurrentTime('attendanceCheckIn');
  setCurrentTime('attendanceCheckOut');
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