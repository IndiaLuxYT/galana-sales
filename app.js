(function () {
  const D = window.GALANA_DATA, G = window.GEO;
  const NS = 'http://www.w3.org/2000/svg';
  const PLANT_NAMES = { NBO: 'Nairobi Depot', MSA: 'Mombasa Depot' };
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtM = (v) => (v / 1e6).toFixed(1) + 'M';
  const fmtK = (v) => (v >= 1e6 ? (v / 1e6).toFixed(0) + 'M' : (v / 1e3).toFixed(0) + 'K');
  const fmtInt = (v) => Math.round(v).toLocaleString('en-KE');
  const monthLabel = (ym) => MONTHS[parseInt(ym.slice(5, 7), 10) - 1];
  const $ = (id) => document.getElementById(id);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  const cust = Object.fromEntries(D.customers.map((c) => [c.id, c]));
  const prod = Object.fromEntries(D.products.map((p) => [p.id, p]));
  const rows = D.sales.map((r) => ({ ...r, type: cust[r.cust]?.type, grp: prod[r.mat]?.grp }));

  const f = { plant: 'ALL', group: 'ALL', type: 'ALL' };
  const OPTS = {
    plant: ['Depot', [['All', 'ALL'], ['Nairobi', 'NBO'], ['Mombasa', 'MSA']]],
    group: ['Product', [['All', 'ALL'], ['White fuel', 'WHITE_FUEL'], ['Lubricants', 'LUBRICANT']]],
    type: ['Customer', [['All', 'ALL'], ['B2B', 'B2B'], ['B2C', 'B2C']]],
  };

  const filt = (skip) => rows.filter((r) =>
    (skip === 'plant' || f.plant === 'ALL' || r.plant === f.plant) &&
    (f.group === 'ALL' || r.grp === f.group) &&
    (skip === 'type' || f.type === 'ALL' || r.type === f.type));

  const sumBy = (arr, keyFn, valFn) => {
    const m = new Map();
    arr.forEach((r) => { const k = keyFn(r); m.set(k, (m.get(k) || 0) + valFn(r)); });
    return m;
  };

  function el(tag, attrs = {}, children = []) {
    const isSvg = ['svg', 'path', 'circle', 'line', 'text', 'g', 'polyline'].includes(tag);
    const e = isSvg ? document.createElementNS(NS, tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v);
    }
    [].concat(children).forEach((c) => c && e.appendChild(c));
    return e;
  }

  function renderFilters() {
    const box = $('filters'); box.innerHTML = '';
    for (const [key, [label, opts]] of Object.entries(OPTS)) {
      const row = el('div', { class: 'frow' }, [el('span', { text: label })]);
      opts.forEach(([l, v]) => {
        const b = el('button', { class: 'chip' + (f[key] === v ? ' on' : ''), text: l, 'aria-pressed': f[key] === v, 'aria-label': `${label}: ${l}` });
        b.onclick = () => { f[key] = v; render(); };
        row.appendChild(b);
      });
      box.appendChild(row);
    }
  }

  function renderKpis(all) {
    const revenue = all.reduce((s, r) => s + r.net, 0);
    const cost = all.reduce((s, r) => s + r.cost, 0);
    const litres = all.reduce((s, r) => s + (r.uom === 'L' ? r.qty : 0), 0);
    const invoices = new Set(all.map((r) => r.inv)).size;
    const customers = new Set(all.map((r) => r.cust)).size;
    const profit = revenue - cost, margin = revenue ? (profit / revenue) * 100 : 0;
    const items = [
      ['Net sales', fmtM(revenue), 'KES'], ['Invoices', fmtInt(invoices), ''],
      ['Fuel volume', fmtM(litres), 'litres'], ['Active customers', fmtInt(customers), ''],
      ['Profit (sample cost)', fmtM(profit), 'KES'], ['Margin', margin.toFixed(1), '%'],
    ];
    $('kpis').innerHTML = '';
    items.forEach(([l, v, u]) => $('kpis').appendChild(el('div', { class: 'kpi' }, [
      el('div', { class: 'l', text: l }),
      el('div', { class: 'v', html: `${v}<span class="u">${u}</span>` })])));
  }

  function renderTrend(all) {
    const months = [...new Set(all.map((r) => r.ym))].sort();
    const plants = [...new Set(all.map((r) => r.plant))].sort();
    const m = sumBy(all, (r) => r.plant + '|' + r.ym, (r) => r.net);
    const series = plants.map((p) => ({
      name: p, color: css(p === 'NBO' ? '--nbo' : '--msa'),
      values: months.map((ym) => m.get(p + '|' + ym) || 0),
    }));
    if (months.length) $('period').textContent =
      `${monthLabel(months[0])} ${months[0].slice(0, 4)} to ${monthLabel(months[months.length - 1])} ${months[months.length - 1].slice(0, 4)} · KES`;

    const W = 900, H = 260, pad = { l: 48, r: 14, t: 12, b: 26 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const max = Math.max(1, ...series.flatMap((s) => s.values)) * 1.1;
    const x = (i) => pad.l + (months.length === 1 ? iw / 2 : (i * iw) / (months.length - 1));
    const y = (v) => pad.t + ih - (v / max) * ih;
    if (!months.length) {
      $('trend').innerHTML = '<p class="empty">No sales for this filter combination.</p>';
      $('trend-legend').innerHTML = ''; $('trend-table').innerHTML = ''; return;
    }
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img',
      'aria-label': 'Monthly net sales line chart. ' + series.map((s) => {
        const hi = Math.max(...s.values);
        return `${PLANT_NAMES[s.name]} peaks at KES ${fmtM(hi)} in ${monthLabel(months[s.values.indexOf(hi)])}.`;
      }).join(' ') });
    [0, 0.5, 1].forEach((t) => {
      const v = t * max;
      svg.appendChild(el('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), stroke: css('--border') }));
      svg.appendChild(el('text', { x: pad.l - 6, y: y(v) + 4, 'font-size': 11, 'text-anchor': 'end', text: fmtK(v) }));
    });
    months.forEach((ym, i) => svg.appendChild(el('text', { x: x(i), y: H - 7, 'font-size': 11, 'text-anchor': 'middle', text: monthLabel(ym) })));
    series.forEach((s) => {
      svg.appendChild(el('polyline', { points: s.values.map((v, i) => `${x(i)},${y(v)}`).join(' '), fill: 'none', stroke: s.color, 'stroke-width': 2.5 }));
      s.values.forEach((v, i) => {
        const c = el('circle', { cx: x(i), cy: y(v), r: 4, fill: s.color });
        c.appendChild(el('title', { text: `${PLANT_NAMES[s.name]} ${monthLabel(months[i])}: KES ${fmtM(v)}` }));
        svg.appendChild(c);
      });
    });
    $('trend').innerHTML = ''; $('trend').appendChild(svg);
    $('trend-legend').innerHTML = series.map((s) => `<span><i style="color:${s.color}" aria-hidden="true">●</i> ${PLANT_NAMES[s.name]}</span>`).join('');
    $('trend-table').innerHTML = `<table class="tbl"><thead><tr><th scope="col">Month</th>${series.map((s) =>
      `<th scope="col">${PLANT_NAMES[s.name]} (KES M)</th>`).join('')}</tr></thead><tbody>${months.map((ym, i) =>
      `<tr><th scope="row">${monthLabel(ym)}</th>${series.map((s) => `<td>${(s.values[i] / 1e6).toFixed(1)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function renderMap() {
    const all = filt('plant');
    const byPlant = [...sumBy(all, (r) => r.plant, (r) => r.net)].map(([plant, amt]) => ({
      plant, amt, customers: new Set(all.filter((r) => r.plant === plant).map((r) => r.cust)).size }));
    const max = Math.max(1, ...byPlant.map((d) => d.amt));
    const eq = G.project(0, 33.9).y;
    const svg = el('svg', { viewBox: `0 0 ${G.MAP_W} ${G.MAP_H}`, style: 'width:100%;max-width:380px' });
    svg.appendChild(el('path', { d: G.KENYA_PATH, fill: css('--land'), stroke: css('--landStroke'), 'stroke-width': 3 }));
    svg.appendChild(el('line', { x1: 0, x2: G.MAP_W, y1: eq, y2: eq, stroke: css('--sub'), 'stroke-width': 1.5, 'stroke-dasharray': '8 8', opacity: 0.5 }));
    svg.appendChild(el('text', { x: G.MAP_W - 6, y: eq - 8, 'font-size': 20, 'text-anchor': 'end', text: 'Equator' }));
    G.TOWNS.forEach((t) => {
      const { x, y } = G.project(t.lat, t.lon);
      svg.appendChild(el('circle', { cx: x, cy: y, r: 5, fill: css('--sub'), opacity: 0.7 }));
      svg.appendChild(el('text', { x: x + 10, y: y + 7, 'font-size': 20, text: t.name }));
    });
    byPlant.forEach((d, i) => {
      const dep = G.DEPOTS[d.plant]; if (!dep) return;
      const { x, y } = G.project(dep.lat, dep.lon);
      const r = 22 + 40 * Math.sqrt(d.amt / max), on = f.plant === d.plant;
      const col = css(d.plant === 'NBO' ? '--nbo' : '--msa');
      const g = el('g', { class: 'depot', role: 'button', tabindex: 0, 'aria-pressed': on,
        'aria-label': `${dep.name} depot, KES ${fmtM(d.amt)}, ${d.customers} customers. ${on ? 'Selected, press to clear filter' : 'Press to filter'}` }, [
        el('circle', { cx: x, cy: y, r, fill: col, opacity: 0.35 }),
        el('circle', { class: 'pulse', cx: x, cy: y, r, stroke: col, 'stroke-width': 4, style: `--s0:${(7 / r).toFixed(3)};animation-delay:${(-i * 1.2).toFixed(1)}s` }),
        el('circle', { cx: x, cy: y, r, fill: 'none', stroke: col, 'stroke-width': on ? 7 : 3 }),
        el('circle', { cx: x, cy: y, r: 7, fill: col }),
        el('text', { x: x - r - 10, y: y - 4, 'font-size': 30, 'font-weight': 'bold', 'text-anchor': 'end', style: `fill:${css('--text')}`, text: dep.name }),
        el('text', { x: x - r - 10, y: y + 30, 'font-size': 26, 'text-anchor': 'end', text: `KES ${fmtM(d.amt)} \u00b7 ${d.customers} cust.` }),
      ]);
      const toggle = () => { f.plant = on ? 'ALL' : d.plant; render(); const n = document.querySelector(`.depot[data-p="${d.plant}"]`); if (n) n.focus(); };
      g.setAttribute('data-p', d.plant);
      g.onclick = toggle;
      g.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
      svg.appendChild(g);
    });
    $('map').innerHTML = ''; $('map').appendChild(svg);
  }
  function renderBars(id, data, fmt) {
    const max = Math.max(1, ...data.map((d) => d.value));
    const box = $(id); box.innerHTML = '';
    if (!data.length) { box.innerHTML = '<p class="empty">No data for this filter combination.</p>'; return; }
    data.forEach((d) => box.appendChild(el('div', { class: 'bar' }, [
      el('span', { text: d.label }),
      el('div', { class: 'track' }, [el('div', { class: 'fill', style: `width:${(d.value / max) * 100}%;background:${d.color}` })]),
      el('span', { class: 'val', text: fmt(d.value) }),
    ])));
  }

  function renderSplit(data) {
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    const box = $('byType'); box.innerHTML = '';
    box.appendChild(el('div', { class: 'split' }, data.map((d) =>
      el('div', { style: `width:${(d.value / total) * 100}%;background:${d.color}`, title: d.label }))));
    box.appendChild(el('div', { class: 'legend', html: data.map((d) =>
      `<span><i style="color:${d.color}">●</i> ${d.label} ${((d.value / total) * 100).toFixed(1)}% · KES ${fmtM(d.value)}</span>`).join('') }));
  }

  function render() {
    const all = filt();
    renderFilters(); renderKpis(all); renderTrend(all); renderMap();
    $('status').textContent = `Showing ${all.length} invoice lines. Depot ${f.plant}, product ${f.group}, customer ${f.type}.`;

    const byMat = sumBy(all, (r) => r.mat, (r) => r.net);
    const costMat = sumBy(all, (r) => r.mat, (r) => r.cost);
    renderBars('byProduct', [...byMat].sort((a, b) => b[1] - a[1]).map(([m, v]) => ({
      label: prod[m].name, value: v, color: css(prod[m].grp === 'WHITE_FUEL' ? '--accent' : '--msa') })), fmtM);
    renderBars('byMargin', [...byMat].map(([m, v]) => ({
      label: prod[m].name, value: Math.max(100 * (v - costMat.get(m)) / v, 0), color: css('--ok') }))
      .sort((a, b) => b.value - a.value), (v) => v.toFixed(1) + '%');

    const tcol = (t) => css(t === 'B2B' ? '--b2b' : '--b2c');
    renderSplit([...sumBy(filt('type'), (r) => r.type, (r) => r.net)].map(([t, v]) => ({ label: t, value: v, color: tcol(t) })));
    renderBars('top', [...sumBy(all, (r) => r.cust, (r) => r.net)].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, v]) => ({
      label: `${cust[id].name} · ${cust[id].plant}`, value: v, color: tcol(cust[id].type) })), fmtM);
  }

  const setNet = () => {
    const on = navigator.onLine, b = $('net');
    b.textContent = on ? 'Online' : 'Offline';
    b.classList.toggle('off', !on);
  };
  addEventListener('online', setNet); addEventListener('offline', setNet); setNet();
  if (D.sync && D.sync.last_synced_at) $('sync').textContent = 'Last sync: ' + new Date(D.sync.last_synced_at).toLocaleString('en-KE');

  $('theme').onclick = () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    render();
  };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
  render();
})();
