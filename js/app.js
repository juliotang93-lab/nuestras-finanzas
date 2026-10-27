/* Nuestras Finanzas · Interfaz */
(function () {
  'use strict';
    /* ---------- Configuración ---------- */
    const APP_VERSION = '2.2.0';
    const LOCALE = 'es-CO';
    const CURRENCY = 'COP';
    const CURRENCY_DECIMALS = 0; // pon 2 si usas USD/EUR
    const PAGE = 150;
    const WALLET_ICONS = { 'Débito': '🏦', 'Crédito': '💳', 'Efectivo': '💵', 'Ahorros': '🐖', 'Otro': '👛' };
    const WALLET_COLORS = ['#3B4CCA', '#D1435B', '#0F8A6A', '#E0A21B', '#7B5CD6', '#1D9BB8', '#E06B2D', '#B0457E', '#5B8C2A', '#637083'];
    const WALLET_ICON_SET = ['🏦','💳','💵','🐖','👛','💰','🪙','💼','💎','📈','🏠','🚗','✈️','🎓','👶','❤️','🛒','🎁','🧾','🌱','⭐','🔒','📱','🍽️'];
    const walletIcon = w => (w && w.icono) || (w && WALLET_ICONS[w.tipo]) || '👛';
    const CHART_COLORS = ['#3B4CCA', '#0F8A6A', '#D1435B', '#E0A21B', '#7B5CD6', '#1D9BB8', '#E06B2D', '#5B8C2A', '#B0457E', '#8A96A8'];
    const NONE = '__none';
    const ICONS = ['🍽️','🍔','🍕','☕','🛒','🍺','🚌','🚗','⛽','🚕','✈️','🚲','🏠','💡','💧','📱','🌐','🔧','🩺','💊','🏋️','💇','🎬','🎮','🎵','📺','🎉','🛍️','👕','👟','🎁','📚','🎓','✏️','👶','🐶','🐱','❤️','🧾','💳','🏦','💼','💻','📈','💰','💵','🪙','🏷️','🧹','🛠️','🌱','⚽','🏖️','🧳','🍼','📦','🔁','⭐','🙏','🚑'];

    /* ---------- Estado ---------- */
    const state = {
      transactions: [], wallets: [], categories: { Gasto: [], Ingreso: [] }, walletTypes: [],
      view: 'mov', wallet: 'Todas', preset: 'month', from: '', to: '',
      formType: 'Gasto', filter: 'Todos', query: '', limit: PAGE,
      repType: 'Gasto', repCat: null, newColor: WALLET_COLORS[0],
      me: '', owner: '', isAdmin: false, identified: true, appUrl: '', users: [], categoryList: [],
      isSuper: false, spaces: [], spaceId: '', spaceName: '', members: [],
      catType: 'Gasto', pickerFor: null, newIcon: '🏷️', walletForm: null, wPicker: false,
      tagList: [], formTags: [], tag: 'Todas', receipt: null,
      detail: null,
      budgets: [], goals: [], contributions: [], recurring: [], prefs: {},
      loading: true, saving: false
    };
    const charts = {};
    const $ = id => document.getElementById(id);
    const money = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY, minimumFractionDigits: CURRENCY_DECIMALS, maximumFractionDigits: CURRENCY_DECIMALS });

    /* ---------- Utilidades ---------- */
    const pad = n => String(n).padStart(2, '0');
    const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const monthKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1);
    const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
    const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const fmtDate = (s, opts) => parseISO(s).toLocaleDateString(LOCALE, opts || { day: 'numeric', month: 'short', year: 'numeric' });
    const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

    /* Monto con separador de miles (es-CO: 1.250.000,50) */
    function formatAmountInput(el) {
      const pos = el.selectionStart || el.value.length;
      const digitsBefore = el.value.slice(0, pos).replace(/[^\d]/g, '').length;
      let raw = el.value.replace(/[^\d,]/g, '');
      let int = raw, dec;
      if (CURRENCY_DECIMALS > 0 && raw.includes(',')) {
        const i = raw.indexOf(',');
        int = raw.slice(0, i);
        dec = raw.slice(i + 1).replace(/,/g, '').slice(0, CURRENCY_DECIMALS);
      } else { int = raw.replace(/,/g, ''); }
      int = int.replace(/^0+(?=\d)/, '').slice(0, 12);
      el.value = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec !== undefined ? ',' + dec : '');
      let count = 0, p = 0;
      while (p < el.value.length && count < digitsBefore) { if (/\d/.test(el.value[p])) count++; p++; }
      try { el.setSelectionRange(p, p); } catch (e) {}
      const wrap = el.closest('.money-input'); if (wrap) wrap.classList.toggle('filled', !!el.value);
    }
    const parseAmount = v => parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')) || 0;

    function tagColor(name) { const t = state.tagList.find(x => x.nombre === name); return t ? t.color : cssVar('--muted'); }
    const tagsInline = t => (t.etiquetas || []).map(n => `<span class="t-tag" style="--tc:${tagColor(n)}">#${escapeHtml(n)}</span>`).join('');
    const receiptLink = t => t.factura ? `<a class="receipt-link" href="${escapeHtml(t.factura)}" target="_blank" rel="noopener" title="Ver factura" aria-label="Ver factura">📎</a>` : '';

    function iconFor(tipo, cat) {
      const found = (state.categories[tipo] || []).find(c => c[0] === cat);
      return found ? found[1] : (tipo === 'Ingreso' ? '💰' : '💸');
    }
    function walletOf(name) { return state.wallets.find(w => w.nombre === name); }

    let toastTimer;
    function toast(msg, isError) {
      const t = $('toast');
      t.textContent = msg;
      t.className = 'toast show' + (isError ? ' error' : '');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { t.className = 'toast' + (isError ? ' error' : ''); }, 3500);
    }

    async function call(fn, ...args) {
      if (!navigator.onLine && fn !== 'getData') throw new Error('Sin conexión a internet. Este cambio no se guardó.');
      return NF.api[fn](...args);
    }

    /* ---------- Filtros ---------- */
    function applyPreset(p) {
      const now = new Date();
      const y = now.getFullYear(), m = now.getMonth();
      state.preset = p;
      if (p === 'month') { state.from = iso(new Date(y, m, 1)); state.to = iso(new Date(y, m + 1, 0)); }
      else if (p === 'lastMonth') { state.from = iso(new Date(y, m - 1, 1)); state.to = iso(new Date(y, m, 0)); }
      else if (p === 'last30') { state.from = iso(new Date(y, m, now.getDate() - 29)); state.to = iso(now); }
      else if (p === 'last90') { state.from = iso(new Date(y, m, now.getDate() - 89)); state.to = iso(now); }
      else if (p === 'year') { state.from = iso(new Date(y, 0, 1)); state.to = iso(new Date(y, 11, 31)); }
      else if (p === 'all') { state.from = ''; state.to = ''; }
      $('preset').value = p;
      $('from').value = state.from;
      $('to').value = state.to;
      state.limit = PAGE;
    }
    function onDateInput() {
      let f = $('from').value, t = $('to').value;
      if (f && t && f > t) { [f, t] = [t, f]; $('from').value = f; $('to').value = t; }
      state.from = f; state.to = t; state.preset = 'custom'; state.limit = PAGE;
      $('preset').value = 'custom';
      render();
    }
    const inRange = t => (!state.from || t.fecha >= state.from) && (!state.to || t.fecha <= state.to);
    const inWallet = t => state.wallet === 'Todas' || (state.wallet === NONE ? !walletOf(t.cartera) : t.cartera === state.wallet);
    const inTag = t => state.tag === 'Todas' || (t.etiquetas || []).includes(state.tag);
    const scoped = () => state.transactions.filter(t => inRange(t) && inWallet(t)); // la etiqueta solo filtra en Reportes

    /* ---------- Tema ---------- */
    const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
    const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
    function applyTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      $('themeBtn').innerHTML = theme === 'dark' ? SUN : MOON;
      store.set('finanzas-theme', theme);
      if (state.view === 'rep') renderReports();
      else if (state.view === 'ana' && window.NFModules) NFModules.render('ana');
    }

    /* ---------- Saldos ---------- */
    function balances() {
      const bal = {};
      state.wallets.forEach(w => bal[w.nombre] = w.saldoInicial);
      let none = 0, hasNone = false;
      state.transactions.forEach(t => {
        const s = t.tipo === 'Ingreso' ? t.monto : -t.monto;
        if (t.cartera in bal) bal[t.cartera] += s; else { none += s; hasNone = true; }
      });
      return { bal, none, hasNone };
    }

    /* ---------- Formulario ---------- */
    function setFormType(type) {
      state.formType = type;
      $('formType').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.type === type)));
      const prev = $('categoria').value;
      $('categoria').innerHTML = (state.categories[type] || []).map(([n, i]) => `<option value="${escapeHtml(n)}">${i} ${escapeHtml(n)}</option>`).join('');
      if (prev && (state.categories[type] || []).some(c => c[0] === prev)) $('categoria').value = prev;
      updateSaveLabel();
    }
    function updateSaveLabel() {
      $('saveBtn').textContent = state.formType === 'Gasto' ? 'Guardar gasto' : 'Guardar ingreso';
    }
    function fillWalletSelect() {
      const sel = $('cartera');
      const current = sel.value || (state.wallet !== 'Todas' && state.wallet !== NONE ? state.wallet : store.get('finanzas-cartera'));
      sel.innerHTML = state.wallets.map(w => `<option value="${escapeHtml(w.nombre)}">${walletIcon(w)} ${escapeHtml(w.nombre)}</option>`).join('');
      if (current && walletOf(current)) sel.value = current;
    }

    async function save() {
      if (state.saving) return;
      const monto = parseAmount($('monto').value);
      const fecha = $('fecha').value;
      if (!monto || monto <= 0) { toast('Escribe un monto mayor que 0.', true); $('monto').focus(); return; }
      if (!fecha) { toast('Elige una fecha.', true); $('fecha').focus(); return; }
      if (!$('cartera').value) { toast('Crea una cartera primero.', true); return; }

      const payload = {
        tipo: state.formType, categoria: $('categoria').value, cartera: $('cartera').value, monto, fecha,
        descripcion: $('descripcion').value.trim(), etiquetas: state.formTags.slice(),
        factura: state.receipt ? { name: state.receipt.name, mimeType: state.receipt.mimeType, data: state.receipt.data } : null
      };
      const repeatSel = $('repeat').value;
      if (!navigator.onLine) { saveOffline(payload, repeatSel); return; }
      state.saving = true;
      $('saveBtn').disabled = true; $('saveBtn').textContent = state.receipt ? 'Subiendo factura…' : 'Guardando…';
      try {
        payload.id = NF.uuid();
        const tx = await NF.api.addTransaction(payload);
        state.transactions.push(tx);
        NF.api.notifyTx(tx.id);
        let label = state.formType === 'Gasto' ? 'Gasto guardado' : 'Ingreso guardado';
        const repeat = $('repeat').value;
        if (repeat) {
          try {
            await call('saveRecurring', { tipo: tx.tipo, categoria: tx.categoria, cartera: tx.cartera, monto: tx.monto, descripcion: tx.descripcion,
              frecuencia: repeat, proxima: NFInsights.nextDate(tx.fecha, repeat) });
            label += ' y programado';
            load(true);
          } catch (e) { toast('Se guardó, pero no se pudo programar: ' + e.message, true); }
        }
        store.set('finanzas-cartera', tx.cartera);
        resetForm();
        render();
        toast(inRange(tx) && inWallet(tx) ? label : label + ' (fuera del filtro actual)');
        if (!isTouch()) $('monto').focus();
      } catch (err) {
        if (err.offline) { state.saving = false; saveOffline(payload, repeatSel); return; }
        toast('No se pudo guardar: ' + err.message, true);
      } finally {
        state.saving = false; $('saveBtn').disabled = false; updateSaveLabel();
      }
    }

    /* ---------- Movimientos guardados sin conexión ----------
       Se guardan en este teléfono y se envían solos al volver internet (sin duplicarse). */
    const queue = {
      key: () => 'nf-cache-pendientes-' + state.me + '-' + (NF.ctx.spaceId || ''),
      all() { try { return JSON.parse(localStorage.getItem(queue.key()) || '[]'); } catch (e) { return []; } },
      save(list) { localStorage.setItem(queue.key(), JSON.stringify(list)); },
      remove(id) { try { queue.save(queue.all().filter(x => x.payload.id !== id)); } catch (e) {} }
    };
    const pendingTx = it => ({ id: it.payload.id, fecha: it.payload.fecha, tipo: it.payload.tipo, categoria: it.payload.categoria, cartera: it.payload.cartera,
      monto: it.payload.monto, descripcion: it.payload.descripcion || '', etiquetas: it.payload.etiquetas || [], creadoPor: state.me,
      factura: '', facturaPath: '', recurringId: '', pendiente: true, errorEnvio: it.error || '' });
    function mergePending() {
      const have = new Set(state.transactions.map(t => t.id));
      queue.all().forEach(it => { if (!have.has(it.payload.id)) state.transactions.push(pendingTx(it)); });
    }
    function saveOffline(payload, repeat) {
      payload.id = payload.id || NF.uuid();
      const item = { payload, repeat: repeat || '', at: new Date().toISOString() };
      let note = '';
      try { queue.save(queue.all().concat(item)); }
      catch (e) {
        // Sin espacio para la foto: se guarda el movimiento sin ella
        if (!payload.factura) { toast('No se pudo guardar en este teléfono.', true); return; }
        item.payload = Object.assign({}, payload, { factura: null });
        try { queue.save(queue.all().concat(item)); note = ' (sin la foto: agrégala al volver internet)'; }
        catch (e2) { toast('No se pudo guardar en este teléfono.', true); return; }
      }
      state.transactions.push(pendingTx(item));
      store.set('finanzas-cartera', payload.cartera);
      resetForm(); render();
      toast('Guardado en este teléfono' + note + '. Se enviará solo cuando vuelva internet.');
    }
    let flushing = false;
    async function flushQueue() {
      if (flushing || !navigator.onLine || !state.me) return 0;
      const list = queue.all();
      if (!list.length) return 0;
      flushing = true;
      let sent = 0, failed = 0;
      try {
        for (const it of list) {
          try {
            const tx = await NF.api.addTransaction(it.payload);
            NF.api.notifyTx(tx.id);
            if (it.repeat) {
              try { await NF.api.saveRecurring({ tipo: tx.tipo, categoria: tx.categoria, cartera: tx.cartera, monto: tx.monto, descripcion: tx.descripcion,
                frecuencia: it.repeat, proxima: NFInsights.nextDate(tx.fecha, it.repeat) }); } catch (e) {}
            }
            queue.remove(it.payload.id); sent++;
          } catch (e) {
            if (e.offline) break; // se intenta de nuevo más tarde
            failed++;
            try { queue.save(queue.all().map(x => x.payload.id === it.payload.id ? Object.assign(x, { error: e.message }) : x)); } catch (e2) {}
          }
        }
      } finally { flushing = false; }
      if (sent) toast(sent === 1 ? 'Se envió 1 movimiento que guardaste sin conexión' : 'Se enviaron ' + sent + ' movimientos que guardaste sin conexión');
      else if (failed) toast('Hay movimientos sin conexión que no se pudieron enviar. Tócalos para ver el motivo.', true);
      return sent;
    }
    // Primero se traen los datos (para conocer carteras y categorías), luego se envían los pendientes
    async function syncAndLoad() { await load(true); if (await flushQueue()) await load(true); }
    function openPending(t) {
      const msg = (t.errorEnvio ? 'No se pudo enviar: ' + t.errorEnvio + '\n\n' : 'Este movimiento está guardado en este teléfono y se enviará solo cuando vuelva internet.\n\n')
        + '¿Quieres descartarlo?';
      if (window.confirm(msg)) {
        queue.remove(t.id);
        state.transactions = state.transactions.filter(x => x.id !== t.id);
        render(); toast('Movimiento descartado');
      }
    }

    function resetForm() {
      $('monto').value = ''; $('descripcion').value = ''; $('moneyWrap').classList.remove('filled');
      $('fecha').value = iso(new Date());
      if ($('repeat')) $('repeat').value = '';
      state.formTags = []; state.receipt = null; renderTagPicker(); renderReceipt();
      updateSaveLabel();
    }

    /* ---------- Detalle de movimiento (ver, editar, eliminar) ---------- */
    const TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';
    const amountText = n => String(Math.round(n * 100) / 100).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    function openTxDetail(id) {
      const t = state.transactions.find(x => x.id === id);
      if (!t) return;
      if (t.pendiente) { openPending(t); return; }
      state.detail = {
        id, editing: false, receipt: null, removeFactura: false, confirmClose: false, saving: false,
        orig: t,
        draft: { tipo: t.tipo, categoria: t.categoria, cartera: walletOf(t.cartera) ? t.cartera : '', monto: t.monto, fecha: t.fecha, descripcion: t.descripcion, etiquetas: (t.etiquetas || []).slice() }
      };
      renderTxDetail();
      resetDel($('tdDelete'));
      $('txModal').hidden = false;
      $('tdBody').scrollTop = 0;
    }

    function detailDirty() {
      const d = state.detail; if (!d) return false;
      const o = d.orig, x = d.draft;
      return d.receipt || d.removeFactura || x.tipo !== o.tipo || x.categoria !== o.categoria || x.cartera !== o.cartera ||
        Number(x.monto) !== Number(o.monto) || x.fecha !== o.fecha || x.descripcion !== o.descripcion ||
        x.etiquetas.slice().sort().join('|') !== (o.etiquetas || []).slice().sort().join('|');
    }
    function updateDetailFoot() {
      const d = state.detail; if (!d) return;
      const dirty = detailDirty();
      $('tdFoot').hidden = !dirty;
      d.confirmClose = false;
    }

    function renderTxDetail() {
      const d = state.detail; if (!d) return;
      const x = d.draft, o = d.orig;
      const cc = catColor(x.categoria);
      $('txModal').querySelector('.tx-sheet').style.setProperty('--cc', cc);
      $('tdEdit').textContent = d.editing ? 'Listo' : 'Editar';
      $('tdEdit').setAttribute('aria-pressed', String(d.editing));

      // Encabezado: vista o edición de tipo, categoría y valor
      if (!d.editing) {
        const sign = x.tipo === 'Ingreso' ? '+' : '−';
        $('tdHeroBody').innerHTML = `
          <span class="td-icon" aria-hidden="true">${iconFor(x.tipo, x.categoria)}</span>
          <p class="td-cat" id="tdCat">${escapeHtml(x.categoria)}</p>
          <p class="td-amount num ${x.tipo === 'Ingreso' ? 'in' : ''}">${sign}${money.format(x.monto)}</p>`;
      } else {
        const cats = state.categories[x.tipo] || [];
        const catOpts = cats.map(([n, i]) => `<option value="${escapeHtml(n)}" ${n === x.categoria ? 'selected' : ''}>${i} ${escapeHtml(n)}</option>`).join('')
          + (cats.some(c => c[0] === x.categoria) ? '' : `<option value="${escapeHtml(x.categoria)}" selected>${escapeHtml(x.categoria)}</option>`);
        $('tdHeroBody').innerHTML = `
          <div class="type-toggle td-type" role="group" aria-label="Tipo">
            <button type="button" data-td-type="Gasto" aria-pressed="${x.tipo === 'Gasto'}">Gasto</button>
            <button type="button" data-td-type="Ingreso" aria-pressed="${x.tipo === 'Ingreso'}">Ingreso</button>
          </div>
          <div class="money-input td-money filled"><span class="prefix" aria-hidden="true">$</span>
            <input class="amount-input num" id="tdMonto" type="text" inputmode="numeric" autocomplete="off" value="${amountText(x.monto)}" aria-label="Valor"></div>
          <select class="td-select-cat" id="tdCatSel" aria-label="Categoría">${catOpts}</select>`;
      }

      // Cuerpo
      const walletOpts = (x.cartera ? '' : '<option value="" selected>Elige una cartera</option>') +
        state.wallets.map(w => `<option value="${escapeHtml(w.nombre)}" ${w.nombre === x.cartera ? 'selected' : ''}>${walletIcon(w)} ${escapeHtml(w.nombre)}</option>`).join('');
      const tagChips = state.tagList.map(t => `<button type="button" class="td-chip" data-td-tag="${escapeHtml(t.nombre)}" aria-pressed="${x.etiquetas.includes(t.nombre)}" style="--tc:${t.color}">${escapeHtml(t.nombre)}</button>`).join('');

      let receipt;
      if (d.receipt) {
        receipt = `<div class="receipt-preview">${d.receipt.preview ? `<img src="${d.receipt.preview}" alt="Vista previa">` : '<span class="doc">📄</span>'}
          <div><strong>${escapeHtml(d.receipt.name)}</strong><small>Se guardará al tocar "Guardar cambios"</small></div>
          <button type="button" class="del-btn" id="tdUndoReceipt"><span class="label">Quitar</span></button></div>`;
      } else if (o.factura && !d.removeFactura) {
        receipt = `<div class="receipt-preview"><span class="doc">📎</span>
          <div><strong>Factura adjunta</strong><small><a href="${escapeHtml(o.factura)}" target="_blank" rel="noopener noreferrer">Ver factura</a></small></div>
          <label class="btn ghost file-btn td-small">Cambiar<input class="sr-only" type="file" accept="image/*,application/pdf" data-td-file></label>
          <button type="button" class="del-btn" id="tdRemoveReceipt"><span class="label">Quitar</span></button></div>`;
      } else {
        receipt = `<div class="receipt-actions">
          <label class="td-card td-attach file-btn">📷 Tomar foto<input class="sr-only" type="file" accept="image/*" capture="environment" data-td-file></label>
          <label class="td-card td-attach file-btn">📁 Subir archivo<input class="sr-only" type="file" accept="image/*,application/pdf" data-td-file></label>
        </div>${d.removeFactura ? '<p class="note">La factura se quitará al guardar.</p>' : ''}`;
      }

      $('tdBody').innerHTML = `
        <div class="td-card td-rows">
          <label class="td-row"><span>${x.tipo === 'Ingreso' ? 'Recibido en' : 'Pagado desde'}</span>
            <select id="tdWallet" aria-label="Cartera">${walletOpts}</select></label>
          <label class="td-row"><span>Cuándo</span><input type="date" id="tdFecha" value="${escapeHtml(x.fecha)}" aria-label="Fecha"></label>
          ${o.creadoPor && o.creadoPor !== state.me ? `<div class="td-row"><span>Registrado por</span><strong>${escapeHtml(shortName(o.creadoPor))}</strong></div>` : ''}
        </div>
        <div class="td-card">
          <textarea id="tdDesc" rows="2" maxlength="200" placeholder="Agrega una descripción">${escapeHtml(x.descripcion)}</textarea>
          <div class="td-tags" aria-label="Etiquetas">
            <span class="td-tag-icon" aria-hidden="true">🏷️</span>
            ${tagChips}
            <input id="tdNewTag" maxlength="30" placeholder="+ Nueva" autocomplete="off" aria-label="Nueva etiqueta">
          </div>
        </div>
        ${receipt}`;
      updateDetailFoot();
    }

    function closeTxDetail(force) {
      const d = state.detail;
      if (d && !force && detailDirty() && !d.confirmClose) {
        d.confirmClose = true;
        toast('Tienes cambios sin guardar. Toca cerrar otra vez para descartarlos.');
        return;
      }
      state.detail = null;
      $('txModal').hidden = true;
    }

    async function saveTxDetail() {
      const d = state.detail; if (!d || d.saving) return;
      const x = d.draft;
      if (!x.monto || x.monto <= 0) { toast('Escribe un valor mayor que 0.', true); return; }
      if (!x.cartera) { toast('Elige una cartera.', true); return; }
      if (!x.fecha) { toast('Elige una fecha.', true); return; }
      const payload = Object.assign({}, x, {
        descripcion: x.descripcion.trim(),
        factura: d.receipt ? { name: d.receipt.name, mimeType: d.receipt.mimeType, data: d.receipt.data } : null,
        removeFactura: d.removeFactura && !d.receipt
      });
      d.saving = true;
      const btn = $('tdSave'); btn.disabled = true; btn.textContent = d.receipt ? 'Subiendo factura…' : 'Guardando…';
      try {
        const tx = await call('updateTransaction', d.id, payload);
        state.transactions = state.transactions.map(t => t.id === tx.id ? tx : t);
        closeTxDetail(true);
        render();
        toast(inRange(tx) && inWallet(tx) ? 'Movimiento actualizado' : 'Movimiento actualizado (fuera del filtro actual)');
      } catch (err) {
        toast('No se pudo guardar: ' + err.message, true);
        if (state.detail) state.detail.saving = false;
      } finally { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
    }

    async function deleteTxDetail() {
      const d = state.detail; if (!d) return;
      await call('deleteTransaction', d.id);
      state.transactions = state.transactions.filter(t => t.id !== d.id);
      closeTxDetail(true); render();
      toast('Movimiento eliminado');
    }

    /* ---------- Confirmación en dos clics ---------- */
    function armOrRun(btn, run) {
      if (!btn.classList.contains('confirm')) {
        document.querySelectorAll('.del-btn.confirm').forEach(resetDel);
        btn.classList.add('confirm');
        btn.querySelector('.label').textContent = '¿Eliminar?';
        btn._t = setTimeout(() => resetDel(btn), 3000);
        return;
      }
      clearTimeout(btn._t);
      btn.disabled = true;
      btn.querySelector('.label').textContent = 'Eliminando…';
      run().catch(err => { toast(err.message, true); btn.disabled = false; resetDel(btn); });
    }
    function resetDel(btn) {
      clearTimeout(btn._t); btn.classList.remove('confirm');
      const l = btn.querySelector('.label'); if (l) l.textContent = 'Eliminar';
    }
    const delButton = (attr, id) => `<button class="del-btn" ${attr}="${escapeHtml(id)}" aria-label="Eliminar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg><span class="label">Eliminar</span></button>`;

    /* ---------- Carteras ---------- */
    const isTouch = () => window.matchMedia && matchMedia('(pointer: coarse)').matches;
    function openModal(id) {
      $(id).hidden = false;
      const body = $(id).querySelector('.modal-body'); if (body) body.scrollTop = 0;
      // En el teléfono no abrimos el teclado automáticamente
      if (!isTouch()) { const f = $(id).querySelector('.modal-body input:not([type=hidden])'); if (f && f.offsetParent) f.focus(); }
    }
    function closeModals() {
      document.querySelectorAll('.modal-back').forEach(m => m.hidden = true);
      state.pickerFor = null; state.walletForm = null; state.wPicker = false;
    }
    const anyModalOpen = () => [...document.querySelectorAll('.modal-back')].some(m => !m.hidden);

    /* Lista de carteras o formulario (crear / editar) dentro de la misma ventana */
    function openWalletModal() { state.walletForm = null; renderWalletModal(); openModal('walletModal'); }
    function showWalletForm(form) {
      state.walletForm = form; state.wPicker = false;
      const w = form.id ? state.wallets.find(x => x.id === form.id) : null;
      $('wName').value = w ? w.nombre : '';
      $('wType').value = w ? w.tipo : (state.walletTypes[0] || 'Débito');
      $('wInit').value = w ? String(w.saldoInicial).replace('.', ',') : '';
      renderWalletModal();
      $('walletModal').querySelector('.modal-body').scrollTop = 0;
      if (!isTouch()) $('wName').focus();
    }

    function renderWalletModal() {
      const form = state.walletForm;
      $('wmList').hidden = !!form;
      $('wmForm').hidden = !form;
      $('wmBack').hidden = !form;
      if (!form) {
        $('wmTitle').textContent = 'Carteras';
        const { bal } = balances();
        $('walletList').innerHTML = state.wallets.map(w => {
          const mine = w.propietario === state.me;
          const extra = !mine ? 'De ' + escapeHtml(shortName(w.propietario))
            : w.compartidaCon.length ? 'Compartida con ' + w.compartidaCon.length + (w.compartidaCon.length === 1 ? ' persona' : ' personas') : escapeHtml(w.tipo);
          return `<div class="w-row">
            <span class="w-icon" style="--wc:${w.color}">${walletIcon(w)}</span>
            <div><strong>${escapeHtml(w.nombre)}</strong><small>${extra}, saldo <span class="num">${money.format(bal[w.nombre])}</span></small></div>
            ${w.canManage ? `<button class="btn ghost edit-btn" data-edit-wallet="${escapeHtml(w.id)}" type="button">Editar</button>` : ''}
          </div>`;
        }).join('') || '<p class="note">Aún no tienes carteras.</p>';
        return;
      }

      const w = form.id ? state.wallets.find(x => x.id === form.id) : null;
      $('wmTitle').textContent = w ? 'Editar cartera' : 'Nueva cartera';
      $('wIconBtn').textContent = form.icono;
      $('wIconBtn').style.borderColor = form.color;
      $('wPicker').hidden = !state.wPicker;
      if (state.wPicker) {
        $('wIconGrid').innerHTML = WALLET_ICON_SET.map(i => `<button type="button" data-wicon="${i}" aria-pressed="${i === form.icono}">${i}</button>`).join('');
      }
      $('wColors').innerHTML = WALLET_COLORS.map(c => `<button type="button" data-color="${c}" style="background:${c}" aria-label="Color ${c}" aria-pressed="${c === form.color}"></button>`).join('');
      $('saveWalletBtn').textContent = w ? 'Guardar cambios' : 'Crear cartera';

      if (w) {
        const count = state.transactions.filter(t => t.cartera === w.nombre).length;
        $('wShare').innerHTML = `<h3>Compartir</h3>
          <div class="share-box">
            <div>${w.compartidaCon.length ? w.compartidaCon.map(e => `<span class="pill">${escapeHtml(e)}<button data-unshare="${escapeHtml(e)}" data-wid="${escapeHtml(w.id)}" aria-label="Dejar de compartir con ${escapeHtml(e)}">×</button></span>`).join('') : '<span class="note" style="margin:0">Aún no la compartes con nadie.</span>'}</div>
            <div class="inline" style="margin-top:8px"><input class="inline-input" type="email" id="shareEmail" placeholder="correo@gmail.com" autocomplete="email" aria-label="Correo para compartir"><button class="btn ghost" data-do-share="${escapeHtml(w.id)}" type="button">Compartir</button></div>
            <p class="note">Después de compartir, envíale el enlace de la app. Debe entrar con esa misma cuenta de Google.</p>
          </div>`;
        $('wDanger').innerHTML = `<div class="danger-zone">
            <p>${count ? `Tiene ${count} movimiento(s). Para eliminarla, primero borra sus movimientos.` : 'Eliminar esta cartera'}</p>
            ${count ? '' : delButton('data-wallet-id', w.id)}
          </div>`;
      } else {
        $('wShare').innerHTML = ''; $('wDanger').innerHTML = '';
      }
    }

    async function saveWallet() {
      const form = state.walletForm; if (!form) return;
      const nombre = $('wName').value.trim();
      if (!nombre) { toast('Escribe un nombre para la cartera.', true); $('wName').focus(); return; }
      const payload = { nombre, tipo: $('wType').value, saldoInicial: parseAmount($('wInit').value.replace(/^-/, '')) * (/^\s*-/.test($('wInit').value) ? -1 : 1), color: form.color, icono: form.icono };
      const btn = $('saveWalletBtn');
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        if (form.id) {
          const old = state.wallets.find(x => x.id === form.id);
          const res = await call('updateWallet', form.id, payload);
          if (old && old.nombre !== res.wallet.nombre) {
            state.transactions.forEach(t => { if (t.cartera === old.nombre) t.cartera = res.wallet.nombre; });
            if (state.wallet === old.nombre) state.wallet = res.wallet.nombre;
            if ($('cartera').value === old.nombre) store.set('finanzas-cartera', res.wallet.nombre);
          }
          state.wallets = state.wallets.map(x => x.id === form.id ? res.wallet : x);
          toast(res.renamed ? `Cartera actualizada (${res.renamed} movimiento(s) renombrados)` : 'Cartera actualizada');
        } else {
          const w = await call('addWallet', payload);
          state.wallets.push(w);
          toast('Cartera creada');
        }
        state.walletForm = null;
        renderWalletModal(); render();
      } catch (err) {
        toast(err.message, true);
      } finally { btn.disabled = false; renderWalletModal(); }
    }

    async function shareWallet(id) {
      const email = ($('shareEmail').value || '').trim();
      if (!email) { toast('Escribe un correo.', true); $('shareEmail').focus(); return; }
      const btn = document.querySelector('[data-do-share]');
      if (btn) { btn.disabled = true; btn.textContent = 'Compartiendo…'; }
      try {
        const res = await call('shareWallet', id, email);
        state.wallets = state.wallets.map(x => x.id === id ? res.wallet : x);
        const em = email.toLowerCase();
        if (!state.members.some(m => m.email === em)) { state.members.push({ email: em, role: 'member' }); state.users.push(em); }
        if (res.appUrl) state.appUrl = res.appUrl;
        renderWalletModal(); renderWallets();
        inviteLink(email, 'Cartera compartida con ' + email);
      } catch (err) {
        toast(err.message, true);
        if (btn) { btn.disabled = false; btn.textContent = 'Compartir'; }
      }
    }
    async function unshareWallet(id, email) {
      try {
        const w = await call('unshareWallet', id, email);
        state.wallets = state.wallets.map(x => x.id === id ? w : x);
        renderWalletModal(); renderWallets();
        toast('Ya no se comparte con ' + email);
      } catch (err) { toast(err.message, true); }
    }

    async function deleteWallet(id) {
      await call('deleteWallet', id);
      const w = state.wallets.find(x => x.id === id);
      state.wallets = state.wallets.filter(x => x.id !== id);
      if (w && state.wallet === w.nombre) state.wallet = 'Todas';
      state.walletForm = null;
      renderWalletModal(); render();
      toast('Cartera eliminada');
    }

    /* ---------- Etiquetas ---------- */
    function renderTagPicker() {
      const box = $('tagBox'), input = $('tagInput');
      box.querySelectorAll('.tag-pill').forEach(el => el.remove());
      state.formTags.forEach(n => {
        const pill = document.createElement('span');
        pill.className = 'tag-pill'; pill.style.setProperty('--tc', tagColor(n));
        pill.innerHTML = `${escapeHtml(n)}<button type="button" data-untag="${escapeHtml(n)}" aria-label="Quitar ${escapeHtml(n)}">×</button>`;
        box.insertBefore(pill, input);
      });
      const q = input.value.trim().toLowerCase();
      const options = state.tagList.filter(t => !state.formTags.includes(t.nombre) && (!q || t.nombre.toLowerCase().includes(q))).slice(0, 8);
      const exact = state.tagList.some(t => t.nombre.toLowerCase() === q);
      $('tagSuggest').innerHTML = options.map(t => `<button type="button" data-tag="${escapeHtml(t.nombre)}">+ ${escapeHtml(t.nombre)}</button>`).join('')
        + (q && !exact ? `<button type="button" class="create" data-create-tag="${escapeHtml(input.value.trim())}">Crear "${escapeHtml(input.value.trim())}"</button>` : '');
    }
    function selectTag(name) {
      if (name && !state.formTags.includes(name)) state.formTags.push(name);
      $('tagInput').value = ''; renderTagPicker(); $('tagInput').focus();
    }
    async function createTag(name, fromModal) {
      name = String(name || '').trim();
      if (!name) return;
      if (name.includes(',')) { toast('La etiqueta no puede tener comas.', true); return; }
      try {
        const tag = await call('addTag', { nombre: name });
        if (!state.tagList.some(t => t.id === tag.id)) state.tagList.push(tag);
        fillTagFilter();
        if (fromModal) { $('newTagName').value = ''; renderTagModal(); toast('Etiqueta creada'); }
        else selectTag(tag.nombre);
      } catch (err) { toast(err.message, true); }
    }
    function onTagKey(e) {
      const v = $('tagInput').value.trim();
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        if (!v) return;
        const match = state.tagList.find(t => t.nombre.toLowerCase() === v.toLowerCase());
        match ? selectTag(match.nombre) : createTag(v);
      } else if (e.key === 'Backspace' && !$('tagInput').value && state.formTags.length) {
        state.formTags.pop(); renderTagPicker();
      }
    }
    function fillTagFilter() {
      const sel = $('tagFilter');
      sel.innerHTML = '<option value="Todas">Todas</option>' + state.tagList.map(t => `<option value="${escapeHtml(t.nombre)}">${escapeHtml(t.nombre)}</option>`).join('');
      if (state.tag !== 'Todas' && !state.tagList.some(t => t.nombre === state.tag)) state.tag = 'Todas';
      sel.value = state.tag;
    }
    function renderTagModal() {
      $('tagList').innerHTML = state.tagList.length ? state.tagList.map(t => {
        const n = state.transactions.filter(x => (x.etiquetas || []).includes(t.nombre)).length;
        return `<div class="w-row">
          <span class="sw" style="background:${t.color}"></span>
          <div><strong>${escapeHtml(t.nombre)}</strong><small>${n} movimiento(s)${t.creadaPor && t.creadaPor !== state.me ? ', creada por ' + escapeHtml(shortName(t.creadaPor)) : ''}</small></div>
          ${t.canDelete && n === 0 ? delButton('data-tag-id', t.id) : ''}
        </div>`;
      }).join('') : '<p class="note">Aún no tienes etiquetas.</p>';
    }
    async function deleteTag(id) {
      await call('deleteTag', id);
      const t = state.tagList.find(x => x.id === id);
      state.tagList = state.tagList.filter(x => x.id !== id);
      if (t) state.formTags = state.formTags.filter(n => n !== t.nombre);
      fillTagFilter(); renderTagModal(); renderTagPicker(); render();
      toast('Etiqueta eliminada');
    }

    /* ---------- Factura ---------- */
    const MAX_RECEIPT = 10 * 1024 * 1024;
    function readReceipt(file) {
      return new Promise((resolve, reject) => {
        if (file.size > MAX_RECEIPT * 1.5) { reject(new Error('El archivo supera los 10 MB.')); return; }
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        reader.onload = () => {
          const dataUrl = reader.result;
          const original = { name: file.name, mimeType: file.type || 'application/octet-stream', data: dataUrl.split(',')[1], preview: null, size: file.size };
          if (!/^image\//.test(file.type)) { resolve(original); return; }
          // Reducir la foto a máx. 1600 px para que suba rápido
          const img = new Image();
          img.onload = () => {
            const k = Math.min(1, 1600 / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            const out = c.toDataURL('image/jpeg', 0.82);
            const data = out.split(',')[1];
            resolve({ name: (file.name || 'factura').replace(/\.[^.]+$/, '') + '.jpg', mimeType: 'image/jpeg', data, preview: out, size: Math.round(data.length * 0.75) });
          };
          img.onerror = () => resolve(Object.assign(original, { preview: null }));
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      });
    }
    async function onReceiptChosen(e) {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (!/^image\//.test(file.type) && file.type !== 'application/pdf') { toast('Usa una imagen o un PDF.', true); return; }
      try {
        const r = await readReceipt(file);
        if (r.size > MAX_RECEIPT) throw new Error('El archivo supera los 10 MB.');
        state.receipt = r; renderReceipt();
      } catch (err) { toast(err.message, true); }
    }
    function renderReceipt() {
      const r = state.receipt, box = $('receiptPreview');
      box.hidden = !r;
      if (!r) { box.innerHTML = ''; return; }
      const kb = r.size > 1048576 ? (r.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(r.size / 1024)) + ' KB';
      box.innerHTML = `${r.preview ? `<img src="${r.preview}" alt="Vista previa de la factura">` : '<span class="doc">📄</span>'}
        <div><strong>${escapeHtml(r.name)}</strong><small>${kb}, se guarda de forma privada</small></div>
        <button type="button" class="del-btn" id="removeReceipt"><span class="label">Quitar</span></button>`;
    }
    function clearReceipt() { state.receipt = null; renderReceipt(); }

/* ---------- Categorías ---------- */
    function buildCategoryMap() {
      state.categories = { Gasto: [], Ingreso: [] };
      state.categoryList.forEach(c => state.categories[c.tipo].push([c.nombre, c.icono]));
    }
    function openCatModal() {
      state.catType = state.formType; state.pickerFor = null; state.catEdit = null;
      renderCatModal(); openModal('catModal');
    }
    function renderCatModal() {
      $('catType').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.type === state.catType)));
      $('catList').after($('picker')); // devolver el selector de íconos a su sitio antes de redibujar
      const ed = state.catEdit;
      const list = state.categoryList.filter(c => c.tipo === state.catType);
      $('catList').innerHTML = list.map(c => {
        const n = state.transactions.filter(t => t.tipo === c.tipo && t.categoria === c.nombre).length;
        if (ed && ed.id === c.id) {
          return `<div class="cat-edit" id="catEditBox">
            <div class="inline">
              <button type="button" class="icon-cell" data-pick="edit" aria-label="Cambiar ícono">${ed.icono}</button>
              <input class="inline-input" id="catEditName" name="nf-cat-editar" maxlength="30" value="${escapeHtml(ed.nombre)}" autocomplete="off" autocorrect="off" enterkeyhint="done" aria-label="Nombre de la categoría">
            </div>
            <div class="actions">
              <button type="button" class="btn" id="catEditSave">Guardar</button>
              <button type="button" class="btn ghost" id="catEditCancel">Cancelar</button>
              <span class="spacer"></span>
              ${c.canDelete && n === 0 ? delButton('data-cat-id', c.id) : ''}
            </div>
            ${n ? `<p class="note" style="margin:8px 0 0">${n} movimiento(s). Si cambias el nombre, se actualizan también.</p>` : ''}
          </div>`;
        }
        return `<div class="w-row">
          <span class="cat-ic" aria-hidden="true">${c.icono}</span>
          <div><strong>${escapeHtml(c.nombre)}</strong><small>${n} movimiento(s)${c.creadaPor && c.creadaPor !== state.me ? ', creada por ' + escapeHtml(shortName(c.creadaPor)) : ''}</small></div>
          <button type="button" class="btn ghost edit-btn" data-cat-edit="${escapeHtml(c.id)}">Editar</button>
        </div>`;
      }).join('');
      $('newIconBtn').textContent = state.newIcon;
      renderPicker();
      if (state.pickerFor === 'edit' && $('catEditBox')) $('catEditBox').appendChild($('picker'));
    }
    function renderPicker() {
      const target = state.pickerFor;
      $('picker').hidden = !target;
      if (!target) return;
      const current = target === 'edit' && state.catEdit ? state.catEdit.icono : state.newIcon;
      $('pickerTitle').textContent = target === 'edit' ? 'Ícono de la categoría' : 'Ícono para la nueva categoría';
      $('iconGrid').innerHTML = ICONS.map(i => `<button type="button" data-icon="${i}" aria-pressed="${i === current}">${i}</button>`).join('');
      $('customIcon').value = '';
    }
    function pickIcon(icon) {
      icon = String(icon || '').trim();
      if (!icon) return;
      if (state.pickerFor === 'edit' && state.catEdit) {
        state.catEdit.nombre = $('catEditName') ? $('catEditName').value : state.catEdit.nombre;
        state.catEdit.icono = icon;
      } else {
        state.newIcon = icon;
      }
      state.pickerFor = null;
      renderCatModal();
    }
    function startCatEdit(id) {
      const c = state.categoryList.find(x => x.id === id); if (!c) return;
      state.catEdit = { id: c.id, nombre: c.nombre, icono: c.icono };
      state.pickerFor = null;
      renderCatModal();
    }
    async function saveCatEdit() {
      const ed = state.catEdit; if (!ed) return;
      const nombre = $('catEditName').value.trim();
      if (!nombre) { toast('Escribe un nombre para la categoría.', true); $('catEditName').focus(); return; }
      const btn = $('catEditSave'); btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        const res = await call('updateCategory', ed.id, { nombre, icono: ed.icono });
        const cat = res.categoria;
        if (res.oldName) {
          state.transactions.forEach(t => { if (t.tipo === cat.tipo && t.categoria === res.oldName) t.categoria = cat.nombre; });
          if ($('categoria').value === res.oldName) $('categoria').value = '';
        }
        state.categoryList = state.categoryList.map(x => x.id === cat.id ? cat : x);
        state.catEdit = null; state.pickerFor = null;
        buildCategoryMap(); renderCatModal(); setFormType(state.formType);
        if (res.oldName && state.formType === cat.tipo) $('categoria').value = cat.nombre;
        render();
        toast(res.renamed ? `Categoría actualizada (${res.renamed} movimiento(s) renombrados)` : 'Categoría actualizada');
      } catch (err) {
        toast(err.message, true);
        if ($('catEditSave')) { $('catEditSave').disabled = false; $('catEditSave').textContent = 'Guardar'; }
      }
    }
    async function addCategory() {
      const nombre = $('catName').value.trim();
      if (!nombre) { toast('Escribe un nombre para la categoría.', true); $('catName').focus(); return; }
      const btn = $('addCatBtn');
      btn.disabled = true; btn.textContent = 'Creando…';
      try {
        const cat = await call('addCategory', { nombre, tipo: state.catType, icono: state.newIcon });
        state.categoryList.push(cat);
        buildCategoryMap();
        $('catName').value = ''; state.newIcon = '🏷️';
        renderCatModal();
        if (state.formType === cat.tipo) { setFormType(cat.tipo); $('categoria').value = cat.nombre; }
        toast('Categoría creada');
      } catch (err) { toast(err.message, true); }
      finally { btn.disabled = false; btn.textContent = 'Crear'; }
    }
    async function deleteCategory(id) {
      await call('deleteCategory', id);
      state.categoryList = state.categoryList.filter(c => c.id !== id);
      state.catEdit = null; state.pickerFor = null;
      buildCategoryMap(); renderCatModal(); setFormType(state.formType);
      toast('Categoría eliminada');
    }

    /* ---------- Compartir la app ---------- */
    function inviteText() {
      return 'Te invito a Nuestras Finanzas. Ábrelo en tu teléfono, entra con tu cuenta de Google y agrégalo a la pantalla de inicio: ' + NF.appUrl();
    }
    async function inviteLink(email, lead) {
      lead = lead ? lead + '. ' : '';
      const text = inviteText();
      try {
        if (navigator.share) { await navigator.share({ title: 'Nuestras Finanzas', text }); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      try { await navigator.clipboard.writeText(text); toast(lead + 'Invitación copiada: pégala en WhatsApp o en un correo para ' + email); }
      catch (e) { toast(lead + 'Envíale este enlace: ' + NF.appUrl()); }
    }
    function renderSpaceLabel() {
      const el = $('spaceLabel'); if (!el) return;
      el.textContent = state.spaceName || '';
      el.hidden = !state.spaceName || (state.spaces.length < 2 && state.spaceName === 'Nuestras Finanzas');
    }
    function renderShareModal() {
      const role = state.isAdmin ? 'dueño de este espacio' : 'miembro de este espacio';
      const who = `<p class="note" style="margin:0 0 12px">Conectado como <strong>${escapeHtml(state.me)}</strong> (${role})</p>`;
      const spaceSel = state.spaces.length > 1 ? `<div class="field"><label for="spaceSelect">Espacio</label>
          <select id="spaceSelect">${state.spaces.map(sp => `<option value="${escapeHtml(sp.id)}" ${sp.id === state.spaceId ? 'selected' : ''}>${escapeHtml(sp.nombre)}${sp.role === 'owner' ? ' (tuyo)' : ''}</option>`).join('')}</select></div>` : '';
      const spaceName = state.isAdmin
        ? `<div class="field"><label for="spaceNameInput">Nombre de este espacio</label>
            <div class="inline"><input class="inline-input" id="spaceNameInput" maxlength="40" value="${escapeHtml(state.spaceName)}" autocomplete="off"><button class="btn ghost" id="renameSpaceBtn" type="button">Guardar</button></div></div>`
        : `<p class="note" style="margin:0 0 12px">Espacio: <strong>${escapeHtml(state.spaceName)}</strong>${state.owner ? ', de ' + escapeHtml(state.owner) : ''}</p>`;
      const link = `<div class="field"><label for="appUrl">Enlace de la app</label>
          <div class="inline"><input class="inline-input" id="appUrl" readonly value="${escapeHtml(NF.appUrl())}"><button class="btn ghost" id="copyUrl" type="button">Copiar</button></div></div>`;
      const others = state.members.filter(m => m.email !== state.me);
      const memberRow = m => `<div class="w-row"><div><strong>${escapeHtml(m.email)}</strong><small>${m.role === 'owner' ? 'Dueño del espacio' : 'Miembro'}</small></div>${
        state.isAdmin && m.role !== 'owner' ? `<div class="w-actions"><button class="btn ghost" data-resend="${escapeHtml(m.email)}" type="button">Invitar</button>${delButton('data-user', m.email)}</div>` : ''}</div>`;
      const members = `<h3>Personas en este espacio</h3>${others.length ? others.map(memberRow).join('') : '<p class="note">Solo tú estás en este espacio por ahora.</p>'}`;
      const add = state.isAdmin ? `
        <h3>Agregar a este espacio</h3>
        <div class="inline"><input class="inline-input" id="userEmail" type="email" placeholder="correo@gmail.com" autocomplete="off" aria-label="Correo"><button class="btn ghost" id="addUserBtn" type="button">Agregar</button></div>
        <p class="note">Podrá entrar con esa cuenta de Google, crear sus propias carteras y usar las categorías de este espacio. Solo verá sus carteras y las que le compartan.</p>
        <h3>Traer datos de Google Sheets</h3>
        <p class="note" style="margin-top:0">Ejecuta <strong>exportarParaNuevaApp</strong> en tu hoja, descarga el archivo y elígelo aquí. Se carga en este espacio y puedes repetirlo sin duplicar nada.</p>
        <label class="btn ghost file-btn" id="importLabel">📥 Elegir archivo exportado<input class="sr-only" type="file" accept=".json,application/json" id="importFile"></label>`
        : `<p class="note">Solo el dueño del espacio puede agregar personas. Para compartir una cartera tuya con alguien de este espacio, ve a "+ Carteras", toca Editar y luego Compartir.</p>`;
      const superSec = state.isSuper ? `
        <h3>Crear un espacio para otra persona</h3>
        <p class="note" style="margin-top:0">La persona tendrá su propio espacio, separado del tuyo: sus carteras, categorías, etiquetas y su gente. Tú no verás sus datos ni ella los tuyos.</p>
        <div class="field"><label for="newSpaceName">Nombre del espacio</label><input class="inline-input" id="newSpaceName" maxlength="40" placeholder="Ej. Casa de Pedro" autocomplete="off" style="width:100%"></div>
        <div class="inline"><input class="inline-input" id="newSpaceOwner" type="email" placeholder="correo del dueño@gmail.com" autocomplete="off" aria-label="Correo del dueño"><button class="btn ghost" id="createSpaceBtn" type="button">Crear</button></div>` : '';
      const out = `<div class="danger-zone"><p>¿Usas un teléfono compartido? Cierra sesión al terminar.</p><button class="btn ghost" id="signOutBtn" type="button">Cerrar sesión</button></div>`;
      $('shareBody').innerHTML = who + spaceSel + spaceName + link + members + add + superSec + out;
    }
    async function renameSpace() {
      try {
        const nombre = await call('renameSpace', $('spaceNameInput').value);
        state.spaceName = nombre;
        const sp = state.spaces.find(x => x.id === state.spaceId); if (sp) sp.nombre = nombre;
        renderSpaceLabel(); toast('Nombre del espacio actualizado');
      } catch (err) { toast(err.message, true); }
    }
    async function createSpaceFor() {
      const nombre = ($('newSpaceName').value || '').trim(), email = ($('newSpaceOwner').value || '').trim();
      if (!nombre) { toast('Escribe un nombre para el espacio.', true); $('newSpaceName').focus(); return; }
      if (!email) { toast('Escribe el correo de la persona.', true); $('newSpaceOwner').focus(); return; }
      const btn = $('createSpaceBtn'); btn.disabled = true; btn.textContent = 'Creando…';
      try {
        await call('createSpaceFor', nombre, email);
        $('newSpaceName').value = ''; $('newSpaceOwner').value = '';
        inviteLink(email.toLowerCase(), 'Espacio "' + nombre + '" creado para ' + email.toLowerCase());
      } catch (err) { toast(err.message, true); }
      finally { btn.disabled = false; btn.textContent = 'Crear'; }
    }
    async function importFile(file) {
      const label = $('importLabel');
      try {
        if (file.size > 20 * 1024 * 1024) throw new Error('El archivo es demasiado grande.');
        const payload = JSON.parse(await file.text());
        if (!payload || !Array.isArray(payload.transactions)) throw new Error('Ese archivo no es una exportación de Nuestras Finanzas.');
        label.firstChild.textContent = 'Importando ' + payload.transactions.length + ' movimientos…';
        const r = await call('importFromSheets', payload);
        await load(true);
        renderShareModal();
        toast(`Listo: ${r.movimientos} movimientos, ${r.carteras} carteras, ${r.categorias} categorías y ${r.etiquetas} etiquetas nuevas` + (r.repetidos ? ` (${r.repetidos} ya existían)` : ''));
      } catch (err) {
        toast('No se pudo importar: ' + (err instanceof SyntaxError ? 'el archivo no es válido.' : err.message), true);
        if ($('importLabel')) $('importLabel').firstChild.textContent = '📥 Elegir archivo exportado';
      }
    }
    async function addUser() {
      const email = ($('userEmail').value || '').trim();
      if (!email) { toast('Escribe un correo.', true); $('userEmail').focus(); return; }
      $('addUserBtn').disabled = true;
      try {
        const res = await call('addUser', email);
        await load(true); renderShareModal();
        inviteLink(res.email, res.email + ' agregado a este espacio');
      } catch (err) { toast(err.message, true); $('addUserBtn').disabled = false; }
    }
    async function resendInvite(email) { inviteLink(email); }
    async function removeUser(email) {
      await call('removeUser', email);
      state.users = state.users.filter(e => e !== email);
      state.members = state.members.filter(m => m.email !== email);
      state.wallets.forEach(w => w.compartidaCon = w.compartidaCon.filter(e => e !== email));
      renderShareModal(); toast(email + ' ya no está en este espacio');
    }

    /* ---------- Datos ---------- */
    async function load(silent, preset) {
      if (!silent) state.loading = true;
      try {
        const data = preset || await call('getData');
        if (!preset) NF.cache.write(data);
        state.transactions = data.transactions.slice();
        mergePending();
        state.wallets = data.wallets;
        state.walletTypes = data.walletTypes;
        Object.assign(state, { me: data.me, owner: data.owner, isAdmin: data.isAdmin, identified: data.identified, appUrl: data.appUrl, users: data.users,
          isSuper: !!data.isSuper, spaces: data.spaces || [], spaceId: data.spaceId || '', spaceName: data.spaceName || '', members: data.members || [],
          budgets: data.budgets || [], goals: data.goals || [], contributions: data.contributions || [], recurring: data.recurring || [], prefs: data.prefs || {} });
        renderSpaceLabel();
        const firstLoad = !state.categoryList.length;
        const prevCat = $('categoria').value;
        state.categoryList = data.categoryList;
        state.tagList = data.tagList || [];
        state.formTags = state.formTags.filter(n => state.tagList.some(t => t.nombre === n));
        fillTagFilter(); renderTagPicker();
        buildCategoryMap();
        setFormType(state.formType);
        if (prevCat) $('categoria').value = prevCat;
        if (firstLoad) {
          $('wType').innerHTML = state.walletTypes.map(t => `<option>${escapeHtml(t)}</option>`).join('');
        }
        if (state.wallet !== 'Todas' && state.wallet !== NONE && !walletOf(state.wallet)) state.wallet = 'Todas';
        setNotice('');
      } catch (err) {
        const msg = String(err.message || '');
        if (/sesión expiró/i.test(msg)) { NF.auth.signOut().then(() => location.reload()); return; }
        setNotice(/conexión/i.test(msg) && state.transactions.length
          ? 'Sin conexión: puedes seguir registrando movimientos; se enviarán solos cuando vuelva internet. Editar o borrar necesita conexión.'
          : 'No se pudieron cargar los datos. ' + escapeHtml(msg));
      } finally {
        state.loading = false;
        render();
      }
    }

    function setNotice(html) { $('accessNotice').innerHTML = html; $('accessNotice').hidden = !html; }

    /* ---------- Render general ---------- */
    function render() {
      renderWallets();
      renderSummary();
      fillWalletSelect();
      if (state.view === 'mov') renderList();
      else if (state.view === 'rep') renderReports();
      else if (window.NFModules) NFModules.render(state.view);
      if (window.NFModules) NFModules.renderBell();
    }

    function renderWallets() {
      const { bal, none, hasNone } = balances();
      const total = Object.values(bal).reduce((a, b) => a + b, 0) + none;
      const card = (key, name, sub, value, color, icon) => `
        <button class="wallet" data-wallet="${escapeHtml(key)}" aria-pressed="${state.wallet === key}" style="--wc:${color}">
          <span class="w-name">${icon} ${escapeHtml(name)}</span>
          <span class="w-type">${escapeHtml(sub)}</span>
          <div class="w-bal num ${value < 0 ? 'neg' : ''}">${state.loading ? '—' : money.format(value)}</div>
        </button>`;
      let html = card('Todas', 'Todas', 'Saldo total', total, cssVar('--ink'), '🧾');
      html += state.wallets.map(w => {
        const sub = w.propietario !== state.me ? w.tipo + ', de ' + shortName(w.propietario)
          : w.compartidaCon.length ? w.tipo + ', compartida' : w.tipo;
        return card(w.nombre, w.nombre, sub, bal[w.nombre], w.color, walletIcon(w) + (w.propietario !== state.me || w.compartidaCon.length ? ' 👥' : ''));
      }).join('');
      if (hasNone) html += card(NONE, 'Sin asignar', 'Movimientos antiguos', none, cssVar('--muted'), '❔');
      html += '<button class="wallet manage" id="manageWallets">+ Carteras</button>';
      $('walletStrip').innerHTML = html;
    }

    function renderSummary() {
      const { bal, none } = balances();
      let balance, label;
      if (state.wallet === 'Todas') { balance = Object.values(bal).reduce((a, b) => a + b, 0) + none; label = 'Balance total'; }
      else if (state.wallet === NONE) { balance = none; label = 'Balance sin asignar'; }
      else { balance = bal[state.wallet] || 0; label = 'Balance de ' + state.wallet; }

      let sIn = 0, sOut = 0;
      scoped().forEach(t => t.tipo === 'Ingreso' ? sIn += t.monto : sOut += t.monto);
      $('balanceLabel').textContent = label;
      $('balance').textContent = state.loading ? '—' : money.format(balance);
      $('balance').classList.toggle('neg', balance < 0);
      $('sumIn').textContent = state.loading ? '—' : money.format(sIn);
      $('sumOut').textContent = state.loading ? '—' : money.format(sOut);
      const sum = sIn + sOut;
      $('barIn').style.width = (sum ? sIn / sum * 100 : 50) + '%';
      $('barOut').style.width = (sum ? sOut / sum * 100 : 50) + '%';
      $('periodLabel').textContent = !state.from && !state.to ? 'Todos los movimientos'
        : (state.from ? fmtDate(state.from) : 'Inicio') + ' al ' + (state.to ? fmtDate(state.to) : 'hoy');
    }

    function walletTag(name) {
      const w = walletOf(name);
      return `<span class="w-tag" style="--wc:${w ? w.color : cssVar('--muted')}"><i></i>${escapeHtml(name || 'Sin asignar')}</span>`;
    }

    const shortName = email => String(email || '').split('@')[0];
    function byTag(t) {
      return t.creadoPor && t.creadoPor !== state.me ? `<span class="by-tag">por ${escapeHtml(shortName(t.creadoPor))}</span>` : '';
    }

    /* "1 de octubre" (con año solo si no es el actual) */
    function dayLabel(date) {
      const d = parseISO(date), now = new Date();
      const today = iso(now), y = new Date(now); y.setDate(now.getDate() - 1);
      if (date === today) return 'Hoy';
      if (date === iso(y)) return 'Ayer';
      const opts = { day: 'numeric', month: 'long' };
      if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
      return d.toLocaleDateString(LOCALE, opts);
    }
    function catColor(name) {
      let h = 0; for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
      return CHART_COLORS[h % CHART_COLORS.length];
    }
    /* Fila de movimiento estilo tarjeta: toca para editar */
    function txRow(t, opts) {
      opts = opts || {};
      const w = walletOf(t.cartera);
      const sign = t.tipo === 'Ingreso' ? '+' : '−';
      const desc = opts.withDate ? fmtDate(t.fecha) + (t.descripcion ? ', ' + t.descripcion : '') : t.descripcion;
      const extras = receiptLink(t) + tagsInline(t);
      return `<div class="tx" role="button" tabindex="0" data-edit-tx="${escapeHtml(t.id)}" aria-label="Ver ${escapeHtml(t.categoria)} ${money.format(t.monto)}">
        <span class="tx-icon" style="--cc:${catColor(t.categoria)}" aria-hidden="true">${iconFor(t.tipo, t.categoria)}</span>
        <span class="tx-main">
          <strong>${escapeHtml(t.categoria)}</strong>
          <small class="tx-wallet"><i>${w ? walletIcon(w) : '❔'}</i>${escapeHtml(t.cartera || 'Sin asignar')}${t.creadoPor && t.creadoPor !== state.me ? ' · ' + escapeHtml(shortName(t.creadoPor)) : ''}</small>
          ${desc ? `<small>${escapeHtml(desc)}</small>` : ''}
          ${extras ? `<small class="tx-extras">${extras}</small>` : ''}
          ${t.pendiente ? `<small class="tx-pending ${t.errorEnvio ? 'err' : ''}">${t.errorEnvio ? '⚠️ No se pudo enviar' : '⏳ Pendiente de enviar'}</small>` : ''}
        </span>
        <span class="tx-amount num ${t.tipo === 'Ingreso' ? 'in' : ''}">${sign}${money.format(t.monto)}</span>
      </div>`;
    }

    function renderList() {
      if (state.loading) return;
      const q = state.query.toLowerCase();
      const rows = scoped()
        .filter(t => state.filter === 'Todos' || t.tipo === state.filter)
        .filter(t => !q || t.descripcion.toLowerCase().includes(q) || t.categoria.toLowerCase().includes(q) || (t.etiquetas || []).some(x => x.toLowerCase().includes(q)))
        .sort((a, b) => b.fecha.localeCompare(a.fecha));

      if (!state.wallets.length) {
        $('txList').innerHTML = `<div class="empty"><strong>Aún no tienes carteras</strong>Toca "+ Carteras" arriba para crear la primera.${state.me ? `<br><br>Si alguien te compartió una cartera, revisa que te la hayan compartido a <strong>${escapeHtml(state.me)}</strong>, que es la cuenta con la que estás usando la app.` : ''}</div>`;
        return;
      }
      if (!rows.length) {
        $('txList').innerHTML = scoped().length
          ? '<div class="empty"><strong>Ningún movimiento coincide</strong>Prueba con otro filtro o búsqueda.</div>'
          : '<div class="empty"><strong>No hay movimientos en este período</strong>Cambia el rango de fechas o registra uno nuevo con el formulario.</div>';
        return;
      }
      const shown = rows.slice(0, state.limit);
      const groups = {};
      shown.forEach(t => (groups[t.fecha] = groups[t.fecha] || []).push(t));
      $('txList').innerHTML = Object.keys(groups).map(date => {
        const items = groups[date];
        const net = items.reduce((s, t) => s + (t.tipo === 'Ingreso' ? t.monto : -t.monto), 0);
        return `<div class="day-group">
          <div class="day-title"><span>${dayLabel(date)}</span><span class="num">${net >= 0 ? '+' : '−'}${money.format(Math.abs(net))}</span></div>
          <div class="day-card">${items.map(t => txRow(t)).join('')}</div>
        </div>`;
      }).join('') + (rows.length > state.limit ? `<button class="btn ghost more" id="moreBtn">Mostrar más (${rows.length - state.limit} restantes)</button>` : '');
    }

    /* ---------- Reportes ---------- */
    function buildChart(key, canvasId, config) {
      if (charts[key]) charts[key].destroy();
      charts[key] = new Chart($(canvasId), config);
    }

    function timeBuckets(rows) {
      let f = state.from, t = state.to;
      if (!f || !t) {
        const dates = rows.map(r => r.fecha).sort();
        f = f || dates[0]; t = t || dates[dates.length - 1];
      }
      if (!f || !t) return { labels: [], values: [], byMonth: false };
      const start = parseISO(f), end = parseISO(t);
      const byMonth = (end - start) / 86400000 > 62;
      const map = new Map();
      const d = byMonth ? new Date(start.getFullYear(), start.getMonth(), 1) : new Date(start);
      while (d <= end && map.size < 400) {
        map.set(byMonth ? monthKey(d) : iso(d), 0);
        byMonth ? d.setMonth(d.getMonth() + 1) : d.setDate(d.getDate() + 1);
      }
      rows.forEach(r => { const k = byMonth ? r.fecha.slice(0, 7) : r.fecha; if (map.has(k)) map.set(k, map.get(k) + r.monto); });
      const labels = [...map.keys()].map(k => byMonth ? parseISO(k + '-01').toLocaleDateString(LOCALE, { month: 'short', year: '2-digit' }) : fmtDate(k, { day: 'numeric', month: 'short' }));
      return { labels, values: [...map.values()], byMonth, days: Math.round((end - start) / 86400000) + 1 };
    }

    function renderReports() {
      if (state.loading) return;
      $('repType').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.type === state.repType)));
      const base = scoped().filter(t => t.tipo === state.repType && inTag(t));
      const filtered = state.repCat ? base.filter(t => t.categoria === state.repCat) : base;

      $('catBadge').hidden = !state.repCat;
      if (state.repCat) $('catBadge').textContent = iconFor(state.repType, state.repCat) + ' ' + state.repCat + '  ✕';

      // KPIs
      const total = filtered.reduce((s, t) => s + t.monto, 0);
      const tb = timeBuckets(filtered);
      $('kTotal').textContent = money.format(total);
      $('kAvg').textContent = money.format(tb.days ? total / tb.days : 0);
      $('kCount').textContent = filtered.length;

      // Por categoría (usa base, sin filtro de categoría)
      const byCat = {};
      base.forEach(t => {
        const o = byCat[t.categoria] || (byCat[t.categoria] = { v: 0, n: 0 });
        o.v += t.monto; o.n += 1;
      });
      const cats = Object.entries(byCat).sort((a, b) => b[1].v - a[1].v);
      const baseTotal = cats.reduce((s, c) => s + c[1].v, 0);
      const colorOf = i => CHART_COLORS[i % CHART_COLORS.length];

      $('catTable').innerHTML = cats.length ? cats.map(([c, o], i) => `
        <tr data-cat="${escapeHtml(c)}" class="${state.repCat === c ? 'active' : ''}">
          <td><span class="sw" style="background:${colorOf(i)}"></span>${iconFor(state.repType, c)} ${escapeHtml(c)}</td>
          <td class="r pct num">${o.n}</td>
          <td class="r pct num">${(o.v / baseTotal * 100).toFixed(1)}%</td>
          <td class="r num"><strong>${money.format(o.v)}</strong></td>
        </tr>`).join('') : '<tr><td class="empty">Sin datos en este período.</td></tr>';

      if (typeof Chart === 'undefined') {
        ['catChart', 'walletChart', 'tagChart', 'trendChart'].forEach(id => $(id).parentElement.innerHTML = '<p class="note">No se pudo cargar la librería de gráficos. Revisa tu conexión.</p>');
        renderRepDetail(filtered);
        return;
      }

      const ink = cssVar('--ink'), muted = cssVar('--muted'), line = cssVar('--line'), surface = cssVar('--surface');
      Chart.defaults.font.family = 'Manrope, system-ui, sans-serif';
      Chart.defaults.color = muted;
      const tooltipMoney = { callbacks: { label: ctx => ' ' + money.format(ctx.parsed.y ?? ctx.parsed.x ?? ctx.parsed) } };

      buildChart('cat', 'catChart', {
        type: 'doughnut',
        data: { labels: cats.map(c => c[0]), datasets: [{ data: cats.map(c => c[1].v), backgroundColor: cats.map((c, i) => state.repCat && state.repCat !== c[0] ? colorOf(i) + '55' : colorOf(i)), borderColor: surface, borderWidth: 3 }] },
        options: {
          maintainAspectRatio: false, cutout: '62%',
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + money.format(ctx.parsed) } } },
          onClick: (e, els) => { if (els.length) toggleCat(cats[els[0].index][0]); }
        }
      });

      const byWallet = {};
      filtered.forEach(t => { const k = walletOf(t.cartera) ? t.cartera : 'Sin asignar'; byWallet[k] = (byWallet[k] || 0) + t.monto; });
      const wEntries = Object.entries(byWallet).sort((a, b) => b[1] - a[1]);
      buildChart('wallet', 'walletChart', {
        type: 'bar',
        data: { labels: wEntries.map(e => e[0]), datasets: [{ data: wEntries.map(e => e[1]), backgroundColor: wEntries.map(e => (walletOf(e[0]) || {}).color || muted), borderRadius: 6 }] },
        options: {
          indexAxis: 'y', maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: tooltipMoney },
          scales: { x: { grid: { color: line }, ticks: { callback: v => money.format(v) } }, y: { grid: { display: false }, ticks: { color: ink } } }
        }
      });

      const byTagSum = {};
      filtered.forEach(t => (t.etiquetas || []).forEach(n => byTagSum[n] = (byTagSum[n] || 0) + t.monto));
      const tEntries = Object.entries(byTagSum).sort((a, b) => b[1] - a[1]);
      $('tagChart').parentElement.style.height = Math.max(160, tEntries.length * 34 + 40) + 'px';
      buildChart('tag', 'tagChart', {
        type: 'bar',
        data: { labels: tEntries.length ? tEntries.map(e => e[0]) : ['Sin etiquetas'], datasets: [{ data: tEntries.length ? tEntries.map(e => e[1]) : [0], backgroundColor: tEntries.map(e => tagColor(e[0])), borderRadius: 6, maxBarThickness: 26 }] },
        options: {
          indexAxis: 'y', maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: tooltipMoney },
          scales: { x: { grid: { color: line }, ticks: { callback: v => money.format(v) } }, y: { grid: { display: false }, ticks: { color: ink } } }
        }
      });

      $('trendTitle').textContent = tb.byMonth ? 'Evolución por mes' : 'Evolución por día';
      const barColor = state.repType === 'Gasto' ? cssVar('--expense') : cssVar('--income');
      buildChart('trend', 'trendChart', {
        type: 'bar',
        data: { labels: tb.labels, datasets: [{ data: tb.values, backgroundColor: barColor, borderRadius: 4, maxBarThickness: 36 }] },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: tooltipMoney },
          scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { grid: { color: line }, ticks: { callback: v => money.format(v) } } }
        }
      });

      renderRepDetail(filtered);
    }

    function renderRepDetail(rows) {
      const sorted = rows.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
      const shown = sorted.slice(0, 50);
      $('repDetail').innerHTML = shown.length ? shown.map(t => txRow(t, { withDate: true })).join('') + (sorted.length > 50 ? `<p class="note">Mostrando 50 de ${sorted.length}. Usa la pestaña Movimientos o la hoja de Reportes para ver todo.</p>` : '')
        : '<div class="empty"><strong>Sin movimientos para este filtro</strong>Amplía el rango de fechas o elige otra cartera.</div>';
    }

    function toggleCat(c) { state.repCat = state.repCat === c ? null : c; renderReports(); }

    const VIEWS = { mov: 'viewMov', rep: 'viewRep', bud: 'viewBud', ana: 'viewAna', goal: 'viewGoal' };
    function setView(v) {
      if (!VIEWS[v]) v = 'mov';
      state.view = v;
      document.body.dataset.view = v;
      document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === v)));
      Object.keys(VIEWS).forEach(k => { $(VIEWS[k]).hidden = k !== v; });
      store.set('finanzas-view', v);
      render();
      window.scrollTo({ top: 0 });
      const scroller = document.querySelector('.wrap'); if (scroller) scroller.scrollTop = 0; // en el teléfono se desplaza el contenido, no la página
    }

    /* Exporta a CSV lo que muestra Reportes (abre bien en Excel y Google Sheets) */
    async function exportCsv() {
      const rows = scoped().filter(t => t.tipo === state.repType && inTag(t) && (!state.repCat || t.categoria === state.repCat))
        .sort((a, b) => b.fecha.localeCompare(a.fecha));
      if (!rows.length) { toast('No hay movimientos para exportar con estos filtros.', true); return; }
      const q = v => { let x = String(v == null ? '' : v); if (/^[=+\-@]/.test(x)) x = "'" + x; return '"' + x.replace(/"/g, '""') + '"'; };
      const lines = [['Fecha', 'Tipo', 'Categoría', 'Cartera', 'Monto', 'Descripción', 'Etiquetas', 'Registrado por'].map(q).join(';')]
        .concat(rows.map(t => [t.fecha, t.tipo, t.categoria, t.cartera, String(t.monto).replace('.', ','), t.descripcion, (t.etiquetas || []).join(', '), t.creadoPor].map(q).join(';')));
      const name = 'nuestras-finanzas-' + (state.from || 'inicio') + '-a-' + (state.to || iso(new Date())) + '.csv';
      const file = new File(['﻿' + lines.join('\r\n')], name, { type: 'text/csv' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Archivo descargado: ' + rows.length + ' movimientos');
    }

    /* ---------- Eventos ---------- */
    document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    $('formType').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setFormType(b.dataset.type); });
    $('repType').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { state.repType = b.dataset.type; state.repCat = null; renderReports(); } });
    $('typeChips').addEventListener('click', e => {
      const c = e.target.closest('.chip'); if (!c) return;
      state.filter = c.dataset.filter; state.limit = PAGE;
      $('typeChips').querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === c)));
      renderList();
    });
    $('search').addEventListener('input', e => { state.query = e.target.value; state.limit = PAGE; renderList(); });
    $('saveBtn').addEventListener('click', save);
    ['monto', 'descripcion'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') save(); }));
    function onTxClick(e) {
      if (e.target.id === 'moreBtn') { state.limit += PAGE; renderList(); return; }
      if (e.target.closest('.receipt-link')) return; // abrir la factura, no editar
      const row = e.target.closest('[data-edit-tx]');
      if (row) openTxDetail(row.dataset.editTx);
    }
    function onTxKey(e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-edit-tx]')) { e.preventDefault(); openTxDetail(e.target.dataset.editTx); }
    }
    ['txList', 'repDetail'].forEach(id => { $(id).addEventListener('click', onTxClick); $(id).addEventListener('keydown', onTxKey); });

    /* Eventos del detalle */
    $('tdClose').addEventListener('click', () => closeTxDetail());
    $('tdEdit').addEventListener('click', () => { const d = state.detail; if (!d) return; d.editing = !d.editing; renderTxDetail(); if (d.editing && !isTouch()) $('tdMonto').focus(); });
    $('tdDelete').addEventListener('click', e => armOrRun(e.currentTarget, deleteTxDetail));
    $('tdSave').addEventListener('click', saveTxDetail);
    $('txModal').addEventListener('click', e => {
      const d = state.detail; if (!d) return;
      const ty = e.target.closest('[data-td-type]');
      if (ty) {
        if (d.draft.tipo !== ty.dataset.tdType) {
          d.draft.tipo = ty.dataset.tdType;
          const cats = state.categories[d.draft.tipo] || [];
          if (!cats.some(c => c[0] === d.draft.categoria)) d.draft.categoria = cats.length ? cats[0][0] : '';
          renderTxDetail();
        }
        return;
      }
      const tg = e.target.closest('[data-td-tag]');
      if (tg) {
        const n = tg.dataset.tdTag, list = d.draft.etiquetas;
        d.draft.etiquetas = list.includes(n) ? list.filter(v => v !== n) : list.concat(n);
        tg.setAttribute('aria-pressed', String(d.draft.etiquetas.includes(n)));
        updateDetailFoot(); return;
      }
      if (e.target.closest('#tdRemoveReceipt')) { d.removeFactura = true; renderTxDetail(); return; }
      if (e.target.closest('#tdUndoReceipt')) { d.receipt = null; renderTxDetail(); return; }
    });
    $('txModal').addEventListener('input', e => {
      const d = state.detail; if (!d) return;
      const id = e.target.id;
      if (id === 'tdMonto') {
        formatAmountInput(e.target); d.draft.monto = parseAmount(e.target.value);
        // Actualiza en vivo el valor mostrado al terminar de editar
      } else if (id === 'tdDesc') d.draft.descripcion = e.target.value;
      else if (id === 'tdFecha') d.draft.fecha = e.target.value;
      updateDetailFoot();
    });
    $('txModal').addEventListener('change', async e => {
      const d = state.detail; if (!d) return;
      const id = e.target.id;
      if (id === 'tdWallet') { d.draft.cartera = e.target.value; updateDetailFoot(); }
      else if (id === 'tdFecha') { d.draft.fecha = e.target.value; updateDetailFoot(); }
      else if (id === 'tdCatSel') { d.draft.categoria = e.target.value; $('txModal').querySelector('.tx-sheet').style.setProperty('--cc', catColor(d.draft.categoria)); updateDetailFoot(); }
      else if (e.target.matches('[data-td-file]')) {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        if (!/^image\//.test(file.type) && file.type !== 'application/pdf') { toast('Usa una imagen o un PDF.', true); return; }
        try {
          const r = await readReceipt(file);
          if (r.size > MAX_RECEIPT) throw new Error('El archivo supera los 10 MB.');
          if (state.detail) { state.detail.receipt = r; state.detail.removeFactura = false; renderTxDetail(); }
        } catch (err) { toast(err.message, true); }
      }
    });
    $('txModal').addEventListener('keydown', async e => {
      const d = state.detail; if (!d) return;
      if (e.target.id === 'tdNewTag' && (e.key === 'Enter' || e.key === ',')) {
        e.preventDefault();
        const name = e.target.value.trim(); if (!name) return;
        if (name.includes(',')) { toast('La etiqueta no puede tener comas.', true); return; }
        try {
          let tag = state.tagList.find(t => t.nombre.toLowerCase() === name.toLowerCase());
          if (!tag) { tag = await call('addTag', { nombre: name }); state.tagList.push(tag); fillTagFilter(); renderTagPicker(); }
          if (state.detail && !state.detail.draft.etiquetas.includes(tag.nombre)) state.detail.draft.etiquetas.push(tag.nombre);
          renderTxDetail();
        } catch (err) { toast(err.message, true); }
      } else if (e.key === 'Enter' && e.target.id === 'tdMonto') { e.preventDefault(); d.editing = false; renderTxDetail(); }
    });
    $('walletStrip').addEventListener('click', e => {
      if (e.target.closest('#manageWallets')) { openWalletModal(); return; }
      const w = e.target.closest('.wallet'); if (!w) return;
      state.wallet = w.dataset.wallet; state.limit = PAGE;
      if (walletOf(state.wallet)) { $('cartera').value = state.wallet; store.set('finanzas-cartera', state.wallet); }
      render();
    });
    $('preset').addEventListener('change', e => { if (e.target.value !== 'custom') { applyPreset(e.target.value); render(); } });
    $('from').addEventListener('change', onDateInput);
    $('to').addEventListener('change', onDateInput);
    $('catTable').addEventListener('click', e => { const r = e.target.closest('tr[data-cat]'); if (r) toggleCat(r.dataset.cat); });
    $('catBadge').addEventListener('click', () => toggleCat(state.repCat));
    $('sheetBtn').addEventListener('click', exportCsv);
    document.querySelectorAll('.modal-back').forEach(m => m.addEventListener('click', e => {
      if (m.id === 'txModal') { if (e.target === m) closeTxDetail(); return; }
      if (e.target === m || e.target.closest('[data-close]')) closeModals();
    }));
    $('walletModal').addEventListener('click', e => {
      if (e.target.closest('#newWalletBtn')) { showWalletForm({ id: null, icono: WALLET_ICONS[state.walletTypes[0]] || '🏦', color: WALLET_COLORS[state.wallets.length % WALLET_COLORS.length] }); return; }
      const ed = e.target.closest('[data-edit-wallet]');
      if (ed) { const w = state.wallets.find(x => x.id === ed.dataset.editWallet); if (w) showWalletForm({ id: w.id, icono: walletIcon(w), color: w.color }); return; }
      if (e.target.closest('#wmBack')) { state.walletForm = null; renderWalletModal(); return; }
      if (e.target.closest('#wIconBtn')) { state.wPicker = !state.wPicker; renderWalletModal(); return; }
      const wi = e.target.closest('[data-wicon]');
      if (wi) { state.walletForm.icono = wi.dataset.wicon; state.wPicker = false; renderWalletModal(); return; }
      if (e.target.closest('#wUseCustom')) {
        const v = $('wCustomIcon').value.trim();
        if (v) { state.walletForm.icono = v; state.wPicker = false; $('wCustomIcon').value = ''; renderWalletModal(); }
        return;
      }
      const sw = e.target.closest('[data-color]');
      if (sw && state.walletForm) { state.walletForm.color = sw.dataset.color; renderWalletModal(); return; }
      if (e.target.closest('#saveWalletBtn')) { saveWallet(); return; }
      const ds = e.target.closest('[data-do-share]');
      if (ds) { shareWallet(ds.dataset.doShare); return; }
      const un = e.target.closest('[data-unshare]');
      if (un) { unshareWallet(un.dataset.wid, un.dataset.unshare); return; }
      const del = e.target.closest('.del-btn');
      if (del) armOrRun(del, () => deleteWallet(del.dataset.walletId));
    });
    $('walletModal').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      if (e.target.id === 'shareEmail' && state.walletForm) shareWallet(state.walletForm.id);
      else if (e.target.id === 'wName' || e.target.id === 'wInit') saveWallet();
      else if (e.target.id === 'wCustomIcon') $('wUseCustom').click();
    });
    $('wType').addEventListener('change', () => {
      // Si el ícono era el automático del tipo anterior, lo actualizamos al del nuevo tipo
      const f = state.walletForm; if (!f) return;
      if (Object.values(WALLET_ICONS).includes(f.icono)) { f.icono = WALLET_ICONS[$('wType').value] || f.icono; renderWalletModal(); }
    });
    // Al enfocar un campo dentro de una ventana, mantenerlo visible sobre el teclado
    document.querySelectorAll('.modal-body').forEach(b => b.addEventListener('focusin', e => {
      if (!isTouch() || !e.target.matches('input, select')) return;
      setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
    }));

    $('editCats').addEventListener('click', openCatModal);
    $('monto').addEventListener('input', e => formatAmountInput(e.target));
    $('tagInput').addEventListener('input', renderTagPicker);
    $('tagInput').addEventListener('keydown', onTagKey);
    $('tagBox').addEventListener('click', e => {
      const b = e.target.closest('[data-untag]');
      if (b) { state.formTags = state.formTags.filter(n => n !== b.dataset.untag); renderTagPicker(); return; }
      $('tagInput').focus();
    });
    $('tagSuggest').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tag) selectTag(b.dataset.tag); else if (b.dataset.createTag) createTag(b.dataset.createTag);
    });
    $('tagFilter').addEventListener('change', e => { state.tag = e.target.value; state.repCat = null; renderReports(); });
    $('editTags').addEventListener('click', () => { renderTagModal(); openModal('tagModal'); });
    $('addTagBtn').addEventListener('click', () => createTag($('newTagName').value, true));
    $('newTagName').addEventListener('keydown', e => { if (e.key === 'Enter') createTag($('newTagName').value, true); });
    $('tagModal').addEventListener('click', e => {
      const del = e.target.closest('.del-btn');
      if (del) armOrRun(del, () => deleteTag(del.dataset.tagId));
    });
    $('camInput').addEventListener('change', onReceiptChosen);
    $('fileInput').addEventListener('change', onReceiptChosen);
    $('receiptPreview').addEventListener('click', e => { if (e.target.closest('#removeReceipt')) clearReceipt(); });
    $('catType').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { state.catType = b.dataset.type; state.pickerFor = null; state.catEdit = null; renderCatModal(); } });
    $('catModal').addEventListener('click', e => {
      const ce = e.target.closest('[data-cat-edit]');
      if (ce) { startCatEdit(ce.dataset.catEdit); return; }
      if (e.target.closest('#catEditSave')) { saveCatEdit(); return; }
      if (e.target.closest('#catEditCancel')) { state.catEdit = null; state.pickerFor = null; renderCatModal(); return; }
      if (e.target.closest('[data-pick="edit"]')) {
        if (state.catEdit && $('catEditName')) state.catEdit.nombre = $('catEditName').value;
        state.pickerFor = state.pickerFor === 'edit' ? null : 'edit'; renderCatModal(); return;
      }
      const pk = e.target.closest('[data-pick]');
      if (pk) { state.pickerFor = state.pickerFor === pk.dataset.pick ? null : pk.dataset.pick; renderPicker(); return; }
      if (e.target.closest('#newIconBtn')) { state.pickerFor = state.pickerFor === 'new' ? null : 'new'; renderPicker(); return; }
      const ic = e.target.closest('[data-icon]');
      if (ic) { pickIcon(ic.dataset.icon); return; }
      if (e.target.closest('#useCustomIcon')) { pickIcon($('customIcon').value); return; }
      const del = e.target.closest('.del-btn');
      if (del) armOrRun(del, () => deleteCategory(del.dataset.catId));
    });
    $('customIcon').addEventListener('keydown', e => { if (e.key === 'Enter') pickIcon($('customIcon').value); });
    $('addCatBtn').addEventListener('click', addCategory);
    $('catName').addEventListener('keydown', e => { if (e.key === 'Enter') addCategory(); });
    $('catModal').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'catEditName') { e.preventDefault(); saveCatEdit(); } });

    $('shareBtn').addEventListener('click', () => { renderShareModal(); openModal('shareModal'); });
    $('shareModal').addEventListener('click', e => {
      if (e.target.closest('#addUserBtn')) { addUser(); return; }
      if (e.target.closest('#renameSpaceBtn')) { renameSpace(); return; }
      if (e.target.closest('#createSpaceBtn')) { createSpaceFor(); return; }
      const rs = e.target.closest('[data-resend]');
      if (rs) { resendInvite(rs.dataset.resend); return; }
      if (e.target.closest('#signOutBtn')) { NF.auth.signOut().then(() => location.reload()); return; }
      if (e.target.closest('#copyUrl')) {
        const inp = $('appUrl'); inp.select();
        const done = () => toast('Enlace copiado');
        if (navigator.clipboard) navigator.clipboard.writeText(inp.value).then(done, () => { try { document.execCommand('copy'); done(); } catch (x) {} });
        else { try { document.execCommand('copy'); done(); } catch (x) {} }
        return;
      }
      const del = e.target.closest('.del-btn');
      if (del) armOrRun(del, () => removeUser(del.dataset.user));
    });
    $('shareModal').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'userEmail') addUser(); });
    $('shareModal').addEventListener('change', e => {
      if (e.target.id === 'importFile' && e.target.files[0]) { importFile(e.target.files[0]); e.target.value = ''; }
      if (e.target.id === 'spaceSelect' && e.target.value !== state.spaceId) NF.api.switchSpace(e.target.value);
    });
    $('spaceLabel').addEventListener('click', () => { renderShareModal(); openModal('shareModal'); });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !anyModalOpen()) return;
      if (!$('txModal').hidden) closeTxDetail(); else closeModals();
    });
    $('themeBtn').addEventListener('click', () => applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
    $('refreshBtn').addEventListener('click', () => load(true).then(() => toast('Datos actualizados')));
    document.addEventListener('visibilitychange', () => { if (!document.hidden && state.me) syncAndLoad(); });
    setInterval(() => { if (!document.hidden && !state.saving && !anyModalOpen()) syncAndLoad(); }, 5 * 60000);
    window.addEventListener('online', () => { setNotice(''); syncAndLoad(); });
    window.addEventListener('offline', () => setNotice('Sin conexión: puedes seguir registrando movimientos; se enviarán solos cuando vuelva internet. Editar o borrar necesita conexión.'));

    /* ---------- Teléfono: la barra inferior se oculta mientras hay una ventana abierta o el teclado está visible
       (en iPhone, con el teclado abierto las barras fijas "flotan" y rebotan) ---------- */
    const syncModalClass = () => document.documentElement.classList.toggle('modal-open', anyModalOpen());
    new MutationObserver(syncModalClass).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
    let kbTimer = null;
    const isTyping = el => el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|file|range|color)$/.test(el.type)));
    document.addEventListener('focusin', e => { if (isTyping(e.target)) { clearTimeout(kbTimer); document.documentElement.classList.add('kb-open'); } });
    document.addEventListener('focusout', () => { clearTimeout(kbTimer); kbTimer = setTimeout(() => { if (!isTyping(document.activeElement)) document.documentElement.classList.remove('kb-open'); }, 150); });
    // Android: el teclado se puede cerrar sin salir del campo; se detecta porque la pantalla visible vuelve a su alto
    if (window.visualViewport) {
      let maxH = visualViewport.height, shrunk = false;
      window.addEventListener('orientationchange', () => { maxH = 0; shrunk = false; });
      visualViewport.addEventListener('resize', () => {
        const h = visualViewport.height;
        if (h > maxH) maxH = h;
        if (h < maxH * 0.75) shrunk = true;
        else if (shrunk && h > maxH * 0.9) { shrunk = false; document.documentElement.classList.remove('kb-open'); }
      });
    }

    /* ---------- Inicio ---------- */
    const savedTheme = store.get('finanzas-theme');
    applyTheme(savedTheme || 'light'); // modo día por defecto; el modo noche se activa con el botón 🌙
    applyPreset('month');
    $('fecha').value = iso(new Date());
    render();

    /* Herramientas que usan las secciones de Presupuestos, Análisis, Metas y Alertas (js/modules.js) */
    window.NFUI = { state, $, money, escapeHtml, iconFor, catColor, call, toast, openModal, closeModals, load, render, setView,
      walletIcon, walletOf, iso, parseISO, fmtDate, ICONS, CHART_COLORS, cssVar, delButton, armOrRun, resetDel, isTouch,
      formatAmountInput, parseAmount, openTxDetail, buildChart, txRow, store };
    document.body.dataset.view = 'mov';

    /* Arranque: primero la sesión, luego los datos */
    NF.gate.start(async info => {
      state.me = info.email; state.isAdmin = info.isAdmin; state.isSuper = !!info.isSuper; state.spaceName = info.spaceName || '';
      const cached = NF.cache.read();
      if (cached) load(true, cached); else state.loading = true;
      const qv = new URLSearchParams(location.search).get('v');
      if (qv) history.replaceState(null, '', location.pathname);
      const lastView = qv || store.get('finanzas-view');
      if (lastView && lastView !== 'mov') setView(lastView);
      NF.subscribe(() => { if (!state.saving && !document.hidden) load(true); });
      if (info.offline || !navigator.onLine) {
        if (!cached) state.loading = false;
        setNotice(cached ? 'Sin conexión: puedes seguir registrando movimientos; se enviarán solos cuando vuelva internet. Editar o borrar necesita conexión.' : 'Sin conexión y aún no hay datos guardados en este teléfono. Abre la app con internet al menos una vez.');
        render();
        if (!navigator.onLine) return; // al volver internet se envían los pendientes y se actualiza
      }
      // Envía lo guardado sin conexión y crea los pagos programados que ya vencieron antes de traer los datos
      await NF.api.materialize();
      await load(!!cached);
      if (await flushQueue()) load(true);
    });

})();
