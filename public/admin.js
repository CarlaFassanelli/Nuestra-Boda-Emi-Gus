const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const viewTitles = {
  overview: 'Resumen',
  guests: 'Invitados',
  confirmations: 'Confirmaciones',
  songs: 'Canciones sugeridas'
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function setFeedback(element, message, error = false) {
  element.textContent = message;
  element.classList.toggle('is-error', error);
}

function setGlobalFeedback(message = '', error = false) {
  const element = $('#globalFeedback');
  element.textContent = message;
  element.classList.toggle('is-error', error);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });
  const contentType = response.headers.get('content-type') || '';
  const result = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(result?.error || `La solicitud falló (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return result;
}

function showAuthenticatedApp(email) {
  $('#loginScreen').hidden = true;
  $('#adminApp').hidden = false;
  $('#accountLabel').textContent = email || '';
  refreshOverview();
}

function showLogin() {
  $('#adminApp').hidden = true;
  $('#loginScreen').hidden = false;
}

function setView(name) {
  if (!viewTitles[name]) return;
  $$('.nav-link').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  $$('.view-panel').forEach((panel) => {
    const active = panel.id === `view-${name}`;
    panel.hidden = !active;
    panel.classList.toggle('active', active);
  });
  $('#pageTitle').textContent = viewTitles[name];
  setGlobalFeedback();

  if (name === 'overview') refreshOverview();
  if (name === 'guests') loadGuests();
  if (name === 'confirmations') loadConfirmations();
  if (name === 'songs') loadSongs();
}

function statusPill(status) {
  const stateClass = status === 'Confirmado' ? 'confirmed' : status === 'No asiste' ? 'declined' : '';
  return `<span class="status-pill ${stateClass}">${escapeHtml(status || 'Pendiente')}</span>`;
}

async function refreshOverview() {
  try {
    const data = await request('/api/admin/summary');
    $('#statGroups').textContent = data.grupos_invitados ?? '0';
    $('#statPeople').textContent = data.personas_invitadas ?? '0';
    $('#statConfirmed').textContent = data.personas_confirmadas ?? '0';
    $('#statPending').textContent = data.grupos_pendientes ?? '0';
    $('#statDeclined').textContent = data.grupos_no_asisten ?? '0';
    $('#statSongs').textContent = data.canciones_recibidas ?? '0';
    $('#activityRows').innerHTML = (data.actividad || []).map((item) => `
      <tr>
        <td><strong>${escapeHtml([item.nombre, item.apellido].filter(Boolean).join(' '))}</strong></td>
        <td>${statusPill(item.asistencia)}</td>
        <td>${escapeHtml(item.cantidad_personas ?? '0')}</td>
        <td>${escapeHtml(formatDate(item.fecha_registro))}</td>
      </tr>`).join('');
    $('#activityEmpty').hidden = Boolean(data.actividad?.length);
  } catch (error) {
    handleRequestError(error);
  }
}

async function loadGuests() {
  const params = new URLSearchParams();
  const search = $('#guestSearch').value.trim();
  const status = $('#guestStatus').value;
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  try {
    const data = await request(`/api/admin/guests?${params}`);
    const guests = data.invitados || [];
    $('#guestRows').innerHTML = guests.map((guest) => `
      <tr>
        <td><strong>${escapeHtml(guest.nombre_completo)}</strong>${guest.acompanantes ? `<br><span>${escapeHtml(guest.acompanantes)}</span>` : ''}</td>
        <td>${escapeHtml(guest.cantidad_invitada)}</td>
        <td>${escapeHtml(guest.cantidad_confirmada)}</td>
        <td>${statusPill(guest.estado)}</td>
        <td>${escapeHtml(guest.telefono || '—')}</td>
        <td><div class="table-actions">
          <button type="button" class="small-button" data-action="edit-guest" data-id="${escapeHtml(guest.id)}">Editar</button>
          <button type="button" class="small-button danger" data-action="delete-guest" data-id="${escapeHtml(guest.id)}">Eliminar</button>
        </div></td>
      </tr>`).join('');
    $('#guestsEmpty').hidden = guests.length > 0;
  } catch (error) {
    handleRequestError(error);
  }
}

async function loadConfirmations() {
  const params = new URLSearchParams();
  const search = $('#confirmationSearch').value.trim();
  const status = $('#confirmationStatus').value;
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  try {
    const data = await request(`/api/admin/confirmations?${params}`);
    const confirmations = data.confirmaciones || [];
    $('#confirmationRows').innerHTML = confirmations.map((item) => `
      <tr>
        <td><strong>${escapeHtml([item.nombre, item.apellido].filter(Boolean).join(' '))}</strong>${item.invitado_vinculado ? `<br><span>Invitación: ${escapeHtml(item.invitado_vinculado)}</span>` : '<br><span>Requiere vinculación</span>'}</td>
        <td>${statusPill(item.asistencia)}</td>
        <td>${escapeHtml(item.cantidad_personas)}</td>
        <td>${escapeHtml(item.acompanantes || '—')}</td>
        <td>${escapeHtml(item.telefono || '—')}</td>
        <td>${escapeHtml(item.mensaje || '—')}</td>
        <td>${escapeHtml(formatDate(item.fecha_registro))}</td>
      </tr>`).join('');
    $('#confirmationsEmpty').hidden = confirmations.length > 0;
  } catch (error) {
    handleRequestError(error);
  }
}

async function loadSongs() {
  const params = new URLSearchParams();
  const search = $('#songSearch').value.trim();
  if (search) params.set('search', search);
  try {
    const data = await request(`/api/admin/songs?${params}`);
    const songs = data.canciones || [];
    $('#songRows').innerHTML = songs.map((song) => `
      <tr data-song-id="${escapeHtml(song.id)}">
        <td><strong>${escapeHtml(song.cancion)}</strong><br><span>${escapeHtml(formatDate(song.fecha_registro))}</span></td>
        <td>${escapeHtml(song.artista)}</td>
        <td>${escapeHtml(song.nombre_invitado || '—')}</td>
        <td>${escapeHtml(song.comentario || '—')}</td>
        <td><input type="checkbox" aria-label="Marcar ${escapeHtml(song.cancion)} como favorita" data-song-flag="seleccionada" ${Number(song.seleccionada) ? 'checked' : ''}></td>
        <td><input type="checkbox" aria-label="Marcar ${escapeHtml(song.cancion)} como escuchada" data-song-flag="escuchada" ${Number(song.escuchada) ? 'checked' : ''}></td>
        <td><button type="button" class="small-button danger" data-action="delete-song" data-id="${escapeHtml(song.id)}">Eliminar</button></td>
      </tr>`).join('');
    $('#songsEmpty').hidden = songs.length > 0;
  } catch (error) {
    handleRequestError(error);
  }
}

function handleRequestError(error) {
  if (error.status === 401) {
    showLogin();
    setFeedback($('#loginFeedback'), 'La sesión venció. Volvé a ingresar.', true);
    return;
  }
  setGlobalFeedback(error.message, true);
}

function openGuestDialog(guest = null) {
  const form = $('#guestForm');
  form.reset();
  $('#guestFeedback').textContent = '';
  $('#guestId').value = guest?.id || '';
  $('#guestDialogTitle').textContent = guest ? 'Editar invitado' : 'Agregar invitado';
  $('#guestName').value = guest?.nombre_completo || '';
  $('#guestInvited').value = guest?.cantidad_invitada ?? 1;
  $('#guestConfirmed').value = guest?.cantidad_confirmada ?? 0;
  $('#guestState').value = guest?.estado || 'Pendiente';
  $('#guestPhone').value = guest?.telefono || '';
  $('#guestCompanions').value = guest?.acompanantes || '';
  $('#guestNotes').value = guest?.observaciones || '';
  $('#guestDialog').showModal();
  $('#guestName').focus();
}

async function editGuest(id) {
  try {
    const data = await request('/api/admin/guests');
    const guest = (data.invitados || []).find((item) => item.id === id);
    if (!guest) throw new Error('No se encontró el grupo de invitados seleccionado.');
    openGuestDialog(guest);
  } catch (error) {
    handleRequestError(error);
  }
}

async function deleteGuest(id) {
  if (!window.confirm('¿Eliminar este grupo de invitados? Esta acción no se puede deshacer.')) return;
  try {
    await request(`/api/admin/guests/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setGlobalFeedback('El grupo se eliminó correctamente.');
    await loadGuests();
  } catch (error) {
    handleRequestError(error);
  }
}

async function deleteSong(id) {
  if (!window.confirm('¿Eliminar esta sugerencia de canción?')) return;
  try {
    await request(`/api/admin/songs/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setGlobalFeedback('La canción se eliminó correctamente.');
    await loadSongs();
  } catch (error) {
    handleRequestError(error);
  }
}

async function exportCsv(type) {
  try {
    const response = await fetch(`/api/admin/export?type=${encodeURIComponent(type)}`, { credentials: 'same-origin' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = new Error(payload.error || `No se pudo exportar (HTTP ${response.status}).`);
      error.status = response.status;
      throw error;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${type}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setGlobalFeedback('El archivo CSV se descargó correctamente.');
  } catch (error) {
    handleRequestError(error);
  }
}

$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#loginButton');
  button.disabled = true;
  setFeedback($('#loginFeedback'), '');
  try {
    const result = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: $('#loginEmail').value.trim(),
        password: $('#loginPassword').value
      })
    });
    $('#loginForm').reset();
    showAuthenticatedApp(result.email);
  } catch (error) {
    setFeedback($('#loginFeedback'), error.message, true);
  } finally {
    button.disabled = false;
  }
});

$('#logoutButton').addEventListener('click', async () => {
  try {
    await request('/api/auth/logout', { method: 'POST' });
    showLogin();
    setFeedback($('#loginFeedback'), 'Se cerró la sesión correctamente.');
  } catch (error) {
    handleRequestError(error);
  }
});

document.addEventListener('click', async (event) => {
  const viewButton = event.target.closest('[data-view], [data-go-view]');
  if (viewButton) {
    setView(viewButton.dataset.view || viewButton.dataset.goView);
    return;
  }
  const exportButton = event.target.closest('[data-export]');
  if (exportButton) {
    await exportCsv(exportButton.dataset.export);
    return;
  }
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  if (actionButton.dataset.action === 'edit-guest') await editGuest(actionButton.dataset.id);
  if (actionButton.dataset.action === 'delete-guest') await deleteGuest(actionButton.dataset.id);
  if (actionButton.dataset.action === 'delete-song') await deleteSong(actionButton.dataset.id);
});

$('#guestForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#saveGuestButton');
  button.disabled = true;
  setFeedback($('#guestFeedback'), '');
  const id = $('#guestId').value;
  const body = {
    nombreCompleto: $('#guestName').value.trim(),
    cantidadInvitada: Number($('#guestInvited').value),
    telefono: $('#guestPhone').value.trim(),
    acompanantes: $('#guestCompanions').value.trim(),
    observaciones: $('#guestNotes').value.trim()
  };
  if (id) {
    body.cantidadConfirmada = Number($('#guestConfirmed').value);
    body.estado = $('#guestState').value;
  }
  try {
    await request(id ? `/api/admin/guests/${encodeURIComponent(id)}` : '/api/admin/guests', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(body)
    });
    $('#guestDialog').close();
    setGlobalFeedback(id ? 'Los datos del grupo se actualizaron.' : 'El grupo se agregó correctamente.');
    await loadGuests();
  } catch (error) {
    setFeedback($('#guestFeedback'), error.message, true);
  } finally {
    button.disabled = false;
  }
});

$('#addGuestButton').addEventListener('click', () => openGuestDialog());
$('#closeGuestDialog').addEventListener('click', () => $('#guestDialog').close());
$('#cancelGuestButton').addEventListener('click', () => $('#guestDialog').close());
$('#guestState').addEventListener('change', () => {
  if ($('#guestState').value === 'No asiste') $('#guestConfirmed').value = '0';
  if ($('#guestState').value === 'Confirmado' && Number($('#guestConfirmed').value) < 1) $('#guestConfirmed').value = '1';
});

document.addEventListener('change', async (event) => {
  const checkbox = event.target.closest('[data-song-flag]');
  if (!checkbox) return;
  const row = checkbox.closest('[data-song-id]');
  const checkboxes = $$('[data-song-flag]', row);
  const payload = {
    seleccionada: checkboxes.find((item) => item.dataset.songFlag === 'seleccionada').checked,
    escuchada: checkboxes.find((item) => item.dataset.songFlag === 'escuchada').checked
  };
  checkbox.disabled = true;
  try {
    await request(`/api/admin/songs/${encodeURIComponent(row.dataset.songId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    setGlobalFeedback('La canción se actualizó.');
  } catch (error) {
    checkbox.checked = !checkbox.checked;
    handleRequestError(error);
  } finally {
    checkbox.disabled = false;
  }
});

let searchTimer;
[
  ['#guestSearch', loadGuests],
  ['#confirmationSearch', loadConfirmations],
  ['#songSearch', loadSongs]
].forEach(([selector, load]) => {
  $(selector).addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(load, 250);
  });
});
$('#guestStatus').addEventListener('change', loadGuests);
$('#confirmationStatus').addEventListener('change', loadConfirmations);

async function initialize() {
  try {
    const session = await request('/api/auth/session');
    if (session.authenticated) showAuthenticatedApp(session.email);
    else showLogin();
  } catch (error) {
    showLogin();
    setFeedback($('#loginFeedback'), error.message, true);
  }
}

initialize();
