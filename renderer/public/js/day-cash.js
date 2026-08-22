const dayCashState = {
  date: '',
  summary: null
};

function getTodayDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function getSelectedBusinessDate() {
  const dateInput = document.getElementById('dayCashDate');
  const selected = dateInput?.value?.trim();
  return selected || getTodayDateInputValue();
}

function setDayCashMessage(message, isError = false) {
  const messageEl = document.getElementById('dayCashMessage');
  if (!messageEl) return;
  messageEl.textContent = message || '';
  messageEl.style.color = isError ? '#b91c1c' : '#166534';
}

function setSummaryValue(elementId, value, isCurrency = true) {
  const el = document.getElementById(elementId);
  if (!el) return;
  if (value === null || value === undefined) {
    el.textContent = '-';
    return;
  }
  el.textContent = isCurrency ? formatCurrency(value) : String(value);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatBusinessDate(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function renderDayCashSummary(summary) {
  dayCashState.summary = summary || null;

  const openingCash = summary?.openingCash;
  const cashIncome = summary?.cashIncome ?? 0;
  const expectedClosingCash = summary?.expectedClosingCash;
  const declaredClosingCash = summary?.closingCash;
  const discrepancy = summary?.discrepancy;
  const cashExpense = summary?.cashExpense ?? 0;

  setSummaryValue('summaryOpeningCash', openingCash);
  setSummaryValue('summaryCashIncome', cashIncome);
  setSummaryValue('summaryExpectedClosing', expectedClosingCash);
  setSummaryValue('summaryDeclaredClosing', declaredClosingCash);
  setSummaryValue('summaryCashExpense', cashExpense);
  setSummaryValue('summaryDiscrepancy', discrepancy);

  const statusEl = document.getElementById('summaryStatus');
  if (statusEl) {
    if (!summary?.closed) {
      statusEl.textContent = summary?.canOpen ? 'Opening pending' : 'Day in progress';
    } else if (summary?.balanced === true) {
      statusEl.textContent = 'Balanced';
    } else if (summary?.balanced === false) {
      statusEl.textContent = 'Discrepancy found';
    } else {
      statusEl.textContent = 'Closed';
    }
  }

  const openingInput = document.getElementById('openingCashInput');
  const openingNoteInput = document.getElementById('openingNoteInput');
  const closingInput = document.getElementById('closingCashInput');
  const closingNoteInput = document.getElementById('closingNoteInput');
  const saveOpeningButton = document.getElementById('saveOpeningCashButton');
  const saveClosingButton = document.getElementById('saveClosingCashButton');

  if (openingInput && openingCash !== null && openingCash !== undefined) {
    openingInput.value = Number(openingCash).toFixed(2);
  }
  if (openingNoteInput) {
    openingNoteInput.value = summary?.openingNote || '';
  }

  if (openingInput) openingInput.disabled = !summary?.canOpen;
  if (openingNoteInput) openingNoteInput.disabled = !summary?.canOpen;
  if (saveOpeningButton) saveOpeningButton.disabled = !summary?.canOpen;

  if (closingInput && declaredClosingCash !== null && declaredClosingCash !== undefined) {
    closingInput.value = Number(declaredClosingCash).toFixed(2);
  }
  if (closingNoteInput) {
    closingNoteInput.value = summary?.closingNote || '';
  }

  if (closingInput) closingInput.disabled = !summary?.canClose;
  if (closingNoteInput) closingNoteInput.disabled = !summary?.canClose;
  if (saveClosingButton) saveClosingButton.disabled = !summary?.canClose;
}

function renderDayCashHistory(items) {
  const body = document.getElementById('dayCashHistoryTableBody');
  if (!body) return;

  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="9" class="empty-state">No reconciliation records yet.</td></tr>';
    return;
  }

  body.innerHTML = rows.map(item => {
    let statusText = 'In progress';
    if (item?.closed && item?.balanced === true) statusText = 'Balanced';
    if (item?.closed && item?.balanced === false) statusText = 'Discrepancy';

    return `
      <tr>
        <td>${formatBusinessDate(item?.businessDate)}</td>
        <td>${item?.openingCash == null ? '-' : formatCurrency(item.openingCash)}</td>
        <td>${formatCurrency(item?.cashIncome || 0)}</td>
        <td>${item?.expectedClosingCash == null ? '-' : formatCurrency(item.expectedClosingCash)}</td>
        <td>${item?.closingCash == null ? '-' : formatCurrency(item.closingCash)}</td>
        <td>${item?.discrepancy == null ? '-' : formatCurrency(item.discrepancy)}</td>
        <td>${statusText}</td>
        <td>${item?.openingNote ? escapeHtml(item.openingNote) : '-'}</td>
        <td>${item?.closingNote ? escapeHtml(item.closingNote) : '-'}</td>
      </tr>
    `;
  }).join('');
}

async function loadDayCashHistory() {
  const response = await fetch(`/api/day-cash/history/${headerRestaurantId}?limit=30`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.message || `Unable to load day cash history (${response.status})`);
  }

  renderDayCashHistory(payload);
}

async function fetchDayCashSummary() {
  const businessDate = getSelectedBusinessDate();
  dayCashState.date = businessDate;

  const response = await fetch(`/api/day-cash/${headerRestaurantId}?date=${encodeURIComponent(businessDate)}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.message || `Unable to load day cash summary (${response.status})`);
  }

  return payload;
}

async function loadDayCashSummary() {
  try {
    const summary = await fetchDayCashSummary();
    renderDayCashSummary(summary);
    await loadDayCashHistory();
    setDayCashMessage('');
  } catch (error) {
    setDayCashMessage(error.message, true);
  }
}

async function saveOpeningCash() {
  const openingCashValue = Number(document.getElementById('openingCashInput')?.value || 0);
  const payload = {
    date: getSelectedBusinessDate(),
    openingCash: openingCashValue,
    openingNote: document.getElementById('openingNoteInput')?.value?.trim() || ''
  };

  const response = await fetch(`/api/day-cash/open/${headerRestaurantId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.message || `Unable to save opening cash (${response.status})`);
  }

  renderDayCashSummary(body);
  await loadDayCashHistory();
  setDayCashMessage('Opening cash recorded.');
}

async function saveClosingCash() {
  const closingCashValue = Number(document.getElementById('closingCashInput')?.value || 0);
  const payload = {
    date: getSelectedBusinessDate(),
    closingCash: closingCashValue,
    closingNote: document.getElementById('closingNoteInput')?.value?.trim() || ''
  };

  const response = await fetch(`/api/day-cash/close/${headerRestaurantId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.message || `Unable to save closing cash (${response.status})`);
  }

  renderDayCashSummary(body);
  await loadDayCashHistory();
  if (body?.balanced) {
    setDayCashMessage('Day closed with no discrepancy.');
  } else {
    setDayCashMessage('Day closed with discrepancy detected.', true);
  }
}

function setupDayCashActions() {
  const dateInput = document.getElementById('dayCashDate');
  const refreshButton = document.getElementById('refreshDayCashButton');
  const openingButton = document.getElementById('saveOpeningCashButton');
  const closingButton = document.getElementById('saveClosingCashButton');

  if (dateInput) {
    dateInput.value = getTodayDateInputValue();
    dateInput.max = getTodayDateInputValue();
    dateInput.addEventListener('change', () => {
      loadDayCashSummary();
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      loadDayCashSummary();
    });
  }

  if (openingButton) {
    openingButton.addEventListener('click', async () => {
      try {
        await saveOpeningCash();
      } catch (error) {
        setDayCashMessage(error.message, true);
      }
    });
  }

  if (closingButton) {
    closingButton.addEventListener('click', async () => {
      try {
        await saveClosingCash();
      } catch (error) {
        setDayCashMessage(error.message, true);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  setupDayCashActions();
  loadDayCashSummary();
});
