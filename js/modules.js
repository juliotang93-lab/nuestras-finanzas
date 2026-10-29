/* Nuestras Finanzas · Presupuestos, Análisis, Metas, Alertas y notificaciones */
(function () {
  'use strict';
  const U = window.NFUI, I = window.NFInsights;
  if (!U || !I) return;
  const { state, $, money } = U;
  const esc = U.escapeHtml;
  const fmt = n => money.format(Math.round(n || 0));
  const today = () => U.iso(new Date());
  const thisMonth = () => today().slice(0, 7);
  let budMonth = thisMonth(), anaMonth = thisMonth();
  const FREQ = { mensual: 'Cada mes', quincenal: 'Cada 15 días', semanal: 'Cada semana', anual: 'Cada año' };
  const FREQ_SHORT = { mensual: 'mensual', quincenal: 'quincenal', semanal: 'semanal', anual: 'anual' };

  /* ---------- Utilidades ---------- */
  const monthLabel = mk => { const s = U.parseISO(mk + '-01').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); };
  const shortDate = d => d ? U.fmtDate(d, { day: 'numeric', month: 'short' }) : '';
  const expenseCats = () => state.categoryList.filter(c => c.tipo === 'Gasto');
  const catIcon = (name, tipo) => name ? U.iconFor(tipo || 'Gasto', name) : '🧾';
  const pctTxt = p => (p > 0 ? '+' : '') + Math.round(p) + '%';
  const monthNav = (id, mk) => `<div class="month-nav"><button type="button" class="icon-btn" data-month="${id}:-1" aria-label="Mes anterior"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg></button><strong>${monthLabel(mk)}</strong><button type="button" class="icon-btn" data-month="${id}:1" aria-label="Mes siguiente" ${mk >= thisMonth() ? 'disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg></button></div>`;
  const bar = (pct, level) => `<div class="pbar lv-${level || 'ok'}" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.max(2, Math.min(100, pct))}%"></i></div>`;
  const moneyField = (id, value, label) => `<div class="field"><label for="${id}">${label}</label><div class="money-input ${value ? 'filled' : ''}"><span class="prefix" aria-hidden="true">$</span><input class="amount-input num" id="${id}" type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="${value ? esc(String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')) : ''}"></div></div>`;
  const empty = (title, text) => `<div class="empty"><strong>${title}</strong>${text}</div>`;
  let dismissed = new Set();
  const dkey = () => 'nf-ocultas-' + state.me + '-' + state.spaceId;
  function loadDismissed() { try { dismissed = new Set(JSON.parse(localStorage.getItem(dkey()) || '[]')); } catch (e) { dismissed = new Set(); } }
  function dismiss(k) { dismissed.add(k); try { localStorage.setItem(dkey(), JSON.stringify([...dismissed].slice(-300))); } catch (e) {} }
  async function act(fn, ok) {
    try { await fn(); if (ok) U.toast(ok); await U.load(true); } catch (e) { U.toast(e.message, true); }
  }

  /* =========================================================
     PRESUPUESTOS
     ========================================================= */
  function renderBud() {
    const el = $('viewBud'), mk = budMonth, t = today();
    const st = I.budgetStatus(state.budgets, state.transactions, mk, t);
    const total = st.find(b => !b.categoria), cats = st.filter(b => b.categoria).sort((a, b) => b.pct - a.pct);
    const sug = I.budgetSuggestions(state.transactions, state.budgets, mk);
    const isCurrent = mk === thisMonth();
    let head = '';
    if (total) {
      head = `<section class="panel bud-hero">
        <div class="bud-hero-top"><div><p class="muted">Presupuesto total del mes</p><p class="big num ${total.level}-text">${fmt(total.spent)} <small>de ${fmt(total.monto)}</small></p></div>
        <button type="button" class="btn ghost" data-bud="${esc(total.id)}">Editar</button></div>
        ${bar(total.pct, total.level)}
        <p class="note">${total.remaining >= 0 ? 'Disponible ' + fmt(total.remaining) : 'Te pasaste ' + fmt(-total.remaining)}${isCurrent && total.daysLeft && total.remaining > 0 ? ' · ' + fmt(total.perDay) + ' por día durante ' + total.daysLeft + ' días' : ''}${total.willExceed ? ' · <strong class="warn-text">A este ritmo cerrarás en ' + fmt(total.projection) + '</strong>' : ''}</p>
      </section>`;
    } else if (cats.length) {
      const m = cats.reduce((s, b) => s + b.monto, 0), sp = cats.reduce((s, b) => s + b.spent, 0);
      head = `<section class="panel bud-hero"><p class="muted">Suma de tus presupuestos</p><p class="big num">${fmt(sp)} <small>de ${fmt(m)}</small></p>${bar(m ? sp / m * 100 : 0, sp > m ? 'over' : sp > m * 0.8 ? 'warn' : 'ok')}</section>`;
    }
    const rows = cats.map(b => `<button type="button" class="bud-row" data-bud="${esc(b.id)}">
        <span class="cat-dot" style="--cc:${U.catColor(b.categoria)}">${catIcon(b.categoria)}</span>
        <span class="bud-main"><span class="bud-line"><strong>${esc(b.categoria)}</strong><span class="num ${b.level}-text">${Math.round(b.pct)}%</span></span>
          ${bar(b.pct, b.level)}
          <small>${fmt(b.spent)} de ${fmt(b.monto)} · ${b.remaining >= 0 ? 'quedan ' + fmt(b.remaining) : 'te pasaste ' + fmt(-b.remaining)}${b.willExceed ? ' · a este ritmo ' + fmt(b.projection) : ''}</small></span>
      </button>`).join('');
    const sugCats = sug.categorias.slice(0, 8).map(c => `<div class="sug-row">
        <span class="cat-dot" style="--cc:${U.catColor(c.categoria)}">${catIcon(c.categoria)}</span>
        <span class="bud-main"><strong>${esc(c.categoria)}</strong><small>Promedio ${fmt(c.avg)} al mes · mes pasado ${fmt(c.last)}</small></span>
        <span class="sug-actions"><button type="button" class="chip-btn" data-sug="${esc(c.categoria)}" data-amt="${c.sugerido}">${fmt(c.sugerido)}<small>−10%</small></button><button type="button" class="chip-btn ghosty" data-sug="${esc(c.categoria)}" data-amt="${c.igual}">${fmt(c.igual)}<small>promedio</small></button></span>
      </div>`).join('');
    const regla = sug.regla ? `<section class="panel"><h2>Regla 50/30/20 con tu ingreso</h2>
        <p class="note" style="margin-top:0">Con un ingreso promedio de <strong>${fmt(sug.regla.ingreso)}</strong> al mes, una guía sencilla es repartirlo así:</p>
        <div class="rule-grid">
          ${[['Necesidades', '50%', sug.regla.necesidades, sug.regla.actualNecesidades, 'Vivienda, servicios, mercado, transporte, salud, educación'],
             ['Gustos', '30%', sug.regla.deseos, sug.regla.actualDeseos, 'Salidas, compras, suscripciones, ocio'],
             ['Ahorro', '20%', sug.regla.ahorro, sug.regla.actualAhorro, 'Lo que queda para tus metas']].map(r => `
            <div class="rule-item"><p class="muted">${r[0]} · ${r[1]}</p><p class="num"><strong>${fmt(r[2])}</strong></p><small>Hoy: ${fmt(r[3])} ${r[3] > r[2] && r[0] !== 'Ahorro' ? '<span class="over-text">(+' + fmt(r[3] - r[2]) + ')</span>' : r[0] === 'Ahorro' && r[3] < r[2] ? '<span class="warn-text">(faltan ' + fmt(r[2] - Math.max(0, r[3])) + ')</span>' : '<span class="ok-text">✓</span>'}</small><small class="muted">${r[4]}</small></div>`).join('')}
        </div></section>` : '';
    el.innerHTML = `
      <div class="mod-head"><h1>Presupuestos</h1>${monthNav('bud', mk)}<button type="button" class="btn" data-bud-new="1">+ Presupuesto</button></div>
      ${head}
      <section class="panel">${cats.length ? `<h2>Por categoría</h2>${rows}` : empty('Aún no tienes presupuestos por categoría', 'Elige una categoría y un límite para el mes; te avisaremos al llegar al 80% y si te pasas. Abajo tienes sugerencias según lo que sueles gastar.')}</section>
      ${sug.categorias.length || sug.total ? `<section class="panel"><h2>Presupuestos sugeridos</h2>
        <p class="note" style="margin-top:0">Según tu promedio de los últimos meses. Toca un valor para crearlo.</p>
        ${sug.total ? `<div class="sug-row"><span class="cat-dot" style="--cc:#3B4CCA">🧾</span><span class="bud-main"><strong>Total del mes</strong><small>Promedio ${fmt(sug.total.avg)} al mes</small></span><span class="sug-actions"><button type="button" class="chip-btn" data-sug="" data-amt="${sug.total.sugerido}">${fmt(sug.total.sugerido)}<small>−10%</small></button></span></div>` : ''}
        ${sugCats}</section>` : (!state.transactions.length ? '' : `<section class="panel">${empty('Sugerencias en camino', 'Cuando tengas al menos un mes completo de movimientos, aquí verás presupuestos sugeridos para cada categoría.')}</section>`)}
      ${regla}`;
  }

  function openBudget(id, preset) {
    const b = id ? state.budgets.find(x => x.id === id) : null;
    const cat = b ? b.categoria : (preset && preset.categoria !== undefined ? preset.categoria : undefined);
    const used = new Set(state.budgets.map(x => x.categoria || ''));
    const options = [['', 'Total del mes']].concat(expenseCats().map(c => [c.nombre, c.nombre]))
      .filter(o => b ? (o[0] === (b.categoria || '')) : !used.has(o[0]) || o[0] === cat);
    const sug = I.budgetSuggestions(state.transactions, [], budMonth);
    const hint = name => { const c = name ? sug.categorias.find(x => x.categoria === name) : (sug.total ? { avg: sug.total.avg, sugerido: sug.total.sugerido, igual: I.nice(sug.total.avg) } : null);
      return c ? `<div class="chips-row">${[[c.sugerido, '−10%'], [c.igual, 'promedio']].map(x => `<button type="button" class="chip-btn" data-fill="${x[0]}">${fmt(x[0])}<small>${x[1]}</small></button>`).join('')}</div><p class="note">Sueles gastar ${fmt(c.avg)} al mes.</p>` : '<p class="note">Aún no hay historial para sugerir un valor.</p>'; };
    $('bmTitle').textContent = b ? 'Editar presupuesto' : 'Nuevo presupuesto';
    $('budBody').innerHTML = `
      <div class="field"><label for="budCat">Categoría</label><select id="budCat" ${b ? 'disabled' : ''}>${options.map(o => `<option value="${esc(o[0])}" ${o[0] === (cat || '') ? 'selected' : ''}>${o[0] ? catIcon(o[0]) + ' ' : '🧾 '}${esc(o[1])}</option>`).join('')}</select></div>
      ${moneyField('budAmt', b ? b.monto : 0, 'Límite mensual')}
      <div id="budHint">${hint(b ? b.categoria : (cat !== undefined ? cat : (options[0] || [''])[0]))}</div>
      <button type="button" class="btn" id="budSave">${b ? 'Guardar cambios' : 'Crear presupuesto'}</button>
      ${b ? `<div class="danger-zone"><button type="button" class="link-btn" id="budSeeTx">Ver movimientos del mes</button>${U.delButton('data-bud-del', b.id)}</div>` : ''}`;
    $('budBody').dataset.id = b ? b.id : '';
    $('budCat').onchange = () => { $('budHint').innerHTML = hint($('budCat').value); };
    U.openModal('budModal');
  }
  async function saveBudgetFromModal() {
    const id = $('budBody').dataset.id || null, monto = U.parseAmount($('budAmt').value);
    const btn = $('budSave'); btn.disabled = true;
    try {
      await U.call('saveBudget', { id, categoria: $('budCat').value || null, monto });
      U.closeModals(); U.toast(id ? 'Presupuesto actualizado' : 'Presupuesto creado'); await U.load(true);
    } catch (e) { U.toast(e.message, true); btn.disabled = false; }
  }

  /* =========================================================
     ANÁLISIS
     ========================================================= */
  function renderAna() {
    const el = $('viewAna'), mk = anaMonth, t = mk === thisMonth() ? today() : mk + '-' + String(I.daysInMonth(mk)).padStart(2, '0');
    const txs = state.transactions;
    if (!txs.length) { el.innerHTML = `<div class="mod-head"><h1>Análisis</h1></div><section class="panel">${empty('Todavía no hay datos para analizar', 'Registra tus gastos e ingresos unos días y aquí verás en qué se te va la plata, tus suscripciones y cómo optimizar tus compras.')}</section>`; return; }
    const sm = I.monthSummary(txs, mk, t);
    const leaks = I.leaks(txs, mk, t);
    const subs = I.detectRecurring(txs, t, state.recurring);
    const activeSubs = subs.filter(s => s.activa && s.esSuscripcion);
    const subsMonth = activeSubs.reduce((s, x) => s + x.mensual, 0);
    const ant = I.antExpenses(txs, mk, t), wd = I.weekdayPattern(txs, t), mer = I.merchants(txs, t).slice(0, 6);

    const kpi = (label, value, sub, cls) => `<div class="kpi"><p>${label}</p><strong class="num ${cls || ''}">${value}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const kpis = `<section class="panel"><div class="kpis four">
      ${kpi('Gasto del mes', fmt(sm.gasto), sm.vsAvg != null ? `${pctTxt(sm.vsAvg)} vs. tu promedio` : 'sin historial aún', sm.vsAvg > 10 ? 'over-text' : '')}
      ${sm.isCurrent ? kpi('Proyección al cierre', fmt(sm.projection), sm.avg ? 'promedio ' + fmt(sm.avg) : '') : kpi('Ingresos', fmt(sm.ingreso), '')}
      ${kpi('Ahorro del mes', fmt(sm.ahorro), sm.ingreso ? Math.round(sm.ahorro / sm.ingreso * 100) + '% de tus ingresos' : '', sm.ahorro < 0 ? 'over-text' : 'ok-text')}
      ${kpi('Suscripciones', fmt(subsMonth) + '<small>/mes</small>', fmt(subsMonth * 12) + ' al año')}
    </div></section>`;

    const leakHtml = leaks.length ? leaks.slice(0, 5).map(l => `<div class="leak-row">
        <span class="cat-dot" style="--cc:${U.catColor(l.categoria)}">${catIcon(l.categoria)}</span>
        <span class="bud-main"><span class="bud-line"><strong>${esc(l.categoria)}</strong><span class="num over-text">${pctTxt(l.pct)}</span></span>
        <div class="cmp"><i class="cmp-avg" style="width:${Math.min(100, l.avgToDay / Math.max(l.actual, l.avgToDay) * 100)}%"></i><i class="cmp-now" style="width:${Math.min(100, l.actual / Math.max(l.actual, l.avgToDay) * 100)}%"></i></div>
        <small>${l.projected ? 'Llevas ' + fmt(l.actual) + '; a esta altura sueles llevar ' + fmt(l.avgToDay) : 'Gastaste ' + fmt(l.actual) + ' frente a ' + fmt(l.avg) + ' de promedio'}. Volviendo a lo normal ahorrarías ${fmt(l.diff)}.</small></span>
      </div>`).join('') + `<p class="note">Barra gris: lo normal a esta altura del mes. Barra de color: lo que llevas.</p>`
      : `<p class="note" style="margin:0">${sm.avg ? 'Ninguna categoría va por encima de lo normal este mes.' : 'Se necesita al menos un mes de historial para comparar.'}</p>`;

    const badge = (txt, cls) => `<span class="badge b-${cls || 'none'}">${txt}</span>`;
    const subRow = s => {
      const flags = [];
      if (s.dobles.length) flags.push(badge('Cobro doble ' + shortDate(s.dobles[s.dobles.length - 1]), 'danger'));
      if (s.parecidas.length && s.activa) flags.push(badge('¿Duplicada con ' + esc(s.parecidas[0]) + '?', 'warn'));
      if (s.subio >= 5 && (s.esSuscripcion || s.fijo)) flags.push(badge('Subió ' + Math.round(s.subio) + '%', 'warn'));
      if (s.enVariasCarteras) flags.push(badge('En varias carteras', 'warn'));
      if (!s.activa) flags.push(badge('Ya no se cobra', ''));
      if (s.programado) flags.push(badge('Programado', 'ok'));
      const forgotKey = 'uso-' + s.key;
      const ask = s.activa && s.esSuscripcion && s.count >= 3 && !dismissed.has(forgotKey)
        ? `<div class="ask">¿Aún la usas? Llevas ${s.count} cobros: ${fmt(s.anual)} al año. <button type="button" class="link-btn" data-dismiss="${esc(forgotKey)}">Sí, la uso</button></div>` : '';
      return `<div class="sub-row ${s.activa ? '' : 'inactive'}">
        <span class="cat-dot" style="--cc:${U.catColor(s.categoria)}">${catIcon(s.categoria)}</span>
        <span class="bud-main"><span class="bud-line"><strong>${esc(s.nombre)}</strong><span class="num">${fmt(s.monto)}</span></span>
          <small>${FREQ_SHORT[s.frecuencia]} · ${esc(s.carteras.join(', '))} · ${s.activa ? 'próximo ~' + shortDate(s.proxima) : 'último ' + shortDate(s.ultima)}</small>
          ${flags.length ? `<span class="badges">${flags.join('')}</span>` : ''}${ask}
          ${s.activa && !s.programado ? `<button type="button" class="link-btn" data-prog="${esc(s.key)}">Programar pago automático</button>` : ''}</span>
      </div>`;
    };
    const subsHtml = subs.length ? subs.slice(0, 12).map(subRow).join('')
      : '<p class="note" style="margin:0">Aún no se detectan pagos que se repitan. Se reconocen por la descripción: escribe por ejemplo "Netflix" o "Arriendo" al registrarlos.</p>';

    const recHtml = state.recurring.length ? state.recurring.slice().sort((a, b) => a.proxima.localeCompare(b.proxima)).map(r => `
      <div class="sub-row ${r.activa ? '' : 'inactive'}">
        <span class="cat-dot" style="--cc:${U.catColor(r.categoria)}">${catIcon(r.categoria, r.tipo)}</span>
        <span class="bud-main"><span class="bud-line"><strong>${esc(r.descripcion || r.categoria)}</strong><span class="num ${r.tipo === 'Ingreso' ? 'ok-text' : ''}">${r.tipo === 'Ingreso' ? '+' : '−'}${fmt(r.monto)}</span></span>
          <small>${FREQ[r.frecuencia]} · ${esc(r.cartera)} · ${r.activa ? 'próximo ' + shortDate(r.proxima) : 'en pausa'}</small>
          <span class="row-actions"><button type="button" class="link-btn" data-rec-edit="${esc(r.id)}">Editar</button><button type="button" class="link-btn" data-rec-toggle="${esc(r.id)}">${r.activa ? 'Pausar' : 'Reanudar'}</button></span></span>
      </div>`).join('') : '<p class="note" style="margin:0">Programa pagos fijos como el arriendo, el salario o tus suscripciones: se registran solos en su fecha y te avisamos antes.</p>';

    const antHtml = ant ? `<p class="lead-num"><strong class="num">${fmt(ant.total)}</strong> en ${ant.count} gastos pequeños (de ${fmt(ant.threshold)} o menos): el ${Math.round(ant.share)}% de lo que gastaste este mes.</p>
      ${ant.top.map(g => `<div class="mini-row"><span>${esc(g.nombre)}</span><span class="num">${g.count} veces · ${fmt(g.total)}</span></div>`).join('')}
      <p class="note">Si los reduces a la mitad, ahorrarías unos ${fmt(ant.total / 2)} al mes.</p>`
      : '<p class="note" style="margin:0">No hay suficientes gastos pequeños este mes para mostrar un patrón.</p>';

    const wdHtml = wd ? (() => {
      const max = Math.max(...wd.avg) || 1, order = [1, 2, 3, 4, 5, 6, 0], ab = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
      return `<div class="wd-bars">${order.map(i => `<div class="wd ${i === wd.top ? 'top' : ''}"><span class="wd-val num">${wd.avg[i] >= 1000 ? Math.round(wd.avg[i] / 1000) + 'k' : Math.round(wd.avg[i])}</span><i style="height:${Math.max(4, wd.avg[i] / max * 100)}%"></i><span>${ab[i]}</span></div>`).join('')}</div>
        <p class="note">Promedio por día de la semana (en miles). Los <strong>${/s$/.test(wd.topName) ? wd.topName : wd.topName + 's'}</strong> gastas ${wd.ratio.toFixed(1).replace('.', ',')} veces tu promedio diario. El fin de semana concentra el ${Math.round(wd.weekendShare)}% de tus gastos (últimos 90 días).</p>`;
    })() : '<p class="note" style="margin:0">Se necesitan más movimientos para ver tus patrones por día.</p>';

    const merHtml = mer.length ? mer.map(m => {
      const tips = [];
      if (m.spread >= 1.4) tips.push(`pagaste entre ${fmt(m.min)} y ${fmt(m.max)}`);
      if (m.perMonth >= 6) tips.push(`unas ${Math.round(m.perMonth)} veces al mes`);
      return `<div class="sub-row"><span class="cat-dot" style="--cc:${U.catColor(m.categoria)}">${catIcon(m.categoria)}</span>
        <span class="bud-main"><span class="bud-line"><strong>${esc(m.nombre)}</strong><span class="num">${fmt(m.total)}</span></span>
        <small>${m.count} compras en 90 días · ticket promedio ${fmt(m.avg)}${tips.length ? ' · ' + tips.join(' · ') : ''}</small></span></div>`;
    }).join('') + '<p class="note">Ideas: donde el precio varía mucho, compara antes de comprar; lo que compras muchas veces al mes, agrúpalo en menos compras más grandes.</p>'
      : '<p class="note" style="margin:0">Cuando repitas compras con la misma descripción (por ejemplo "Mercado D1"), aquí verás frecuencia, ticket promedio y variación de precio.</p>';

    el.innerHTML = `
      <div class="mod-head"><h1>Análisis</h1>${monthNav('ana', mk)}</div>
      ${kpis}
      <div class="mod-grid">
        <section class="panel"><h2>Dónde se te escapa el dinero</h2>${leakHtml}</section>
        <section class="panel"><h2>Suscripciones y pagos que se repiten</h2>${subsHtml}</section>
        <section class="panel"><div class="panel-title"><h2>Pagos programados</h2><button type="button" class="btn ghost" data-rec-new="1">+ Programar</button></div>${recHtml}</section>
        <section class="panel"><h2>Gastos hormiga</h2>${antHtml}</section>
        <section class="panel"><h2>Cuándo gastas más</h2>${wdHtml}</section>
        <section class="panel"><h2>Optimiza tus compras</h2>${merHtml}</section>
      </div>`;
  }

  /* ---------- Pagos programados ---------- */
  function openRecurring(id, preset) {
    const r = id ? state.recurring.find(x => x.id === id) : null;
    const p = r || Object.assign({ tipo: 'Gasto', categoria: '', cartera: (state.wallets[0] || {}).nombre || '', monto: 0, descripcion: '', frecuencia: 'mensual', proxima: today(), activa: true }, preset || {});
    const cats = t => state.categoryList.filter(c => c.tipo === t);
    const catOpts = t => cats(t).map(c => `<option value="${esc(c.nombre)}" ${c.nombre === p.categoria ? 'selected' : ''}>${c.icono} ${esc(c.nombre)}</option>`).join('');
    $('rmTitle').textContent = r ? 'Editar pago programado' : 'Programar pago o cobro';
    $('recBody').dataset.id = r ? r.id : '';
    $('recBody').innerHTML = `
      <div class="type-toggle" id="recType"><button type="button" data-t="Gasto" aria-pressed="${p.tipo === 'Gasto'}">Gasto</button><button type="button" data-t="Ingreso" aria-pressed="${p.tipo === 'Ingreso'}">Ingreso</button></div>
      <div class="field" style="margin-top:14px"><label for="recDesc">Descripción</label><input id="recDesc" maxlength="200" value="${esc(p.descripcion)}" placeholder="Ej. Arriendo, Netflix, Salario" autocomplete="off"></div>
      ${moneyField('recAmt', p.monto, 'Monto')}
      <div class="row-2">
        <div class="field"><label for="recCat">Categoría</label><select id="recCat">${catOpts(p.tipo)}</select></div>
        <div class="field"><label for="recWallet">Cartera</label><select id="recWallet">${state.wallets.map(w => `<option value="${esc(w.nombre)}" ${w.nombre === p.cartera ? 'selected' : ''}>${U.walletIcon(w)} ${esc(w.nombre)}</option>`).join('')}</select></div>
      </div>
      <div class="row-2">
        <div class="field"><label for="recFreq">Se repite</label><select id="recFreq">${Object.keys(FREQ).map(f => `<option value="${f}" ${f === p.frecuencia ? 'selected' : ''}>${FREQ[f]}</option>`).join('')}</select></div>
        <div class="field"><label for="recNext">Próxima fecha</label><input type="date" id="recNext" value="${esc(p.proxima)}"></div>
      </div>
      <p class="note" style="margin-top:-4px">En esa fecha se registra solo y te avisamos el día antes. Puedes pausarlo cuando quieras.</p>
      <button type="button" class="btn" id="recSave">${r ? 'Guardar cambios' : 'Programar'}</button>
      ${r ? `<div class="danger-zone"><p>Los movimientos ya registrados se conservan.</p>${U.delButton('data-rec-del', r.id)}</div>` : ''}`;
    $('recBody').dataset.tipo = p.tipo;
    U.openModal('recModal');
  }
  async function saveRecurringFromModal() {
    const id = $('recBody').dataset.id || null;
    const old = id ? state.recurring.find(x => x.id === id) : null;
    const payload = { id, tipo: $('recBody').dataset.tipo, categoria: $('recCat').value, cartera: $('recWallet').value, monto: U.parseAmount($('recAmt').value),
      descripcion: $('recDesc').value.trim(), frecuencia: $('recFreq').value, proxima: $('recNext').value, activa: old ? old.activa : true };
    const btn = $('recSave'); btn.disabled = true;
    try {
      await U.call('saveRecurring', payload);
      U.closeModals();
      await NF.api.materialize();
      U.toast(id ? 'Pago programado actualizado' : 'Programado: se registrará solo en su fecha');
      await U.load(true);
    } catch (e) { U.toast(e.message, true); btn.disabled = false; }
  }

  /* =========================================================
     METAS DE AHORRO
     ========================================================= */
  const GOAL_ICONS = ['🎯', '✈️', '🏖️', '🏠', '🚗', '🎓', '💍', '👶', '🛟', '💻', '📱', '🎁', '🏥', '🐶', '🎉', '💰'];
  function renderGoal() {
    const el = $('viewGoal'), t = today();
    const cap = I.savingsCapacity(state.transactions, thisMonth());
    const goals = state.goals.map(g => Object.assign({}, g, { st: I.goalStatus(g, state.contributions, t) }));
    const capHtml = cap && (cap.ingreso || cap.gasto) ? `<section class="panel cap ${cap.ahorro >= 0 ? '' : 'neg'}"><p class="muted">Tu capacidad de ahorro</p>
      <p class="big num">${fmt(Math.abs(cap.ahorro))}<small> ${cap.ahorro >= 0 ? 'te sobran al mes' : 'gastas de más al mes'}</small></p>
      <p class="note">Promedio de los últimos ${cap.meses} ${cap.meses === 1 ? 'mes' : 'meses'}: ingresos ${fmt(cap.ingreso)}, gastos ${fmt(cap.gasto)}.</p></section>` : '';
    const statusBadge = s => ({ 'a tiempo': '<span class="badge b-ok">A tiempo</span>', atrasada: '<span class="badge b-warn">Atrasada</span>', lograda: '<span class="badge b-ok">¡Lograda!</span>', vencida: '<span class="badge b-danger">Venció la fecha</span>', 'sin fecha': '' }[s] || '');
    const card = g => {
      const my = state.contributions.filter(c => c.goalId === g.id).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 3);
      return `<section class="panel goal-card">
        <div class="goal-top"><span class="goal-ic">${esc(g.icono)}</span><div class="bud-main"><strong>${esc(g.nombre)}</strong><small>${g.fecha ? 'Para el ' + U.fmtDate(g.fecha) : 'Sin fecha límite'}${g.compartida ? ' · del espacio' : ' · privada'}</small></div>${statusBadge(g.st.status)}</div>
        <p class="num goal-amt"><strong>${fmt(g.st.saved)}</strong> de ${fmt(g.monto)} · ${Math.round(g.st.pct)}%</p>
        ${bar(g.st.pct, g.st.status === 'atrasada' ? 'warn' : 'ok')}
        ${g.st.perMonth && g.st.status !== 'lograda' ? `<p class="note">Ahorra <strong>${fmt(g.st.perMonth)}</strong> al mes para lograrla a tiempo${cap && cap.ahorro > 0 ? ' (' + Math.round(g.st.perMonth / cap.ahorro * 100) + '% de lo que te sobra)' : ''}.</p>` : ''}
        ${my.length ? `<div class="contribs">${my.map(c => `<div class="mini-row"><span>${shortDate(c.fecha)}${c.nota ? ' · ' + esc(c.nota) : ''}${c.email !== state.me ? ' · ' + esc(c.email.split('@')[0]) : ''}</span><span class="num ${c.monto < 0 ? 'over-text' : 'ok-text'}">${c.monto < 0 ? '−' : '+'}${fmt(Math.abs(c.monto))}${c.email === state.me ? ` <button type="button" class="x-btn" data-contrib-del="${esc(c.id)}" aria-label="Eliminar abono">×</button>` : ''}</span></div>`).join('')}</div>` : ''}
        <div class="goal-actions"><button type="button" class="btn" data-goal-add="${esc(g.id)}">Abonar</button><button type="button" class="btn ghost" data-goal-take="${esc(g.id)}">Retirar</button>${g.canEdit ? `<button type="button" class="btn ghost" data-goal-edit="${esc(g.id)}">Editar</button>` : ''}</div>
      </section>`;
    };
    const ideas = cap && cap.gasto ? [['🛟', 'Fondo de emergencia', I.nice(cap.gasto * 3), '3 meses de tus gastos'], ['✈️', 'Vacaciones', 0, ''], ['🎁', 'Regalos de diciembre', 0, '']] : [['🛟', 'Fondo de emergencia', 0, ''], ['✈️', 'Vacaciones', 0, '']];
    el.innerHTML = `
      <div class="mod-head"><h1>Metas de ahorro</h1><button type="button" class="btn" data-goal-new="1">+ Nueva meta</button></div>
      ${capHtml}
      ${goals.length ? `<div class="mod-grid">${goals.map(card).join('')}</div>` : `<section class="panel">${empty('Aún no tienes metas', 'Ponle nombre, monto y fecha a lo que quieres lograr; te decimos cuánto ahorrar cada mes y si vas a tiempo.')}
        <div class="chips-row">${ideas.map(i => `<button type="button" class="chip-btn" data-goal-idea="${esc(JSON.stringify(i))}">${i[0]} ${esc(i[1])}${i[2] ? `<small>${fmt(i[2])}</small>` : ''}</button>`).join('')}</div></section>`}`;
  }

  let goalIcon = '🎯';
  function openGoal(id, idea) {
    const g = id ? state.goals.find(x => x.id === id) : null;
    goalIcon = g ? g.icono : (idea ? idea[0] : '🎯');
    $('gmTitle').textContent = g ? 'Editar meta' : 'Nueva meta de ahorro';
    $('goalBody').dataset.mode = 'goal'; $('goalBody').dataset.id = g ? g.id : '';
    $('goalBody').innerHTML = `
      <div class="field"><label for="goalName">Nombre</label><input id="goalName" maxlength="40" value="${esc(g ? g.nombre : idea ? idea[1] : '')}" placeholder="Ej. Viaje a San Andrés" autocomplete="off"></div>
      <div class="field"><label>Ícono</label><div class="icon-grid goal-icons">${GOAL_ICONS.map(i => `<button type="button" data-gicon="${i}" aria-pressed="${i === goalIcon}">${i}</button>`).join('')}</div></div>
      ${moneyField('goalAmt', g ? g.monto : idea && idea[2] ? idea[2] : 0, '¿Cuánto quieres ahorrar?')}
      <div class="field"><label for="goalDate">¿Para cuándo? (opcional)</label><input type="date" id="goalDate" value="${esc(g ? g.fecha : '')}"></div>
      <label class="check"><input type="checkbox" id="goalShared" ${!g || g.compartida ? 'checked' : ''}> Compartirla con las personas de este espacio (pueden ver el avance y abonar)</label>
      <button type="button" class="btn" id="goalSave" style="margin-top:14px">${g ? 'Guardar cambios' : 'Crear meta'}</button>
      ${g && g.canDelete ? `<div class="danger-zone"><p>Se borran también sus abonos.</p>${U.delButton('data-goal-del', g.id)}</div>` : ''}`;
    U.openModal('goalModal');
  }
  function openContribution(goalId, sign) {
    const g = state.goals.find(x => x.id === goalId); if (!g) return;
    $('gmTitle').textContent = (sign > 0 ? 'Abonar a ' : 'Retirar de ') + g.nombre;
    $('goalBody').dataset.mode = 'contrib'; $('goalBody').dataset.id = goalId; $('goalBody').dataset.sign = sign;
    $('goalBody').innerHTML = `${moneyField('contribAmt', 0, sign > 0 ? '¿Cuánto abonas?' : '¿Cuánto retiras?')}
      <div class="field"><label for="contribNote">Nota (opcional)</label><input id="contribNote" maxlength="100" placeholder="${sign > 0 ? 'Ej. Prima de diciembre' : 'Ej. Pago del tiquete'}" autocomplete="off"></div>
      <p class="note">Registra aquí lo que separas para la meta. Si lo mueves entre tus carteras, regístralo también como movimiento.</p>
      <button type="button" class="btn" id="contribSave">${sign > 0 ? 'Abonar' : 'Retirar'}</button>`;
    U.openModal('goalModal');
  }
  async function saveGoalModal() {
    const b = $('goalBody'), btn = b.querySelector('.btn'); btn.disabled = true;
    try {
      if (b.dataset.mode === 'contrib') {
        const m = U.parseAmount($('contribAmt').value) * Number(b.dataset.sign);
        await U.call('addContribution', b.dataset.id, m, $('contribNote').value);
        U.closeModals(); U.toast(m > 0 ? 'Abono registrado' : 'Retiro registrado');
      } else {
        await U.call('saveGoal', { id: b.dataset.id || null, nombre: $('goalName').value, icono: goalIcon, monto: U.parseAmount($('goalAmt').value), fecha: $('goalDate').value, compartida: $('goalShared').checked });
        U.closeModals(); U.toast(b.dataset.id ? 'Meta actualizada' : 'Meta creada');
      }
      await U.load(true);
    } catch (e) { U.toast(e.message, true); btn.disabled = false; }
  }

  /* =========================================================
     ALERTAS Y NOTIFICACIONES
     ========================================================= */
  function currentAlerts() {
    if (!state.transactions.length && !state.goals.length) return [];
    return I.alerts({ txs: state.transactions, budgets: state.budgets, goals: state.goals, contributions: state.contributions, rules: state.recurring, today: today(), money, dismissed });
  }
  function renderBell() {
    const b = $('bellBadge'); if (!b) return;
    if (!state.me) { b.hidden = true; return; }
    if (!dismissed.size && state.me) loadDismissed();
    const n = currentAlerts().filter(a => a.level !== 'info').length;
    b.hidden = !n; b.textContent = n > 9 ? '9+' : n;
  }
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  async function pushState() {
    if (!pushSupported()) return { ok: false, why: isIOS() && !standalone() ? 'ios' : 'unsupported' };
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && await reg.pushManager.getSubscription();
      return { ok: true, on: !!sub && Notification.permission === 'granted', denied: Notification.permission === 'denied' };
    } catch (e) { return { ok: true, on: false }; }
  }
  const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const fromB64u = s => { const p = '='.repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };
  async function enablePush() {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('No diste permiso para notificaciones. Puedes activarlo en los ajustes del teléfono.');
    const key = await NF.api.pushPublicKey();
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(key) });
    await NF.api.savePushSubscription(sub);
  }
  async function disablePush() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) { await NF.api.deletePushSubscription(sub.endpoint); await sub.unsubscribe(); }
  }

  async function openAlerts() {
    loadDismissed();
    const list = currentAlerts();
    const ps = await pushState();
    const prefs = state.prefs || {};
    const pushHtml = !ps.ok
      ? `<p class="note">${ps.why === 'ios' ? 'En iPhone, primero instala la app (Safari > Compartir > Agregar a inicio), ábrela desde el ícono y vuelve aquí. Requiere iOS 16.4 o superior.' : 'Este navegador no permite notificaciones. Prueba con Chrome o con la app instalada.'}</p>`
      : `<div class="push-row"><div><strong>${ps.on ? 'Activadas en este teléfono' : 'Desactivadas en este teléfono'}</strong><small>${ps.denied ? 'Bloqueaste los avisos; actívalos en los ajustes del navegador o del teléfono.' : 'Recibe avisos aunque la app esté cerrada.'}</small></div>
          <button type="button" class="btn ${ps.on ? 'ghost' : ''}" id="pushToggle" ${ps.denied ? 'disabled' : ''}>${ps.on ? 'Desactivar' : 'Activar'}</button></div>
        <div class="prefs">${[['presupuestos', 'Cuando llegues al 80% o te pases de un presupuesto'], ['movimientos', 'Cuando alguien registre un movimiento en una cartera compartida contigo'], ['recordatorios', 'Un día antes de un pago programado'], ['resumen', 'Resumen semanal los lunes y del mes el día 1']]
          .map(p => `<label class="check"><input type="checkbox" data-pref="${p[0]}" ${prefs[p[0]] !== false ? 'checked' : ''}> ${p[1]}</label>`).join('')}</div>
        ${ps.on ? '<button type="button" class="link-btn" id="pushTest">Enviar notificación de prueba</button>' : ''}`;
    const superHtml = state.isSuper ? `<details class="setup"><summary>Configurar el servidor de notificaciones (solo administrador)</summary>
        <p class="note">Se hace una sola vez. Genera aquí las claves y pégalas en Supabase como indica la guía de actualización (paso de notificaciones). Las claves se crean en este teléfono y no se guardan en ninguna parte.</p>
        <button type="button" class="btn ghost" id="genKeys">Generar claves</button><div id="keysOut"></div></details>` : '';
    $('alertBody').innerHTML = `
      ${list.length ? list.map(a => `<div class="alert-item al-${a.level}">
          <span class="al-dot" aria-hidden="true"></span>
          <div class="bud-main"><strong>${esc(a.title)}</strong><small>${esc(a.body)}</small>
            <span class="row-actions"><button type="button" class="link-btn" data-al-go="${a.view}">Ver</button><button type="button" class="link-btn muted" data-al-hide="${esc(a.key)}">Ocultar</button></span></div>
        </div>`).join('') : empty('Todo en orden', 'No hay alertas por ahora. Aquí verás avisos de presupuestos, cobros dobles, suscripciones que suben y metas atrasadas.')}
      <h3>Notificaciones en el teléfono</h3>${pushHtml}${superHtml}`;
    U.openModal('alertModal');
  }
  async function genKeys() {
    if (!window.crypto || !crypto.subtle) throw new Error('Abre la app desde su dirección segura (https) para generar las claves.');
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
    const priv = (await crypto.subtle.exportKey('jwk', kp.privateKey)).d;
    const secret = b64u(crypto.getRandomValues(new Uint8Array(24)));
    const row = (name, value) => `<div class="field"><label>${name}</label><div class="inline"><input class="inline-input" readonly value="${esc(value)}"><button type="button" class="btn ghost" data-copy="${esc(value)}">Copiar</button></div></div>`;
    $('keysOut').innerHTML = row('VAPID_PUBLIC_KEY', pub) + row('VAPID_PRIVATE_KEY', priv) + row('VAPID_SUBJECT', 'mailto:' + state.me) + row('CRON_SECRET', secret) +
      '<p class="note">Guárdalas ahora: al cerrar esta ventana no se vuelven a mostrar. Si las pierdes, genera unas nuevas y vuelve a activar las notificaciones en cada teléfono.</p>';
  }

  /* =========================================================
     EVENTOS
     ========================================================= */
  function onMonth(btn) {
    const [id, d] = btn.dataset.month.split(':');
    if (id === 'bud') budMonth = I.addMonths(budMonth, Number(d)); else anaMonth = I.addMonths(anaMonth, Number(d));
    if (budMonth > thisMonth()) budMonth = thisMonth();
    if (anaMonth > thisMonth()) anaMonth = thisMonth();
    render(id);
  }
  $('viewBud').addEventListener('click', e => {
    const m = e.target.closest('[data-month]'); if (m) return onMonth(m);
    const b = e.target.closest('[data-bud]'); if (b) return openBudget(b.dataset.bud);
    if (e.target.closest('[data-bud-new]')) return openBudget(null);
    const s = e.target.closest('[data-sug]');
    if (s) return act(() => U.call('saveBudget', { categoria: s.dataset.sug || null, monto: Number(s.dataset.amt) }), 'Presupuesto creado: ' + (s.dataset.sug || 'Total del mes'));
  });
  $('budModal').addEventListener('click', e => {
    if (e.target.closest('#budSave')) return saveBudgetFromModal();
    const f = e.target.closest('[data-fill]');
    if (f) { const inp = $('budAmt'); inp.value = String(f.dataset.fill); U.formatAmountInput(inp); return; }
    if (e.target.closest('#budSeeTx')) {
      const b = state.budgets.find(x => x.id === $('budBody').dataset.id);
      U.closeModals(); U.setView('mov');
      if (b && b.categoria && $('search')) { $('search').value = b.categoria; $('search').dispatchEvent(new Event('input')); }
      return;
    }
    const d = e.target.closest('[data-bud-del]');
    if (d) U.armOrRun(d, async () => { await U.call('deleteBudget', d.dataset.budDel); U.closeModals(); U.toast('Presupuesto eliminado'); await U.load(true); });
  });
  $('viewAna').addEventListener('click', e => {
    const m = e.target.closest('[data-month]'); if (m) return onMonth(m);
    const dm = e.target.closest('[data-dismiss]'); if (dm) { dismiss(dm.dataset.dismiss); renderAna(); renderBell(); return; }
    const pg = e.target.closest('[data-prog]');
    if (pg) {
      const s = I.detectRecurring(state.transactions, today(), state.recurring).find(x => x.key === pg.dataset.prog);
      if (s) openRecurring(null, { tipo: 'Gasto', categoria: s.categoria, cartera: s.carteras[s.carteras.length - 1], monto: s.monto, descripcion: s.nombre, frecuencia: s.frecuencia, proxima: s.proxima < today() ? I.nextDate(s.proxima, s.frecuencia) : s.proxima });
      return;
    }
    if (e.target.closest('[data-rec-new]')) return openRecurring(null);
    const re = e.target.closest('[data-rec-edit]'); if (re) return openRecurring(re.dataset.recEdit);
    const rt = e.target.closest('[data-rec-toggle]');
    if (rt) { const r = state.recurring.find(x => x.id === rt.dataset.recToggle); return act(() => U.call('setRecurringActive', r.id, !r.activa), r.activa ? 'Pago en pausa' : 'Pago reanudado'); }
  });
  $('recModal').addEventListener('click', e => {
    if (e.target.closest('#recSave')) return saveRecurringFromModal();
    const t = e.target.closest('[data-t]');
    if (t) {
      $('recBody').dataset.tipo = t.dataset.t;
      $('recType').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === t)));
      $('recCat').innerHTML = state.categoryList.filter(c => c.tipo === t.dataset.t).map(c => `<option value="${esc(c.nombre)}">${c.icono} ${esc(c.nombre)}</option>`).join('');
      return;
    }
    const d = e.target.closest('[data-rec-del]');
    if (d) U.armOrRun(d, async () => { await U.call('deleteRecurring', d.dataset.recDel); U.closeModals(); U.toast('Pago programado eliminado'); await U.load(true); });
  });
  $('viewGoal').addEventListener('click', e => {
    if (e.target.closest('[data-goal-new]')) return openGoal(null);
    const idea = e.target.closest('[data-goal-idea]'); if (idea) return openGoal(null, JSON.parse(idea.dataset.goalIdea));
    const a = e.target.closest('[data-goal-add]'); if (a) return openContribution(a.dataset.goalAdd, 1);
    const tk = e.target.closest('[data-goal-take]'); if (tk) return openContribution(tk.dataset.goalTake, -1);
    const ed = e.target.closest('[data-goal-edit]'); if (ed) return openGoal(ed.dataset.goalEdit);
    const cd = e.target.closest('[data-contrib-del]'); if (cd) return act(() => U.call('deleteContribution', cd.dataset.contribDel), 'Abono eliminado');
  });
  $('goalModal').addEventListener('click', e => {
    if (e.target.closest('#goalSave') || e.target.closest('#contribSave')) return saveGoalModal();
    const gi = e.target.closest('[data-gicon]');
    if (gi) { goalIcon = gi.dataset.gicon; $('goalBody').querySelectorAll('[data-gicon]').forEach(b => b.setAttribute('aria-pressed', String(b === gi))); return; }
    const d = e.target.closest('[data-goal-del]');
    if (d) U.armOrRun(d, async () => { await U.call('deleteGoal', d.dataset.goalDel); U.closeModals(); U.toast('Meta eliminada'); await U.load(true); });
  });
  ['budModal', 'recModal', 'goalModal'].forEach(id => $(id).addEventListener('input', e => { if (e.target.classList.contains('amount-input')) U.formatAmountInput(e.target); }));
  $('bellBtn').addEventListener('click', openAlerts);
  $('alertModal').addEventListener('click', async e => {
    const go = e.target.closest('[data-al-go]'); if (go) { U.closeModals(); U.setView(go.dataset.alGo); return; }
    const hd = e.target.closest('[data-al-hide]'); if (hd) { dismiss(hd.dataset.alHide); renderBell(); openAlerts(); return; }
    if (e.target.closest('#pushToggle')) {
      const btn = $('pushToggle'); btn.disabled = true;
      try { const st = await pushState(); if (st.on) { await disablePush(); U.toast('Notificaciones desactivadas en este teléfono'); } else { await enablePush(); U.toast('Notificaciones activadas'); } }
      catch (err) { U.toast(err.message, true); }
      openAlerts(); return;
    }
    if (e.target.closest('#pushTest')) { try { const r = await NF.api.testPush(); U.toast(r.sent ? 'Prueba enviada: debería llegarte en unos segundos' : 'No hay teléfonos activados para recibirla', !r.sent); } catch (err) { U.toast(err.message, true); } return; }
    if (e.target.closest('#genKeys')) { genKeys().catch(err => U.toast(err.message, true)); return; }
    const cp = e.target.closest('[data-copy]');
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); U.toast('Copiado'); } catch (err) { U.toast('Selecciona el texto y cópialo', true); } }
  });
  $('alertModal').addEventListener('change', async e => {
    const p = e.target.closest('[data-pref]'); if (!p) return;
    const prefs = Object.assign({ presupuestos: true, movimientos: true, recordatorios: true, resumen: true }, state.prefs);
    prefs[p.dataset.pref] = p.checked;
    try { await U.call('savePrefs', prefs); state.prefs = prefs; U.toast('Preferencia guardada'); } catch (err) { U.toast(err.message, true); p.checked = !p.checked; }
  });

  function render(view) {
    if (state.loading && !state.transactions.length) return;
    if (view === 'bud') renderBud();
    else if (view === 'ana') renderAna();
    else if (view === 'goal') renderGoal();
  }
  window.NFModules = { render, renderBell, openAlerts, openBudget };
  if (state.view && state.view !== 'mov' && state.view !== 'rep') render(state.view);
})();
