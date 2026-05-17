/* /curation/demo/app.js — wizard state machine */

const STAGE_DURATION = 10000;       // ms desktop
const MOBILE_STAGE_DURATION = 15000; // ms mobile
const TOTAL_STAGES = 8;

const state = {
  stage: 1,
  autoplay: false,
  intervalId: null,
};

// Fallback data — used if data.json fetch fails
const FALLBACK_KDRSHOV = {
  channel: "kdrshov",
  post_id: 3549,
  score: 0.6322,
  text: "ШПОРА ПО 2 НОМЕРУ\n\nсамое главное во 2 номере правильно математический символ представить в Python — для этого вам прикрепил картинку, чтобы в любой момент могли глянуть\n\nВАЖНО! при соотнесении проверяйте, чтобы буквы подходили для всех строк, а не только для одной",
  link: "https://t.me/kdrshov/3549",
  date: "2026-03-14T11:34:01+00:00",
  keyword: "ЕГЭ",
  components: {
    Q: { raw: 0.48, norm: 0.64,   weighted: 0.256 },
    F: { raw: 14,   norm: 0.0886, weighted: 0.0266 },
    R: { raw_days_ago: 0, norm: 1.0, weighted: 0.2 },
    V: { raw: 1025, norm: 0.0973, weighted: 0.0097 },
  },
};

const FALLBACK_STATS = { total: 131, top: 43, mid: 44, bot: 44 };
const FALLBACK_TOP_CHANNELS = [
  { channel: "infa_vikusya", mean_err: 27.08 },
  { channel: "flash_ege",    mean_err: 26.77 },
  { channel: "kdrshov",      mean_err: 20.22 },
  { channel: "vk_205865487", mean_err: 15.54 },
  { channel: "korshunov_school", mean_err: 14.44 },
];

let dataLoaded = false;

// ---------- DOM helpers ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function isMobile() { return window.matchMedia("(max-width: 640px)").matches; }
function prefersReducedMotion() { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }

// ---------- Rendering ----------
function render() {
  // stages
  $$(".stage").forEach((s) => {
    const n = Number(s.dataset.stage);
    s.classList.toggle("active", n === state.stage);
  });
  // progress
  $$(".progress-seg").forEach((seg) => {
    const n = Number(seg.dataset.seg);
    seg.classList.remove("done", "current");
    if (n < state.stage) seg.classList.add("done");
    else if (n === state.stage) seg.classList.add("current");
  });
  $(".progress").setAttribute("aria-valuenow", String(state.stage));
  $("#stage-counter").textContent = `${state.stage} / ${TOTAL_STAGES}`;

  // buttons
  $("#btn-prev").disabled = state.stage === 1;
  $("#btn-next").disabled = state.stage === TOTAL_STAGES;

  // play button visual
  $("#btn-play").classList.toggle("on", state.autoplay);
  $("#btn-play-icon").textContent = state.autoplay ? "⏸" : "▶";
  $("#btn-play-label").textContent = state.autoplay ? "Пауза" : "Авто";

  // stage-specific entry animations
  if (state.stage === 3) animateQbreakRows();
  if (state.stage === 4) animateFormulaRows();
  if (state.stage === 1) ensureFunnelDots();
  if (state.stage === 6) animateLifecycle();
  if (state.stage === 7) animateWeightsRows();
}

function animateWeightsRows() {
  const rows = $$(".weights-table tbody tr");
  if (prefersReducedMotion()) {
    rows.forEach((r) => r.classList.add("shown"));
    return;
  }
  rows.forEach((r) => r.classList.remove("shown"));
  rows.forEach((r, i) => {
    setTimeout(() => r.classList.add("shown"), 100 + i * 150);
  });
}

function animateQbreakRows() {
  const rows = $$("#qbreak-table tbody tr");
  if (prefersReducedMotion()) {
    rows.forEach((r) => r.classList.add("shown"));
    return;
  }
  rows.forEach((r) => r.classList.remove("shown"));
  rows.forEach((r, i) => {
    setTimeout(() => r.classList.add("shown"), 100 + i * 150);
  });
}

function goto(n) {
  if (n < 1) n = 1;
  if (n > TOTAL_STAGES) n = TOTAL_STAGES;
  state.stage = n;
  render();
}

function next() {
  if (state.stage < TOTAL_STAGES) {
    goto(state.stage + 1);
  } else if (state.autoplay) {
    stopAutoplay();
  }
}

function prev() {
  if (state.stage > 1) goto(state.stage - 1);
}

// ---------- Autoplay ----------
function startAutoplay() {
  state.autoplay = true;
  scheduleNextTick();
  render();
}

function stopAutoplay() {
  state.autoplay = false;
  if (state.intervalId) {
    clearTimeout(state.intervalId);
    state.intervalId = null;
  }
  render();
}

function scheduleNextTick() {
  if (state.intervalId) clearTimeout(state.intervalId);
  const dur = isMobile() ? MOBILE_STAGE_DURATION : STAGE_DURATION;
  state.intervalId = setTimeout(() => {
    if (!state.autoplay) return;
    if (state.stage < TOTAL_STAGES) {
      next();
      scheduleNextTick();
    } else {
      stopAutoplay();
    }
  }, dur);
}

function toggleAutoplay() {
  if (state.autoplay) stopAutoplay();
  else startAutoplay();
}

// ---------- Stage 1: funnel dots ----------
let funnelDotsBuilt = false;
function ensureFunnelDots() {
  if (funnelDotsBuilt) return;
  const ch = $("#dots-channels");
  const cd = $("#dots-candidates");
  if (!ch || !cd) return;
  ch.innerHTML = "";
  for (let i = 0; i < 23; i++) {
    const d = document.createElement("div");
    d.className = "dot";
    d.style.animationDelay = (i * 25) + "ms";
    ch.appendChild(d);
  }
  cd.innerHTML = "";
  for (let i = 0; i < 50; i++) {
    const d = document.createElement("div");
    d.className = "dot";
    d.style.animationDelay = (300 + i * 15) + "ms";
    cd.appendChild(d);
  }
  funnelDotsBuilt = true;
}

// ---------- Stage 2: candidate text ----------
function renderCandidate(item) {
  const text = (item.text || "").slice(0, 280);
  $("#candidate-text").textContent = text + (item.text && item.text.length > 280 ? "…" : "");
  $("#meta-postid").textContent = String(item.post_id || 3549);
  $("#meta-views").textContent = String(item.components?.V?.raw ?? 1025);
  $("#meta-forwards").textContent = String(item.components?.F?.raw ?? 14);
  $("#meta-days").textContent = String(item.components?.R?.raw_days_ago ?? 0);
  $("#meta-quality").textContent = String(item.components?.Q?.raw ?? 0.48);
  if (item.date) {
    const d = new Date(item.date);
    $("#meta-date").textContent = d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  if (item.keyword) $("#meta-keyword").textContent = item.keyword;
  if (item.link) {
    const a = $("#meta-link");
    a.href = item.link;
    a.textContent = item.link.replace(/^https?:\/\//, "") + " ↗";
  }
}

// ---------- Stage 3: formula rows ----------
function buildFormulaRows(item) {
  const c = item.components || FALLBACK_KDRSHOV.components;
  const fmt = (n, p = 3) => Number(n).toFixed(p);
  const rows = [
    { name: "Q (качество)",   raw: fmt(c.Q.raw, 2),         norm: fmt(c.Q.norm, 3), weight: 0.40, weighted: fmt(c.Q.weighted, 3) },
    { name: "F (пересылки)",  raw: String(c.F.raw),         norm: fmt(c.F.norm, 3), weight: 0.30, weighted: fmt(c.F.weighted, 4) },
    { name: "R (свежесть)",   raw: c.R.raw_days_ago + " дн.", norm: fmt(c.R.norm, 3), weight: 0.20, weighted: fmt(c.R.weighted, 3) },
    { name: "V (просмотры)",  raw: String(c.V.raw),         norm: fmt(c.V.norm, 3), weight: 0.10, weighted: fmt(c.V.weighted, 4) },
  ];
  const total = rows.reduce((s, r) => s + Number(r.weighted), 0);
  const tbody = $("#formula-tbody");
  tbody.innerHTML = "";
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.name}</td><td>${r.raw}</td><td>${r.norm}</td><td>${r.weighted} <small style="color:#888">(× ${r.weight.toFixed(2)})</small></td>`;
    tbody.appendChild(tr);
  });
  const trTotal = document.createElement("tr");
  trTotal.className = "total";
  trTotal.innerHTML = `<td>Итого score</td><td></td><td></td><td>${total.toFixed(3)}</td>`;
  tbody.appendChild(trTotal);
}

function animateFormulaRows() {
  const rows = $$("#formula-tbody tr");
  if (prefersReducedMotion()) {
    rows.forEach((r) => r.classList.add("shown"));
    return;
  }
  rows.forEach((r) => r.classList.remove("shown"));
  rows.forEach((r, i) => {
    setTimeout(() => r.classList.add("shown"), 100 + i * 200);
  });
}

// ---------- Stage 4: tertile vis ----------
function buildTertileVis(stats) {
  const wrap = $("#tertile-vis");
  if (!wrap) return;
  wrap.innerHTML = "";
  const { top, mid, bot, total } = stats;
  const rest = mid + bot;
  $("#t4-total").textContent = String(total);
  $("#t4-top").textContent = String(top);
  $("#lg-top").textContent = String(top);
  const lr = $("#lg-rest"); if (lr) lr.textContent = String(rest);
  // Two groups only: published (top third, green) vs not passed (rest, grey)
  for (let i = 0; i < top; i++) {
    const c = document.createElement("div");
    c.className = "cell t-top" + (i === 0 ? " highlight" : "");
    c.title = i === 0 ? "@kdrshov #3549 — score 0.632 — №1, в публикацию" : "в публикацию";
    wrap.appendChild(c);
  }
  for (let i = 0; i < rest; i++) {
    const c = document.createElement("div");
    c.className = "cell t-bot";
    c.title = "не прошло порог";
    wrap.appendChild(c);
  }
}

// ---------- Stage 5: perf chart ----------
function buildPerfChart(channels) {
  const wrap = $("#perf-chart");
  if (!wrap) return;
  wrap.innerHTML = "";
  const max = Math.max(...channels.map((c) => c.mean_err));
  channels.slice(0, 5).forEach((c) => {
    const row = document.createElement("div");
    row.className = "perf-row";
    const isKd = c.channel === "kdrshov";
    row.innerHTML = `
      <div class="label ${isKd ? "hl" : ""}">@${c.channel}</div>
      <div class="track"><div class="fill" style="--w:${(c.mean_err / max).toFixed(3)}"></div></div>
      <div class="val">${c.mean_err.toFixed(1)}%</div>
    `;
    wrap.appendChild(row);
  });
}

// ---------- Data loading ----------
async function loadData() {
  let item = FALLBACK_KDRSHOV;
  let stats = FALLBACK_STATS;
  let topChannels = FALLBACK_TOP_CHANNELS;

  try {
    const r = await fetch("../data.json");
    if (r.ok) {
      const d = await r.json();
      const found = (d.items || []).find((it) => it.channel === "kdrshov" && String(it.post_id) === "3549");
      if (found) item = found;
      // tertile counts
      if (d.items && d.items.length) {
        stats = { total: d.items.length, top: 0, mid: 0, bot: 0 };
        d.items.forEach((it) => { if (stats[it.tertile] !== undefined) stats[it.tertile]++; });
      }
    }
  } catch (e) { /* fallback */ }

  try {
    const r = await fetch("../performance/data.json");
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d.top_channels) && d.top_channels.length) {
        topChannels = d.top_channels;
      }
    }
  } catch (e) { /* fallback */ }

  renderCandidate(item);
  buildFormulaRows(item);
  buildTertileVis(stats);
  buildPerfChart(topChannels);
  dataLoaded = true;
  // re-render in case we're already on stage 4 etc.
  if (state.stage === 4) animateFormulaRows();
}

// ---------- Stage 6: lifecycle animation ----------
function animateLifecycle() {
  const rows = $$(".lifecycle-fill");
  if (prefersReducedMotion()) {
    rows.forEach((r) => r.classList.add("shown"));
    return;
  }
  rows.forEach((r) => r.classList.remove("shown"));
  rows.forEach((r, i) => {
    setTimeout(() => r.classList.add("shown"), 200 + i * 400);
  });
}

// ---------- Input handlers ----------
function bindEvents() {
  $("#btn-prev").addEventListener("click", () => { stopAutoplay(); prev(); });
  $("#btn-next").addEventListener("click", () => { stopAutoplay(); next(); });
  $("#btn-play").addEventListener("click", () => { toggleAutoplay(); });
  $("#btn-stop").addEventListener("click", () => { stopAutoplay(); goto(1); });

  document.addEventListener("keydown", (e) => {
    // Ignore key events when typing in inputs (none here, but safe)
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (e.key === "ArrowLeft")  { e.preventDefault(); stopAutoplay(); prev(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); stopAutoplay(); next(); }
    else if (e.key === " ")     { e.preventDefault(); toggleAutoplay(); }
    else if (e.key === "Escape"){ e.preventDefault(); stopAutoplay(); }
  });

  // Touch swipe
  let touchX = null, touchY = null;
  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchX;
    const dy = t.clientY - touchY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      stopAutoplay();
      if (dx < 0) next();
      else prev();
    }
    touchX = null;
    touchY = null;
  }, { passive: true });
}

// ---------- Init ----------
function init() {
  bindEvents();
  render();
  loadData();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
