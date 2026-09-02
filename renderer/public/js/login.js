function showLoginMessage(message, isError = true) {
  const messageEl = document.getElementById('loginMessage');
  if (!messageEl) return;
  messageEl.textContent = message || '';
  messageEl.style.color = isError ? '#b91c1c' : '#166534';
}

document.addEventListener('DOMContentLoaded', async () => {

  const versionElement = document.getElementById('app-version');

  try {
    // Call the securely exposed API from preload.js
    const version = await window.electronAPI.getAppVersion();
    versionElement.innerText = version;
  } catch (error) {
    console.error('Failed to fetch app version:', error);
    versionElement.innerText = 'Unknown';
  }

  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const email = document.getElementById('email')?.value?.trim();
    const password = document.getElementById('password')?.value || '';

    try {
      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || 'Login failed');
      }

      showLoginMessage('Login successful.', false);
      window.location.href = data.redirectTo || '/dashboard';
    } catch (error) {
      showLoginMessage(error.message || 'Login failed');
    }
  });
});
