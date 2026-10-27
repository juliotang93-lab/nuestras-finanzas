/* Nuestras Finanzas · Motor de análisis (sin IA externa)
   Todo se calcula en el teléfono con los movimientos que la persona puede ver:
   presupuestos, fugas, gastos hormiga, patrones, compras frecuentes, suscripciones y alertas. */
(function (root) {
  'use strict';

  /* ---------- Fechas ---------- */
  const pad = n => String(n).padStart(2, '0');
  const parse = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d || 1); };
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const monthKey = s => String(s).slice(0, 7);
  const daysInMonth = mk => { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  const addMonths = (mk, n) => { const [y, m] = mk.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  /* Siguiente fecha de un pago programado (igual que en la base de datos: el 31 pasa al último día del mes) */
  function nextDate(s, f) {
    if (f === 'semanal') return addDays(s, 7);
    if (f === 'quincenal') return addDays(s, 15);
    const d = parse(s), months = f === 'anual' ? 12 : 1;
    const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(d.getDate(), last));
    return iso(target);
  }
  const prevMonths = (mk, n) => Array.from({ length: n }, (_, i) => addMonths(mk, -(i + 1)));

  /* ---------- Utilidades ---------- */
  const sum = arr => arr.reduce((s, x) => s + x, 0);
  const median = arr => { if (!arr.length) return 0; const a = arr.slice().sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const percentile = (arr, p) => { if (!arr.length) return 0; const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
  /* Redondea a una cifra "bonita" para sugerir presupuestos */
  function nice(n) {
    if (n <= 0) return 0;
    const step = n >= 1000000 ? 50000 : n >= 200000 ? 10000 : n >= 20000 ? 5000 : n >= 2000 ? 1000 : n >= 100 ? 50 : 1;
    return Math.max(step, Math.round(n / step) * step);
  }
  const STOP = new Set(['de', 'la', 'el', 'los', 'las', 'en', 'y', 'a', 'del', 'por', 'para', 'con', 'pago', 'compra', 'cuota', 'mes', 'mensual', 'cobro', 'factura', 'pse', 'tarjeta', 'credito', 'debito']);
  /* "Pago NETFLIX.COM 10/26" -> "netflix com" */
  function normalize(desc) {
    return String(desc || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w)).slice(0, 4).join(' ').trim();
  }
  const SUB_HINT = /netflix|spotify|disney|hbo|max\b|prime|amazon|youtube|apple|icloud|google one|chatgpt|openai|claude|deezer|paramount|star\+?|crunchyroll|gym|smart ?fit|bodytech|claro|movistar|tigo|wom|etb|internet|plan|seguro|suscrip|membres|patreon|canva|adobe|microsoft|office|xbox|playstation|nintendo|rappi pro|uber one/i;
  const NEEDS = /vivienda|arriendo|alquiler|hipoteca|servicio|agua|luz|energ|gas|internet|comida|mercado|super|transporte|gasolina|salud|medic|farmacia|educa|colegio|universidad|seguro|beb[eé]|pañal|cr[eé]dito|deuda|cuota/i;

  const expenses = (txs, filter) => txs.filter(t => t.tipo === 'Gasto' && (!filter || filter(t)));
  const inMonth = (t, mk) => monthKey(t.fecha) === mk;

  /* Gasto por categoría y mes */
  function monthlyByCategory(txs) {
    const m = {};
    expenses(txs).forEach(t => {
      const c = (m[t.categoria] = m[t.categoria] || {}); const k = monthKey(t.fecha);
      c[k] = (c[k] || 0) + t.monto;
    });
    return m;
  }
  /* Promedio de los meses previos que tienen datos (hasta 3) */
  function avgPrev(byMonth, mk, n, firstMonth) {
    const ms = prevMonths(mk, n || 3).filter(k => !firstMonth || k >= firstMonth);
    if (!ms.length) return null;
    return sum(ms.map(k => (byMonth && byMonth[k]) || 0)) / ms.length;
  }
  const firstMonthOf = txs => txs.reduce((min, t) => (!min || t.fecha < min ? t.fecha : min), '').slice(0, 7);

  /* Proyección del mes según tu historia: lo que llevas + lo que normalmente gastas en los días que faltan.
     Así un pago fijo de inicio de mes (arriendo) no se "multiplica" al proyectar. */
  function historyProjection(rows, mk, day, first) {
    const ms = prevMonths(mk, 3).filter(k => !first || k >= first);
    const dim = daysInMonth(mk);
    const toDay = rows.filter(t => monthKey(t.fecha) === mk && parse(t.fecha).getDate() <= day);
    const actual = sum(toDay.map(t => t.monto));
    if (!ms.length) return { actual, avgToDay: null, avgFull: null, projection: day >= 5 ? actual / day * dim : actual };
    const per = ms.map(k => {
      const r = rows.filter(t => monthKey(t.fecha) === k);
      const dk = daysInMonth(k), cut = Math.round(day / dim * dk);
      return { toDay: sum(r.filter(t => parse(t.fecha).getDate() <= cut).map(t => t.monto)), full: sum(r.map(t => t.monto)) };
    });
    const avgToDay = sum(per.map(x => x.toDay)) / ms.length, avgFull = sum(per.map(x => x.full)) / ms.length;
    return { actual, avgToDay, avgFull, projection: actual + Math.max(0, avgFull - avgToDay) };
  }

  /* ---------- Presupuestos ---------- */
  function budgetStatus(budgets, txs, mk, today) {
    const dim = daysInMonth(mk), isCurrent = monthKey(today) === mk;
    const elapsed = isCurrent ? parse(today).getDate() : dim;
    const left = isCurrent ? dim - elapsed + 1 : 0;
    return budgets.map(b => {
      const rows = expenses(txs, t => inMonth(t, mk) && (!b.categoria || t.categoria === b.categoria));
      const spent = sum(rows.map(t => t.monto));
      const pct = b.monto ? spent / b.monto * 100 : 0;
      const hist = isCurrent ? historyProjection(expenses(txs, t => !b.categoria || t.categoria === b.categoria), mk, elapsed, firstMonthOf(txs)) : null;
      const projection = hist ? hist.projection : spent;
      return {
        id: b.id, categoria: b.categoria || null, monto: b.monto, spent, pct, remaining: b.monto - spent,
        daysLeft: left, perDay: left > 0 ? Math.max(0, b.monto - spent) / left : 0,
        projection, willExceed: isCurrent && elapsed >= 3 && projection > b.monto * 1.02 && pct < 100,
        level: pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok', count: rows.length
      };
    });
  }

  function budgetSuggestions(txs, budgets, mk) {
    const byCat = monthlyByCategory(txs), first = firstMonthOf(txs);
    const budgeted = new Set(budgets.map(b => b.categoria || '__total'));
    const cats = Object.keys(byCat).map(c => {
      const avg = avgPrev(byCat[c], mk, 3, first) || 0;
      const last = byCat[c][addMonths(mk, -1)] || 0;
      return { categoria: c, avg, last, sugerido: nice(avg * 0.9), igual: nice(avg) };
    }).filter(x => x.avg > 0 && !budgeted.has(x.categoria)).sort((a, b) => b.avg - a.avg);
    // Total del mes y regla 50/30/20 con el ingreso promedio
    const monthsWith = prevMonths(mk, 3).filter(k => k >= first);
    const inc = monthsWith.length ? sum(txs.filter(t => t.tipo === 'Ingreso' && monthsWith.includes(monthKey(t.fecha))).map(t => t.monto)) / monthsWith.length : 0;
    const exp = monthsWith.length ? sum(expenses(txs, t => monthsWith.includes(monthKey(t.fecha))).map(t => t.monto)) / monthsWith.length : 0;
    const needs = monthsWith.length ? sum(expenses(txs, t => monthsWith.includes(monthKey(t.fecha)) && NEEDS.test(t.categoria)).map(t => t.monto)) / monthsWith.length : 0;
    return {
      categorias: cats,
      total: !budgeted.has('__total') && exp > 0 ? { avg: exp, sugerido: nice(exp * 0.9) } : null,
      regla: inc > 0 ? {
        ingreso: inc, necesidades: nice(inc * 0.5), deseos: nice(inc * 0.3), ahorro: nice(inc * 0.2),
        actualNecesidades: needs, actualDeseos: Math.max(0, exp - needs), actualAhorro: inc - exp
      } : null
    };
  }

  /* ---------- Fugas: categorías por encima de tu promedio ---------- */
  function leaks(txs, mk, today) {
    const first = firstMonthOf(txs);
    const dim = daysInMonth(mk), isCurrent = monthKey(today) === mk, day = isCurrent ? parse(today).getDate() : dim;
    if (isCurrent && day < 5) return [];
    const cats = [...new Set(expenses(txs).map(t => t.categoria))];
    const rowsBy = {}; expenses(txs).forEach(t => (rowsBy[t.categoria] = rowsBy[t.categoria] || []).push(t));
    const all = cats.map(c => {
      const h = historyProjection(rowsBy[c], mk, day, first);
      // Comparación justa: lo que llevas hasta hoy frente a lo que normalmente llevas a esta altura del mes
      return { categoria: c, actual: h.actual, avg: h.avgFull, avgToDay: h.avgToDay, value: h.projection, projected: isCurrent,
        diff: h.actual - (h.avgToDay || 0), pct: h.avgToDay ? (h.actual / h.avgToDay - 1) * 100 : null };
    });
    const totalAvg = sum(all.map(x => x.avg || 0));
    const minDiff = Math.max(totalAvg * 0.02, 1);
    return all.filter(x => x.avgToDay && x.avgToDay > 0 && x.pct >= 20 && x.diff >= minDiff).sort((a, b) => b.diff - a.diff);
  }

  /* ---------- Gastos hormiga: muchos gastos pequeños ---------- */
  function antExpenses(txs, mk, today) {
    const from = addDays(today, -90);
    const recent = expenses(txs, t => t.fecha >= from).map(t => t.monto);
    if (recent.length < 10) return null;
    const threshold = percentile(recent, 0.3);
    const month = expenses(txs, t => inMonth(t, mk));
    const small = month.filter(t => t.monto <= threshold);
    if (small.length < 5) return null;
    const total = sum(small.map(t => t.monto)), monthTotal = sum(month.map(t => t.monto));
    const groups = {};
    small.forEach(t => { const k = t.descripcion ? normalize(t.descripcion) || t.categoria : t.categoria; const g = (groups[k] = groups[k] || { nombre: t.descripcion || t.categoria, count: 0, total: 0 }); g.count++; g.total += t.monto; });
    return { threshold, count: small.length, total, share: monthTotal ? total / monthTotal * 100 : 0,
      top: Object.values(groups).sort((a, b) => b.total - a.total).slice(0, 3) };
  }

  /* ---------- Patrones por día de la semana ---------- */
  const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  function weekdayPattern(txs, today, days) {
    days = days || 90;
    const from = addDays(today, -days + 1);
    const rows = expenses(txs, t => t.fecha >= from && t.fecha <= today);
    if (rows.length < 10) return null;
    const totals = [0, 0, 0, 0, 0, 0, 0], counts = [0, 0, 0, 0, 0, 0, 0];
    for (let d = parse(from); iso(d) <= today; d.setDate(d.getDate() + 1)) counts[d.getDay()]++;
    rows.forEach(t => { totals[parse(t.fecha).getDay()] += t.monto; });
    const avg = totals.map((x, i) => counts[i] ? x / counts[i] : 0);
    const mean = sum(avg) / 7;
    const top = avg.indexOf(Math.max(...avg));
    const weekend = totals[0] + totals[6], all = sum(totals);
    return { avg, labels: WEEKDAYS, top, topName: WEEKDAYS[top], ratio: mean ? avg[top] / mean : 1, weekendShare: all ? weekend / all * 100 : 0 };
  }

  /* ---------- Compras frecuentes y variación de precio ---------- */
  function merchants(txs, today, days) {
    days = days || 90;
    const from = addDays(today, -days + 1);
    const g = {};
    expenses(txs, t => t.fecha >= from && t.descripcion).forEach(t => {
      const k = normalize(t.descripcion); if (!k) return;
      const m = (g[k] = g[k] || { key: k, nombre: t.descripcion, categoria: t.categoria, count: 0, total: 0, min: Infinity, max: 0, ultima: '' });
      m.count++; m.total += t.monto; m.min = Math.min(m.min, t.monto); m.max = Math.max(m.max, t.monto);
      if (t.fecha >= m.ultima) { m.ultima = t.fecha; m.nombre = t.descripcion; }
    });
    return Object.values(g).filter(m => m.count >= 3).map(m => Object.assign(m, {
      avg: m.total / m.count, perMonth: m.count / (days / 30), spread: m.min > 0 ? m.max / m.min : 1
    })).sort((a, b) => b.total - a.total);
  }

  /* ---------- Suscripciones y pagos recurrentes ---------- */
  function classify(medianGap) {
    if (medianGap >= 26 && medianGap <= 35) return { frecuencia: 'mensual', dias: 30, factor: 1 };
    if (medianGap >= 12 && medianGap <= 17) return { frecuencia: 'quincenal', dias: 15, factor: 2 };
    if (medianGap >= 6 && medianGap <= 8) return { frecuencia: 'semanal', dias: 7, factor: 52 / 12 };
    if (medianGap >= 350 && medianGap <= 380) return { frecuencia: 'anual', dias: 365, factor: 1 / 12 };
    return null;
  }
  function detectRecurring(txs, today, rules) {
    const ruleKeys = new Set((rules || []).map(r => normalize(r.descripcion)).filter(Boolean));
    const groups = {};
    expenses(txs, t => t.descripcion).forEach(t => {
      const k = normalize(t.descripcion); if (!k) return;
      (groups[k] = groups[k] || []).push(t);
    });
    const out = [];
    Object.keys(groups).forEach(k => {
      const rows = groups[k].slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
      if (rows.length < 2) return;
      // Cobros dobles: mismo concepto y monto parecido con menos de 5 días de diferencia
      // (no aplica a compras frecuentes como transporte o tinto, que se repiten cada pocos días)
      const rawGaps = rows.slice(1).map((t, i) => diffDays(rows[i].fecha, t.fecha));
      const doubles = [];
      for (let i = 1; i < rows.length && median(rawGaps) > 10; i++) {
        const gap = diffDays(rows[i - 1].fecha, rows[i].fecha);
        if (gap <= 5 && Math.abs(rows[i].monto - rows[i - 1].monto) <= rows[i].monto * 0.05) doubles.push(rows[i]);
      }
      const series = rows.filter(t => !doubles.includes(t));
      const gaps = series.slice(1).map((t, i) => diffDays(series[i].fecha, t.fecha));
      const cls = gaps.length ? classify(median(gaps)) : null;
      const hinted = SUB_HINT.test(k) || /suscrip|servicio/i.test(rows[0].categoria);
      if (!cls) return;
      const regular = gaps.every(g => Math.abs(g - cls.dias) <= Math.max(6, cls.dias * 0.2));
      if (!regular || (series.length < 3 && !hinted)) return;
      // Pago fijo: el monto casi no cambia (arriendo, plan del celular). Las compras variables se ven en "Optimiza tus compras".
      const base = (series.length > 2 ? series.slice(-7, -1) : series).map(t => t.monto);
      const fijo = Math.max(...base) <= Math.min(...base) * 1.15;
      if (!hinted && !fijo) return;
      const last = series[series.length - 1];
      const prev = series.slice(0, -1).map(t => t.monto);
      const prevAvg = sum(prev) / prev.length;
      const wallets = [...new Set(rows.map(t => t.cartera))];
      const proxima = addDays(last.fecha, Math.round(median(gaps)));
      const activa = diffDays(last.fecha, today) <= cls.dias * 1.5 + 5;
      out.push({
        key: k, nombre: last.descripcion, categoria: last.categoria, carteras: wallets, frecuencia: cls.frecuencia,
        monto: last.monto, mensual: last.monto * cls.factor, anual: last.monto * cls.factor * 12, count: series.length,
        primera: series[0].fecha, ultima: last.fecha, proxima, activa, programado: ruleKeys.has(k),
        subio: prevAvg > 0 && last.monto > prevAvg * 1.05 ? (last.monto / prevAvg - 1) * 100 : 0,
        dobles: doubles.filter(t => diffDays(t.fecha, today) <= 90).map(t => t.fecha),
        enVariasCarteras: wallets.length > 1 && series.slice(-3).some(t => t.cartera !== last.cartera),
        esSuscripcion: hinted, fijo
      });
    });
    // Posibles duplicadas: conceptos que se contienen entre sí, ambos activos
    out.forEach(a => {
      a.parecidas = out.filter(b => b !== a && b.activa && a.activa && (b.key.includes(a.key) || a.key.includes(b.key))).map(b => b.nombre);
    });
    return out.sort((a, b) => (b.activa - a.activa) || b.mensual - a.mensual);
  }

  /* ---------- Metas ---------- */
  function goalStatus(goal, contributions, today) {
    const saved = sum(contributions.filter(c => c.goalId === goal.id).map(c => c.monto));
    const pct = goal.monto ? Math.min(100, Math.max(0, saved / goal.monto * 100)) : 0;
    const remaining = Math.max(0, goal.monto - saved);
    let monthsLeft = null, perMonth = null, expectedPct = null, status = remaining <= 0 ? 'lograda' : 'sin fecha';
    if (goal.fecha && remaining > 0) {
      const days = diffDays(today, goal.fecha);
      monthsLeft = Math.max(0, days / 30.44);
      perMonth = monthsLeft >= 1 ? remaining / monthsLeft : remaining;
      const total = Math.max(1, diffDays(goal.creada, goal.fecha));
      expectedPct = Math.min(100, Math.max(0, diffDays(goal.creada, today) / total * 100));
      status = days < 0 ? 'vencida' : pct + 5 >= expectedPct ? 'a tiempo' : 'atrasada';
    }
    return { saved, pct, remaining, monthsLeft, perMonth, expectedPct, status };
  }
  function savingsCapacity(txs, mk) {
    const first = firstMonthOf(txs);
    const ms = prevMonths(mk, 3).filter(k => k >= first);
    if (!ms.length) return null;
    const inc = sum(txs.filter(t => t.tipo === 'Ingreso' && ms.includes(monthKey(t.fecha))).map(t => t.monto)) / ms.length;
    const exp = sum(expenses(txs, t => ms.includes(monthKey(t.fecha))).map(t => t.monto)) / ms.length;
    return { ingreso: inc, gasto: exp, ahorro: inc - exp, meses: ms.length };
  }

  /* ---------- Resumen del mes ---------- */
  function monthSummary(txs, mk, today) {
    const exp = sum(expenses(txs, t => inMonth(t, mk)).map(t => t.monto));
    const inc = sum(txs.filter(t => t.tipo === 'Ingreso' && inMonth(t, mk)).map(t => t.monto));
    const byMonth = {}; expenses(txs).forEach(t => { const k = monthKey(t.fecha); byMonth[k] = (byMonth[k] || 0) + t.monto; });
    const avg = avgPrev(byMonth, mk, 3, firstMonthOf(txs));
    const dim = daysInMonth(mk), isCurrent = monthKey(today) === mk, elapsed = isCurrent ? parse(today).getDate() : dim;
    const projection = isCurrent ? historyProjection(expenses(txs), mk, elapsed, firstMonthOf(txs)).projection : exp;
    return { gasto: exp, ingreso: inc, ahorro: inc - exp, avg, projection, isCurrent, vsAvg: avg ? (projection / avg - 1) * 100 : null };
  }

  /* ---------- Alertas para la campana ---------- */
  const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const pretty = d => Number(d.slice(8, 10)) + ' de ' + MES_CORTO[Number(d.slice(5, 7)) - 1];
  function alerts(ctx) {
    const { txs, budgets, goals, contributions, rules, today, money, dismissed } = ctx;
    const mk = monthKey(today), out = [];
    const fmt = money ? (n => money.format(n)) : (n => String(Math.round(n)));
    const skip = k => dismissed && dismissed.has(k);
    budgetStatus(budgets, txs, mk, today).forEach(b => {
      const name = b.categoria || 'Total del mes';
      if (b.level === 'over') out.push({ key: 'b-over-' + b.id + mk, level: 'danger', title: 'Te pasaste en ' + name, body: 'Llevas ' + fmt(b.spent) + ' de ' + fmt(b.monto) + ' (' + Math.round(b.pct) + '%).', view: 'bud' });
      else if (b.level === 'warn') out.push({ key: 'b-warn-' + b.id + mk, level: 'warn', title: name + ' al ' + Math.round(b.pct) + '%', body: 'Te quedan ' + fmt(b.remaining) + (b.daysLeft ? ' para ' + b.daysLeft + ' días: ' + fmt(b.perDay) + ' por día.' : '.'), view: 'bud' });
      else if (b.willExceed) out.push({ key: 'b-proj-' + b.id + mk, level: 'warn', title: 'A este ritmo te pasarás en ' + name, body: 'Proyección: ' + fmt(b.projection) + ' de ' + fmt(b.monto) + '.', view: 'bud' });
    });
    leaks(txs, mk, today).slice(0, 2).forEach(l => out.push({ key: 'leak-' + l.categoria + mk, level: 'info', title: l.categoria + ' va ' + Math.round(l.pct) + '% sobre lo normal', body: (l.projected ? 'Llevas ' + fmt(l.actual) + '; a esta altura del mes sueles llevar ' + fmt(l.avgToDay) + '.' : 'Gastaste ' + fmt(l.actual) + ' frente a ' + fmt(l.avg) + ' de promedio.'), view: 'ana' }));
    const subs = detectRecurring(txs, today, rules);
    subs.forEach(s => {
      if (s.dobles.length) out.push({ key: 'dbl-' + s.key + s.dobles[s.dobles.length - 1], level: 'danger', title: 'Posible cobro doble: ' + s.nombre, body: 'Hay dos cobros casi iguales el ' + pretty(s.dobles[s.dobles.length - 1]) + '. Revisa tu extracto.', view: 'ana' });
      if (s.activa && s.parecidas.length && s.esSuscripcion && !out.some(a => a.pair && a.pair.includes(s.nombre))) out.push({ key: 'dup-' + s.key, pair: [s.nombre].concat(s.parecidas), level: 'warn', title: 'Suscripción posiblemente duplicada', body: s.nombre + ' y ' + s.parecidas[0] + ' se cobran a la vez.', view: 'ana' });
      if (s.activa && s.esSuscripcion && s.subio >= 5) out.push({ key: 'up-' + s.key + s.ultima, level: 'warn', title: s.nombre + ' subió ' + Math.round(s.subio) + '%', body: 'Ahora pagas ' + fmt(s.monto) + ' (' + s.frecuencia + ').', view: 'ana' });
      if (s.activa && !s.programado && s.proxima >= today && diffDays(today, s.proxima) <= 3) out.push({ key: 'next-' + s.key + s.proxima, level: 'info', title: 'Pronto se cobra ' + s.nombre, body: 'Cerca del ' + pretty(s.proxima) + ' por unos ' + fmt(s.monto) + '.', view: 'ana' });
    });
    (rules || []).filter(r => r.activa && r.tipo === 'Gasto' && r.proxima >= today && diffDays(today, r.proxima) <= 3).forEach(r =>
      out.push({ key: 'rule-' + r.id + r.proxima, level: 'info', title: (r.descripcion || r.categoria) + (r.proxima === today ? ' hoy' : ' el ' + pretty(r.proxima)), body: 'Pago programado de ' + fmt(r.monto) + ' en ' + r.cartera + '.', view: 'ana' }));
    (goals || []).forEach(g => {
      const st = goalStatus(g, contributions || [], today);
      if (st.status === 'atrasada') out.push({ key: 'goal-' + g.id + mk, level: 'warn', title: 'Meta atrasada: ' + g.nombre, body: 'Vas en ' + Math.round(st.pct) + '%; deberías ir en ' + Math.round(st.expectedPct) + '%. Ahorra ' + fmt(st.perMonth) + ' al mes para lograrla.', view: 'goal' });
    });
    const order = { danger: 0, warn: 1, info: 2 };
    return out.filter(a => !skip(a.key)).sort((a, b) => order[a.level] - order[b.level]);
  }

  const api = { normalize, nextDate, monthKey, addMonths, addDays, diffDays, daysInMonth, nice, budgetStatus, budgetSuggestions, leaks,
    antExpenses, weekdayPattern, merchants, detectRecurring, goalStatus, savingsCapacity, monthSummary, alerts, NEEDS };
  root.NFInsights = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
