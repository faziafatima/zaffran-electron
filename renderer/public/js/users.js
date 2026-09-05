const userCrudState = {
  items: [],
  editingId: null
};

function setUserFormMode(isEdit) {
  const title = document.getElementById('userModalTitle');
  const submitButton = document.querySelector('#userForm button[type="submit"]');
  const passwordInput = document.getElementById('userPassword');

  if (title) title.textContent = isEdit ? 'Edit user' : 'Add user';
  if (submitButton) submitButton.textContent = isEdit ? 'Update User' : 'Save User';
  if (passwordInput) {
    passwordInput.required = !isEdit;
    passwordInput.placeholder = isEdit ? 'Leave blank to keep existing password' : 'Set password';
  }
}

function resetUserForm() {
  const form = document.getElementById('userForm');
  if (form) form.reset();
  userCrudState.editingId = null;
  setUserFormMode(false);
  showSaveMessage('userSaveMessage', '');
}

function renderUserTable(items) {
  const body = document.getElementById('usersTableBody');
  if (!body) return;

  if (!items.length) {
    body.innerHTML = '<tr><td colspan="4" class="empty-state">No users available.</td></tr>';
    return;
  }

  body.innerHTML = items.map(item => `
    <tr>
      <td>${item.name || 'Unnamed user'}</td>
      <td>${item.email || '-'}</td>
      <td>${item.role?.roleName || 'No role'}</td>
      <td>${item.restaurant?.name || 'No restaurant'}</td>
      <td>
        <div class="menu-actions">
          <button type="button" class="menu-action-btn edit" data-user-action="edit" data-user-id="${item.id}">Edit</button>
          <button type="button" class="menu-action-btn delete" data-user-action="delete" data-user-id="${item.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function loadUsers() {
  const response = await fetch('/api/users');
  const data = await response.json();
  userCrudState.items = Array.isArray(data) ? data : [];
  renderUserTable(userCrudState.items);
}

async function loadUsersMeta() {
  const response = await fetch('/api/users/meta');
  const meta = await response.json();
  fillSelect('userRoleId', meta.roles || []);
  fillSelect('userRestaurantId', meta.restaurant || []);
}

function openUserForEdit(id) {
  const item = userCrudState.items.find(user => Number(user.id) === Number(id));
  if (!item) return;

  userCrudState.editingId = item.id;
  setUserFormMode(true);

  const name = document.getElementById('userName');
  const email = document.getElementById('userEmail');
  const role = document.getElementById('userRoleId');
  const restaurant = document.getElementById('userRestaurantId');
  const password = document.getElementById('userPassword');

  if (name) name.value = item.name || '';
  if (email) email.value = item.email || '';
  if (role && item.role?.id) role.value = item.role.id;
  if (restaurant) restaurant.value = item.restaurant?.id || '';
  if (password) password.value = '';

  toggleModal('userModal', 'userModalBackdrop', true);
}

async function removeUser(id) {
  if (!window.confirm('Delete this user?')) return;
  const response = await fetch(`/api/users/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`Delete failed with status ${response.status}`);
  }
  await loadUsers();
}

function setupUserCrud() {
  const form = document.getElementById('userForm');
  const body = document.getElementById('usersTableBody');
  const openButton = document.getElementById('openUserFormButton');
  const closeButton = document.getElementById('closeUserFormButton');
  const cancelButton = document.getElementById('cancelUserFormButton');
  const backdrop = document.getElementById('userModalBackdrop');

  if (openButton) {
    openButton.addEventListener('click', () => {
      resetUserForm();
      toggleModal('userModal', 'userModalBackdrop', true);
    });
  }

  if (closeButton) closeButton.addEventListener('click', () => toggleModal('userModal', 'userModalBackdrop', false));
  if (cancelButton) cancelButton.addEventListener('click', () => toggleModal('userModal', 'userModalBackdrop', false));
  if (backdrop) backdrop.addEventListener('click', () => toggleModal('userModal', 'userModalBackdrop', false));

  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();

      const payload = {
        name: document.getElementById('userName')?.value?.trim(),
        email: `${document.getElementById('userEmail')?.value?.trim()}@thezaffran.in`,
        roleId: Number(document.getElementById('userRoleId')?.value || 0),
        restaurantId: document.getElementById('userRestaurantId')?.value?.trim()
      };

      const passwordValue = document.getElementById('userPassword')?.value || '';
      if (passwordValue.trim()) payload.password = passwordValue;

      const isEdit = userCrudState.editingId !== null;
      const url = isEdit ? `/api/users/${userCrudState.editingId}` : '/api/users';
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

        showSaveMessage('userSaveMessage', isEdit ? 'User updated successfully.' : 'User saved successfully.');
        await loadUsers();
        resetUserForm();
        toggleModal('userModal', 'userModalBackdrop', false);
      } catch (error) {
        showSaveMessage('userSaveMessage', error.message, true);
      }
    });
  }

  if (body) {
    body.addEventListener('click', async event => {
      const button = event.target.closest('[data-user-action]');
      if (!button) return;

      const id = button.getAttribute('data-user-id');
      const action = button.getAttribute('data-user-action');

      try {
        if (action === 'edit') openUserForEdit(id);
        if (action === 'delete') await removeUser(id);
      } catch (error) {
        showSaveMessage('userSaveMessage', error.message, true);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  setUserFormMode(false);
  setupUserCrud();

  Promise.all([loadUsersMeta(), loadUsers()]).catch(() => {
    renderUserTable([]);
    showSaveMessage('userSaveMessage', 'Unable to load users metadata.', true);
  });
});
