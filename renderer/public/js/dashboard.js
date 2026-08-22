document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();

  if (document.getElementById('dashboardChart')) {
    fetch(`/api/dashboard/summary/${headerRestaurantId}`)
      .then(res => res.json())
      .then(data => renderDashboard(data))
      .catch(() => renderDashboard({}));
  }
});
