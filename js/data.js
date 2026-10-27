/* Nuestras Finanzas · Capa de datos (Supabase)
   Ofrece a la interfaz las mismas funciones que antes daba Google Apps Script. */
(function () {
  'use strict';
  const cfg = window.NF_CONFIG || {};
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.supabaseUrl || '') && (cfg.supabaseAnonKey || '').length > 40;
  const sb = configured ? window.supabase.createClient(cfg.supabaseUrl.replace(/\/$/, ''), cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
  }) : null;

  const WALLET_TYPES = ['Débito', 'Crédito', 'Efectivo', 'Ahorros', 'Otro'];
  const TAG_COLORS = ['#3B4CCA', '#0F8A6A', '#D1435B', '#E0A21B', '#7B5CD6', '#1D9BB8', '#E06B2D', '#5B8C2A', '#B0457E', '#637083'];
  const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
  const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
  // Identificadores únicos (también en teléfonos con navegador antiguo)
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
  const appUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');

  // Contexto de la sesión e índices para traducir nombres <-> ids
  // isAdmin = administrador general (crea espacios); isOwner = dueño del espacio actual
  const ctx = { email: '', isAdmin: false, spaces: [], spaceId: '', spaceName: '', isOwner: false };
  let idx = { walletByName: {}, walletById: {}, catByKey: {}, catById: {}, tagByName: {}, tagById: {}, members: {} };

  /* ---------- Errores en lenguaje claro ---------- */
  function friendly(e, extra) {
    if (!e) return new Error('Error desconocido');
    const code = e.code || '', msg = String(e.message || e);
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) return new Error('Sin conexión a internet. Revisa tu conexión e inténtalo de nuevo.');
    if (/JWT|session|refresh token/i.test(msg) || code === 'PGRST301') return new Error('Tu sesión expiró. Cierra sesión y vuelve a entrar.');
    if (code === '23505') return new Error((extra && extra.unique) || 'Ya existe un registro con ese nombre.');
    if (code === '23503') return new Error((extra && extra.fk) || 'No se puede: hay otros datos que dependen de este.');
    if (code === '42501' || /row-level security/i.test(msg)) return new Error((extra && extra.rls) || 'No tienes permiso para hacer esto.');
    if (code === '23514' || code === '22P02' || code === '22003') return new Error('Algún dato no es válido. Revisa los campos.');
    if (code === 'P0001') return new Error(msg);
    return new Error(msg);
  }
  async function run(promise, extra) {
    const { data, error, count } = await promise;
    if (error) throw friendly(error, extra);
    return count !== undefined && count !== null && data === null ? count : data;
  }
  async function fetchAll(table, select, order, filter) {
    const out = [], size = 1000;
    for (let from = 0; ; from += size) {
      let q = sb.from(table).select(select || '*').range(from, from + size - 1);
      if (filter) q = filter(q);
      if (order) q = q.order(order, { ascending: true });
      const rows = await run(q);
      out.push(...rows);
      if (rows.length < size) return out;
    }
  }
  const clean = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
  function validName(v, what) {
    const s = clean(v, 60);
    if (!s || s.length > 30) throw new Error('El nombre de la ' + what + ' debe tener entre 1 y 30 caracteres.');
    return s;
  }
  function validIcon(v) {
    const s = clean(v, 20);
    if (!s || s.length > 16 || /[\w\s<>"'=&]/.test(s)) throw new Error('Elige un ícono (emoji) válido.');
    return s;
  }
  const validColor = (c, d) => /^#[0-9a-f]{6}$/i.test(String(c)) ? String(c) : d;

  // Tablas de la 2.2: si aún no se ejecutó el SQL nuevo, la app sigue funcionando sin ellas
  async function optional(promise, fallback) {
    try { return await promise; } catch (e) { return fallback === undefined ? [] : fallback; }
  }

  /* ---------- Conversión a los objetos que usa la interfaz ---------- */
  const mapBudget = b => ({ id: b.id, categoria: b.category_id ? (idx.catById[b.category_id] || {}).nombre || null : null, monto: Number(b.monto) || 0 });
  const mapGoal = g => ({ id: g.id, nombre: g.nombre, icono: g.icono, monto: Number(g.monto_objetivo) || 0, fecha: g.fecha_objetivo || '',
    compartida: g.compartida, creadaPor: g.creada_por, creada: String(g.created_at || '').slice(0, 10),
    canEdit: g.creada_por === ctx.email, canDelete: g.creada_por === ctx.email || ctx.isOwner });
  const mapRecurring = r => ({ id: r.id, tipo: r.tipo, categoria: (idx.catById[r.category_id] || {}).nombre || '', cartera: (idx.walletById[r.wallet_id] || {}).nombre || '',
    monto: Number(r.monto) || 0, descripcion: r.descripcion || '', frecuencia: r.frecuencia, proxima: r.proxima, activa: r.activa, creadoPor: r.creado_por });
  const mapWallet = w => ({
    id: w.id, nombre: w.nombre, tipo: w.tipo, saldoInicial: Number(w.saldo_inicial) || 0, color: w.color, icono: w.icono,
    propietario: w.propietario, compartidaCon: (idx.members[w.id] || []).slice(),
    canManage: w.propietario === ctx.email
  });
  const mapCat = c => ({ id: c.id, nombre: c.nombre, tipo: c.tipo, icono: c.icono, creadaPor: c.creada_por || '', canDelete: ctx.isOwner || c.creada_por === ctx.email });
  const mapTag = t => ({ id: t.id, nombre: t.nombre, color: t.color, creadaPor: t.creada_por || '', canDelete: ctx.isOwner || t.creada_por === ctx.email });
  function mapTx(t, tagIds, urls) {
    const cat = idx.catById[t.category_id], w = idx.walletById[t.wallet_id];
    return {
      id: t.id, fecha: t.fecha, tipo: t.tipo, categoria: cat ? cat.nombre : 'Otros', monto: Number(t.monto) || 0,
      descripcion: t.descripcion || '', cartera: w ? w.nombre : '', creadoPor: t.creado_por || '',
      etiquetas: (tagIds || []).map(id => idx.tagById[id] && idx.tagById[id].nombre).filter(Boolean),
      factura: (t.factura_path && urls && urls[t.factura_path]) || t.factura_url || '',
      facturaPath: t.factura_path || '', recurringId: t.recurring_id || ''
    };
  }
  function rebuildIndex(wallets, members, cats, tags) {
    idx = { walletByName: {}, walletById: {}, catByKey: {}, catById: {}, tagByName: {}, tagById: {}, members: {} };
    members.forEach(m => (idx.members[m.wallet_id] = idx.members[m.wallet_id] || []).push(m.email));
    wallets.forEach(w => { idx.walletById[w.id] = w; idx.walletByName[w.nombre] = w; });
    cats.forEach(c => { idx.catById[c.id] = c; idx.catByKey[c.tipo + '|' + c.nombre] = c; });
    tags.forEach(t => { idx.tagById[t.id] = t; idx.tagByName[t.nombre] = t; });
  }
  async function signedUrls(paths) {
    const out = {};
    const list = [...new Set(paths.filter(Boolean))];
    for (let i = 0; i < list.length; i += 500) {
      const { data } = await sb.storage.from('facturas').createSignedUrls(list.slice(i, i + 500), 3600);
      (data || []).forEach(d => { if (d.signedUrl) out[d.path] = d.signedUrl; });
    }
    return out;
  }
  async function loadOneTx(id) {
    const t = await run(sb.from('transactions').select('*, transaction_tags(tag_id)').eq('id', id).single());
    const urls = t.factura_path ? await signedUrls([t.factura_path]) : {};
    return mapTx(t, (t.transaction_tags || []).map(x => x.tag_id), urls);
  }

  /* ---------- Facturas ---------- */
  function b64ToBlob(b64, type) {
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type });
  }
  async function uploadReceipt(txId, f) {
    if (!RECEIPT_TYPES.includes(f.mimeType)) throw new Error('La factura debe ser una imagen (JPG, PNG) o un PDF.');
    const blob = b64ToBlob(f.data, f.mimeType);
    if (blob.size > 10 * 1024 * 1024) throw new Error('La factura supera los 10 MB.');
    const ext = f.mimeType === 'application/pdf' ? 'pdf' : f.mimeType === 'image/png' ? 'png' : f.mimeType === 'image/webp' ? 'webp' : 'jpg';
    const path = txId + '/' + uuid() + '.' + ext;
    const { error } = await sb.storage.from('facturas').upload(path, blob, { contentType: f.mimeType, upsert: false });
    if (error) throw friendly(error);
    return path;
  }
  async function removeReceipt(path) {
    if (path) { try { await sb.storage.from('facturas').remove([path]); } catch (e) {} }
  }

  /* ---------- Validación de movimientos ---------- */
  function txRow(p) {
    const tipo = String(p.tipo);
    if (tipo !== 'Gasto' && tipo !== 'Ingreso') throw new Error('El tipo debe ser Ingreso o Gasto.');
    const monto = Math.round(Number(p.monto) * 100) / 100;
    if (!isFinite(monto) || monto <= 0) throw new Error('El monto debe ser un número mayor que 0.');
    const cat = idx.catByKey[tipo + '|' + p.categoria];
    if (!cat) throw new Error('Selecciona una categoría válida.');
    const w = idx.walletByName[p.cartera];
    if (!w) throw new Error('Selecciona una cartera a la que tengas acceso.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.fecha))) throw new Error('Fecha inválida.');
    const tagIds = [...new Set((p.etiquetas || []).map(n => idx.tagByName[n] && idx.tagByName[n].id).filter(Boolean))];
    return { row: { fecha: p.fecha, tipo, category_id: cat.id, wallet_id: w.id, monto, descripcion: clean(p.descripcion, 200) }, tagIds };
  }

  /* ---------- API usada por la interfaz ---------- */
  const api = {
    async getData() {
      const S = ctx.spaceId;
      if (!S) throw new Error('No perteneces a ningún espacio.');
      const bySpace = q => q.eq('space_id', S);
      const [wallets, members, cats, tags, budgets, goals, prefs] = await Promise.all([
        fetchAll('wallets', '*', 'created_at', bySpace),
        fetchAll('space_members', 'email, role, created_at', 'created_at', bySpace),
        fetchAll('categories', '*', 'created_at', bySpace),
        fetchAll('tags', '*', 'created_at', bySpace),
        optional(fetchAll('budgets', '*', 'created_at', q => q.eq('space_id', S).eq('email', ctx.email))),
        optional(fetchAll('goals', '*', 'created_at', bySpace)),
        optional(run(sb.from('user_prefs').select('*').eq('email', ctx.email).maybeSingle()), null)
      ]);
      const ids = wallets.map(w => w.id), goalIds = goals.map(g => g.id);
      const [walletMembers, txs, recurring, contributions] = await Promise.all([
        ids.length ? fetchAll('wallet_members', '*', null, q => q.in('wallet_id', ids)) : [],
        ids.length ? fetchAll('transactions', '*, transaction_tags(tag_id)', 'fecha', q => q.in('wallet_id', ids)) : [],
        ids.length ? optional(fetchAll('recurring', '*', 'proxima', q => q.in('wallet_id', ids))) : [],
        goalIds.length ? optional(fetchAll('goal_contributions', '*', 'fecha', q => q.in('goal_id', goalIds))) : []
      ]);
      rebuildIndex(wallets, walletMembers, cats, tags);
      const urls = await signedUrls(txs.map(t => t.factura_path));
      const sp = ctx.spaces.find(x => x.id === S);
      if (sp) { ctx.spaceName = sp.nombre; }
      return {
        me: ctx.email, owner: (members.find(m => m.role === 'owner') || {}).email || '',
        isAdmin: ctx.isOwner, isSuper: ctx.isAdmin, identified: true, appUrl: appUrl(),
        spaceId: S, spaceName: ctx.spaceName, spaces: ctx.spaces.slice(), members,
        wallets: wallets.map(mapWallet),
        transactions: txs.map(t => mapTx(t, (t.transaction_tags || []).map(x => x.tag_id), urls)),
        categoryList: cats.map(mapCat),
        tagList: tags.map(mapTag),
        walletTypes: WALLET_TYPES,
        users: members.map(m => m.email).filter(e => e !== ctx.email),
        budgets: budgets.map(mapBudget),
        goals: goals.map(mapGoal),
        contributions: contributions.map(c => ({ id: c.id, goalId: c.goal_id, monto: Number(c.monto) || 0, fecha: c.fecha, nota: c.nota || '', email: c.email })),
        recurring: recurring.map(mapRecurring),
        prefs: {
          presupuestos: prefs ? prefs.notif_presupuestos : true, movimientos: prefs ? prefs.notif_movimientos : true,
          recordatorios: prefs ? prefs.notif_recordatorios : true, resumen: prefs ? prefs.notif_resumen : true
        }
      };
    },

    /* Presupuestos (de cada persona) */
    async saveBudget(p) {
      const monto = Math.round(Number(p.monto) * 100) / 100;
      if (!isFinite(monto) || monto <= 0) throw new Error('Escribe un monto mayor que 0.');
      const cat = p.categoria ? idx.catByKey['Gasto|' + p.categoria] : null;
      if (p.categoria && !cat) throw new Error('Elige una categoría de gasto.');
      if (p.id) {
        await run(sb.from('budgets').update({ monto }).eq('id', p.id));
        return true;
      }
      await run(sb.from('budgets').insert({ id: uuid(), space_id: ctx.spaceId, category_id: cat ? cat.id : null, monto }),
        { unique: p.categoria ? 'Ya tienes un presupuesto para ' + p.categoria + '.' : 'Ya tienes un presupuesto total.' });
      return true;
    },
    async deleteBudget(id) { await run(sb.from('budgets').delete().eq('id', id)); return true; },

    /* Metas de ahorro */
    async saveGoal(p) {
      const nombre = clean(p.nombre, 60);
      if (!nombre || nombre.length > 40) throw new Error('El nombre de la meta debe tener entre 1 y 40 caracteres.');
      const monto = Math.round(Number(p.monto) * 100) / 100;
      if (!isFinite(monto) || monto <= 0) throw new Error('Escribe cuánto quieres ahorrar.');
      if (p.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(p.fecha)) throw new Error('Fecha inválida.');
      const row = { nombre, icono: validIcon(p.icono || '🎯'), monto_objetivo: monto, fecha_objetivo: p.fecha || null, compartida: p.compartida !== false };
      if (p.id) await run(sb.from('goals').update(row).eq('id', p.id), { rls: 'Solo quien creó la meta puede editarla.' });
      else await run(sb.from('goals').insert(Object.assign({ id: uuid(), space_id: ctx.spaceId }, row)));
      return true;
    },
    async deleteGoal(id) { await run(sb.from('goals').delete().eq('id', id), { rls: 'Solo quien creó la meta o el dueño del espacio pueden eliminarla.' }); return true; },
    async addContribution(goalId, monto, nota) {
      monto = Math.round(Number(monto) * 100) / 100;
      if (!isFinite(monto) || monto === 0) throw new Error('Escribe un monto.');
      await run(sb.from('goal_contributions').insert({ id: uuid(), goal_id: goalId, monto, nota: clean(nota, 100) }));
      return true;
    },
    async deleteContribution(id) { await run(sb.from('goal_contributions').delete().eq('id', id)); return true; },

    /* Pagos y cobros programados */
    async saveRecurring(p) {
      const tipo = p.tipo === 'Ingreso' ? 'Ingreso' : 'Gasto';
      const cat = idx.catByKey[tipo + '|' + p.categoria], w = idx.walletByName[p.cartera];
      if (!cat) throw new Error('Elige una categoría válida.');
      if (!w) throw new Error('Elige una cartera.');
      const monto = Math.round(Number(p.monto) * 100) / 100;
      if (!isFinite(monto) || monto <= 0) throw new Error('El monto debe ser mayor que 0.');
      if (!['semanal', 'quincenal', 'mensual', 'anual'].includes(p.frecuencia)) throw new Error('Elige cada cuánto se repite.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.proxima))) throw new Error('Elige la fecha del próximo pago.');
      const row = { tipo, category_id: cat.id, wallet_id: w.id, monto, descripcion: clean(p.descripcion, 200), frecuencia: p.frecuencia, proxima: p.proxima, activa: p.activa !== false };
      if (p.id) await run(sb.from('recurring').update(row).eq('id', p.id));
      else await run(sb.from('recurring').insert(Object.assign({ id: uuid() }, row)));
      return true;
    },
    async setRecurringActive(id, activa) { await run(sb.from('recurring').update({ activa: !!activa }).eq('id', id)); return true; },
    async deleteRecurring(id) { await run(sb.from('recurring').delete().eq('id', id)); return true; },
    /* Crea los movimientos programados que ya vencieron */
    async materialize() {
      try { return await run(sb.rpc('materialize_recurring')); } catch (e) { return 0; }
    },

    /* Notificaciones */
    async savePrefs(p) {
      await run(sb.from('user_prefs').upsert({ email: ctx.email, notif_presupuestos: !!p.presupuestos, notif_movimientos: !!p.movimientos,
        notif_recordatorios: !!p.recordatorios, notif_resumen: !!p.resumen, updated_at: new Date().toISOString() }, { onConflict: 'email' }));
      return true;
    },
    async pushPublicKey() {
      const { data, error } = await sb.functions.invoke('notificar', { body: { type: 'key' } });
      if (error || !data || !data.publicKey) throw new Error('Las notificaciones aún no están configuradas en el servidor (falta la función "notificar" o sus claves).');
      try { localStorage.removeItem('nf-sin-notificar'); } catch (e) {}
      return data.publicKey;
    },
    async savePushSubscription(sub) {
      const j = sub.toJSON();
      await run(sb.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent }));
      return true;
    },
    async deletePushSubscription(endpoint) { try { await run(sb.rpc('delete_push_subscription', { p_endpoint: endpoint })); } catch (e) {} return true; },
    async testPush() {
      const { data, error } = await sb.functions.invoke('notificar', { body: { type: 'test' } });
      if (error) throw new Error('No se pudo enviar la prueba. Revisa que la función "notificar" esté publicada.');
      return data || {};
    },
    /* Avisa a la función de notificaciones de un movimiento nuevo (no detiene nada si falla) */
    notifyTx(id) {
      if (!navigator.onLine) return;
      // Si la función aún no está publicada, no se vuelve a intentar durante un día
      let off = 0; try { off = Number(localStorage.getItem('nf-sin-notificar')) || 0; } catch (e) {}
      if (off > Date.now()) return;
      sb.functions.invoke('notificar', { body: { type: 'tx', id } }).then(r => {
        const st = r && r.error && r.error.context && r.error.context.status;
        if (st === 404 || (r && r.error && !st)) { try { localStorage.setItem('nf-sin-notificar', String(Date.now() + 864e5)); } catch (e) {} }
      }).catch(() => {});
    },

    /* Movimientos */
    async addTransaction(p) {
      const { row, tagIds } = txRow(p);
      const id = uuid();
      await run(sb.from('transactions').insert(Object.assign({ id }, row)));
      if (tagIds.length) await run(sb.from('transaction_tags').insert(tagIds.map(tag_id => ({ transaction_id: id, tag_id }))));
      if (p.factura && p.factura.data) {
        const path = await uploadReceipt(id, p.factura);
        await run(sb.from('transactions').update({ factura_path: path }).eq('id', id));
      }
      return loadOneTx(id);
    },
    async updateTransaction(id, p) {
      const { row, tagIds } = txRow(p);
      const cur = await run(sb.from('transactions').select('factura_path, factura_url').eq('id', id).single());
      if (p.factura && p.factura.data) {
        row.factura_path = await uploadReceipt(id, p.factura);
        row.factura_url = null;
      } else if (p.removeFactura) {
        row.factura_path = null; row.factura_url = null;
      }
      await run(sb.from('transactions').update(row).eq('id', id), { rls: 'No tienes permiso para editar este movimiento o para moverlo a esa cartera.' });
      await run(sb.from('transaction_tags').delete().eq('transaction_id', id));
      if (tagIds.length) await run(sb.from('transaction_tags').insert(tagIds.map(tag_id => ({ transaction_id: id, tag_id }))));
      if (cur.factura_path && ('factura_path' in row)) await removeReceipt(cur.factura_path);
      return loadOneTx(id);
    },
    async deleteTransaction(id) {
      const cur = await run(sb.from('transactions').select('factura_path').eq('id', id).maybeSingle());
      if (!cur) throw new Error('No se encontró el movimiento. Puede que ya se haya eliminado.');
      await removeReceipt(cur.factura_path); // primero la factura: después ya no habría permiso para verla
      await run(sb.from('transactions').delete().eq('id', id));
      return true;
    },

    /* Carteras */
    async addWallet(p) {
      const nombre = validName(p.nombre, 'cartera');
      if (['todas', 'sin asignar'].includes(nombre.toLowerCase())) throw new Error('Ese nombre está reservado.');
      const row = {
        id: uuid(), space_id: ctx.spaceId, nombre, tipo: WALLET_TYPES.includes(p.tipo) ? p.tipo : 'Otro',
        saldo_inicial: Number(p.saldoInicial) || 0, color: validColor(p.color, '#3B4CCA'), icono: p.icono ? validIcon(p.icono) : '👛'
      };
      const w = await run(sb.from('wallets').insert(row).select().single(), { unique: 'Ya existe una cartera con ese nombre en este espacio (puede ser de otra persona). Prueba con otro nombre.' });
      idx.walletById[w.id] = w; idx.walletByName[w.nombre] = w;
      return mapWallet(w);
    },
    async updateWallet(id, p) {
      const nombre = validName(p.nombre, 'cartera');
      if (['todas', 'sin asignar'].includes(nombre.toLowerCase())) throw new Error('Ese nombre está reservado.');
      const w = await run(sb.from('wallets').update({
        nombre, tipo: WALLET_TYPES.includes(p.tipo) ? p.tipo : 'Otro', saldo_inicial: Number(p.saldoInicial) || 0,
        color: validColor(p.color, '#3B4CCA'), icono: validIcon(p.icono || '👛')
      }).eq('id', id).select().single(), { unique: 'Ya existe otra cartera con ese nombre en este espacio.', rls: 'Solo el propietario puede editar esta cartera.' });
      const old = idx.walletById[id];
      if (old) delete idx.walletByName[old.nombre];
      idx.walletById[id] = w; idx.walletByName[w.nombre] = w;
      return { wallet: mapWallet(w), renamed: 0 };
    },
    async deleteWallet(id) {
      await run(sb.from('wallets').delete().eq('id', id), { fk: 'La cartera tiene movimientos. Elimínalos antes de borrarla.', rls: 'Solo el propietario puede eliminar esta cartera.' });
      return true;
    },
    async shareWallet(id, email) {
      email = clean(email, 120).toLowerCase();
      if (!EMAIL_RE.test(email)) throw new Error('Escribe un correo válido.');
      const w = idx.walletById[id];
      if (w && w.propietario === email) throw new Error('Esa persona ya es la propietaria de la cartera.');
      // El dueño del espacio puede compartir con alguien nuevo: queda agregado al espacio
      if (ctx.isOwner && email !== ctx.email) {
        await run(sb.from('space_members').upsert({ space_id: ctx.spaceId, email }, { onConflict: 'space_id,email', ignoreDuplicates: true }));
      }
      await run(sb.from('wallet_members').upsert({ wallet_id: id, email }, { onConflict: 'wallet_id,email', ignoreDuplicates: true }),
        { rls: 'Solo el propietario puede compartir esta cartera.' });
      (idx.members[id] = idx.members[id] || []).includes(email) || idx.members[id].push(email);
      return { wallet: mapWallet(idx.walletById[id]), emailSent: false, appUrl: appUrl() };
    },
    async unshareWallet(id, email) {
      await run(sb.from('wallet_members').delete().eq('wallet_id', id).eq('email', email));
      idx.members[id] = (idx.members[id] || []).filter(e => e !== email);
      return mapWallet(idx.walletById[id]);
    },

    /* Miembros del espacio (los gestiona su dueño) */
    async addUser(email) {
      email = clean(email, 120).toLowerCase();
      if (!EMAIL_RE.test(email)) throw new Error('Escribe un correo válido.');
      if (email === ctx.email) throw new Error('Ya eres parte de este espacio.');
      await run(sb.from('space_members').upsert({ space_id: ctx.spaceId, email }, { onConflict: 'space_id,email', ignoreDuplicates: true }),
        { rls: 'Solo el dueño del espacio puede agregar personas.' });
      return { email, emailSent: false, appUrl: appUrl() };
    },
    async removeUser(email) {
      await run(sb.from('space_members').delete().eq('space_id', ctx.spaceId).eq('email', email), { rls: 'Solo el dueño del espacio puede retirar personas.' });
      return true;
    },

    /* Espacios */
    async createSpaceFor(nombre, email) {
      nombre = clean(nombre, 60);
      email = clean(email, 120).toLowerCase();
      if (!nombre || nombre.length > 40) throw new Error('El nombre del espacio debe tener entre 1 y 40 caracteres.');
      if (!EMAIL_RE.test(email)) throw new Error('Escribe un correo válido.');
      if (email === ctx.email) throw new Error('Ese es tu correo. Crea el espacio para otra persona.');
      return run(sb.rpc('create_space', { p_nombre: nombre, p_owner: email }));
    },
    async renameSpace(nombre) {
      nombre = clean(nombre, 60);
      if (!nombre || nombre.length > 40) throw new Error('El nombre del espacio debe tener entre 1 y 40 caracteres.');
      await run(sb.from('spaces').update({ nombre }).eq('id', ctx.spaceId), { rls: 'Solo el dueño puede cambiar el nombre del espacio.' });
      ctx.spaceName = nombre;
      const sp = ctx.spaces.find(x => x.id === ctx.spaceId); if (sp) sp.nombre = nombre;
      return nombre;
    },
    switchSpace(id) {
      if (!ctx.spaces.some(x => x.id === id)) return;
      try { localStorage.setItem('nf-space-' + ctx.email, id); } catch (e) {}
      location.reload();
    },

    /* Categorías */
    async addCategory(p) {
      const tipo = p.tipo === 'Ingreso' ? 'Ingreso' : 'Gasto';
      const c = await run(sb.from('categories').insert({ id: uuid(), space_id: ctx.spaceId, nombre: validName(p.nombre, 'categoría'), tipo, icono: validIcon(p.icono) }).select().single(),
        { unique: 'Ya existe esa categoría en ' + (tipo === 'Gasto' ? 'gastos' : 'ingresos') + '.' });
      idx.catById[c.id] = c; idx.catByKey[c.tipo + '|' + c.nombre] = c;
      return mapCat(c);
    },
    async updateCategory(id, p) {
      const old = idx.catById[id];
      const c = await run(sb.from('categories').update({ nombre: validName(p.nombre, 'categoría'), icono: validIcon(p.icono) }).eq('id', id).select().single(),
        { unique: 'Ya existe una categoría con ese nombre.' });
      if (old) delete idx.catByKey[old.tipo + '|' + old.nombre];
      idx.catById[c.id] = c; idx.catByKey[c.tipo + '|' + c.nombre] = c;
      return { categoria: mapCat(c), oldName: old && old.nombre !== c.nombre ? old.nombre : '', renamed: 0 };
    },
    async updateCategoryIcon(id, icono) {
      const old = idx.catById[id];
      return api.updateCategory(id, { nombre: old ? old.nombre : '', icono });
    },
    async deleteCategory(id) {
      await run(sb.from('categories').delete().eq('id', id), { fk: 'La categoría tiene movimientos. No se puede eliminar.' });
      return true;
    },

    /* Etiquetas */
    async addTag(p) {
      const nombre = validName(p.nombre, 'etiqueta');
      if (nombre.includes(',')) throw new Error('El nombre de la etiqueta no puede tener comas.');
      const existing = Object.values(idx.tagById).find(t => t.nombre.toLowerCase() === nombre.toLowerCase());
      if (existing) return mapTag(existing);
      const color = TAG_COLORS[Object.keys(idx.tagById).length % TAG_COLORS.length];
      const t = await run(sb.from('tags').insert({ id: uuid(), space_id: ctx.spaceId, nombre, color }).select().single(), { unique: 'Ya existe esa etiqueta.' });
      idx.tagById[t.id] = t; idx.tagByName[t.nombre] = t;
      return mapTag(t);
    },
    async deleteTag(id) {
      await run(sb.from('tags').delete().eq('id', id), { fk: 'La etiqueta está en uso. No se puede eliminar.' });
      return true;
    },

    /* Migración */
    async importFromSheets(payload) {
      return run(sb.rpc('import_from_sheets', { payload, p_space: ctx.spaceId }));
    }
  };

  /* ---------- Sesión ---------- */
  const auth = {
    configured,
    async session() {
      const { data } = await sb.auth.getSession();
      return data.session;
    },
    async signInWithGoogle() {
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: appUrl(), queryParams: { prompt: 'select_account' } }
      });
      if (error) throw friendly(error);
    },
    async sendCode(email) {
      email = clean(email, 120).toLowerCase();
      if (!EMAIL_RE.test(email)) throw new Error('Escribe un correo válido.');
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: appUrl() } });
      if (error) throw friendly(error);
      return email;
    },
    async verifyCode(email, token) {
      const { error } = await sb.auth.verifyOtp({ email, token: clean(token, 10), type: 'email' });
      if (error) throw new Error('El código no es válido o ya venció. Pide uno nuevo.');
    },
    async signOut() {
      cache.clearAll();
      try { await sb.auth.signOut(); } catch (e) {}
    },
    /* Verifica que la cuenta esté autorizada. La primera cuenta que entra queda como administradora. */
    async authorize(session) {
      ctx.email = String(session.user.email || '').toLowerCase();
      await run(sb.rpc('claim_admin'));
      ctx.isAdmin = !!(await run(sb.rpc('is_admin')));
      const rows = await run(sb.from('space_members').select('space_id, role, spaces(nombre)').eq('email', ctx.email));
      ctx.spaces = rows.map(r => ({ id: r.space_id, role: r.role, nombre: (r.spaces && r.spaces.nombre) || 'Espacio' }))
        .sort((a, b) => (a.role === 'owner' ? 0 : 1) - (b.role === 'owner' ? 0 : 1) || a.nombre.localeCompare(b.nombre));
      let saved = '';
      try { saved = localStorage.getItem('nf-space-' + ctx.email) || ''; } catch (e) {}
      const cur = ctx.spaces.find(x => x.id === saved) || ctx.spaces[0];
      ctx.spaceId = cur ? cur.id : ''; ctx.spaceName = cur ? cur.nombre : ''; ctx.isOwner = !!(cur && cur.role === 'owner');
      return { email: ctx.email, allowed: ctx.spaces.length > 0, isAdmin: ctx.isOwner, isSuper: ctx.isAdmin, spaceName: ctx.spaceName };
    },
    onChange(cb) { sb.auth.onAuthStateChange((event, session) => cb(event, session)); }
  };

  /* ---------- Copia local para abrir al instante (se borra al cerrar sesión) ---------- */
  const cache = {
    key: () => 'nf-cache-v2-' + ctx.email + '-' + ctx.spaceId,
    read() { try { const s = localStorage.getItem(cache.key()); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
    write(d) { try { localStorage.setItem(cache.key(), JSON.stringify(d)); } catch (e) {} },
    clearAll() { try { Object.keys(localStorage).filter(k => k.startsWith('nf-cache-')).forEach(k => localStorage.removeItem(k)); } catch (e) {} }
  };

  /* ---------- Tiempo real: avisa cuando alguien cambia algo ---------- */
  function subscribe(onChange) {
    let t = null;
    const fire = () => { clearTimeout(t); t = setTimeout(onChange, 600); };
    const ch = sb.channel('nf-cambios');
    ['spaces', 'space_members', 'wallets', 'wallet_members', 'categories', 'tags', 'transactions', 'transaction_tags',
     'budgets', 'goals', 'goal_contributions', 'recurring'].forEach(table =>
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, fire));
    ch.subscribe();
    return () => sb.removeChannel(ch);
  }

  window.NF = { api, auth, cache, subscribe, ctx, appUrl };
})();
