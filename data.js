/* Nuestras Finanzas · Pantalla de entrada (sesión y autorización) */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let onReady = null, started = false, entering = false, codeEmail = '';

  function show(html) {
    $('gateBody').innerHTML = html;
    $('gate').hidden = false;
    document.body.classList.add('gated');
  }
  function hide() {
    $('gate').hidden = true;
    document.body.classList.remove('gated');
  }
  function setMsg(text, isError) {
    const m = $('gateMsg'); if (!m) return;
    m.textContent = text || ''; m.className = 'gate-msg' + (isError ? ' error' : '');
  }

  function loginView() {
    show(`
      <p class="gate-lead">Entra para ver y registrar sus movimientos.</p>
      <button class="btn gate-google" id="gGoogle" type="button">
        <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        Entrar con Google
      </button>
      <details class="gate-alt">
        <summary>¿No funciona? Entra con un código por correo</summary>
        <div class="inline" style="margin-top:10px">
          <input class="inline-input" id="gEmail" type="email" inputmode="email" autocomplete="email" placeholder="tu-correo@gmail.com" aria-label="Correo">
          <button class="btn ghost" id="gSend" type="button">Enviar código</button>
        </div>
      </details>
      <p class="gate-msg" id="gateMsg" role="status"></p>`);
  }
  function codeView(email) {
    codeEmail = email;
    show(`
      <p class="gate-lead">Te enviamos un código a <strong>${esc(email)}</strong>. Escríbelo aquí.</p>
      <div class="inline">
        <input class="inline-input gate-code" id="gCode" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456" aria-label="Código">
        <button class="btn" id="gVerify" type="button" style="width:auto">Entrar</button>
      </div>
      <button class="link-btn" id="gBack" type="button" style="margin-top:14px">Volver</button>
      <p class="gate-msg" id="gateMsg" role="status"></p>`);
    setTimeout(() => $('gCode') && $('gCode').focus(), 50);
  }
  function deniedView(email) {
    show(`
      <p class="gate-lead">La cuenta <strong>${esc(email)}</strong> no tiene acceso a esta app.</p>
      <p class="note">Pide a quien te invitó que te agregue a su espacio en «Personas y cuenta» y vuelve a entrar con esta misma cuenta.</p>
      <button class="btn ghost" id="gOut" type="button">Entrar con otra cuenta</button>`);
  }
  function setupView() {
    show(`
      <p class="gate-lead">Falta conectar la base de datos.</p>
      <p class="note">Abre <code>js/config.js</code> y pega la URL y la clave pública de tu proyecto de Supabase (Project Settings > API). Luego vuelve a publicar la app.</p>`);
  }
  function loadingView(text) {
    show(`<p class="gate-lead">${esc(text || 'Abriendo…')}</p><div class="skeleton"></div><div class="skeleton" style="width:70%"></div>`);
  }

  // Sin internet: entra con el último acceso verificado en este teléfono
  function tryOffline() {
    if (started) return true;
    const info = NF.auth.offline();
    if (!info) return false;
    hide(); started = true; onReady(Object.assign({ offline: true }, info));
    return true;
  }

  async function enter(session) {
    if (entering || started) return;
    entering = true;
    loadingView('Verificando tu acceso…');
    try {
      const info = await NF.auth.authorize(session);
      if (!info.allowed) { deniedView(info.email); return; }
      hide();
      if (!started) { started = true; onReady(info); }
    } catch (e) {
      if ((e.offline || !navigator.onLine) && tryOffline()) return;
      loginView(); setMsg(e.message, true);
    } finally { entering = false; }
  }

  document.addEventListener('click', async e => {
    const id = e.target.closest('button') && e.target.closest('button').id;
    try {
      if (id === 'gGoogle') { setMsg('Abriendo Google…'); await NF.auth.signInWithGoogle(); }
      else if (id === 'gSend') {
        $('gSend').disabled = true; setMsg('Enviando…');
        const email = await NF.auth.sendCode($('gEmail').value);
        codeView(email);
      }
      else if (id === 'gVerify') {
        $('gVerify').disabled = true; setMsg('Verificando…');
        await NF.auth.verifyCode(codeEmail, $('gCode').value);
        const s = await NF.auth.session();
        if (s) enter(s);
      }
      else if (id === 'gBack') loginView();
      else if (id === 'gOut') { await NF.auth.signOut(); location.reload(); }
    } catch (err) {
      setMsg(err.message, true);
      ['gSend', 'gVerify'].forEach(b => $(b) && ($(b).disabled = false));
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'gEmail') $('gSend').click();
    if (e.target.id === 'gCode') $('gVerify').click();
  });

  NF.gate = {
    async start(cb) {
      onReady = cb;
      if (!NF.auth.configured) { setupView(); return; }
      loadingView();
      NF.auth.onChange((event, session) => {
        if (event === 'SIGNED_OUT') { NF.cache.clearAll(); location.reload(); }
        else if (event === 'SIGNED_IN' && session && !started) enter(session);
      });
      try {
        const session = await NF.auth.session();
        // Limpia el código de inicio de sesión de la dirección
        if (/[?&](code|error)=/.test(location.search)) history.replaceState(null, '', NF.appUrl());
        if (session) enter(session);
        else if (tryOffline()) return; // hay sesión guardada pero no se pudo renovar (sin internet)
        else loginView();
      } catch (e) {
        if (tryOffline()) return;
        loginView(); setMsg(e.message, true);
      }
    }
  };
})();
