/* Analisi e grafici della Home: SVG puri, nessuna libreria.
   Colori delle discipline: palette categoriale validata per sfondo scuro (ordine fisso). */
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const nf = n => n.toLocaleString("it-IT");

export const DISC = [
  { id: "swim", label: "Nuoto", color: "#3987e5", icons: ["swim"] },
  { id: "run", label: "Corsa", color: "#d95926", icons: ["run"] },
  { id: "bike", label: "Bici", color: "#199e70", icons: ["bike"] },
  { id: "str", label: "Forza", color: "#c98500", icons: ["bar", "gym"] },
  { id: "metcon", label: "Metcon", color: "#d55181", icons: ["kb"] },
  { id: "erg", label: "Row & ski", color: "#008300", icons: ["row", "ski"] },
  { id: "other", label: "Altro", color: "#9085e9", icons: [] }
];
const discOf = icon => DISC.find(d => d.icons.includes(icon)) || DISC[DISC.length - 1];
const WD = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const WD_SHORT = ["L", "M", "M", "G", "V", "S", "D"];
const parseDay = s => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* ---------- Calcolo delle statistiche ---------- */
export function computeStats(weeks, done) {
  const asc = [...weeks].sort((a, b) => a.number - b.number);
  const byKey = new Map(done.map(e => [`${e.week}:${e.id}`, e]));
  const perWeek = asc.map(w => {
    const segs = {}; let req = 0, reqDone = 0, opt = 0, load = 0, rpeSum = 0, rpeN = 0, mins = 0;
    const skipped = [];
    w.sessions.forEach(s => {
      const e = byKey.get(`${w.number}:${s.id}`), d = discOf(s.icon);
      if (!s.optional) req++;
      if (e) {
        segs[d.id] = (segs[d.id] || 0) + 1;
        s.optional ? opt++ : reqDone++;
        if (e.dur > 0) mins += e.dur;
        if (e.rpe > 0) { rpeSum += e.rpe; rpeN++; if (e.dur > 0) load += e.dur * e.rpe; }
      } else if (!s.optional) skipped.push(d.id);
    });
    return { number: w.number, req, reqDone, opt, total: reqDone + opt, segs, load, mins, rpe: rpeN ? rpeSum / rpeN : 0, rpeN, skipped };
  });
  const firstActive = perWeek.findIndex(p => p.total > 0);
  const active = firstActive === -1 ? [] : perWeek.slice(firstActive);
  const latest = perWeek[perWeek.length - 1];
  // La settimana in corso non interrompe la serie finché non è finita.
  let streak = 0;
  for (let i = perWeek.length - 1; i >= 0; i--) {
    const p = perWeek[i];
    if (p.reqDone >= p.req && p.req) streak++;
    else if (i === perWeek.length - 1) continue;
    else break;
  }
  const reqAll = active.reduce((a, p) => a + p.req, 0), reqDoneAll = active.reduce((a, p) => a + p.reqDone, 0);
  const byDisc = {};
  done.forEach(e => {
    const w = asc.find(x => x.number === e.week), s = w && w.sessions.find(x => x.id === e.id);
    if (s) { const d = discOf(s.icon).id; byDisc[d] = (byDisc[d] || 0) + 1; }
  });
  const days = {};
  done.forEach(e => { if (e.at) days[e.at] = (days[e.at] || 0) + 1; });
  return {
    perWeek, active, latest, streak, byDisc, days,
    total: done.filter(e => asc.some(w => w.number === e.week && w.sessions.some(s => s.id === e.id))).length,
    adherence: reqAll ? reqDoneAll / reqAll : null,
    firstWeek: active[0]?.number ?? null,
    minutes: perWeek.reduce((a, p) => a + p.mins, 0),
    logged: done.filter(e => e.rpe > 0).length
  };
}

/* ---------- Riquadri numerici ---------- */
export function kpiHTML(st) {
  const hours = st.minutes / 60;
  const tiles = [
    { l: "Aderenza", v: st.adherence === null ? "—" : Math.round(st.adherence * 100) + "%", s: st.firstWeek ? `obbligatori dalla sett. ${st.firstWeek}` : "nessun dato ancora" },
    { l: "Serie", v: String(st.streak), s: st.streak === 1 ? "settimana completa" : "settimane complete di fila" },
    { l: "Sessioni", v: nf(st.total), s: "completate in totale" },
    { l: "Tempo", v: st.minutes ? (hours >= 10 ? nf(Math.round(hours)) : nf(Math.round(hours * 10) / 10)) + " h" : "—", s: st.minutes ? "di allenamento registrato" : "aggiungi la durata alle sessioni" }
  ];
  return `<div class="kpis">${tiles.map(t => `<div class="kpi"><small>${t.l}</small><b>${t.v}</b><span>${t.s}</span></div>`).join("")}</div>`;
}

/* ---------- Attività per settimana: colonne impilate per disciplina ---------- */
export function activityHTML(st, curNum) {
  const P = st.perWeek.slice(-8);
  if (!P.length) return "";
  const W = 320, H = 168, padL = 22, padB = 24, padT = 10, plotH = H - padB - padT;
  const maxY = Math.max(4, ...P.map(p => Math.max(p.total, p.req)));
  const step = Math.ceil(maxY / 4), top = step * 4;
  const y = v => padT + plotH - (v / top) * plotH;
  const band = (W - padL) / P.length, bw = Math.min(24, band * 0.56);
  let grid = "";
  for (let v = 0; v <= top; v += step)
    grid += `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="gl"/><text x="${padL - 6}" y="${y(v) + 4}" class="ax" text-anchor="end">${v}</text>`;
  let bars = "";
  const present = new Set();
  P.forEach((p, i) => {
    const cx = padL + band * i + band / 2, x = cx - bw / 2;
    let acc = 0;
    const order = DISC.filter(d => p.segs[d.id]);
    order.forEach((d, j) => {
      present.add(d.id);
      const n = p.segs[d.id], y0 = y(acc), y1 = y(acc + n), gap = j ? 2 : 0, h = Math.max(0, y0 - y1 - gap);
      const isTop = j === order.length - 1, r = isTop ? Math.min(4, h) : 0;
      // Estremità superiore arrotondata a 4px, base squadrata.
      bars += r
        ? `<path d="M${x},${y0 - gap} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 + r} V${y0 - gap} Z" fill="${d.color}"/>`
        : `<rect x="${x}" y="${y1}" width="${bw}" height="${h}" fill="${d.color}"/>`;
      acc += n;
    });
    // Obiettivo della settimana (sessioni obbligatorie): tacca orizzontale sopra la colonna.
    if (p.req) bars += `<line x1="${cx - bw / 2 - 4}" x2="${cx + bw / 2 + 4}" y1="${y(p.req)}" y2="${y(p.req)}" class="goal"/>`;
    const cur = p.number === curNum;
    bars += `<text x="${cx}" y="${H - 6}" text-anchor="middle" class="ax${cur ? " cur" : ""}">S${p.number}</text>`;
    const tip = `Settimana ${p.number}: ${p.reqDone}/${p.req} obbligatori${p.opt ? ` + ${p.opt} facoltativ${p.opt > 1 ? "i" : "o"}` : ""}` +
      (order.length ? " · " + order.map(d => `${d.label} ${p.segs[d.id]}`).join(", ") : "");
    bars += `<rect x="${padL + band * i}" y="${padT}" width="${band}" height="${plotH + padB}" fill="transparent" class="hit" data-tip="${esc(tip)}"/>`;
  });
  const legend = DISC.filter(d => present.has(d.id));
  const rows = P.map(p => `<tr><td>S${p.number}</td><td>${p.reqDone}/${p.req}</td><td>${p.opt}</td>${legend.map(d => `<td>${p.segs[d.id] || 0}</td>`).join("")}</tr>`).join("");
  return `<section class="card glass chart-card" aria-label="Attività per settimana">
    <div class="card-head"><div><h2>Attività</h2><small class="card-sub">Sessioni completate per settimana · la tacca è l'obiettivo</small></div></div>
    <div class="chart" data-chart><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sessioni completate nelle ultime ${P.length} settimane">${grid}${bars}</svg><div class="tip" hidden></div></div>
    ${legend.length ? `<div class="legend">${legend.map(d => `<span><i style="background:${d.color}"></i>${d.label}</span>`).join("")}<span><i class="goal-key"></i>Obiettivo</span></div>` : `<p class="empty-note small">Ancora nessuna sessione completata: segna i tuoi allenamenti come fatti.</p>`}
    <details class="data-table"><summary>Vedi i dati</summary><div class="rt-wrap"><table class="rt mini"><thead><tr><th>Sett.</th><th>Obblig.</th><th>Facolt.</th>${legend.map(d => `<th>${d.label}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div></details>
  </section>`;
}

/* ---------- Calendario dei giorni di allenamento (ultime 12 settimane) ---------- */
export function heatmapHTML(st) {
  const weeksBack = 12, today = new Date(); today.setHours(0, 0, 0, 0);
  const mondayIdx = (today.getDay() + 6) % 7;
  const start = new Date(today); start.setDate(today.getDate() - mondayIdx - (weeksBack - 1) * 7);
  const cell = 20, gap = 4, padL = 16, padT = 16;
  const W = padL + weeksBack * (cell + gap), H = padT + 7 * (cell + gap);
  let out = "", activeDays = 0, months = "";
  let lastMonth = -1;
  for (let c = 0; c < weeksBack; c++) {
    const colDate = new Date(start); colDate.setDate(start.getDate() + c * 7);
    if (colDate.getMonth() !== lastMonth) {
      lastMonth = colDate.getMonth();
      months += `<text x="${padL + c * (cell + gap)}" y="10" class="ax">${colDate.toLocaleDateString("it-IT", { month: "short" })}</text>`;
    }
    for (let r = 0; r < 7; r++) {
      const d = new Date(start); d.setDate(start.getDate() + c * 7 + r);
      if (d > today) continue;
      const n = st.days[dayKey(d)] || 0; if (n) activeDays++;
      const lvl = n >= 3 ? 3 : n;
      const label = `${d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}: ${n ? n + (n > 1 ? " sessioni" : " sessione") : "riposo"}`;
      out += `<rect x="${padL + c * (cell + gap)}" y="${padT + r * (cell + gap)}" width="${cell}" height="${cell}" rx="5" class="hm l${lvl}${dayKey(d) === dayKey(today) ? " today" : ""}" data-tip="${esc(label)}"/>`;
    }
  }
  const wd = WD_SHORT.map((l, r) => r % 2 === 0 ? `<text x="0" y="${padT + r * (cell + gap) + 14}" class="ax">${l}</text>` : "").join("");
  return `<section class="card glass chart-card" aria-label="Giorni di allenamento">
    <div class="card-head"><div><h2>Calendario</h2><small class="card-sub">${activeDays} giorni di allenamento nelle ultime 12 settimane</small></div></div>
    <div class="chart" data-chart><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Calendario degli allenamenti">${months}${wd}${out}</svg><div class="tip" hidden></div></div>
    <div class="legend scale"><span>Riposo</span><i class="hm-key l0"></i><i class="hm-key l1"></i><i class="hm-key l2"></i><i class="hm-key l3"></i><span>3+</span></div>
  </section>`;
}

/* ---------- Ripartizione per disciplina ---------- */
export function disciplineHTML(st) {
  const items = DISC.filter(d => st.byDisc[d.id]).map(d => ({ ...d, n: st.byDisc[d.id] })).sort((a, b) => b.n - a.n);
  if (!items.length) return "";
  const tot = items.reduce((a, d) => a + d.n, 0), max = items[0].n;
  return `<section class="card glass chart-card" aria-label="Sessioni per disciplina">
    <div class="card-head"><div><h2>Discipline</h2><small class="card-sub">Sessioni completate, da sempre</small></div></div>
    <div class="hbars">${items.map(d => `<div class="hbar"><span class="hl"><i style="background:${d.color}"></i>${d.label}</span>
      <span class="track-h"><span style="width:${Math.max(4, (d.n / max) * 100)}%;background:${d.color}"></span></span>
      <span class="hv">${d.n}<small> · ${Math.round(d.n / tot * 100)}%</small></span></div>`).join("")}</div>
  </section>`;
}

/* ---------- Carico interno (durata × RPE) ---------- */
export function loadHTML(st) {
  const P = st.perWeek.slice(-8);
  const hasData = P.some(p => p.load > 0);
  if (!hasData) {
    return `<section class="card glass chart-card" aria-label="Carico di allenamento">
      <div class="card-head"><div><h2>Carico e fatica</h2><small class="card-sub">Durata × fatica percepita (RPE)</small></div></div>
      <p class="empty-note small">Quando segni un allenamento come fatto, aggiungi durata e fatica (RPE 1–10): qui vedrai come cresce il carico settimana dopo settimana.</p>
    </section>`;
  }
  const W = 320, H = 150, padL = 34, padB = 24, padT = 16, plotH = H - padB - padT;
  const maxV = Math.max(...P.map(p => p.load));
  const mag = Math.pow(10, Math.floor(Math.log10(maxV))), step = Math.ceil(maxV / 3 / mag) * mag, top = step * 3;
  const y = v => padT + plotH - (v / top) * plotH;
  const band = (W - padL) / P.length, bw = Math.min(24, band * 0.56);
  const fmt = v => v >= 1000 ? nf(Math.round(v / 100) / 10) + "K" : nf(v);
  let g = "";
  for (let v = 0; v <= top; v += step) g += `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="gl"/><text x="${padL - 6}" y="${y(v) + 4}" class="ax" text-anchor="end">${fmt(v)}</text>`;
  const peak = P.reduce((a, p) => p.load > a.load ? p : a, P[0]);
  P.forEach((p, i) => {
    const cx = padL + band * i + band / 2, x = cx - bw / 2;
    if (p.load > 0) {
      const y1 = y(p.load), r = Math.min(4, y(0) - y1);
      g += `<path d="M${x},${y(0)} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 + r} V${y(0)} Z" class="load-bar"/>`;
      if (p === peak) g += `<text x="${cx}" y="${y1 - 5}" text-anchor="middle" class="val">${fmt(p.load)}</text>`;
    }
    g += `<text x="${cx}" y="${H - 6}" text-anchor="middle" class="ax">S${p.number}</text>`;
    g += `<rect x="${padL + band * i}" y="${padT}" width="${band}" height="${plotH + padB}" fill="transparent" class="hit" data-tip="${esc(`Settimana ${p.number}: carico ${nf(p.load)} UA${p.rpeN ? ` · RPE medio ${nf(Math.round(p.rpe * 10) / 10)}` : ""}${p.mins ? ` · ${nf(p.mins)} min` : ""}`)}"/>`;
  });
  const withLoad = P.filter(p => p.load > 0), last = withLoad[withLoad.length - 1], prev = withLoad[withLoad.length - 2];
  const delta = last && prev ? Math.round((last.load / prev.load - 1) * 100) : null;
  const rpes = P.filter(p => p.rpeN), avgRpe = rpes.length ? rpes.reduce((a, p) => a + p.rpe * p.rpeN, 0) / rpes.reduce((a, p) => a + p.rpeN, 0) : 0;
  return `<section class="card glass chart-card" aria-label="Carico di allenamento">
    <div class="card-head"><div><h2>Carico e fatica</h2><small class="card-sub">Durata × RPE per settimana (unità arbitrarie)</small></div></div>
    <div class="chart" data-chart><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Carico settimanale">${g}</svg><div class="tip" hidden></div></div>
    <div class="mini-stats"><div><small>RPE medio</small><b>${avgRpe ? nf(Math.round(avgRpe * 10) / 10) : "—"}</b></div>
      <div><small>vs settimana prima</small><b>${delta === null ? "—" : (delta > 0 ? "+" : "") + delta + "%"}</b></div>
      <div><small>Sessioni registrate</small><b>${st.logged}</b></div></div>
  </section>`;
}

/* ---------- Analisi testuale ---------- */
export function insightsHTML(st, weeks) {
  const out = [];
  const A = st.active;
  if (!A.length) return "";
  const done = A.filter((p, i) => i < A.length - 1 || p.reqDone >= p.req);
  if (done.length >= 2) {
    const last2 = done.slice(-2), before = done.slice(0, -2);
    const r = arr => arr.reduce((a, p) => a + p.reqDone, 0) / Math.max(1, arr.reduce((a, p) => a + p.req, 0));
    if (before.length) {
      const d = Math.round((r(last2) - r(before)) * 100);
      if (d >= 10) out.push(["up", `Costanza in crescita: nelle ultime 2 settimane hai fatto il ${Math.round(r(last2) * 100)}% degli obbligatori (+${d} punti).`]);
      else if (d <= -10) out.push(["down", `Nelle ultime 2 settimane sei al ${Math.round(r(last2) * 100)}% degli obbligatori, ${-d} punti in meno di prima.`]);
    }
  }
  const skips = {};
  A.slice(0, -1).forEach(p => p.skipped.forEach(d => { skips[d] = (skips[d] || 0) + 1; }));
  const topSkip = Object.entries(skips).sort((a, b) => b[1] - a[1])[0];
  if (topSkip && topSkip[1] >= 2) out.push(["warn", `La disciplina che salti più spesso è ${DISC.find(d => d.id === topSkip[0]).label.toLowerCase()} (${topSkip[1]} volte).`]);
  const dates = Object.entries(st.days);
  if (dates.reduce((a, [, n]) => a + n, 0) >= 5) {
    const wd = Array(7).fill(0);
    dates.forEach(([k, n]) => { wd[parseDay(k).getDay()] += n; });
    const best = wd.indexOf(Math.max(...wd));
    out.push(["info", `Il giorno in cui ti alleni di più è il ${WD[best]}.`]);
  }
  const L = st.perWeek.filter(p => p.load > 0);
  if (L.length >= 4) {
    const last = L[L.length - 1], base = L.slice(-4, -1).reduce((a, p) => a + p.load, 0) / 3;
    const ratio = last.load / base;
    if (ratio > 1.3) out.push(["warn", `Carico della settimana ${last.number} oltre il 30% sopra la media delle tre precedenti: cura recupero e sonno.`]);
    else if (ratio < 0.7) out.push(["info", `Settimana ${last.number} più leggera del solito (${Math.round((1 - ratio) * 100)}% sotto la media): ok se era di scarico.`]);
  }
  const optDone = A.reduce((a, p) => a + p.opt, 0);
  if (optDone) out.push(["up", `Hai aggiunto ${optDone} session${optDone > 1 ? "i" : "e"} facoltativ${optDone > 1 ? "e" : "a"}.`]);
  if (st.streak >= 2) out.push(["up", `${st.streak} settimane di fila con tutti gli obbligatori completati.`]);
  if (!out.length) return "";
  return `<section class="card glass" aria-label="Analisi"><div class="card-head"><h2>Analisi</h2></div>
    <ul class="insights">${out.slice(0, 4).map(([k, t]) => `<li class="${k}"><i aria-hidden="true"></i><span>${esc(t)}</span></li>`).join("")}</ul></section>`;
}

/* Tooltip al tocco o al passaggio del mouse su colonne e celle. */
export function bindCharts(root) {
  root.querySelectorAll("[data-chart]").forEach(ch => {
    const tip = ch.querySelector(".tip");
    let active = null;
    const show = (el, ev) => {
      if (active) active.classList.remove("on");
      active = el; el.classList.add("on");
      tip.textContent = el.dataset.tip; tip.hidden = false;
      const box = ch.getBoundingClientRect(), r = el.getBoundingClientRect();
      const x = Math.min(Math.max(r.left + r.width / 2 - box.left, 8), box.width - 8);
      tip.style.left = x + "px";
      tip.style.top = Math.max(0, r.top - box.top - 8) + "px";
      tip.classList.toggle("left", x < box.width * 0.3); tip.classList.toggle("right", x > box.width * 0.7);
    };
    const hide = () => { tip.hidden = true; if (active) active.classList.remove("on"); active = null; };
    ch.addEventListener("pointerover", e => { const el = e.target.closest("[data-tip]"); if (el && e.pointerType === "mouse") show(el, e); });
    ch.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") hide(); });
    ch.addEventListener("click", e => { const el = e.target.closest("[data-tip]"); el ? show(el, e) : hide(); });
  });
}
