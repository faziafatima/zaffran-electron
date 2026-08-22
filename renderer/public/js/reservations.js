document.addEventListener('DOMContentLoaded', () => {
  bindCommonChrome();
  setupReservationSave();

  if (document.getElementById('reservationList')) {
    fetch('/api/reservations')
      .then(res => res.json())
      .then(data => renderReservations(data))
      .catch(() => renderReservations([]));
  }
});
