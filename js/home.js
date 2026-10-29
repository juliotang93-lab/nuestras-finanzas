/* Nuestras Finanzas · Inicio: flujo de caja, anillos de presupuesto, botón +, calendario y deslizar movimientos */
(function () {
  'use strict';
  const U = window.NFUI, I = window.NFInsights;
  if (!U) return;
  const { state, $, money } = U;
  const esc = U.escapeHtml;
  const LOC = U.LOCALE || 'es-CO';
  const fmt = n => money.format(Math.round(n || 0));
  const compact = n => {
    const a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + 'M';
    if (a >= 1e3) return Math.round(n / 1e3) + 'k';
    return String(Math.round(n));
  };
  const iso = U.iso, parseISO = U.parseISO;
  const today = () => iso(new Date());

  /* =========================================================
     FLUJO DE CAJA
     ========================================================= */
  let gran = U.store.get('nf-flujo') || 'month';
  if (!['week', 'month', 'year', 'all'].includes(gran)) gran = 'month';
  let windowEnd = null; // inicio del último período visible en la gráfica
  // Al abrir, el rango de Inicio sigue la agrupación que se usó la última vez
  if (gran === 'all') U.setRange('', '', 'all');
  else if (gran !== 'month' && state.preset === 'month') {
    const s0 = gran === 'week' ? (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d; })() : new Date(new Date().getFullYear(), 0, 1);
    const e0 = new Date(s0); if (gran === 'week') e0.setDate(e0.getDate() + 6); else e0.setFullYear(e0.getFullYear() + 1, 0, 0);
    U.setRange(iso(s0), iso(e0), 'custom');
  }

  function startOf(g, d) {
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (g === 'week') { const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); }
    else if (g === 'month') d.setDate(1);
    else { d.setMonth(0); d.setDate(1); }
    return d;
  }
  function add(g, d, n) {
    d = new Date(d);
    if (g === 'week') d.setDate(d.getDate() + 7 * n);
    else if (g === 'month') d.setMonth(d.getMonth() + n);
    else d.setFullYear(d.getFullYear() + n);
    return d;
  }
  const endOf = (g, s) => { const e = add(g, s, 1); e.setDate(e.getDate() - 1); return e; };
  const short = (d, withYear) => d.toLocaleDateString(LOC, withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' }).replace('.', '');
  function bucketLabel(g, s) {
    if (g === 'week') return [short(s), short(endOf(g, s))];
    if (g === 'month') { const m = s.toLocaleDateString(LOC, { month: 'short' }).replace('.', ''); return s.getFullYear() === new Date().getFullYear() ? m : [m, String(s.getFullYear())]; }
    return String(s.getFullYear());
  }
  function rangeText(g, s) {
    if (g === 'week') return short(s) + ' – ' + short(endOf(g, s));
    if (g === 'month') { const t = s.toLocaleDateString(LOC, { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); }
    return 'Año ' + s.getFullYear();
  }
  // ¿El rango actual coincide con un período exacto de la agrupación elegida?
  function selectedStart() {
    if (gran === 'all' || !state.from || !state.to) return null;
    const s = startOf(gran, parseISO(state.from));
    return iso(s) === state.from && iso(endOf(gran, s)) === state.to ? s : null;
  }
  function buckets() {
    const g = gran === 'all' ? 'year' : gran;
    if (gran === 'all') {
      const years = state.transactions.map(t => Number(t.fecha.slice(0, 4)));
      const last = new Date().getFullYear(), first = Math.max(Math.min(...(years.length ? years : [last])), last - 5);
      const out = []; for (let y = first; y <= last; y++) out.push(new Date(y, 0, 1));
      return { g, list: out };
    }
    const n = gran === 'year' ? 5 : 6;
    const sel = selectedStart();
    let end = windowEnd || startOf(g, new Date());
    // Si el período elegido quedó fuera de la ventana, se mueve la ventana
    if (sel && (sel > end || sel < add(g, end, -(n - 1)))) end = sel > end ? sel : add(g, sel, n - 1);
    windowEnd = end;
    const list = []; for (let i = n - 1; i >= 0; i--) list.push(add(g, end, -i));
    return { g, list };
  }
  function selectBucket(s) {
    const g = gran === 'all' ? 'year' : gran;
    U.setRange(iso(s), iso(endOf(g, s)), 'custom');
    if (gran === 'all') { gran = 'year'; U.store.set('nf-flujo', gran); }
    U.render();
  }
  function setGran(g) {
    gran = g; U.store.set('nf-flujo', g); windowEnd = null;
    if (g === 'all') { U.setRange('', '', 'all'); U.render(); return; }
    // Se elige el período que contiene hoy si hoy está en el rango actual; si no, el del inicio del rango
    const t = today(), inRange = (!state.from || t >= state.from) && (!state.to || t <= state.to);
    const base = inRange || !state.from ? new Date() : parseISO(state.from);
    const s = startOf(g, base > new Date() ? new Date() : base);
    selectBucket(s);
  }

  let kind = U.store.get('nf-grafica') === 'line' ? 'line' : 'bar';
  const rangeLabelOf = (g, sel) => gran === 'all' || (!state.from && !state.to) ? 'Todos los movimientos'
    : sel ? rangeText(g, sel) : U.fmtDate(state.from, { day: 'numeric', month: 'short' }) + ' – ' + U.fmtDate(state.to, { day: 'numeric', month: 'short', year: 'numeric' });

  /* Saldo día a día (o mes a mes en rangos largos) de las carteras elegidas */
  function balanceSeries() {
    const t = today();
    const dates = state.transactions.filter(U.inWallet).map(x => x.fecha).sort();
    let from = state.from || (dates[0] || t), to = state.to && state.to < t ? state.to : t;
    if (to < from) to = from;
    const monthly = (parseISO(to) - parseISO(from)) / 864e5 > 120;
    const wallets = state.wallet === 'Todas' ? state.wallets : state.wallets.filter(w => w.nombre === state.wallet);
    let base = wallets.reduce((a, w) => a + (w.saldoInicial || 0), 0);
    const txs = state.transactions.filter(U.inWallet).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
    const points = [];
    const d = parseISO(from), end = parseISO(to);
    if (monthly) d.setDate(1);
    while (d <= end && points.length < 400) {
      let k;
      if (monthly) { const e = new Date(d.getFullYear(), d.getMonth() + 1, 0); k = iso(e > end ? end : e); }
      else k = iso(d);
      points.push(k);
      monthly ? d.setMonth(d.getMonth() + 1) : d.setDate(d.getDate() + 1);
    }
    let i = 0, run = base;
    const startBal = (() => { let b = base; txs.forEach(x => { if (x.fecha < from) b += x.tipo === 'Ingreso' ? x.monto : -x.monto; }); return b; })();
    const values = points.map(k => { while (i < txs.length && txs[i].fecha <= k) { run += txs[i].tipo === 'Ingreso' ? txs[i].monto : -txs[i].monto; i++; } return run; });
    const labels = points.map(k => monthly ? parseISO(k).toLocaleDateString(LOC, { month: 'short' }).replace('.', '') : short(parseISO(k)));
    return { labels, values, startBal, monthly };
  }

  function renderCash() {
    const rows = U.scoped();
    let sIn = 0, sOut = 0;
    rows.forEach(t => t.tipo === 'Ingreso' ? sIn += t.monto : sOut += t.monto);
    const { g, list } = buckets();
    const sel = selectedStart();
    const rangeLabel = rangeLabelOf(g, sel);
    $('cashIn').textContent = '+ ' + fmt(sIn);
    $('cashOut').textContent = '− ' + fmt(sOut);
    $('cashRange').textContent = rangeLabel;
    $('cashPrev').disabled = gran === 'all';
    $('cashNext').disabled = gran === 'all' || (sel && add(g, sel, 1) > new Date());
    $('cashKind').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
    const walletName = state.wallet === 'Todas' ? '' : state.wallet === U.NONE ? ' · Sin asignar' : ' · ' + state.wallet;
    const muted = U.cssVar('--muted'), line = U.cssVar('--line');

    if (kind === 'line') {
      const ser = balanceSeries();
      const endBal = ser.values.length ? ser.values[ser.values.length - 1] : ser.startBal;
      const diff = endBal - ser.startBal;
      $('cashNet').textContent = (endBal < 0 ? '−' : '') + fmt(Math.abs(endBal));
      $('cashNet').className = 'cash-net num ' + (endBal < 0 ? 'neg' : 'pos');
      $('cashTitle').innerHTML = `Saldo${esc(walletName)} · ${esc(rangeLabel)} · <span class="${diff < 0 ? 'over-text' : 'ok-text'}">${diff < 0 ? '▼' : '▲'} ${fmt(Math.abs(diff))}</span>`;
      if (typeof Chart === 'undefined') return;
      const c = endBal < 0 ? U.cssVar('--expense') : U.cssVar('--accent');
      U.buildChart('cash', 'cashChart', {
        type: 'line',
        data: { labels: ser.labels, datasets: [{ label: 'Saldo', data: ser.values, borderColor: c, backgroundColor: c + '22', fill: true, tension: .3, borderWidth: 2.5,
          pointRadius: ser.values.map((_, i) => i === ser.values.length - 1 ? 4 : 0), pointBackgroundColor: U.cssVar('--surface'), pointBorderWidth: 2.5, pointBorderColor: c }] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: { duration: 250 }, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: x => 'Saldo: ' + fmt(x.parsed.y) } } },
          scales: {
            x: { grid: { display: false }, border: { display: false }, ticks: { color: muted, font: { size: 10.5 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
            y: { grid: { color: line }, border: { display: false }, ticks: { color: muted, font: { size: 10 }, maxTicksLimit: 4, callback: v => compact(v) } }
          }
        }
      });
      return;
    }

    const net = sIn - sOut;
    $('cashNet').textContent = (net < 0 ? '−' : '') + fmt(Math.abs(net));
    $('cashNet').className = 'cash-net num ' + (net < 0 ? 'neg' : 'pos');
    $('cashTitle').textContent = 'Flujo de caja' + walletName + ' · ' + rangeLabel;
    // Totales por período (respeta la cartera elegida)
    const inc = list.map(() => 0), exp = list.map(() => 0);
    const keys = list.map(s => [iso(s), iso(endOf(g, s))]);
    state.transactions.forEach(t => {
      if (!U.inWallet(t)) return;
      const i = keys.findIndex(k => t.fecha >= k[0] && t.fecha <= k[1]);
      if (i < 0) return;
      if (t.tipo === 'Ingreso') inc[i] += t.monto; else exp[i] += t.monto;
    });
    const isSel = i => gran === 'all' || (sel && iso(list[i]) === iso(sel));
    const cIn = U.cssVar('--income'), cOut = U.cssVar('--expense');
    const fade = (c, i) => isSel(i) ? c : c + '55';
    if (typeof Chart === 'undefined') return;
    U.buildChart('cash', 'cashChart', {
      type: 'bar',
      data: {
        labels: list.map(s => bucketLabel(g, s)),
        datasets: [
          { label: 'Ingresos', data: inc, backgroundColor: inc.map((_, i) => fade(cIn, i)), borderRadius: 4, maxBarThickness: 16, categoryPercentage: .62, barPercentage: .92 },
          { label: 'Gastos', data: exp, backgroundColor: exp.map((_, i) => fade(cOut, i)), borderRadius: 4, maxBarThickness: 16, categoryPercentage: .62, barPercentage: .92 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmt(c.parsed.y) } } },
        scales: {
          x: { grid: { display: false }, border: { display: false },
            ticks: { color: c => isSel(c.index) ? U.cssVar('--ink') : muted, font: c => ({ size: 10.5, weight: isSel(c.index) ? '800' : '500' }), maxRotation: 0, autoSkip: false } },
          y: { beginAtZero: true, grid: { color: line }, border: { display: false }, ticks: { color: muted, font: { size: 10 }, maxTicksLimit: 3, callback: v => compact(v) } }
        },
        onClick: (evt, els, chart) => {
          const hit = chart.getElementsAtEventForMode(evt, 'index', { intersect: false }, false);
          if (hit.length) { const s = list[hit[0].index]; setTimeout(() => selectBucket(s), 0); } // fuera del evento de la gráfica
        },
        onHover: (evt, els) => { if (evt.native && evt.native.target) evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; }
      }
    });
  }

  $('cashKind').addEventListener('click', e => {
    const b = e.target.closest('[data-kind]'); if (!b || b.dataset.kind === kind) return;
    kind = b.dataset.kind; U.store.set('nf-grafica', kind); renderCash();
  });
  function step(n) {
    const g = gran === 'all' ? 'year' : gran;
    const sel = selectedStart() || startOf(g, state.from ? parseISO(state.from) : new Date());
    const next = add(g, sel, n);
    if (next > new Date()) return;
    selectBucket(next);
  }
  $('cashPrev').addEventListener('click', () => step(-1));
  $('cashNext').addEventListener('click', () => step(1));
  $('cashRange').addEventListener('click', () => openFilter(true));

  /* =========================================================
     FILTRO (arriba): período y carteras
     ========================================================= */
  const pop = $('filterPop');
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  let showCustom = false;
  function renderFilter() {
    const { bal, none, hasNone } = U.walletBalances();
    const total = Object.values(bal).reduce((a, b) => a + b, 0) + none;
    const g = [['week', 'Semana', '📆'], ['month', 'Mes', '🗓️'], ['year', 'Año', '📅'], ['all', 'Todo', '♾️']];
    const isCustom = gran !== 'all' && state.from && !selectedStart();
    const row = (attr, val, label, sub, on, icon) => `<button type="button" class="fp-row" ${attr}="${esc(val)}" aria-pressed="${on}">
        <span class="fp-check">${on ? CHECK : ''}</span>${icon ? `<span class="fp-ic">${icon}</span>` : ''}
        <span class="fp-txt"><span>${esc(label)}</span>${sub ? `<small class="num ${sub.neg ? 'over-text' : ''}">${esc(sub.t)}</small>` : ''}</span></button>`;
    pop.innerHTML = `
      <p class="fp-sec">Período</p>
      ${g.map(x => row('data-fp-gran', x[0], x[1], null, !isCustom && gran === x[0], x[2])).join('')}
      ${row('data-fp-custom', '1', 'Fechas personalizadas', isCustom ? { t: U.fmtDate(state.from, { day: 'numeric', month: 'short' }) + ' – ' + U.fmtDate(state.to || today(), { day: 'numeric', month: 'short' }) } : null, isCustom, '✏️')}
      <div class="fp-custom" ${showCustom ? '' : 'hidden'}>
        <label>Desde<input type="date" id="fpFrom" value="${esc(state.from || '')}"></label>
        <label>Hasta<input type="date" id="fpTo" value="${esc(state.to || today())}"></label>
        <button type="button" class="btn" id="fpApply">Aplicar</button>
      </div>
      <p class="fp-sec">Carteras</p>
      ${row('data-fp-wallet', 'Todas', 'Todas', { t: fmt(total), neg: total < 0 }, state.wallet === 'Todas', '🧾')}
      ${state.wallets.map(w => row('data-fp-wallet', w.nombre, w.nombre, { t: fmt(bal[w.nombre] || 0), neg: (bal[w.nombre] || 0) < 0 }, state.wallet === w.nombre, U.walletIcon(w))).join('')}
      ${hasNone ? row('data-fp-wallet', U.NONE, 'Sin asignar', { t: fmt(none), neg: none < 0 }, state.wallet === U.NONE, '❔') : ''}`;
  }
  function placeFilter() {
    const r = $('filterBtn').getBoundingClientRect(), w = pop.offsetWidth || 320;
    pop.style.top = Math.round(r.bottom + 8) + 'px';
    pop.style.left = Math.round(Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8)) + 'px';
  }
  function openFilter(custom) {
    showCustom = !!custom;
    renderFilter();
    pop.hidden = false; placeFilter(); $('filterBtn').setAttribute('aria-expanded', 'true');
    if (custom) setTimeout(() => { const f = $('fpFrom'); if (f && !U.isTouch()) f.focus(); }, 30);
  }
  function closeFilter() { pop.hidden = true; $('filterBtn').setAttribute('aria-expanded', 'false'); }
  $('filterBtn').addEventListener('click', e => { e.stopPropagation(); pop.hidden ? openFilter(false) : closeFilter(); });
  document.addEventListener('click', e => { if (!pop.hidden && e.target.isConnected && !pop.contains(e.target) && !e.target.closest('#filterBtn') && !e.target.closest('#cashRange')) closeFilter(); });
  window.addEventListener('resize', () => { if (!pop.hidden) placeFilter(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) closeFilter(); });
  pop.addEventListener('click', e => {
    const gb = e.target.closest('[data-fp-gran]'); if (gb) { closeFilter(); setGran(gb.dataset.fpGran); return; }
    if (e.target.closest('[data-fp-custom]')) { showCustom = !showCustom; renderFilter(); return; }
    if (e.target.closest('#fpApply')) {
      let f = $('fpFrom').value, t = $('fpTo').value;
      if (!f || !t) { U.toast('Elige las dos fechas.', true); return; }
      if (f > t) [f, t] = [t, f];
      if (gran === 'all') { gran = 'month'; U.store.set('nf-flujo', gran); }
      windowEnd = null; U.setRange(f, t, 'custom'); closeFilter(); U.render(); return;
    }
    const wb = e.target.closest('[data-fp-wallet]');
    if (wb) {
      state.wallet = wb.dataset.fpWallet; state.limit = U.PAGE;
      if (U.walletOf(state.wallet)) U.store.set('finanzas-cartera', state.wallet);
      closeFilter(); U.render();
    }
  });

  /* =========================================================
     ANILLOS DE PRESUPUESTO (los tuyos y los del hogar)
     ========================================================= */
  function renderRings() {
    const mk = today().slice(0, 7);
    const mine = state.budgets.filter(b => b.mine), others = state.budgets.filter(b => !b.mine);
    const stat = list => I ? I.budgetStatus(list, state.transactions, mk, today()) : [];
    const order = list => list.sort((a, b) => (!a.categoria ? 0 : 1) - (!b.categoria ? 0 : 1) || b.pct - a.pct);
    const st = order(stat(mine)).map(b => Object.assign(b, { who: '' }))
      .concat(...[...new Set(others.map(b => b.email))].map(em => order(stat(others.filter(b => b.email === em))).map(b => Object.assign(b, { who: em.split('@')[0] }))));
    const color = l => l === 'over' ? U.cssVar('--expense') : l === 'warn' ? '#E0A030' : U.cssVar('--income');
    const ring = (pct, l) => {
      const C = 2 * Math.PI * 25, p = Math.min(100, Math.max(0, pct));
      return `<svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="25" class="ring-bg"/><circle cx="30" cy="30" r="25" class="ring-fg" stroke="${color(l)}" stroke-dasharray="${(C * p / 100).toFixed(1)} ${C.toFixed(1)}"/></svg>`;
    };
    const items = st.map(b => {
      const name = b.categoria || 'Total del mes', icon = b.categoria ? U.iconFor('Gasto', b.categoria) : '🧾';
      return `<button type="button" class="ring" data-ring="1" title="${esc(name)}${b.who ? ' (de ' + esc(b.who) + ')' : ''}: ${fmt(b.spent)} de ${fmt(b.monto)}">
        <span class="ring-circle">${ring(b.pct, b.level)}<span class="ring-ic">${icon}</span>${b.who ? `<span class="ring-who">${esc(b.who.charAt(0).toUpperCase())}</span>` : ''}</span>
        <span class="ring-name">${esc(name)}</span><span class="ring-pct num ${b.level}-text">${Math.round(b.pct)}%</span></button>`;
    }).join('');
    $('budRings').innerHTML = items + `<button type="button" class="ring add" data-ring-add="1">
        <span class="ring-circle"><span class="ring-plus">+</span></span><span class="ring-name">${mine.length ? 'Presupuesto' : 'Crear presupuesto'}</span><span class="ring-pct">&nbsp;</span></button>`;
  }
  $('budRings').addEventListener('click', e => {
    if (e.target.closest('[data-ring-add]')) { if (window.NFModules && NFModules.openBudget) NFModules.openBudget(null); return; }
    if (e.target.closest('[data-ring]')) U.setView('bud');
  });

  /* =========================================================
     LISTA: categoría, día elegido y calendario
     ========================================================= */
  function fillCatFilter() {
    const sel = $('catFilter'), cur = state.catFilter;
    const cats = [...new Set(state.transactions.map(t => t.categoria))].sort((a, b) => a.localeCompare(b));
    if (cur && !cats.includes(cur)) cats.push(cur);
    const html = '<option value="">Todas las categorías</option>' + cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if (sel.dataset.sig !== html) { sel.innerHTML = html; sel.dataset.sig = html; }
    sel.value = cur;
    sel.classList.toggle('active', !!cur);
  }
  $('catFilter').addEventListener('change', e => { state.catFilter = e.target.value; state.limit = U.PAGE; fillCatFilter(); U.renderList(); });

  function renderDayChip() {
    const c = $('dayChip');
    c.hidden = !state.day;
    if (state.day) c.innerHTML = `📅 ${esc(U.fmtDate(state.day, { weekday: 'long', day: 'numeric', month: 'long' }))} <button type="button" class="link-btn" id="dayClear">Ver todo el período ✕</button>`;
  }
  $('dayChip').addEventListener('click', e => { if (e.target.closest('#dayClear')) { state.day = ''; renderDayChip(); U.renderList(); } });

  function setListMode(m) {
    state.listMode = m;
    $('listMode').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    document.querySelector('.list-panel').classList.toggle('cal-mode', m === 'cal');
    U.renderList();
  }
  $('listMode').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) setListMode(b.dataset.mode); });

  let calMonth = null;
  function renderCalendar() {
    const base = calMonth || (state.day || state.to || today()).slice(0, 7);
    calMonth = base;
    const [y, m] = base.split('-').map(Number);
    const first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    const exp = {}, inc = {};
    state.transactions.forEach(t => {
      if (!t.fecha.startsWith(base) || !U.inWallet(t) || (state.catFilter && t.categoria !== state.catFilter)) return;
      (t.tipo === 'Ingreso' ? inc : exp)[t.fecha] = ((t.tipo === 'Ingreso' ? inc : exp)[t.fecha] || 0) + t.monto;
    });
    const max = Math.max(1, ...Object.values(exp));
    const tExp = Object.values(exp).reduce((a, b) => a + b, 0), tInc = Object.values(inc).reduce((a, b) => a + b, 0);
    const title = first.toLocaleDateString(LOC, { month: 'long', year: 'numeric' });
    const now = today(), cur = now.slice(0, 7);
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span class="cal-cell empty"></span>';
    for (let d = 1; d <= days; d++) {
      const k = base + '-' + String(d).padStart(2, '0'), e = exp[k] || 0, n = inc[k] || 0;
      const lvl = e ? Math.max(.12, e / max * .55) : 0;
      cells += `<button type="button" class="cal-cell ${k === now ? 'today' : ''} ${k === state.day ? 'sel' : ''} ${k > now ? 'future' : ''}" data-day="${k}" style="--lvl:${(lvl * 100).toFixed(0)}%">
        <span class="cal-d">${d}</span>${e ? `<span class="cal-e num">${compact(e)}</span>` : ''}${n ? '<i class="cal-in" title="Ingreso"></i>' : ''}</button>`;
    }
    $('txList').innerHTML = `<div class="cal">
      <div class="cal-head"><button type="button" class="icon-btn" data-cal="-1" aria-label="Mes anterior"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg></button>
        <strong>${esc(title.charAt(0).toUpperCase() + title.slice(1))}</strong>
        <button type="button" class="icon-btn" data-cal="1" aria-label="Mes siguiente" ${base >= cur ? 'disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg></button></div>
      <div class="cal-sum"><span>Gastos <strong class="num over-text">${fmt(tExp)}</strong></span><span>Ingresos <strong class="num ok-text">${fmt(tInc)}</strong></span></div>
      <div class="cal-grid">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<span class="cal-wd">${x}</span>`).join('')}${cells}</div>
      <p class="note">Toca un día para ver sus movimientos. El color más intenso indica más gasto.</p></div>`;
  }
  $('txList').addEventListener('click', e => {
    const nav = e.target.closest('[data-cal]');
    if (nav) {
      const [y, m] = calMonth.split('-').map(Number), d = new Date(y, m - 1 + Number(nav.dataset.cal), 1);
      calMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); renderCalendar(); return;
    }
    const day = e.target.closest('[data-day]');
    if (day) { state.day = day.dataset.day; renderDayChip(); setListMode('list'); document.querySelector('.list-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });

  /* =========================================================
     DESLIZAR UN MOVIMIENTO: Editar / Eliminar
     ========================================================= */
  const OPEN = 150;
  let drag = null, justSwiped = 0;
  const rowOf = el => el && el.closest('.tx-swipe');
  function setX(sw, x, anim) {
    const tx = sw.querySelector('.tx');
    tx.style.transition = anim ? 'transform .22s ease' : 'none';
    tx.style.transform = x ? `translateX(${x}px)` : '';
    sw.classList.toggle('open', x < 0);
  }
  function closeAll(except) { document.querySelectorAll('.tx-swipe.open').forEach(sw => { if (sw !== except) { setX(sw, 0, true); resetDelBtn(sw); } }); }
  function resetDelBtn(sw) { const b = sw.querySelector('.tx-act.del'); if (b) { b.classList.remove('confirm'); b.querySelector('span').textContent = 'Eliminar'; } }
  const list = $('txList');
  list.addEventListener('touchstart', e => {
    const sw = rowOf(e.target); if (!sw || e.target.closest('.tx-acts')) { drag = null; return; }
    const t = e.touches[0];
    drag = { sw, x0: t.clientX, y0: t.clientY, base: sw.classList.contains('open') ? -OPEN : 0, x: 0, mode: '' };
  }, { passive: true });
  list.addEventListener('touchmove', e => {
    if (!drag) return;
    const t = e.touches[0], dx = t.clientX - drag.x0, dy = t.clientY - drag.y0;
    if (!drag.mode) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) { drag.mode = 'h'; closeAll(drag.sw); }
      else if (Math.abs(dy) > 8) { drag = null; return; }
      else return;
    }
    e.preventDefault();
    drag.x = Math.max(-OPEN - 30, Math.min(0, drag.base + dx));
    setX(drag.sw, drag.x, false);
  }, { passive: false });
  list.addEventListener('touchend', () => {
    if (!drag) return;
    if (drag.mode === 'h') {
      const open = drag.x < -OPEN / 2;
      setX(drag.sw, open ? -OPEN : 0, true);
      if (!open) resetDelBtn(drag.sw);
      justSwiped = Date.now();
    }
    drag = null;
  });
  // Mientras haya una fila abierta, tocar fuera solo la cierra (no abre el detalle)
  list.addEventListener('click', e => {
    if (Date.now() - justSwiped < 350 && !e.target.closest('.tx-acts')) { e.stopPropagation(); e.preventDefault(); return; }
    const acts = e.target.closest('.tx-acts');
    if (!acts && document.querySelector('.tx-swipe.open')) { closeAll(); e.stopPropagation(); e.preventDefault(); return; }
    const ed = e.target.closest('[data-sw-edit]');
    if (ed) {
      e.stopPropagation(); closeAll();
      const t = state.transactions.find(x => x.id === ed.dataset.swEdit);
      U.openTxDetail(ed.dataset.swEdit);
      if (t && !t.pendiente && state.detail && !state.detail.editing) $('tdEdit').click();
      return;
    }
    const del = e.target.closest('[data-sw-del]');
    if (del) {
      e.stopPropagation();
      if (!del.classList.contains('confirm')) {
        del.classList.add('confirm'); del.querySelector('span').textContent = '¿Seguro?';
        clearTimeout(del._t); del._t = setTimeout(() => resetDelBtn(rowOf(del)), 3000);
        return;
      }
      clearTimeout(del._t); del.disabled = true; del.querySelector('span').textContent = 'Eliminando…';
      U.deleteTx(del.dataset.swDel).catch(err => { U.toast(err.message, true); del.disabled = false; resetDelBtn(rowOf(del)); });
    }
  }, true);

  /* =========================================================
     BOTÓN + : el formulario como hoja inferior en el teléfono
     ========================================================= */
  function closeSheet() { document.documentElement.classList.remove('form-open'); }
  function openSheet() { U.openNewTx(); }
  $('fabAdd').addEventListener('click', () => U.openNewTx());

  /* ---------- Render ---------- */
  function render() {
    $('homeTop').hidden = false;
    if (state.loading && !state.transactions.length) return;
    renderRings();
    renderCash();
    fillCatFilter();
    renderDayChip();
  }
  window.NFHome = { render, renderCalendar, closeSheet, openSheet };
  if (state.view === 'mov') render();
})();
