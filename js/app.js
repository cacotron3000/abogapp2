const STORAGE_KEY = 'gestion_juridica_etapa1_v1';

const initialState = {
  session: null,
  users: [
    { id: crypto.randomUUID(), nombre: 'Administrador', correo: 'admin@gjabogados.cl', rol: 'Administrador', activo: true, password: 'admin123' },
    { id: crypto.randomUUID(), nombre: 'Abogado 1', correo: 'abogado1@gjabogados.cl', rol: 'Abogado', activo: true, password: 'demo123' },
    { id: crypto.randomUUID(), nombre: 'Abogado 2', correo: 'abogado2@gjabogados.cl', rol: 'Abogado', activo: true, password: 'demo123' }
  ],
  clientes: [], asuntos: [], causas: [], tareas: [], plazos: [], cotizaciones: [], logs: [], templates: { asuntos: [], tareas: [], plazos: [] }
};

let state = loadState();
normalizeState();

function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw){ localStorage.setItem(STORAGE_KEY, JSON.stringify(initialState)); return structuredClone(initialState); }
  try { return JSON.parse(raw); } catch { return structuredClone(initialState); }
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
let syncMessageTimer = null;
let autoSyncTimer = null;
let isPullingFromDb = false;
let isPushingToDb = false;
const AUTO_SYNC_DELAY_MS = 900;
const wizardState = { enabled: false, clienteId: '', asuntoId: '' };
function showSyncMessage(message, isError = false){
  clearTimeout(syncMessageTimer);
  const status = $('#syncStatus');
  if(!status) return;
  const prev = status.dataset.prevText || status.textContent;
  status.dataset.prevText = prev;
  status.textContent = `Sincronización: ${message}`;
  status.style.color = isError ? '#f04438' : '#53b1fd';
  syncMessageTimer = setTimeout(() => {
    status.textContent = status.dataset.prevText || status.textContent;
    status.style.color = '';
  }, 3500);
}
async function apiSync(action, payload = {}){
  const res = await fetch('backend/sync.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await res.json().catch(()=>({ ok:false, error:'Respuesta inválida del servidor' }));
  if(!res.ok || !data.ok) throw new Error(data.error || `Error HTTP ${res.status}`);
  return data;
}
async function apiNotify(action, payload = {}){
  const res = await fetch('backend/notify.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await res.json().catch(()=>({ ok:false, error:'Respuesta inválida del servidor de correo' }));
  if(!res.ok || !data.ok) throw new Error(data.error || `Error HTTP ${res.status}`);
  return data;
}
async function pullFromCpanelDb(){
  if(isPullingFromDb) return;
  isPullingFromDb = true;
  try{
    const data = await apiSync('pull');
    if(!data.state){ showSyncMessage('No hay datos guardados aún en DB cPanel.'); return; }
    const currentSession = state.session;
    state = data.state;
    if(currentSession) state.session = currentSession;
    normalizeState();
    applyRolePermissions();
    renderAll();
    showSyncMessage('Datos leídos desde cPanel correctamente.');
  }catch(err){
    console.error(err);
    alert(`No fue posible leer la base de datos: ${err.message}`);
    showSyncMessage('Error al leer desde DB cPanel.', true);
  }finally{
    isPullingFromDb = false;
  }
}
async function pushToCpanelDb(){
  if(isPushingToDb || isPullingFromDb) return;
  isPushingToDb = true;
  try{
    await apiSync('push', { state });
    showSyncMessage('Datos escritos en DB cPanel correctamente.');
  }catch(err){
    console.error(err);
    alert(`No fue posible escribir en la base de datos: ${err.message}`);
    showSyncMessage('Error al escribir en DB cPanel.', true);
  }finally{
    isPushingToDb = false;
  }
}
function queueAutoPushToCpanel(){
  clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => { pushToCpanelDb(); }, AUTO_SYNC_DELAY_MS);
}
function normalizeState(){
  state.cotizaciones = (state.cotizaciones || []).map(c => ({ ...c, numero: Number(c.numero) || 0 }));
  state.clientes = (state.clientes || []).sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''), 'es', { sensitivity:'base' }));
  state.asuntos = (state.asuntos || []).map(a => ({ ...a, responsableIds: asArray(a.responsableIds || a.responsableId), archivado: a.archivado || a.estado === 'Archivado' || a.estado === 'Terminado' }));
  state.tareas = (state.tareas || []).map(t => ({ ...t, responsableIds: asArray(t.responsableIds || t.responsableId), archivada: t.archivada || t.estado === 'Terminada' }));
  state.causas = (state.causas || []).map(c => ({ ...c, archivada: c.archivada || c.estadoProcesal === 'Archivada' || c.estadoProcesal === 'Terminada' || c.estadoProcesal === 'Cumplida' }));
  state.plazos = (state.plazos || []).map(p => ({ ...p, tipoDias: p.tipoDias || 'Judiciales', responsableIds: asArray(p.responsableIds || p.responsableId), archivado: p.archivado || p.estado === 'Cumplido' || p.estado === 'Archivado' }));
  state.sugerencias = state.sugerencias || { asuntoNombres: [], asuntoMaterias: [] };
  state.templates = state.templates || { asuntos: [], tareas: [], plazos: [] };
  state.formDrafts = state.formDrafts || {};
  saveState();
}
const $ = s => document.querySelector(s);
const safe = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const $$ = s => Array.from(document.querySelectorAll(s));
const todayISO = () => new Date().toISOString().slice(0,10);
function fmtDate(date){ if(!date) return 'Sin fecha'; return new Date(`${date}T00:00:00`).toLocaleDateString('es-CL'); }
function daysUntil(date){ if(!date) return null; const a = new Date(`${todayISO()}T00:00:00`); const b = new Date(`${date}T00:00:00`); return Math.ceil((b-a)/86400000); }
function tomorrowISO(){ const d = new Date(`${todayISO()}T00:00:00`); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); }
function sortByVencimiento(a,b){ return (a.vencimiento || '9999-12-31').localeCompare(b.vencimiento || '9999-12-31'); }
function asArray(value){ if(Array.isArray(value)) return value; return value ? [value] : []; }
function getResponsableNames(item){ const ids = asArray(item.responsableIds || item.responsableId).filter(Boolean); return ids.map(id => getUser(id)?.nombre).filter(Boolean).join(', ') || 'Sin responsable'; }
function getSelectedValues(selector){ const el = $(selector); return el ? Array.from(el.selectedOptions).map(o=>o.value).filter(Boolean) : []; }
function getCliente(id){ return state.clientes.find(x=>x.id===id); }
function getAsunto(id){ return state.asuntos.find(x=>x.id===id); }
function getCausaByAsuntoId(asuntoId){ return state.causas.find(c => c.asuntoId === asuntoId); }
function asuntoDisplayName(asunto){
  if(!asunto) return 'Sin asunto';
  const causa = getCausaByAsuntoId(asunto.id);
  const idCausa = causa?.rol || causa?.rit || '';
  return idCausa ? `${asunto.nombre} (${idCausa})` : (asunto.nombre || 'Sin asunto');
}
function asuntoActivo(id){ const a = getAsunto(id); return !a || (!a.archivado && !['Archivado','Terminado'].includes(a.estado)); }
function causaActiva(c){ return c && !c.archivada && !['Archivada','Terminada','Cumplida'].includes(c.estadoProcesal); }
function plazoActivo(p){ return p && !p.archivado && !['Cumplido','Archivado'].includes(p.estado); }
function getUser(id){ return state.users.find(x=>x.id===id); }
function badgeClass(value){ return ['Urgente','Alta','Vencido','Atrasada'].includes(value)?'danger':['Media','En espera','Suspendido'].includes(value)?'warn':'ok'; }

function log(action){ state.logs.unshift({ id: crypto.randomUUID(), action, at: new Date().toISOString(), user: state.session?.correo || 'sistema' }); state.logs = state.logs.slice(0,80); saveState(); }

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#loginEmail').value.trim().toLowerCase();
  const pass = $('#loginPassword').value;
  let user = state.users.find(u => u.correo.toLowerCase() === email && u.password === pass && u.activo);
  if(!user){
    try{
      const auth = await apiSync('verify_login', { email, password: pass });
      if(auth?.user){
        user = auth.user;
        const ix = state.users.findIndex(u => u.id === user.id);
        if(ix >= 0) state.users[ix] = { ...state.users[ix], ...user, password: pass };
        else state.users.push({ ...user, password: pass });
      }
    }catch(_e){ /* noop */ }
  }
  if(!user && email === 'admin@gjabogados.cl' && pass === 'admin123'){
    user = state.users.find(u => String(u.correo || '').toLowerCase() === email) || { id: crypto.randomUUID(), nombre:'Administrador', correo:'admin@gjabogados.cl', rol:'Administrador', activo:true, password:'admin123' };
    user.activo = true;
    user.password = 'admin123';
    if(!state.users.some(u => u.id === user.id)) state.users.push(user);
  }
  if(!user) return alert('Credenciales incorrectas o usuario inactivo.');
  user.ultimoIngreso = new Date().toISOString();
  state.session = { id: user.id, nombre: user.nombre, correo: user.correo, rol: user.rol };
  saveState();
  showApp();
});
$('#logoutBtn').addEventListener('click', () => { state.session = null; saveState(); location.reload(); });
$('#syncPullBtn')?.addEventListener('click', pullFromCpanelDb);
$('#syncPushBtn')?.addEventListener('click', pushToCpanelDb);
$('#sidebarUserName')?.addEventListener('click', openProfileModal);
$('#quickWizardBtn')?.addEventListener('click', startQuickWizard);

function updateSidebarUserName(){
  const el = $('#sidebarUserName');
  if(el) el.textContent = state.session?.nombre || state.session?.correo || 'Usuario';
  const photo = $('#sidebarUserPhoto');
  const u = currentUser();
  if(photo){
    if(u?.fotoPerfil){ photo.src = u.fotoPerfil; photo.classList.remove('hidden'); }
    else { photo.removeAttribute('src'); photo.classList.add('hidden'); }
  }
}
function currentUser(){ return state.users.find(u => u.id === state.session?.id); }
function resizeProfileImage(dataUrl, maxSize = 512){
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * ratio));
      const h = Math.max(1, Math.round(img.height * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
function openProfileModal(){
  const u = currentUser();
  if(!u) return;
  openModal('perfilModal');
  setField('#perfilNombre', u.nombre);
  setField('#perfilCorreo', u.correo);
  setField('#perfilRol', u.rol);
  setField('#perfilPassword', '');
  setField('#perfilPassword2', '');
  const preview = $('#perfilFotoPreview');
  const uploadBtn = $('#perfilFotoBtn');
  $('#perfilFotoMenu')?.classList.add('hidden');
  if(preview){
    if(u.fotoPerfil){ preview.src = u.fotoPerfil; preview.style.display='block'; if(uploadBtn) uploadBtn.classList.add('hidden'); }
    else { preview.style.display='none'; preview.removeAttribute('src'); if(uploadBtn) uploadBtn.classList.remove('hidden'); }
  }
  const activas = state.asuntos.filter(a => !a.archivado && (a.responsableIds||[]).includes(u.id)).length;
  const tareasPendientes = state.tareas.filter(t => !t.archivada && t.estado !== 'Terminada' && (t.responsableIds||[]).includes(u.id)).length;
  const plazosProximos = state.plazos.filter(p => !p.archivado && daysUntil(p.vencimiento) !== null && daysUntil(p.vencimiento) <= 7 && (p.responsableIds||[]).includes(u.id)).length;
  $('#perfilStats').innerHTML = `Asuntos activos: <strong>${activas}</strong> · Tareas pendientes: <strong>${tareasPendientes}</strong> · Plazos próximos (7 días): <strong>${plazosProximos}</strong><br>Último ingreso: <strong>${u.ultimoIngreso ? new Date(u.ultimoIngreso).toLocaleString('es-CL') : 'Sin registro'}</strong>`;
}
$('#perfilFotoBtn')?.addEventListener('click', () => $('#perfilFoto')?.click());
$('#perfilFoto')?.addEventListener('change', e => {
  const file = e.target.files?.[0];
  if(!file) return;
  $('#perfilFotoLoading')?.classList.remove('hidden');
  const reader = new FileReader();
  reader.onload = async () => {
    const processed = await resizeProfileImage(String(reader.result || ''));
    const preview = $('#perfilFotoPreview');
    if(preview){ preview.src = processed; preview.style.display='block'; }
    $('#perfilFotoBtn')?.classList.add('hidden');
    $('#perfilFotoLoading')?.classList.add('hidden');
  };
  reader.onerror = () => {
    $('#perfilFotoLoading')?.classList.add('hidden');
    alert('No se pudo cargar la imagen.');
  };
  reader.readAsDataURL(file);
});
$('#perfilFotoPreview')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if(!$('#perfilFotoPreview')?.src) return;
  $('#perfilFotoMenu')?.classList.toggle('hidden');
});
$('#perfilCambiarFotoBtn')?.addEventListener('click', () => $('#perfilFoto')?.click());
$('#perfilEliminarFotoBtn')?.addEventListener('click', () => {
  const preview = $('#perfilFotoPreview');
  if(preview){ preview.removeAttribute('src'); preview.style.display='none'; }
  const fileInput = $('#perfilFoto');
  if(fileInput) fileInput.value = '';
  $('#perfilFotoBtn')?.classList.remove('hidden');
  $('#perfilFotoMenu')?.classList.add('hidden');
});
function handleProfileSave(){
  try{
    let u = currentUser();
    if(!u && state.session){
      u = { id: state.session.id, nombre: state.session.nombre, correo: state.session.correo, rol: state.session.rol, activo: true, password: '' };
    }
    if(!u){ alert('No se pudo identificar el usuario actual.'); return false; }
    const p1 = $('#perfilPassword').value;
    const p2 = $('#perfilPassword2').value;
    if((p1 || p2) && p1 !== p2){ alert('Las contraseñas no coinciden.'); return false; }
    const previewSrc = $('#perfilFotoPreview')?.getAttribute('src') || u.fotoPerfil || '';
    upsert('users', { id: u.id, nombre: $('#perfilNombre').value, correo: $('#perfilCorreo').value, rol: u.rol, activo: u.activo, password: p1 || u.password || '', fotoPerfil: previewSrc, ultimoIngreso: u.ultimoIngreso || null });
    state.session.nombre = $('#perfilNombre').value;
    state.session.correo = $('#perfilCorreo').value;
    updateSidebarUserName();
    clearModalDraft('perfilModal');
    closeModals();
    return true;
  }catch(err){
    console.error(err);
    alert('No se pudo guardar el perfil. Revise los datos e intente nuevamente.');
    return false;
  }
}
$('#perfilForm')?.addEventListener('submit', e => { e.preventDefault(); handleProfileSave(); });
$('#perfilGuardarBtn')?.addEventListener('click', (e) => {
  e.preventDefault();
  handleProfileSave();
});
function isAdminSession(){
  const rol = String(state.session?.rol || '').toLowerCase();
  return rol === 'administrador' || rol === 'admin';
}
function applyRolePermissions(){
  const canManageUsers = isAdminSession();
  const userNavBtn = document.querySelector('.nav-item[data-view="usuarios"]');
  if(userNavBtn) userNavBtn.classList.toggle('hidden', !canManageUsers);
  if(!canManageUsers && document.querySelector('.nav-item.active')?.dataset?.view === 'usuarios'){
    switchView('dashboard');
  }
}

function showApp(){
  $('#loginScreen').classList.add('hidden');
  $('#appShell').classList.remove('hidden');
  updateSidebarUserName();
  applyRolePermissions();
  renderAll();
  pullFromCpanelDb();
}
if(state.session) showApp();

$$('.nav-item').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
function switchView(view){
  if(view === 'usuarios' && !isAdminSession()){
    showSyncMessage('Acceso restringido: solo administradores.');
    view = 'dashboard';
  }
  $$('.nav-item').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
  $$('.view').forEach(v=>v.classList.remove('active-view'));
  $(`#${view}View`).classList.add('active-view');
  const titles = {
    dashboard:['Dashboard','Resumen operativo del estudio'], clientes:['Clientes','Base de clientes y potenciales clientes'], asuntos:['Asuntos','Gestión judicial y extrajudicial'], causas:['Causas judiciales','Control de RIT, ROL, tribunal y estado'], tareas:['Tareas','Trabajo pendiente por responsable'], plazos:['Plazos','Vencimientos y alertas'], archivo:['Archivo','Registros completados y archivados por categoría'], utilidades:['Utilidades','Sincronización con cPanel e intercambio JSON'], usuarios:['Usuarios','Equipo interno del estudio']
  };
  $('#viewTitle').textContent = titles[view][0]; $('#viewSubtitle').textContent = titles[view][1];
  renderAll();
  pullFromCpanelDb();
}

$$('[data-open-modal]').forEach(btn => btn.addEventListener('click', () => openModal(btn.dataset.openModal)));
$$('.close-modal').forEach(btn => btn.addEventListener('click', closeModals));
document.addEventListener('click', e => { if(e.target.classList?.contains('close-modal')) closeModals(); });
$('#modalBackdrop').addEventListener('click', closeModals);
function openModal(id){
  resetForms(id); hydrateSelects();
  const modalTitles = { clienteModal:'Nuevo cliente', asuntoModal:'Nuevo asunto', causaModal:'Nueva causa judicial', tareaModal:'Nueva tarea', plazoModal:'Nuevo plazo', usuarioModal:'Nuevo usuario' };
  if(modalTitles[id]) setModalTitle(id, modalTitles[id]);
  if(id === 'plazoModal'){ setField('#plazoInicio', tomorrowISO()); setField('#plazoTipo', 'Judiciales'); }
  if(id === 'asuntoModal'){ setField('#asuntoTipo', 'Judicial'); toggleAsuntoJudicialFields(); }
  if(id === 'causaModal'){
    const box = $('#causaAudienciasContainer');
    if(box) box.innerHTML = '';
    addAudienciaRow();
  }
  if(id === 'usuarioModal'){
    const passInput = $('#usuarioPassword');
    if(passInput){
      passInput.required = true;
      passInput.placeholder = '';
    }
  }
  restoreModalDraft(id);
  refreshAsuntoSugerencias();
  $('#modalBackdrop').classList.remove('hidden'); $(`#${id}`).showModal();
}
function closeModals(){ $$('.modal').forEach(m=>m.close()); $('#modalBackdrop').classList.add('hidden'); }
function draftFormSelector(modalId){ return `#${modalId} input, #${modalId} select, #${modalId} textarea`; }
function captureModalDraft(modalId){
  state.formDrafts = state.formDrafts || {};
  const data = {};
  $$(`${draftFormSelector(modalId)}`).forEach(el => {
    if(!el.id) return;
    if(el.type === 'hidden') return;
    data[el.id] = el.multiple ? Array.from(el.selectedOptions).map(o=>o.value) : el.value;
  });
  state.formDrafts[modalId] = data;
  saveState();
}
function restoreModalDraft(modalId){
  const draft = state.formDrafts?.[modalId];
  if(!draft) return;
  Object.entries(draft).forEach(([id,val]) => setField(`#${id}`, val));
}
function clearModalDraft(modalId){
  if(state.formDrafts?.[modalId]){
    delete state.formDrafts[modalId];
    saveState();
  }
}
function refreshAsuntoSugerencias(){
  const nombres = Array.from(new Set([...(state.sugerencias?.asuntoNombres || []), ...state.asuntos.map(a=>a.nombre).filter(Boolean)])).slice(0,200);
  const materias = Array.from(new Set([...(state.sugerencias?.asuntoMaterias || []), ...state.asuntos.map(a=>a.materia).filter(Boolean)])).slice(0,200);
  const nombreList = $('#asuntoNombreSugerencias');
  const materiaList = $('#asuntoMateriaSugerencias');
  if(nombreList) nombreList.innerHTML = nombres.map(v=>`<option value="${safe(v)}"></option>`).join('');
  if(materiaList) materiaList.innerHTML = materias.map(v=>`<option value="${safe(v)}"></option>`).join('');
}

$$('.modal').forEach(m => {
  m.addEventListener('click', e => {
    // Cierra solamente cuando el click cae directamente en el backdrop nativo del dialog.
    // Esto evita que botones internos como "Editar información" cierren el modal recién abierto.
    if(e.target === m) closeModals();
  });
});
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeModals(); });

function resetForms(id){ const form = $(`#${id} form`); if(form) form.reset(); const hidden = $(`#${id} input[type="hidden"]`); if(hidden){ hidden.value = ''; hidden.removeAttribute('value'); } }

function buildOptions(items, getLabel, emptyLabel, includeAll = false){
  const all = includeAll ? '<option value="">Todos los clientes</option>' : '';
  const opts = items.map(item => `<option value="${item.id}">${safe(getLabel(item))}</option>`).join('');
  return all + (opts || (!includeAll ? `<option value="">${safe(emptyLabel)}</option>` : ''));
}
function activeAsuntosForSelect({ clienteId = '', judicialOnly = false } = {}){
  return state.asuntos
    .filter(a => !a.archivado && !['Archivado','Terminado'].includes(a.estado))
    .filter(a => !judicialOnly || a.tipo === 'Judicial')
    .filter(a => !clienteId || String(a.clienteId) === String(clienteId));
}
function hydrateSelects(){
  const clientes = [...(state.clientes || [])].sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''), 'es', { sensitivity:'base' }));
  const usuarios = (state.users || []).filter(u=>u.activo);
  const clientOpts = buildOptions(clientes, c=>c.nombre, 'Cree un cliente primero');
  const clientFilterOpts = buildOptions(clientes, c=>c.nombre, '', true);
  const userOpts = buildOptions(usuarios, u=>u.nombre, 'Cree un usuario primero');

  ['#asuntoCliente'].forEach(sel=>{ if($(sel)) $(sel).innerHTML = clientOpts; });
  ['#causaClienteFiltro','#tareaClienteFiltro','#plazoClienteFiltro'].forEach(sel=>{ if($(sel)) $(sel).innerHTML = clientFilterOpts; });
  ['#asuntoResponsable','#tareaResponsable','#plazoResponsable'].forEach(sel=>{ if($(sel)) $(sel).innerHTML = userOpts; });

  hydrateAsuntoSelectsByCliente();
  enhanceSearchableSelects();
}
function hydrateAsuntoSelectsByCliente(){
  const tareaCliente = $('#tareaClienteFiltro')?.value || '';
  const plazoCliente = $('#plazoClienteFiltro')?.value || '';
  const causaCliente = $('#causaClienteFiltro')?.value || '';

  const tareaAsuntos = activeAsuntosForSelect({ clienteId: tareaCliente });
  const plazoAsuntos = activeAsuntosForSelect({ clienteId: plazoCliente });
  const causaAsuntos = activeAsuntosForSelect({ clienteId: causaCliente, judicialOnly: true });

  if($('#tareaAsunto')) $('#tareaAsunto').innerHTML = buildOptions(tareaAsuntos, a=>`${asuntoDisplayName(a)} · ${getCliente(a.clienteId)?.nombre || 'Sin cliente'}`, 'Cree un asunto primero');
  if($('#plazoAsunto')) $('#plazoAsunto').innerHTML = buildOptions(plazoAsuntos, a=>`${asuntoDisplayName(a)} · ${getCliente(a.clienteId)?.nombre || 'Sin cliente'}`, 'Cree un asunto primero');
  if($('#causaAsunto')) $('#causaAsunto').innerHTML = buildOptions(causaAsuntos, a=>`${asuntoDisplayName(a)} · ${getCliente(a.clienteId)?.nombre || 'Sin cliente'}`, 'Cree un asunto judicial primero');

  refreshSearchableSelects();
}

function enhanceSearchableSelects(){
  $$('select').forEach(select => {
    if(select.dataset.searchReady === 'true') { refreshOneSearchableSelect(select); return; }
    select.dataset.searchReady = 'true';
    select.classList.add('ss-native');

    const wrapper = document.createElement('div');
    wrapper.className = 'searchable-select';
    wrapper.dataset.for = select.id || '';
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'ss-control';
    const dropdown = document.createElement('div');
    dropdown.className = 'ss-dropdown';
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'ss-search';
    search.placeholder = 'Buscar...';
    const optionsBox = document.createElement('div');
    optionsBox.className = 'ss-options';

    dropdown.append(search, optionsBox);
    wrapper.append(control, dropdown);
    select.parentNode.insertBefore(wrapper, select.nextSibling);

    control.addEventListener('click', e => {
      e.preventDefault();
      $$('.searchable-select.open').forEach(w => { if(w !== wrapper) w.classList.remove('open'); });
      wrapper.classList.toggle('open');
      search.value = '';
      renderSearchableOptions(select, wrapper);
      if(wrapper.classList.contains('open')) setTimeout(()=>search.focus(), 0);
    });
    search.addEventListener('input', () => renderSearchableOptions(select, wrapper));
    select.addEventListener('change', () => refreshOneSearchableSelect(select));
    refreshOneSearchableSelect(select);
  });
}
function refreshSearchableSelects(){ $$('select').forEach(refreshOneSearchableSelect); }
function refreshOneSearchableSelect(select){
  if(!select) return;
  const wrapper = select.nextElementSibling?.classList?.contains('searchable-select') ? select.nextElementSibling : null;
  if(!wrapper) return;
  const control = wrapper.querySelector('.ss-control');
  const selected = Array.from(select.selectedOptions).map(o=>o.textContent).filter(Boolean);
  control.textContent = selected.length ? selected.join(', ') : 'Seleccionar';
  renderSearchableOptions(select, wrapper);
}
function renderSearchableOptions(select, wrapper){
  const q = (wrapper.querySelector('.ss-search')?.value || '').toLowerCase().trim();
  const optionsBox = wrapper.querySelector('.ss-options');
  const opts = Array.from(select.options).filter(opt => opt.textContent.toLowerCase().includes(q));
  optionsBox.innerHTML = opts.map(opt => `<button type="button" class="ss-option ${opt.selected ? 'active' : ''}" data-value="${safe(opt.value)}">${safe(opt.textContent)}</button>`).join('') || '<div class="ss-empty">Sin resultados</div>';
}
document.addEventListener('click', e => {
  const opt = e.target.closest?.('.ss-option');
  if(opt){
    const wrapper = opt.closest('.searchable-select');
    const select = wrapper?.previousElementSibling;
    if(select){
      if(select.multiple){ const option = Array.from(select.options).find(o=>o.value === opt.dataset.value); if(option) option.selected = !option.selected; }
      else { select.value = opt.dataset.value; wrapper.classList.remove('open'); }
      select.dispatchEvent(new Event('change', { bubbles:true }));
      refreshOneSearchableSelect(select);
    }
    return;
  }
  if(!e.target.closest?.('.searchable-select')){
    $$('.searchable-select.open').forEach(w => w.classList.remove('open'));
  }
});
document.addEventListener('change', e => {
  if(['causaClienteFiltro','tareaClienteFiltro','plazoClienteFiltro'].includes(e.target.id)){
    hydrateAsuntoSelectsByCliente();
  }
  if(e.target.id === 'asuntoTipo'){
    toggleAsuntoJudicialFields();
  }
  if(e.target.classList?.contains('audiencia-tipo')){
    const wrap = e.target.closest('.audiencia-row')?.querySelector('.audiencia-otro-wrap');
    if(wrap) wrap.classList.toggle('hidden', e.target.value !== 'Otro');
  }
});
document.addEventListener('input', e => {
  const modal = e.target.closest?.('.modal');
  if(modal?.id) captureModalDraft(modal.id);
});
$('#addAudienciaBtn')?.addEventListener('click', () => addAudienciaRow());
document.addEventListener('click', e => {
  if(e.target.classList?.contains('remove-audiencia')){
    const row = e.target.closest('.audiencia-row');
    row?.remove();
    if(!$$('#causaAudienciasContainer .audiencia-row').length) addAudienciaRow();
  }
});
function toggleAsuntoJudicialFields(){
  const isJudicial = ($('#asuntoTipo')?.value || '') === 'Judicial';
  $$('.judicial-only').forEach(el => el.classList.toggle('hidden', !isJudicial));
  const tribunal = $('#asuntoCausaTribunal');
  if(tribunal) tribunal.required = isJudicial;
}
function audienciaTypeOptions(selected=''){
  const opts = ['Preparatoria','Juicio','Única','Otro'];
  return opts.map(o=>`<option value="${o}" ${selected===o?'selected':''}>${o}</option>`).join('');
}
function addAudienciaRow(values = {}){
  const row = document.createElement('div');
  row.className = 'audiencia-row';
  row.innerHTML = `
    <label>Tipo<select class="audiencia-tipo">${audienciaTypeOptions(values.tipo || 'Preparatoria')}</select></label>
    <label class="audiencia-otro-wrap ${values.tipo === 'Otro' ? '' : 'hidden'}">Otro<input class="audiencia-otro" value="${safe(values.otro || '')}" /></label>
    <label>Fecha<input class="audiencia-fecha" type="date" value="${safe(values.fecha || '')}" /></label>
    <label>Hora<input class="audiencia-hora" type="time" value="${safe(values.hora || '')}" /></label>
    <button type="button" class="mini-btn danger remove-audiencia">Quitar</button>
  `;
  $('#causaAudienciasContainer')?.appendChild(row);
}
function getCausaAudienciasFromForm(){
  return $$('#causaAudienciasContainer .audiencia-row').map(row => {
    const tipo = row.querySelector('.audiencia-tipo')?.value || 'Preparatoria';
    return {
      id: crypto.randomUUID(),
      tipo,
      otro: tipo === 'Otro' ? (row.querySelector('.audiencia-otro')?.value || '') : '',
      fecha: row.querySelector('.audiencia-fecha')?.value || '',
      hora: row.querySelector('.audiencia-hora')?.value || ''
    };
  }).filter(a => a.fecha || a.hora || a.otro);
}
function nextAudiencia(causa){
  const list = Array.isArray(causa.audiencias) ? causa.audiencias : [];
  return list
    .filter(a => a?.fecha)
    .sort((a,b)=>(`${a.fecha}T${a.hora||'00:00'}`).localeCompare(`${b.fecha}T${b.hora||'00:00'}`))[0] || null;
}


const cotizacionForm = $('#cotizacionForm');
if(cotizacionForm) cotizacionForm.addEventListener('submit', e => { e.preventDefault(); guardarCotizacion(); });

$('#clienteForm').addEventListener('submit', e=>{ e.preventDefault(); upsert('clientes', { id: $('#clienteId').value || crypto.randomUUID(), tipo: $('#clienteTipo').value, nombre: $('#clienteNombre').value, rut: $('#clienteRut').value, correo: $('#clienteCorreo').value, telefono: $('#clienteTelefono').value, comuna: $('#clienteComuna').value, region: $('#clienteRegion').value, estado: $('#clienteEstado').value, observaciones: $('#clienteObs').value, createdAt: new Date().toISOString() }); clearModalDraft('clienteModal'); closeModals(); });
$('#asuntoForm').addEventListener('submit', e=>{ 
  e.preventDefault();
  const asuntoId = $('#asuntoId').value || crypto.randomUUID();
  const tipo = $('#asuntoTipo').value;
  const responsables = getSelectedValues('#asuntoResponsable');
  upsert('asuntos', { id: asuntoId, clienteId: $('#asuntoCliente').value, nombre: $('#asuntoNombre').value, tipo, area: $('#asuntoArea').value, materia: $('#asuntoMateria').value, prioridad: $('#asuntoPrioridad').value, estado: $('#asuntoEstado').value, responsableIds: responsables, responsableId: responsables[0] || '', observaciones: $('#asuntoObs').value, fechaIngreso: todayISO(), archivado: ['Terminado','Archivado'].includes($('#asuntoEstado').value) });
  state.sugerencias.asuntoNombres = Array.from(new Set([$('#asuntoNombre').value, ...(state.sugerencias.asuntoNombres || [])])).filter(Boolean).slice(0,200);
  state.sugerencias.asuntoMaterias = Array.from(new Set([$('#asuntoMateria').value, ...(state.sugerencias.asuntoMaterias || [])])).filter(Boolean).slice(0,200);
  refreshAsuntoSugerencias();
  if(tipo === 'Judicial'){
    const existing = state.causas.find(c => c.asuntoId === asuntoId);
    const audiencias = $('#asuntoCausaAudiencia').value ? [{ id: crypto.randomUUID(), tipo:'Preparatoria', otro:'', fecha: $('#asuntoCausaAudiencia').value, hora:'' }] : [];
    upsert('causas', { id: existing?.id || crypto.randomUUID(), asuntoId, tribunal: $('#asuntoCausaTribunal').value, rit: $('#asuntoCausaRit').value, rol: $('#asuntoCausaRol').value, caratula: $('#asuntoCausaCaratula').value, estadoProcesal: $('#asuntoCausaEstado').value, etapa: $('#asuntoCausaEtapa').value, audiencias, proximaAudiencia: $('#asuntoCausaAudiencia').value, link: $('#asuntoCausaLink').value, ultimaActuacion: todayISO() });
  } else {
    state.causas = state.causas.filter(c => c.asuntoId !== asuntoId);
  }
  clearModalDraft('asuntoModal'); closeModals();
});
$('#causaForm').addEventListener('submit', e=>{ 
  e.preventDefault();
  const audiencias = getCausaAudienciasFromForm();
  const prox = audiencias.filter(a=>a.fecha).sort((a,b)=>(`${a.fecha}T${a.hora||'00:00'}`).localeCompare(`${b.fecha}T${b.hora||'00:00'}`))[0];
  upsert('causas', { id: $('#causaId').value || crypto.randomUUID(), asuntoId: $('#causaAsunto').value, tribunal: $('#causaTribunal').value, rit: $('#causaRit').value, rol: $('#causaRol').value, caratula: $('#causaCaratula').value, estadoProcesal: $('#causaEstado').value, etapa: $('#causaEtapa').value, audiencias, proximaAudiencia: prox?.fecha || '', link: $('#causaLink').value, ultimaActuacion: todayISO() }); 
  clearModalDraft('causaModal'); closeModals(); 
});
$('#tareaForm').addEventListener('submit', e=>{ e.preventDefault(); const responsables = getSelectedValues('#tareaResponsable'); upsert('tareas', { id: $('#tareaId').value || crypto.randomUUID(), asuntoId: $('#tareaAsunto').value, titulo: $('#tareaTitulo').value, responsableIds: responsables, responsableId: responsables[0] || '', vencimiento: $('#tareaVencimiento').value, prioridad: $('#tareaPrioridad').value, estado: $('#tareaEstado').value, descripcion: $('#tareaDescripcion').value, archivada: $('#tareaEstado').value === 'Terminada' }); clearModalDraft('tareaModal'); closeModals(); });
$('#plazoForm').addEventListener('submit', e=>{ e.preventDefault(); const responsables = getSelectedValues('#plazoResponsable'); upsert('plazos', { id: $('#plazoId').value || crypto.randomUUID(), asuntoId: $('#plazoAsunto').value, nombre: $('#plazoNombre').value, inicio: $('#plazoInicio').value || tomorrowISO(), vencimiento: $('#plazoVencimiento').value, tipoDias: $('#plazoTipo').value || 'Judiciales', responsableIds: responsables, responsableId: responsables[0] || '', estado: $('#plazoEstado').value, observaciones: $('#plazoObs').value }); clearModalDraft('plazoModal'); closeModals(); });
$('#usuarioForm').addEventListener('submit', e=>{ 
  e.preventDefault();
  const existing = state.users.find(u => u.id === $('#usuarioId').value);
  const plainPassword = $('#usuarioPassword').value;
  if(!existing && !plainPassword){
    alert('Debe ingresar una contraseña para el nuevo usuario.');
    return;
  }
  upsert('users', { id: $('#usuarioId').value || crypto.randomUUID(), nombre: $('#usuarioNombre').value, correo: $('#usuarioCorreo').value, rol: $('#usuarioRol').value, activo: $('#usuarioActivo').value === 'true', password: plainPassword || existing?.password || '' });
  clearModalDraft('usuarioModal'); closeModals();
});

function upsert(collection, item){
  const prev = state[collection].find(x=>x.id===item.id) || null;
  const ix = state[collection].findIndex(x=>x.id===item.id);
  if(ix>=0) state[collection][ix] = { ...state[collection][ix], ...item };
  else state[collection].push(item);
  notifyNewAssignments(collection, prev, state[collection].find(x=>x.id===item.id));
  handleWizardFlow(collection, state[collection].find(x=>x.id===item.id));
  log(`${ix>=0?'Actualizó':'Creó'} registro en ${collection}`); renderAll();
  queueAutoPushToCpanel();
}
function startQuickWizard(){
  wizardState.enabled = true; wizardState.clienteId = ''; wizardState.asuntoId = '';
  alert('Paso 1/3: crea el cliente. Luego se abrirá automáticamente el asunto.');
  openModal('clienteModal');
}
function handleWizardFlow(collection, item){
  if(!wizardState.enabled || !item) return;
  if(collection === 'clientes'){
    wizardState.clienteId = item.id;
    openModal('asuntoModal');
    setField('#asuntoCliente', item.id);
    alert('Paso 2/3: completa el asunto. Luego crearás la primera tarea o plazo.');
    return;
  }
  if(collection === 'asuntos'){
    wizardState.asuntoId = item.id;
    const createTask = confirm('Paso 3/3: ¿Deseas crear primero una tarea? (Cancelar = crear plazo)');
    openModal(createTask ? 'tareaModal' : 'plazoModal');
    if(createTask){
      setField('#tareaClienteFiltro', item.clienteId || wizardState.clienteId || '');
      hydrateAsuntoSelectsByCliente();
      setField('#tareaAsunto', item.id);
    }else{
      setField('#plazoClienteFiltro', item.clienteId || wizardState.clienteId || '');
      hydrateAsuntoSelectsByCliente();
      setField('#plazoAsunto', item.id);
    }
    return;
  }
  if(collection === 'tareas' || collection === 'plazos'){
    wizardState.enabled = false;
    alert('Wizard completado ✅');
  }
}
function notifyNewAssignments(collection, prevItem, nextItem){
  if(!['asuntos','tareas','plazos'].includes(collection) || !nextItem) return;
  const prevIds = new Set(asArray(prevItem?.responsableIds || prevItem?.responsableId));
  const nextIds = asArray(nextItem.responsableIds || nextItem.responsableId).filter(Boolean);
  const added = nextIds.filter(id => !prevIds.has(id));
  const itemName = nextItem.nombre || nextItem.titulo || 'Registro';
  const itemType = collection === 'asuntos' ? 'Asunto' : collection === 'tareas' ? 'Tarea' : 'Plazo';
  added.forEach(async uid => {
    const user = getUser(uid);
    if(!user?.correo) return;
    try{
      await apiNotify('assignment_notice', { to: user.correo, member: user.nombre, itemType, itemName, assignedBy: state.session?.nombre || state.session?.correo || 'sistema' });
      showSyncMessage(`Correo enviado a ${user.nombre}`);
    }catch(err){
      console.warn('No se pudo enviar correo de asignación', err);
    }
  });
}
function removeItem(collection,id){ if(!confirm('¿Eliminar este registro?')) return; state[collection]=state[collection].filter(x=>x.id!==id); log(`Eliminó registro en ${collection}`); renderAll(); queueAutoPushToCpanel(); }
window.removeItem = removeItem;
function completeAsunto(id){
  const asunto = state.asuntos.find(a=>a.id===id);
  if(!asunto) return;
  if(!confirm('¿Marcar este asunto como completado y archivarlo?')) return;
  asunto.estado = 'Archivado';
  asunto.archivado = true;
  asunto.completado = true;
  asunto.fechaCierre = todayISO();
  asunto.completedAt = new Date().toISOString();
  log('Marcó asunto como completado y archivado');
  renderAll();
  queueAutoPushToCpanel();
}
function completeTarea(id){
  const tarea = state.tareas.find(t=>t.id===id);
  if(!tarea) return;
  tarea.estado = 'Terminada';
  tarea.archivada = true;
  tarea.completada = true;
  tarea.completedAt = new Date().toISOString();
  log('Marcó tarea como completada y archivada');
  renderAll();
  queueAutoPushToCpanel();
}
function completePlazo(id){
  const plazo = state.plazos.find(p=>p.id===id);
  if(!plazo) return;
  plazo.estado = 'Cumplido';
  plazo.archivado = true;
  plazo.completado = true;
  plazo.completedAt = new Date().toISOString();
  log('Marcó plazo como cumplido y archivado');
  renderAll();
  queueAutoPushToCpanel();
}
function completeCausa(id){
  const causa = state.causas.find(c=>c.id===id);
  if(!causa) return;
  const nombre = causa.caratula || causa.rit || getAsunto(causa.asuntoId)?.nombre || 'esta causa judicial';
  if(!confirm(`¿Confirmas que deseas completar y archivar la causa judicial: ${nombre}?`)) return;
  causa.estadoProcesal = 'Terminada';
  causa.archivada = true;
  causa.completada = true;
  causa.completedAt = new Date().toISOString();
  log('Marcó causa judicial como completada y archivada');
  renderAll();
  queueAutoPushToCpanel();
}
function detailItem(label, value){ return `<div class="detail-item"><span>${safe(label)}</span><strong>${safe(value || '—')}</strong></div>`; }
function openClienteDetalle(id){
  const c = getCliente(id);
  if(!c) return;
  const asuntos = state.asuntos.filter(a=>a.clienteId===id && !a.archivado && !['Archivado','Terminado'].includes(a.estado));
  const archivados = state.asuntos.filter(a=>a.clienteId===id && (a.archivado || ['Archivado','Terminado'].includes(a.estado)));
  $('#detalleClienteNombre').textContent = c.nombre || 'Detalle del cliente';
  $('#detalleClienteSubtitulo').textContent = `${c.tipo || 'Cliente'} · ${c.rut || 'Sin RUT'}`;
  $('#detalleClienteEstado').textContent = c.estado || 'Sin estado';
  $('#detalleClienteEstado').className = 'badge ' + badgeClass(c.estado);
  $('#clienteDetalleContenido').innerHTML = `
    <div class="detail-grid">
      ${detailItem('Tipo', c.tipo)}${detailItem('RUT', c.rut)}${detailItem('Correo', c.correo)}${detailItem('Teléfono', c.telefono)}
      ${detailItem('Comuna', c.comuna)}${detailItem('Región', c.region)}${detailItem('Estado', c.estado)}${detailItem('Fecha creación', c.createdAt ? new Date(c.createdAt).toLocaleDateString('es-CL') : '')}
      <div class="detail-item wide"><span>Observaciones</span><strong>${safe(c.observaciones || 'Sin observaciones')}</strong></div>
    </div>
    <h4 class="detail-section-title">Asuntos activos (${asuntos.length})</h4>
    <div class="detail-list">${asuntos.map(a=>`<div class="list-item"><div><strong>${safe(a.nombre)}</strong><br><span>${safe(a.tipo)} · ${safe(a.area)} · ${safe(a.materia || 'Sin materia')}</span></div><span class="badge ${badgeClass(a.prioridad)}">${safe(a.prioridad)}</span></div>`).join('') || '<div class="empty">Sin asuntos activos.</div>'}</div>
    <h4 class="detail-section-title">Asuntos archivados (${archivados.length})</h4>
    <div class="detail-list">${archivados.map(a=>`<div class="list-item"><div><strong>${safe(a.nombre)}</strong><br><span>Archivado${a.fechaCierre ? ' el '+fmtDate(a.fechaCierre) : ''}</span></div><span class="badge ok">Completado</span></div>`).join('') || '<div class="empty">Sin asuntos archivados.</div>'}</div>`;
  $('#editarClienteBtn').onclick = (event) => { event.stopPropagation(); editCliente(id); };
  $('#modalBackdrop').classList.remove('hidden');
  $('#clienteDetalleModal').showModal();
}

function setField(id, value){
  const el = $(id);
  if(el){
    if(el.multiple){ const values = asArray(value).map(String); Array.from(el.options).forEach(o => { o.selected = values.includes(String(o.value)); }); } else { el.value = value ?? ''; }
    el.dispatchEvent(new Event('change', { bubbles:true }));
    refreshOneSearchableSelect(el);
  }
}
function setModalTitle(modalId, title){ const h = $(`#${modalId} h3`); if(h) h.textContent = title; }
function editCliente(id){
  const c = getCliente(id); if(!c) return;
  closeModals(); openModal('clienteModal'); setModalTitle('clienteModal','Editar cliente');
  setField('#clienteId', c.id); setField('#clienteTipo', c.tipo); setField('#clienteNombre', c.nombre); setField('#clienteRut', c.rut);
  setField('#clienteCorreo', c.correo); setField('#clienteTelefono', c.telefono); setField('#clienteComuna', c.comuna); setField('#clienteRegion', c.region);
  setField('#clienteEstado', c.estado); setField('#clienteObs', c.observaciones);
}
function editAsunto(id){
  const a = getAsunto(id); if(!a) return;
  const c = state.causas.find(x => x.asuntoId === a.id);
  closeModals(); openModal('asuntoModal'); setModalTitle('asuntoModal','Editar asunto');
  setField('#asuntoId', a.id); setField('#asuntoCliente', a.clienteId); setField('#asuntoNombre', a.nombre); setField('#asuntoTipo', a.tipo);
  setField('#asuntoArea', a.area); setField('#asuntoMateria', a.materia); setField('#asuntoPrioridad', a.prioridad); setField('#asuntoEstado', a.estado);
  setField('#asuntoResponsable', a.responsableIds || a.responsableId); setField('#asuntoObs', a.observaciones);
  setField('#asuntoCausaTribunal', c?.tribunal); setField('#asuntoCausaRit', c?.rit); setField('#asuntoCausaRol', c?.rol); setField('#asuntoCausaCaratula', c?.caratula);
  setField('#asuntoCausaEstado', c?.estadoProcesal); setField('#asuntoCausaEtapa', c?.etapa); setField('#asuntoCausaAudiencia', c?.proximaAudiencia); setField('#asuntoCausaLink', c?.link);
  toggleAsuntoJudicialFields();
}
function editCausa(id){
  const c = state.causas.find(x=>x.id===id); if(!c) return;
  closeModals(); openModal('causaModal'); setModalTitle('causaModal','Editar causa judicial');
  setField('#causaId', c.id); setField('#causaClienteFiltro', getAsunto(c.asuntoId)?.clienteId || ''); hydrateAsuntoSelectsByCliente(); setField('#causaAsunto', c.asuntoId); setField('#causaTribunal', c.tribunal); setField('#causaRit', c.rit);
  setField('#causaRol', c.rol); setField('#causaCaratula', c.caratula); setField('#causaEstado', c.estadoProcesal); setField('#causaEtapa', c.etapa);
  const box = $('#causaAudienciasContainer');
  if(box){
    box.innerHTML = '';
    const auds = Array.isArray(c.audiencias) && c.audiencias.length ? c.audiencias : [{ tipo:'Preparatoria', fecha:c.proximaAudiencia || '', hora:'' }];
    auds.forEach(a => addAudienciaRow(a));
  }
  setField('#causaLink', c.link);
}
function editTarea(id){
  const t = state.tareas.find(x=>x.id===id); if(!t) return;
  closeModals(); openModal('tareaModal'); setModalTitle('tareaModal','Editar tarea');
  setField('#tareaId', t.id); setField('#tareaClienteFiltro', getAsunto(t.asuntoId)?.clienteId || ''); hydrateAsuntoSelectsByCliente(); setField('#tareaAsunto', t.asuntoId); setField('#tareaTitulo', t.titulo); setField('#tareaResponsable', t.responsableIds || t.responsableId);
  setField('#tareaVencimiento', t.vencimiento); setField('#tareaPrioridad', t.prioridad); setField('#tareaEstado', t.estado); setField('#tareaDescripcion', t.descripcion);
}
function editPlazo(id){
  const pz = state.plazos.find(x=>x.id===id); if(!pz) return;
  closeModals(); openModal('plazoModal'); setModalTitle('plazoModal','Editar plazo');
  setField('#plazoId', pz.id); setField('#plazoClienteFiltro', getAsunto(pz.asuntoId)?.clienteId || ''); hydrateAsuntoSelectsByCliente(); setField('#plazoAsunto', pz.asuntoId); setField('#plazoNombre', pz.nombre); setField('#plazoInicio', pz.inicio);
  setField('#plazoVencimiento', pz.vencimiento); setField('#plazoTipo', pz.tipoDias); setField('#plazoResponsable', pz.responsableIds || pz.responsableId);
  setField('#plazoEstado', pz.estado); setField('#plazoObs', pz.observaciones);
}

function openEntidadDetalle({estado, badge, titulo, subtitulo, contenido, acciones}){
  $('#detalleEntidadEstado').textContent = estado || 'Detalle';
  $('#detalleEntidadEstado').className = 'badge ' + (badge || 'ok');
  $('#detalleEntidadTitulo').textContent = titulo || 'Detalle';
  $('#detalleEntidadSubtitulo').textContent = subtitulo || 'Ficha completa';
  $('#entidadDetalleContenido').innerHTML = contenido || '';
  $('#detalleEntidadAcciones').innerHTML = acciones || '<button type="button" class="secondary-btn close-modal">Cerrar</button>';
  $('#modalBackdrop').classList.remove('hidden');
  $('#entidadDetalleModal').showModal();
}
function openAsuntoDetalle(id){
  const a = getAsunto(id); if(!a) return;
  const tareas = state.tareas.filter(t=>t.asuntoId===id && !t.archivada && t.estado!=='Terminada');
  const plazos = state.plazos.filter(p=>p.asuntoId===id).sort(sortByVencimiento);
  const causas = state.causas.filter(c=>c.asuntoId===id);
  openEntidadDetalle({
    estado:a.estado || 'Asunto', badge:badgeClass(a.prioridad), titulo:a.nombre, subtitulo:`${a.tipo || 'Asunto'} · ${a.area || 'Sin área'} · Cliente: ${getCliente(a.clienteId)?.nombre || 'Sin cliente'}`,
    contenido:`<div class="detail-grid">${detailItem('Cliente', getCliente(a.clienteId)?.nombre)}${detailItem('Tipo', a.tipo)}${detailItem('Área', a.area)}${detailItem('Materia', a.materia)}${detailItem('Prioridad', a.prioridad)}${detailItem('Estado', a.estado)}${detailItem('Responsable', getResponsableNames(a))}${detailItem('Ingreso', fmtDate(a.fechaIngreso))}<div class="detail-item wide"><span>Observaciones</span><strong>${safe(a.observaciones || 'Sin observaciones')}</strong></div></div><h4 class="detail-section-title">Causas asociadas (${causas.length})</h4><div class="detail-list">${causas.map(c=>`<div class="list-item"><div><strong>${safe(c.caratula || c.rit || 'Causa')}</strong><br><span>${safe(c.tribunal || '-')} · ${safe(c.estadoProcesal || '-')}</span></div><button class="mini-btn" onclick="openCausaDetalle('${c.id}')">Ver</button></div>`).join('') || '<div class="empty">Sin causas asociadas.</div>'}</div><h4 class="detail-section-title">Tareas activas (${tareas.length})</h4><div class="detail-list">${tareas.map(t=>`<div class="list-item"><div><strong>${safe(t.titulo)}</strong><br><span>Vence ${fmtDate(t.vencimiento)}</span></div><span class="badge ${badgeClass(t.prioridad)}">${safe(t.prioridad)}</span></div>`).join('') || '<div class="empty">Sin tareas activas.</div>'}</div><h4 class="detail-section-title">Plazos (${plazos.length})</h4><div class="detail-list">${plazos.map(p=>`<div class="list-item"><div><strong>${safe(p.nombre)}</strong><br><span>Vence ${fmtDate(p.vencimiento)}</span></div><span class="badge ${daysUntil(p.vencimiento)<0?'danger':daysUntil(p.vencimiento)<=3?'warn':'ok'}">${safe(p.estado)}</span></div>`).join('') || '<div class="empty">Sin plazos.</div>'}</div>`,
    acciones:`<button type="button" class="primary-btn" onclick="event.stopPropagation(); editAsunto('${id}')">Editar información</button>${!a.archivado && !['Archivado','Terminado'].includes(a.estado)?`<button type="button" class="secondary-btn" onclick="completeAsunto('${id}'); closeModals();">Completar y archivar</button>`:''}<button type="button" class="secondary-btn close-modal">Cerrar</button>`
  });
}
function openCausaDetalle(id){
  const c = state.causas.find(x=>x.id===id); if(!c) return; const a = getAsunto(c.asuntoId);
  openEntidadDetalle({estado:c.estadoProcesal || 'Causa', badge:'ok', titulo:c.caratula || a?.nombre || 'Causa judicial', subtitulo:`${c.tribunal || 'Sin tribunal'} · ${c.rit || c.rol || 'Sin RIT/ROL'}`, contenido:`<div class="detail-grid">${detailItem('Asunto', a?.nombre)}${detailItem('Cliente', getCliente(a?.clienteId)?.nombre)}${detailItem('Tribunal', c.tribunal)}${detailItem('RIT', c.rit)}${detailItem('ROL', c.rol)}${detailItem('Carátula', c.caratula)}${detailItem('Estado procesal', c.estadoProcesal)}${detailItem('Etapa', c.etapa)}${detailItem('Próxima audiencia', fmtDate(c.proximaAudiencia))}${detailItem('Última actuación', fmtDate(c.ultimaActuacion))}<div class="detail-item wide"><span>Link PJUD</span><strong>${c.link ? `<a href="${safe(c.link)}" target="_blank" rel="noopener">Abrir enlace</a>` : '—'}</strong></div></div>`, acciones:`<button type="button" class="primary-btn" onclick="event.stopPropagation(); editCausa('${id}')">Editar información</button>${causaActiva(c)?`<button type="button" class="secondary-btn" onclick="completeCausa('${id}'); closeModals();">Completar y archivar</button>`:''}<button type="button" class="secondary-btn close-modal">Cerrar</button>`});
}
function openTareaDetalle(id){
  const t = state.tareas.find(x=>x.id===id); if(!t) return; const a = getAsunto(t.asuntoId);
  openEntidadDetalle({estado:t.estado || 'Tarea', badge:badgeClass(t.prioridad), titulo:t.titulo, subtitulo:`${a?.nombre || 'Sin asunto'} · Responsable: ${getResponsableNames(t) || 'Sin responsable'}`, contenido:`<div class="detail-grid">${detailItem('Asunto', a?.nombre)}${detailItem('Cliente', getCliente(a?.clienteId)?.nombre)}${detailItem('Responsable', getResponsableNames(t))}${detailItem('Vencimiento', fmtDate(t.vencimiento))}${detailItem('Prioridad', t.prioridad)}${detailItem('Estado', t.estado)}${detailItem('Archivada', t.archivada ? 'Sí' : 'No')}${detailItem('Completada', t.completada ? 'Sí' : 'No')}<div class="detail-item wide"><span>Descripción</span><strong>${safe(t.descripcion || 'Sin descripción')}</strong></div></div>`, acciones:`<button type="button" class="primary-btn" onclick="event.stopPropagation(); editTarea('${id}')">Editar información</button>${!t.archivada && t.estado!=='Terminada'?`<button type="button" class="secondary-btn" onclick="completeTarea('${id}'); closeModals();">Completar y archivar</button>`:''}<button type="button" class="secondary-btn close-modal">Cerrar</button>`});
}
function openPlazoDetalle(id){
  const pz = state.plazos.find(x=>x.id===id); if(!pz) return; const a = getAsunto(pz.asuntoId); const d = daysUntil(pz.vencimiento);
  openEntidadDetalle({estado:pz.estado || 'Plazo', badge:d<0?'danger':d<=3?'warn':'ok', titulo:pz.nombre, subtitulo:`${a?.nombre || 'Sin asunto'} · Vence ${fmtDate(pz.vencimiento)}`, contenido:`<div class="detail-grid">${detailItem('Asunto', a?.nombre)}${detailItem('Cliente', getCliente(a?.clienteId)?.nombre)}${detailItem('Inicio', fmtDate(pz.inicio))}${detailItem('Vencimiento', fmtDate(pz.vencimiento))}${detailItem('Días restantes', d===null?'—':(d<0?'Vencido':d+' días'))}${detailItem('Tipo de días', pz.tipoDias)}${detailItem('Responsable', getResponsableNames(pz))}${detailItem('Estado', pz.estado)}<div class="detail-item wide"><span>Observaciones</span><strong>${safe(pz.observaciones || 'Sin observaciones')}</strong></div></div><div class="notice">El cálculo de plazos es referencial y debe ser verificado por el abogado responsable.</div>`, acciones:`<button type="button" class="primary-btn" onclick="event.stopPropagation(); editPlazo('${id}')">Editar información</button>${plazoActivo(pz)?`<button type="button" class="secondary-btn" onclick="completePlazo('${id}'); closeModals();">Completar y archivar</button>`:''}<button type="button" class="secondary-btn close-modal">Cerrar</button>`});
}

window.editCliente = editCliente;
window.editAsunto = editAsunto;
window.editCausa = editCausa;
window.editTarea = editTarea;
window.editPlazo = editPlazo;
window.openAsuntoDetalle = openAsuntoDetalle;
window.openCausaDetalle = openCausaDetalle;
window.openTareaDetalle = openTareaDetalle;
window.openPlazoDetalle = openPlazoDetalle;
window.completeAsunto = completeAsunto;
window.completeTarea = completeTarea;
window.completePlazo = completePlazo;
window.completeCausa = completeCausa;
window.openClienteDetalle = openClienteDetalle;
window.openModal = openModal;
window.openDashboardAlert = openDashboardAlert;
window.openCotizacionModal = openCotizacionModal;
window.generarCotizacionDesdeId = generarCotizacionDesdeId;
window.descargarCotizacion = descargarCotizacion;
window.removeCotizacion = removeCotizacion;
window.addCotizacionConcepto = addCotizacionConcepto;

function renderAll(){ hydrateSelects(); refreshAsuntoSugerencias(); hydrateTemplateSelects(); renderDashboard(); renderClientes(); renderAsuntos(); renderCausas(); renderTareas(); renderPlazos(); renderArchivo(); renderUsuarios(); renderUtilidades(); }

function renderDashboard(){
  const dueSoon = state.plazos.filter(p=>asuntoActivo(p.asuntoId) && plazoActivo(p) && p.estado==='Vigente' && daysUntil(p.vencimiento) !== null && daysUntil(p.vencimiento) <= 7).length;
  const lateTasks = state.tareas.filter(t=>!t.archivada && t.estado!=='Terminada' && t.vencimiento && daysUntil(t.vencimiento)<0).length;
  $('#dashboardView').innerHTML = `
    <div class="quick-panel content-card">
      <div>
        <h3>Acceso rápido</h3>
        <p>Crear registros frecuentes o abrir herramientas externas.</p>
      </div>
      <div class="quick-actions">
        <button type="button" class="primary-btn" onclick="openModal('clienteModal')">Nuevo cliente</button>
        <button type="button" class="primary-btn" onclick="openModal('asuntoModal')">Nuevo asunto</button>
        <button type="button" class="primary-btn" onclick="openModal('plazoModal')">Nuevo plazo</button>
        <button type="button" class="primary-btn" onclick="openModal('tareaModal')">Nueva tarea</button>
        <button type="button" class="secondary-btn" onclick="openCotizacionModal()">Generar cotización</button>
        <button type="button" class="secondary-btn" onclick="window.location.href='https://gjabogados.cl/generador'">Generar escrito</button>
      </div>
    </div>
    <div class="stats-grid">
      ${stat('Clientes', state.clientes.length)}${stat('Asuntos activos', state.asuntos.filter(a=>!a.archivado && !['Terminado','Archivado'].includes(a.estado)).length)}${stat('Plazos 7 días', dueSoon)}${stat('Tareas atrasadas', lateTasks)}
    </div>
    <div class="dashboard-grid">
      <div class="content-card"><h3>Alertas próximas</h3><div class="list">${renderAlertList()}</div></div>
      <div class="content-card"><h3>Actividad reciente</h3><div class="list">${state.logs.slice(0,8).map(l=>`<div class="list-item"><div>${l.action}<br><span>${new Date(l.at).toLocaleString('es-CL')}</span></div></div>`).join('') || '<div class="empty">Sin actividad registrada.</div>'}</div></div><div class="content-card"><h3>Últimas cotizaciones</h3><div class="list">${(state.cotizaciones || []).slice(-6).reverse().map(c=>`<div class="list-item"><div><strong>Propuesta N° ${safe(c.numero)}</strong><br><span>${safe(c.nombreCliente)} · ${safe(c.materia)}</span></div><button class="mini-btn" onclick="descargarCotizacion('${c.id}')">Descargar</button></div>`).join('') || '<div class="empty">Sin cotizaciones generadas.</div>'}</div></div>
    </div>`;
}
function stat(label, value){ return `<div class="stat-card"><span>${label}</span><strong>${value}</strong></div>`; }
function renderAlertList(){
  const plazoAlerts = state.plazos
    .filter(p=>asuntoActivo(p.asuntoId) && plazoActivo(p) && p.estado==='Vigente')
    .sort(sortByVencimiento)
    .map(p=>({tipo:'plazo', id:p.id, txt:`Plazo: ${p.nombre}`, sub:`Vence ${fmtDate(p.vencimiento)} · ${getAsunto(p.asuntoId)?.nombre || 'Sin asunto'}`, d:daysUntil(p.vencimiento)}))
    .filter(x=>x.d!==null && x.d<=7)
    .sort((a,b)=>a.d-b.d);
  const taskAlerts = state.tareas
    .filter(t=>asuntoActivo(t.asuntoId) && !t.archivada && t.estado!=='Terminada' && t.vencimiento && daysUntil(t.vencimiento)<=3)
    .map(t=>({tipo:'tarea', id:t.id, txt:`Tarea: ${t.titulo}`, sub:`Vence ${fmtDate(t.vencimiento)} · ${getResponsableNames(t) || 'Sin responsable'}`, d:daysUntil(t.vencimiento)}));
  const hearingAlerts = state.causas
    .filter(c=>causaActiva(c) && c.proximaAudiencia && daysUntil(c.proximaAudiencia)>=0 && daysUntil(c.proximaAudiencia)<=14)
    .map(c=>({tipo:'causa', id:c.id, txt:`Audiencia: ${c.caratula || getAsunto(c.asuntoId)?.nombre || 'Causa judicial'}`, sub:`${c.tribunal || 'Sin tribunal'} · ${fmtDate(c.proximaAudiencia)}`, d:daysUntil(c.proximaAudiencia)}));
  const noResponsibleTasks = state.tareas.filter(t=>asuntoActivo(t.asuntoId) && !t.archivada && t.estado!=='Terminada' && !asArray(t.responsableIds).length)
    .map(t=>({tipo:'tarea', id:t.id, txt:`Tarea sin responsable: ${t.titulo}`, sub:`${getAsunto(t.asuntoId)?.nombre || 'Sin asunto'}`, d:0}));
  const causasSinAudiencia = state.causas.filter(c=>causaActiva(c) && !nextAudiencia(c))
    .map(c=>({tipo:'causa', id:c.id, txt:`Causa sin próxima audiencia`, sub:`${c.caratula || getAsunto(c.asuntoId)?.nombre || 'Causa judicial'}`, d:1}));
  const all = [...plazoAlerts,...taskAlerts,...hearingAlerts,...noResponsibleTasks,...causasSinAudiencia].sort((a,b)=>a.d-b.d).slice(0,12);
  return all.map(a=>`<div class="list-item clickable-card alert-item" onclick="openDashboardAlert('${a.tipo}','${a.id}')" title="Ver detalle"><div><strong>${safe(a.txt)}</strong><br><span>${safe(a.sub)}</span></div><span class="badge ${a.d<0?'danger':a.d<=2?'warn':'ok'}">${a.d<0?'Vencido':a.d+' días'}</span></div>`).join('') || '<div class="empty">Sin alertas próximas.</div>';
}
function hydrateTemplateSelects(){
  const fill = (selector, list) => {
    const el = $(selector); if(!el) return;
    const prev = el.value;
    el.innerHTML = '<option value="">Sin plantilla</option>' + list.map(t => `<option value="${t.id}">${safe(t.nombre)}</option>`).join('');
    el.value = prev;
  };
  fill('#asuntoTemplateSelect', state.templates.asuntos || []);
  fill('#tareaTemplateSelect', state.templates.tareas || []);
  fill('#plazoTemplateSelect', state.templates.plazos || []);
}
function applyTemplate(kind){
  const map = {
    asunto: { select:'#asuntoTemplateSelect', store:'asuntos', fields:{ '#asuntoTipo':'tipo','#asuntoNombre':'nombre','#asuntoArea':'area','#asuntoMateria':'materia','#asuntoPrioridad':'prioridad','#asuntoEstado':'estado','#asuntoObs':'observaciones' } },
    tarea: { select:'#tareaTemplateSelect', store:'tareas', fields:{ '#tareaTitulo':'titulo','#tareaPrioridad':'prioridad','#tareaEstado':'estado','#tareaDescripcion':'descripcion' } },
    plazo: { select:'#plazoTemplateSelect', store:'plazos', fields:{ '#plazoNombre':'nombre','#plazoTipo':'tipoDias','#plazoEstado':'estado','#plazoObs':'observaciones' } }
  }[kind];
  const id = $(map.select)?.value; if(!id) return;
  const tpl = (state.templates[map.store] || []).find(x=>x.id===id); if(!tpl) return;
  Object.entries(map.fields).forEach(([sel, key]) => setField(sel, tpl.data?.[key] || ''));
}
function renderUtilidades(){
  const t = state.templates || { asuntos:[], tareas:[], plazos:[] };
  const syncPanel = `<h3>Sincronización</h3><p>Úsala cuando necesites traer o respaldar el estado completo entre dispositivos.</p><div class="toolbar"><button id="syncPullBtnCard" class="secondary-btn">Leer DB cPanel</button><button id="syncPushBtnCard" class="secondary-btn">Escribir DB cPanel</button></div>`;
  $('#templatesPanel').innerHTML = `${syncPanel}<hr><h3>Plantillas reutilizables</h3><p>Úsalas para crear registros repetitivos más rápido y con formato consistente.</p>
    <div class="toolbar"><button class="secondary-btn" onclick="saveCurrentAsTemplate('asunto')">Guardar asunto actual como plantilla</button><button class="secondary-btn" onclick="saveCurrentAsTemplate('tarea')">Guardar tarea actual como plantilla</button><button class="secondary-btn" onclick="saveCurrentAsTemplate('plazo')">Guardar plazo actual como plantilla</button><button class="secondary-btn" onclick="sendDailyTaskReminders()">Enviar recordatorio diario ahora</button></div>
    <p>Asuntos: ${t.asuntos.length} · Tareas: ${t.tareas.length} · Plazos: ${t.plazos.length}</p>`;
  $('#actividadPanel').innerHTML = `<h3>Actividad del equipo</h3><p>Revisa trazabilidad de cambios por usuario y fecha.</p><div class="toolbar"><input id="activityUserFilter" placeholder="Filtrar por correo usuario..." /><input id="activityDateFilter" type="date" /></div><div class="list">${renderActividadList()}</div>`;
  $('#notificacionesPanel').innerHTML = `<h3>Correo y recordatorios</h3><p>Notificaciones internas y recordatorios de pendientes para el equipo.</p><div class="list">${renderAlertList()}</div>`;
  $('#syncPullBtnCard')?.addEventListener('click', pullFromCpanelDb);
  $('#syncPushBtnCard')?.addEventListener('click', pushToCpanelDb);
}
function renderActividadList(){
  const user = ($('#activityUserFilter')?.value || '').toLowerCase();
  const date = $('#activityDateFilter')?.value || '';
  const items = (state.logs || []).filter(l => !user || String(l.user || '').toLowerCase().includes(user))
    .filter(l => !date || String(l.at || '').slice(0,10) === date).slice(0,30);
  return items.map(l=>`<div class="list-item"><div><strong>${safe(l.user || 'sistema')}</strong>: ${safe(l.action)}<br><span>${new Date(l.at).toLocaleString('es-CL')}</span></div></div>`).join('') || '<div class="empty">Sin actividad para los filtros seleccionados.</div>';
}
function saveCurrentAsTemplate(kind){
  const name = prompt('Nombre de la plantilla:');
  if(!name) return;
  const payload = kind === 'asunto'
    ? { tipo:$('#asuntoTipo').value, nombre:$('#asuntoNombre').value.trim(), area:$('#asuntoArea').value, materia:$('#asuntoMateria').value.trim(), prioridad:$('#asuntoPrioridad').value, estado:$('#asuntoEstado').value, observaciones:$('#asuntoObs').value.trim() }
    : kind === 'tarea'
      ? { titulo:$('#tareaTitulo').value.trim(), prioridad:$('#tareaPrioridad').value, estado:$('#tareaEstado').value, descripcion:$('#tareaDescripcion').value.trim() }
      : { nombre:$('#plazoNombre').value.trim(), tipoDias:$('#plazoTipo').value, estado:$('#plazoEstado').value, observaciones:$('#plazoObs').value.trim() };
  const bucket = kind === 'asunto' ? 'asuntos' : kind === 'tarea' ? 'tareas' : 'plazos';
  state.templates[bucket].push({ id: crypto.randomUUID(), nombre: name.trim(), data: payload });
  log(`Guardó plantilla de ${kind}: ${name.trim()}`);
  saveState(); renderAll();
}
window.saveCurrentAsTemplate = saveCurrentAsTemplate;
async function sendDailyTaskReminders(){
  const usersPayload = state.users.filter(u=>u.activo && u.correo).map(u => ({
    nombre: u.nombre,
    correo: u.correo,
    tasks: state.tareas.filter(t => !t.archivada && t.estado !== 'Terminada' && asArray(t.responsableIds || t.responsableId).includes(u.id)).map(t => ({ titulo: t.titulo, vencimiento: t.vencimiento || 'Sin fecha' }))
  }));
  try{
    const result = await apiNotify('daily_reminder', { users: usersPayload });
    alert(`Recordatorios enviados: ${result.sent || 0}`);
    log(`Envió recordatorio diario de tareas (${result.sent || 0} correos)`);
  }catch(err){
    alert(`No se pudo enviar recordatorio diario: ${err.message}`);
  }
}
window.sendDailyTaskReminders = sendDailyTaskReminders;
function openDashboardAlert(tipo, id){
  if(tipo === 'plazo') return openPlazoDetalle(id);
  if(tipo === 'tarea') return openTareaDetalle(id);
  if(tipo === 'causa') return openCausaDetalle(id);
}

function nextCotizacionNumero(){
  const max = Math.max(294, ...(state.cotizaciones || []).map(c => Number(c.numero) || 0));
  return max + 1;
}
function openCotizacionModal(){
  resetForms('cotizacionModal');
  hydrateSelects();
  setField('#cotizacionNumero', nextCotizacionNumero());
  setField('#cotizacionFecha', todayISO());
  resetCotizacionConceptos();
  $('#modalBackdrop').classList.remove('hidden');
  $('#cotizacionModal').showModal();
}
// El generador de cotizaciones no se asocia a clientes ni asuntos internos.
function resetCotizacionConceptos(){
  const container = $('#cotizacionConceptosContainer');
  if(!container) return;
  container.innerHTML = '';
  addCotizacionConcepto();
}
function addCotizacionConcepto(data = {}){
  const container = $('#cotizacionConceptosContainer');
  if(!container) return;
  const row = document.createElement('div');
  row.className = 'quote-concept-row';
  row.innerHTML = `
    <input class="cotizacionConcepto" placeholder="Concepto" value="${safe(data.concepto || '')}" />
    <input class="cotizacionFijo" placeholder="$" inputmode="numeric" value="${safe(data.fijo || '')}" />
    <input class="cotizacionVariable" placeholder="$ / % / evento" value="${safe(data.variable || '')}" />
    <button type="button" class="quote-remove-btn" title="Eliminar concepto">×</button>
  `;
  row.querySelector('.quote-remove-btn').addEventListener('click', () => {
    const rows = container.querySelectorAll('.quote-concept-row');
    if(rows.length <= 1){
      row.querySelectorAll('input').forEach(input => input.value = '');
      return;
    }
    row.remove();
  });
  container.appendChild(row);
}
function getCotizacionConceptos(){
  return Array.from(document.querySelectorAll('#cotizacionConceptosContainer .quote-concept-row'))
    .map(row => ({
      concepto: row.querySelector('.cotizacionConcepto')?.value.trim() || '',
      fijo: row.querySelector('.cotizacionFijo')?.value.trim() || '',
      variable: row.querySelector('.cotizacionVariable')?.value.trim() || ''
    }))
    .filter(item => item.concepto || item.fijo || item.variable);
}
function getCotizacionFormData(){
  const conceptos = getCotizacionConceptos();
  return {
    id: crypto.randomUUID(),
    numero: Number($('#cotizacionNumero').value || nextCotizacionNumero()),
    nombreCliente: $('#cotizacionNombreCliente').value.trim(),
    mail: $('#cotizacionMail').value.trim(),
    materia: $('#cotizacionMateria').value.trim(),
    fecha: $('#cotizacionFecha').value || todayISO(),
    servicioRequerido: $('#cotizacionServicio').value.trim(),
    propuestaServicio: $('#cotizacionPropuesta').value.trim(),
    conceptos,
    usuario: state.session?.nombre || state.session?.correo || 'Usuario',
    createdAt: new Date().toISOString()
  };
}
function guardarCotizacion(){
  const data = getCotizacionFormData();
  if(!data.nombreCliente){ alert('Debe indicar el nombre del cliente.'); return; }
  if(!data.materia){ alert('Debe indicar la materia.'); return; }
  if(!data.servicioRequerido){ alert('Debe indicar el resumen del requerimiento.'); return; }
  state.cotizaciones = state.cotizaciones || [];
  state.cotizaciones.push(data);
  log(`Generó cotización N° ${data.numero}`);
  queueAutoPushToCpanel();
  closeModals();
  renderAll();
  descargarCotizacion(data.id);
}
function generarCotizacionDesdeId(id){
  const c = (state.cotizaciones || []).find(x=>x.id===id);
  if(c) descargarCotizacion(id);
}
function removeCotizacion(id){
  if(!confirm('¿Eliminar esta cotización del registro local?')) return;
  state.cotizaciones = (state.cotizaciones || []).filter(c=>c.id!==id);
  log('Eliminó cotización');
  queueAutoPushToCpanel();
  renderAll();
}
function formatMontoFijo(value){
  const raw = String(value || '').trim();
  if(!raw) return '-';
  const digits = raw.replace(/[^0-9]/g, '');
  if(!digits) return raw;
  return '$' + Number(digits).toLocaleString('es-CL') + '.-';
}
function moneyCell(v){ return safe(formatMontoFijo(v)); }
function textToWordXml(value){
  const text = String(value ?? '');
  const parts = text.split(/\r?\n/);
  return parts.map((part, i) => `${i ? '</w:t><w:br/><w:t xml:space="preserve">' : ''}${escapeXml(part)}`).join('');
}
function escapeXml(value){
  return String(value ?? '').replace(/[<>&"']/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[ch]));
}
function wordSafeFileName(value){
  return String(value || 'cliente').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
}
function cotizacionMap(c){
  const fecha = c.fecha ? new Date(`${c.fecha}T00:00:00`).toLocaleDateString('es-CL') : '';
  return {
    '[Numero]': c.numero,
    '[Nombre cliente]': c.nombreCliente,
    '[Mail]': c.mail,
    '[Materia]': c.materia,
    '[Fecha]': fecha,
    '[Servicio requerido]': c.servicioRequerido,
    '[Propuesta de servicio]': c.propuestaServicio,
    '[Concepto 1]': c.concepto1 || '-',
    '[Fijo 1]': formatMontoFijo(c.fijo1),
    '[Variable 1]': c.variable1 || '-',
    '[Usuario]': c.usuario
  };
}
function applyWordTypography(xml){
  const rPr = '<w:rFonts w:ascii="Tahoma" w:hAnsi="Tahoma" w:eastAsia="Tahoma" w:cs="Tahoma"/><w:color w:val="000000"/><w:sz w:val="22"/><w:szCs w:val="22"/>';
  function cleanRPr(inner){
    return inner
      .replace(/<w:rFonts[^>]*\/>/g, '')
      .replace(/<w:color[^>]*\/>/g, '')
      .replace(/<w:sz[^>]*\/>/g, '')
      .replace(/<w:szCs[^>]*\/>/g, '') + rPr;
  }
  xml = xml.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/g, (_, inner) => `<w:rPr>${cleanRPr(inner)}</w:rPr>`);
  xml = xml.replace(/<w:r>(?!<w:rPr>)/g, `<w:r><w:rPr>${rPr}</w:rPr>`);
  return xml;
}
function replaceWordPlaceholders(xml, map){
  Object.entries(map).forEach(([key, val]) => {
    xml = xml.split(key).join(textToWordXml(val));
  });
  return xml;
}

function xmlRun(text, opts = {}){
  const bold = opts.bold ? '<w:b/><w:bCs/>' : '';
  const italic = opts.italic ? '<w:i/><w:iCs/>' : '';
  return `<w:r><w:rPr><w:rFonts w:ascii="Tahoma" w:hAnsi="Tahoma" w:eastAsia="Tahoma" w:cs="Tahoma"/><w:color w:val="000000"/><w:sz w:val="22"/><w:szCs w:val="22"/>${bold}${italic}</w:rPr><w:t xml:space="preserve">${escapeXml(text ?? '')}</w:t></w:r>`;
}
function xmlP(runs = '', opts = {}){
  const jc = opts.align ? `<w:jc w:val="${opts.align}"/>` : '';
  const ind = opts.indent ? `<w:ind w:left="${opts.indent}" w:hanging="${opts.hanging || 0}"/>` : '';
  return `<w:p><w:pPr><w:spacing w:before="${opts.before || 0}" w:after="${opts.after ?? 120}" w:line="276" w:lineRule="auto"/>${jc}${ind}</w:pPr>${runs}</w:p>`;
}
function xmlLabel(label, value){ return xmlP(xmlRun(label + ': ', {bold:true}) + xmlRun(value || ''), {after:0}); }
function xmlHeading(num, text){ return xmlP(xmlRun(num, {bold:true}) + xmlRun('      ' + text, {bold:true}), {before:240, after:240}); }
function xmlCell(content, width){
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="8" w:color="000000"/><w:left w:val="single" w:sz="8" w:color="000000"/><w:bottom w:val="single" w:sz="8" w:color="000000"/><w:right w:val="single" w:sz="8" w:color="000000"/></w:tcBorders></w:tcPr>${content}</w:tc>`;
}
function getCotizacionRows(c){
  let rows = Array.isArray(c.conceptos) ? c.conceptos : [];
  if(!rows.length){
    [1,2,3].forEach(n => {
      if(c[`concepto${n}`] || c[`fijo${n}`] || c[`variable${n}`]){
        rows.push({concepto:c[`concepto${n}`] || '-', fijo:c[`fijo${n}`] || '', variable:c[`variable${n}`] || '-'});
      }
    });
  }
  rows = rows.filter(r => r.concepto || r.fijo || r.variable);
  if(!rows.length) rows.push({concepto:'Honorarios profesionales', fijo:'', variable:'-'});
  return rows;
}
function xmlCotizacionTable(c){
  const rows = getCotizacionRows(c).map(r => ({
    concepto: r.concepto || '-',
    fijo: formatMontoFijo(r.fijo),
    variable: r.variable || '-'
  }));
  const head = `<w:tr>${xmlCell(xmlP(xmlRun('Concepto',{bold:true}),{after:0}),3100)}${xmlCell(xmlP(xmlRun('Monto fijo',{bold:true}),{after:0}),3200)}${xmlCell(xmlP(xmlRun('Monto Variable/Eventual',{bold:true}),{after:0}),2800)}</w:tr>`;
  const body = rows.map(r=>`<w:tr>${xmlCell(xmlP(xmlRun(r.concepto),{after:0}),3100)}${xmlCell(xmlP(xmlRun(r.fijo,{bold:true}),{after:0}),3200)}${xmlCell(xmlP(xmlRun(r.variable),{after:0}),2800)}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="9100" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="8" w:color="000000"/><w:left w:val="single" w:sz="8" w:color="000000"/><w:bottom w:val="single" w:sz="8" w:color="000000"/><w:right w:val="single" w:sz="8" w:color="000000"/><w:insideH w:val="single" w:sz="8" w:color="000000"/><w:insideV w:val="single" w:sz="8" w:color="000000"/></w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr>${head}${body}</w:tbl>`;
}
function xmlDisposition(letter, text, boldText = ''){
  return xmlP(xmlRun(letter + ')  ') + xmlRun(text) + (boldText ? xmlRun(boldText,{bold:true}) : ''), {align:'both', indent:720, hanging:360, after:80});
}
function cotizacionDocumentXml(c){
  const fecha = c.fecha ? new Date(`${c.fecha}T00:00:00`).toLocaleDateString('es-CL') : '';
  const p=[];
  p.push(xmlP(xmlRun(`PROPUESTA N° ${c.numero}`,{bold:true}),{before:240,after:420}));
  p.push(xmlLabel('CLIENTE', c.nombreCliente)); p.push(xmlLabel('MAIL', c.mail)); p.push(xmlLabel('MATERIA', c.materia)); p.push(xmlLabel('FECHA', fecha));
  p.push(xmlHeading('I.','RESUMEN REQUERIMIENTO:'));
  String(c.servicioRequerido || '').split(/\r?\n/).forEach(line=>p.push(xmlP(xmlRun(line),{after:0})));
  p.push(xmlHeading('II.','SERVICIO PROPUESTO'));
  String(c.propuestaServicio || '').split(/\r?\n/).forEach(line=>p.push(xmlP(xmlRun(line),{after:0})));
  p.push(xmlHeading('III.','COTIZACIÓN'));
  p.push(xmlCotizacionTable(c));
  p.push(xmlP('',{after:140}));
  p.push(xmlP(xmlRun('Formas de pago: ',{bold:true}) + xmlRun('Transferencia, tarjeta de débito, tarjeta de crédito, efectivo, vale vista.'),{after:240}));
  p.push(xmlP(xmlRun('Datos bancarios:',{bold:true}),{after:80}));
  ['Gorroño y Jara Abogados Limitada','Rut: 77941043-9','Número de cuenta: 000094541921','Tipo de cuenta: Corriente','Banco: Santander','Mail: contacto@gjabogados.cl'].forEach(l=>p.push(xmlP(xmlRun(l,{italic:true}),{align:'center',after:0})));
  p.push(xmlHeading('IV.','OTRAS DISPOSICIONES'));
  p.push(xmlP(xmlRun('Además de las condiciones tratadas en los apartados precedentes, se deben tener cuenta las siguientes disposiciones generales de la prestación de servicios:'),{align:'both',after:240}));
  p.push(xmlDisposition('a','El cliente pagará al estudio de abogados los gastos razonables y necesarios que el cumplimiento del presente contrato represente a éste último, tales como, entre otros, reproducciones de documentos, solicitud de emisión de certificaciones, copias autorizadas u otros documentos emitidos por entidades públicas y/o privadas, administrativas y/o judiciales, u otros, como, asimismo, las cargas pecuniarias referidas en los artículos 25, 26, 27, y 28 del Código de Procedimiento Civil. Las costas que se pudieran generar como consecuencia de las gestiones encomendadas serán siempre de cargo del cliente.'));
  p.push(xmlDisposition('b','Para el fiel y acabado cumplimiento de la gestión encomendada, el cliente hará entrega íntegra y oportuna al estudio de abogados de todos los antecedentes probatorios y de toda la documentación, información y demás antecedentes fidedignos cuyo conocimiento fuere necesario, útil y/o conveniente, atendida la naturaleza y demás circunstancias de la gestión encomendada, declarando expresamente el cliente que los antecedentes cumplen la condición de ser fidedignos por solo hecho de ser puestos a disposición del estudio de abogados. Por tanto, la falta de entrega de los antecedentes necesarios para llevar a cabo la gestión encomendada exime al estudio de abogados de cualquier responsabilidad derivada de dicha omisión.'));
  p.push(xmlDisposition('c','Una vez encargada una gestión y materializado tal encargo a través de la firma del presente documento, el cliente se obligará a cumplir con todas y cada una de las obligaciones económicas establecidas, no siendo su desistimiento o renuncia de los servicios, un motivo suficiente para eximirlo de dichas obligaciones.'));
  p.push(xmlDisposition('d','Se deja expresa constancia que las obligaciones asumidas por los abogados son siempre de medios y no de resultados, por lo que la exigibilidad de resultados solo será aplicable cuando, de la naturaleza misma del servicio se desprenda como un elemento de su naturaleza, y siempre que no se trate de un asunto sometido ante un tribunal.'));
  p.push(xmlDisposition('e','El estudio de abogados se reserva el derecho de elegir el profesional que comparecerá a cada una de las gestiones presenciales o virtuales que deban realizarse, no pudiendo el cliente exigir la comparecencia personal de uno u otro de nuestros integrantes. Al efecto, el estudio podrá contratar abogados externos para la cobertura de todas las gestiones necesarias.'));
  p.push(xmlP(xmlRun('f)  ') + xmlRun('Una vez aceptada la presente propuesta de servicios, ') + xmlRun('se entenderá como un contrato de prestación de servicios a honorarios para todos los efectos legales,',{bold:true}) + xmlRun(' y previa lectura íntegra, así lo declaran las partes.'),{align:'both',indent:720,hanging:360,after:240}));
  p.push(xmlP(xmlRun('© Gorroño y Jara Abogados Limitada'),{after:240}));
  p.push(xmlP(xmlRun(`Cotización generada por: ${c.usuario || 'Administrador'}`),{after:0}));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${p.join('')}<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader1"/><w:footerReference w:type="default" r:id="rIdFooter1"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="360" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}
function pngDimensions(buffer){
  try{
    const view = new DataView(buffer);
    // PNG signature + IHDR width/height
    if(view.getUint32(0) !== 0x89504e47) return null;
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }catch(_e){ return null; }
}
function cotizacionHeaderXml(includeLogo, logoSize = null){
  if(!includeLogo) return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr></w:p></w:hdr>`;
  // Encabezado de la cotización: solo logo del estudio jurídico, centrado.
  const maxWidthEmu = 2600000;
  const ratio = logoSize?.width && logoSize?.height ? (logoSize.width / logoSize.height) : 3.57;
  const widthEmu = maxWidthEmu;
  const heightEmu = Math.max(250000, Math.round(widthEmu / ratio));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${widthEmu}" cy="${heightEmu}"/><wp:docPr id="1" name="Logo estudio jurídico"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="logo-gj.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:hdr>`;
}
function cotizacionFooterXml(){ return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr></w:p></w:ftr>`; }
async function buildCotizacionDocx(c){
  if(!window.JSZip){ throw new Error('No se cargó JSZip.'); }
  const zip = new JSZip();
  let logoBuffer = null;
  let logoSize = null;
  try{
    const logoResp = await fetch('assets/logo-gj.png');
    if(logoResp.ok){ logoBuffer = await logoResp.arrayBuffer(); logoSize = pngDimensions(logoBuffer); }
  }catch(e){ logoBuffer = null; }
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file('word/document.xml', cotizacionDocumentXml(c));
  zip.file('word/header1.xml', cotizacionHeaderXml(!!logoBuffer, logoSize));
  zip.file('word/footer1.xml', cotizacionFooterXml());
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Tahoma" w:hAnsi="Tahoma" w:eastAsia="Tahoma" w:cs="Tahoma"/><w:color w:val="000000"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:rPr><w:rFonts w:ascii="Tahoma" w:hAnsi="Tahoma" w:eastAsia="Tahoma" w:cs="Tahoma"/><w:color w:val="000000"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style></w:styles>`);
  zip.file('word/settings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/></w:settings>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>`);
  if(logoBuffer){
    zip.file('word/_rels/header1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo-gj.png"/></Relationships>`);
    zip.file('word/media/logo-gj.png', logoBuffer);
  }
  return await zip.generateAsync({ type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
async function descargarCotizacion(id){
  const c = (state.cotizaciones || []).find(x=>x.id===id);
  if(!c) return;
  try{
    const blob = await buildCotizacionDocx(c);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `N${c.numero} ${wordSafeFileName(c.nombreCliente)}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }catch(err){
    console.error(err);
    alert('No se pudo generar la cotización. Revise los datos ingresados e intente nuevamente.');
  }
}

function renderClientes(){
  const q = ($('#clienteSearch')?.value || '').toLowerCase();
  const items = [...state.clientes].sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''), 'es', { sensitivity:'base' })).filter(c=>[c.nombre,c.rut,c.correo].join(' ').toLowerCase().includes(q));
  $('#clientesList').innerHTML = items.map(c=>`<article class="entity-card clickable-card" onclick="openClienteDetalle('${c.id}')"><span class="badge ${badgeClass(c.estado)}">${safe(c.estado)}</span><h4>${safe(c.nombre)}</h4><p>${safe(c.tipo)} · ${safe(c.rut || 'Sin RUT')}</p><p>${safe(c.correo || 'Sin correo')} · ${safe(c.telefono || 'Sin teléfono')}</p><p>${safe(c.comuna || '')} ${safe(c.region || '')}</p><div class="card-actions"><button class="mini-btn" onclick="event.stopPropagation(); openClienteDetalle('${c.id}')">Ver detalle</button><button class="mini-btn danger" onclick="event.stopPropagation(); removeItem('clientes','${c.id}')">Eliminar</button></div></article>`).join('') || '<div class="empty">Sin clientes registrados.</div>';
}
function renderAsuntos(){
  const q = ($('#asuntoSearch')?.value || '').toLowerCase();
  const items = state.asuntos.filter(a=>!a.archivado && !['Archivado','Terminado'].includes(a.estado)).filter(a=>[a.nombre,a.materia,a.estado,a.area,getCliente(a.clienteId)?.nombre].join(' ').toLowerCase().includes(q));
  const archivados = state.asuntos.filter(a=>a.archivado || ['Archivado','Terminado'].includes(a.estado)).length;
  $('#asuntosList').innerHTML = (items.map(a=>`<article class="entity-card clickable-card" onclick="openAsuntoDetalle('${a.id}')"><span class="badge ${badgeClass(a.prioridad)}">${safe(a.prioridad)}</span><h4>${safe(asuntoDisplayName(a))}</h4><p>${safe(a.tipo)} · ${safe(a.area)} · ${safe(a.materia || 'Sin materia')}</p><p>Cliente: ${safe(getCliente(a.clienteId)?.nombre || 'Sin cliente')}</p><p>Responsable: ${safe(getResponsableNames(a) || 'Sin responsable')}</p><p>Estado: <strong>${safe(a.estado)}</strong></p><div class="card-actions"><button class="mini-btn" onclick="event.stopPropagation(); openAsuntoDetalle('${a.id}')">Ver detalle</button><button class="mini-btn ok-btn" onclick="event.stopPropagation(); completeAsunto('${a.id}')">Completar y archivar</button><button class="mini-btn danger" onclick="event.stopPropagation(); removeItem('asuntos','${a.id}')">Eliminar</button></div></article>`).join('') || '<div class="empty">Sin asuntos activos registrados.</div>') + (archivados ? `<div class="archive-note">${archivados} asunto(s) completado(s) y archivado(s). No se muestran en la vista activa.</div>` : '');
}
function renderCausas(){
  const q = ($('#causaSearch')?.value || '').toLowerCase();
  const items = state.causas.filter(c=>asuntoActivo(c.asuntoId) && causaActiva(c)).filter(c=>[c.tribunal,c.rit,c.rol,c.caratula].join(' ').toLowerCase().includes(q));
  const archivadas = state.causas.filter(c=>!causaActiva(c)).length;
  $('#causasList').innerHTML = `<div class="cards-grid embedded-grid">${items.map(c=>{const prox=nextAudiencia(c); return `<article class="entity-card clickable-card" onclick="openCausaDetalle('${c.id}')"><span class="badge ok">${safe(c.estadoProcesal || 'Causa')}</span><h4>${safe(c.caratula || getAsunto(c.asuntoId)?.nombre || 'Causa judicial')}</h4><p>${safe(c.tribunal || 'Sin tribunal')}</p><p>RIT/ROL: ${safe(c.rit || '-')} / ${safe(c.rol || '-')}</p><p>Próxima audiencia: ${prox ? `${safe(prox.tipo === 'Otro' ? prox.otro : prox.tipo)} · ${fmtDate(prox.fecha)} ${safe(prox.hora || '')}` : 'Sin audiencia'}</p><div class="card-actions"><button class="mini-btn" onclick="event.stopPropagation(); openCausaDetalle('${c.id}')">Ver detalle</button><button class="mini-btn ok-btn" onclick="event.stopPropagation(); completeCausa('${c.id}')">Completar y archivar</button><button class="mini-btn danger" onclick="event.stopPropagation(); removeItem('causas','${c.id}')">Eliminar</button></div></article>`}).join('') || '<div class="empty">Sin causas judiciales activas.</div>'}</div>${archivadas ? `<div class="archive-note">${archivadas} causa(s) judicial(es) completada(s) y archivada(s). Revísalas en la sección Archivo.</div>` : ''}`;
}
function renderTareas(){
  const responsibleFilter = $('#tareaResponsableFiltro')?.value || '';
  const priorityFilter = $('#tareaPrioridadFiltro')?.value || '';
  const estados = ['Pendiente','En proceso','Atrasada'];
  const archivadas = state.tareas.filter(t=>t.archivada || t.estado==='Terminada').length;
  const userOptions = state.users.map(u=>`<option value="${u.id}">${safe(u.nombre)}</option>`).join('');
  const filterBar = `<div class="toolbar"><select id="tareaResponsableFiltro"><option value="">Todos los responsables</option>${userOptions}</select><select id="tareaPrioridadFiltro"><option value="">Todas las prioridades</option><option>Baja</option><option>Media</option><option>Alta</option><option>Urgente</option></select></div>`;
  $('#kanban').innerHTML = estados.map(est=>{
    const items = state.tareas.filter(t => asuntoActivo(t.asuntoId) && !t.archivada && t.estado !== 'Terminada')
      .filter(t => est==='Atrasada' ? t.vencimiento && daysUntil(t.vencimiento)<0 : t.estado===est && !(t.vencimiento && daysUntil(t.vencimiento)<0))
      .filter(t => !responsibleFilter || asArray(t.responsableIds || t.responsableId).includes(responsibleFilter))
      .filter(t => !priorityFilter || t.prioridad === priorityFilter);
    return `<div class="kanban-col" data-status="${est}" ondragover="event.preventDefault()" ondrop="dropTaskStatus(event,'${est}')"><h4>${est} (${items.length})</h4>${items.map(t=>{const chips=[!asArray(t.responsableIds||t.responsableId).length?'Sin responsable':'',daysUntil(t.vencimiento)===0?'Vence hoy':'',daysUntil(t.vencimiento)<0?'Atrasada':''].filter(Boolean).map(c=>`<span class="badge warn">${c}</span>`).join(' '); return `<div class="task-card clickable-card" draggable="true" ondragstart="dragTaskStatus(event,'${t.id}')" onclick="openTareaDetalle('${t.id}')"><span class="badge ${badgeClass(t.prioridad)}">${safe(t.prioridad)}</span> ${chips}<strong>${safe(t.titulo)}</strong><p>${safe(t.descripcion || 'Sin descripción')}</p><p>${safe(getAsunto(t.asuntoId)?.nombre || 'Sin asunto')}</p><p>Vence: ${fmtDate(t.vencimiento)}</p><p>Responsable(s): ${safe(getResponsableNames(t) || '-')}</p><div class="card-actions"><button class="mini-btn" onclick="event.stopPropagation(); openTareaDetalle('${t.id}')">Ver detalle</button><button class="mini-btn ok-btn" onclick="event.stopPropagation(); completeTarea('${t.id}')">Completar y archivar</button><button class="mini-btn danger" onclick="event.stopPropagation(); removeItem('tareas','${t.id}')">Eliminar</button></div></div>`;}).join('') || '<div class="empty">Sin registros.</div>'}</div>`;
  }).join('') + (archivadas ? `<div class="archive-note kanban-archive-note">${archivadas} tarea(s) completada(s) y archivada(s). No se muestran en el tablero activo.</div>` : '');
  $('#kanban').innerHTML = filterBar + $('#kanban').innerHTML;
  const respEl = $('#tareaResponsableFiltro');
  const prioEl = $('#tareaPrioridadFiltro');
  if(respEl) respEl.value = responsibleFilter;
  if(prioEl) prioEl.value = priorityFilter;
}
function dragTaskStatus(event, taskId){ event.dataTransfer.setData('text/plain', taskId); }
function dropTaskStatus(event, status){
  const taskId = event.dataTransfer.getData('text/plain');
  const t = state.tareas.find(x=>x.id===taskId);
  if(!t) return;
  t.estado = status === 'Atrasada' ? 'Pendiente' : status;
  if(status === 'Terminada') t.archivada = true;
  log(`Cambió estado de tarea por arrastre: ${t.titulo} → ${status}`);
  renderTareas();
  queueAutoPushToCpanel();
}
window.dragTaskStatus = dragTaskStatus;
window.dropTaskStatus = dropTaskStatus;
function renderPlazos(){
  const activos = state.plazos.filter(p=>asuntoActivo(p.asuntoId) && plazoActivo(p)).sort(sortByVencimiento);
  const ocultos = state.plazos.length - activos.length;
  $('#plazosList').innerHTML = `<div class="cards-grid embedded-grid">${activos.map(p=>{const d=daysUntil(p.vencimiento);return `<article class="entity-card clickable-card" onclick="openPlazoDetalle('${p.id}')"><span class="badge ${d<0?'danger':d<=3?'warn':'ok'}">${d<0?'Vencido':d+' días'}</span><h4>${safe(p.nombre)}</h4><p>Asunto: ${safe(getAsunto(p.asuntoId)?.nombre || '-')}</p><p>Vencimiento: ${fmtDate(p.vencimiento)}</p><p>Responsable: ${safe(getResponsableNames(p) || '-')}</p><p>Estado: <strong>${safe(p.estado)}</strong></p><div class="card-actions"><button class="mini-btn" onclick="event.stopPropagation(); openPlazoDetalle('${p.id}')">Ver detalle</button><button class="mini-btn ok-btn" onclick="event.stopPropagation(); completePlazo('${p.id}')">Completar y archivar</button><button class="mini-btn danger" onclick="event.stopPropagation(); removeItem('plazos','${p.id}')">Eliminar</button></div></article>`}).join('') || '<div class="empty">Sin plazos activos registrados.</div>'}</div>${ocultos ? `<div class="archive-note">${ocultos} plazo(s) completado(s), archivado(s) u oculto(s) por pertenecer a asuntos archivados. Revísalos en la sección Archivo.</div>` : ''}`;
}
function renderArchivo(){
  const asuntos = state.asuntos.filter(a=>a.archivado || ['Archivado','Terminado'].includes(a.estado));
  const causas = state.causas.filter(c=>!causaActiva(c));
  const tareas = state.tareas.filter(t=>t.archivada || t.estado==='Terminada');
  const plazos = state.plazos.filter(p=>!plazoActivo(p)).sort(sortByVencimiento);
  const card = (title, count, body) => `<div class="archive-category"><div class="archive-category-head"><h4>${title}</h4><span class="badge ok">${count}</span></div><div class="archive-list">${body || '<div class="empty">Sin registros archivados.</div>'}</div></div>`;
  const asuntoBody = asuntos.map(a=>`<article class="archive-row clickable-card" onclick="openAsuntoDetalle('${a.id}')"><strong>${safe(a.nombre)}</strong><span>${safe(getCliente(a.clienteId)?.nombre || 'Sin cliente')} · ${safe(a.area || '-')} · ${safe(a.estado || 'Archivado')}</span></article>`).join('');
  const causaBody = causas.map(c=>`<article class="archive-row clickable-card" onclick="openCausaDetalle('${c.id}')"><strong>${safe(c.caratula || c.rit || getAsunto(c.asuntoId)?.nombre || 'Causa judicial')}</strong><span>${safe(c.tribunal || 'Sin tribunal')} · ${safe(c.estadoProcesal || 'Archivada')}</span></article>`).join('');
  const tareaBody = tareas.map(t=>`<article class="archive-row clickable-card" onclick="openTareaDetalle('${t.id}')"><strong>${safe(t.titulo)}</strong><span>${safe(getAsunto(t.asuntoId)?.nombre || 'Sin asunto')} · ${safe(t.estado || 'Terminada')}</span></article>`).join('');
  const plazoBody = plazos.map(p=>`<article class="archive-row clickable-card" onclick="openPlazoDetalle('${p.id}')"><strong>${safe(p.nombre)}</strong><span>${safe(getAsunto(p.asuntoId)?.nombre || 'Sin asunto')} · Vencía ${fmtDate(p.vencimiento)} · ${safe(p.estado || 'Archivado')}</span></article>`).join('');
  const total = asuntos.length + causas.length + tareas.length + plazos.length;
  const el = $('#archivoView');
  if(!el) return;
  el.innerHTML = `<div class="section-header"><div><h3>Archivo</h3><p>Registros completados y archivados, separados por categoría.</p></div><span class="badge ok">${total} archivados</span></div><div class="archive-grid">${card('Asuntos archivados', asuntos.length, asuntoBody)}${card('Causas judiciales archivadas', causas.length, causaBody)}${card('Tareas archivadas', tareas.length, tareaBody)}${card('Plazos archivados', plazos.length, plazoBody)}</div>`;
}
function renderUsuarios(){
  $('#usuariosList').innerHTML = state.users.map(u=>`<article class="entity-card clickable-card" onclick="editUser('${u.id}')"><span class="badge ${u.activo?'ok':'danger'}">${u.activo?'Activo':'Inactivo'}</span><h4>${u.nombre}</h4><p>${u.correo}</p><p>Rol: ${u.rol}</p><div class="card-actions"><button class="mini-btn" onclick="event.stopPropagation(); editUser('${u.id}')">Editar</button><button class="mini-btn danger" onclick="event.stopPropagation(); removeItem('users','${u.id}')">Eliminar</button></div></article>`).join('');
}
function editUser(id){
  const u = state.users.find(x => x.id === id); if(!u) return;
  closeModals(); openModal('usuarioModal'); setModalTitle('usuarioModal','Editar usuario');
  setField('#usuarioId', u.id); setField('#usuarioNombre', u.nombre); setField('#usuarioCorreo', u.correo); setField('#usuarioRol', u.rol); setField('#usuarioActivo', String(!!u.activo));
  setField('#usuarioPassword', '');
  const passInput = $('#usuarioPassword');
  if(passInput){
    passInput.required = false;
    passInput.placeholder = 'Dejar en blanco para no cambiar';
  }
}
window.editUser = editUser;

['clienteSearch','asuntoSearch','causaSearch'].forEach(id => document.addEventListener('input', e => { if(e.target.id===id) renderAll(); }));
['activityUserFilter','activityDateFilter'].forEach(id => document.addEventListener('input', e => { if(e.target.id===id) renderUtilidades(); }));
['tareaResponsableFiltro','tareaPrioridadFiltro'].forEach(id => document.addEventListener('change', e => { if(e.target.id===id) renderTareas(); }));
$('#asuntoApplyTemplateBtn')?.addEventListener('click', ()=>applyTemplate('asunto'));
$('#tareaApplyTemplateBtn')?.addEventListener('click', ()=>applyTemplate('tarea'));
$('#plazoApplyTemplateBtn')?.addEventListener('click', ()=>applyTemplate('plazo'));

$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `respaldo_gestion_juridica_${todayISO()}.json`; a.click(); URL.revokeObjectURL(a.href);
});


$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', event => {
  const file = event.target.files?.[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      const requiredArrays = ['users','clientes','asuntos','causas','tareas','plazos'];
      const missing = requiredArrays.filter(key => !Array.isArray(imported[key]));
      if(missing.length){
        alert(`El archivo JSON no tiene una estructura válida. Faltan o no son listas: ${missing.join(', ')}.`);
        event.target.value = '';
        return;
      }
      const currentSession = state.session;
      localStorage.setItem(`${STORAGE_KEY}_backup_${new Date().toISOString()}`, JSON.stringify(state));
      state = {
        session: imported.session || currentSession,
        users: imported.users,
        clientes: imported.clientes,
        asuntos: imported.asuntos,
        causas: imported.causas,
        tareas: imported.tareas,
        plazos: imported.plazos,
        cotizaciones: Array.isArray(imported.cotizaciones) ? imported.cotizaciones : [],
        logs: Array.isArray(imported.logs) ? imported.logs : []
      };
      if(currentSession && !state.users.some(u => u.id === currentSession.id)) state.session = currentSession;
      normalizeState();
      log(`Importó base de datos desde JSON: ${file.name}`);
      renderAll();
      alert('Base de datos importada correctamente. Se creó un respaldo automático de la base anterior en este navegador.');
    } catch(error){
      alert('No se pudo importar el archivo. Verifique que sea un JSON válido exportado desde la aplicación.');
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
});

renderAll();
