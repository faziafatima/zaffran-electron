const roleCrudState = {
  items: [],
  editingId: null
};

function setRoleFormMode(isEdit) {
  const title = document.getElementById('roleModalTitle');
  const submitButton = document.querySelector('#roleForm button[type="submit"]');
  if (title) title.textContent = isEdit ? 'Edit role' : 'Add role';
  if (submitButton) submitButton.textContent = isEdit ? 'Update Role' : 'Save Role';
}

function resetRoleForm() {
  const form = document.getElementById('roleForm');
  if (form) form.reset();
  roleCrudState.editingId = null;
  setRoleFormMode(false);
  showSaveMessage('roleSaveMessage', '');
}

function renderRoleTable(items) {
  const body = document.getElementById('rolesTableBody');
  if (!body) return;

  if (!items.length) {
    body.innerHTML = '<tr><td colspan="3" class="empty-state">No roles available.</td></tr>';
    return;
  }

  body.innerHTML = items.map(item => `
    <tr>
      <td>${item.roleName || 'Unnamed role'}</td>
      <td>${item.roleDescription || 'No description'}</td>
      <td>
        <div class="menu-actions">
          <button type="button" class="menu-action-btn edit" data-role-action="edit" data-role-id="${item.id}">Edit</button>
          <button type="button" class="menu-action-btn delete" data-role-action="delete" data-role-id="${item.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function loadRoles() {
  const response = await fetch('/api/roles');
  const data = await response.json();
  roleCrudState.items = Array.isArray(data) ? data : [];
  renderRoleTable(roleCrudState.items);
}

function openRoleForEdit(id) {
  const item = roleCrudState.items.find(role => Number(role.id) === Number(id));
  if (!item) return;

  roleCrudState.editingId = item.id;
  setRoleFormMode(true);

  const roleName = document.getElementById('roleName');
  const roleDescription = document.getElementById('roleDescription');

  if (roleName) roleName.value = item.roleName || '';
  if (roleDescription) roleDescription.value = item.roleDescription || '';

  toggleModal('roleModal', 'roleModalBackdrop', true);
}

async function removeRole(id) {
  if (!window.confirm('Delete this role?')) return;
  const response = await fetch(`/api/roles/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`Delete failed with status ${response.status}`);
  }
  await loadRoles();
}

function setupRoleCrud() {
  const form = document.getElementById('roleForm');
  const body = document.getElementById('rolesTableBody');
  const openButton = document.getElementById('openRoleFormButton');
  const closeButton = document.getElementById('closeRoleFormButton');
  const cancelButton = document.getElementById('cancelRoleFormButton');
  const backdrop = document.getElementById('roleModalBackdrop');

  if (openButton) {
    openButton.addEventListener('click', () => {
      resetRoleForm();
      toggleModal('roleModal', 'roleModalBackdrop', true);
    });
  }

  if (closeButton) closeButton.addEventListener('click', () => toggleModal('roleModal', 'roleModalBackdrop', false));
  if (cancelButton) cancelButton.addEventListener('click', () => toggleModal('roleModal', 'roleModalBackdrop', false));
  if (backdrop) backdrop.addEventListener('click', () => toggleModal('roleModal', 'roleModalBackdrop', false));

  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();

      const payload = {
        roleName: document.getElementById('roleName')?.value?.trim(),
        roleDescription: document.getElementById('roleDescription')?.value?.trim() || ''
      };

      const isEdit = roleCrudState.editingId !== null;
      const url = isEdit ? `/api/roles/${roleCrudState.editingId}` : '/api/roles';
      const method = isEdit ? 'PUT' : 'POST';

      try {
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`Save failed with status ${response.status}`);
        }

        showSaveMessage('roleSaveMessage', isEdit ? 'Role updated successfully.' : 'Role saved successfully.');
        await loadRoles();
        resetRoleForm();
        toggleModal('roleModal', 'roleModalBackdrop', false);
      } catch (error) {
        showSaveMessage('roleSaveMessage', error.message, true);
      }
    });
  }

  if (body) {
    body.addEventListener('click', async event => {
      const button = event.target.closest('[data-role-action]');
      if (!button) return;

      const id = button.getAttribute('data-role-id');
      const action = button.getAttribute('data-role-action');

      try {
        if (action === 'edit') openRoleForEdit(id);
        if (action === 'delete') await removeRole(id);
      } catch (error) {
        showSaveMessage('roleSaveMessage', error.message, true);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  setupRoleCrud();
  setRoleFormMode(false);
  loadRoles().catch(() => renderRoleTable([]));
});
