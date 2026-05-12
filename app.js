// piofant.github.io/curation/app.js
'use strict';

const DATA_URL = './data.json';
const FALLBACK_URL = './data.example.json';

const state = {
  raw: null,
  filtered: [],
  sort: { key: 'score', dir: 'desc' },
  filters: { channel: '', tertile: '', search: '' },
};

async function loadData() {
  try {
    const r = await fetch(DATA_URL, { cache: 'no-store' });
    if (!r.ok) throw new Error('no data.json');
    return await r.json();
  } catch {
    const r = await fetch(FALLBACK_URL);
    return await r.json();
  }
}

function fmtStats(s, generatedAt) {
  const dt = new Date(generatedAt);
  const when = dt.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' });
  return `Постов в очереди: ${s.total_items} · Источников: ${s.channels_count} · Avg score: ${s.avg_score.toFixed(2)} · Last update: ${when} МСК`;
}

function populateChannelFilter(items) {
  const sel = document.getElementById('filter-channel');
  const channels = [...new Set(items.map(i => i.channel))].sort();
  for (const c of channels) {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = '@' + c;
    sel.appendChild(opt);
  }
}

function applyFilters() {
  const { channel, tertile, search } = state.filters;
  const needle = search.trim().toLowerCase();
  state.filtered = state.raw.items.filter(it => {
    if (channel && it.channel !== channel) return false;
    if (tertile && it.tertile !== tertile) return false;
    if (!needle) return true;
    const hay = (it.channel + ' ' + it.text + ' ' + it.keyword).toLowerCase();
    return hay.includes(needle);
  });
  applySort();
  render();
}

function applySort() {
  const { key, dir } = state.sort;
  const mul = dir === 'asc' ? 1 : -1;
  state.filtered.sort((a, b) => {
    const av = readSortKey(a, key);
    const bv = readSortKey(b, key);
    if (av < bv) return -1 * mul;
    if (av > bv) return 1 * mul;
    return 0;
  });
}

function readSortKey(it, key) {
  if (key === 'channel') return it.channel + String(it.post_id).padStart(10, '0');
  if (['Q', 'F', 'R', 'V'].includes(key)) return it.components[key].norm;
  if (key === 'score') return it.score;
  if (key === 'tertile') return { top: 0, mid: 1, bot: 2 }[it.tertile];
  return it[key];
}

function render() {
  const body = document.getElementById('queue-body');
  body.innerHTML = '';
  for (const it of state.filtered) {
    const tr = document.createElement('tr');
    tr.className = 't-' + it.tertile;
    tr.dataset.id = it.id;
    tr.innerHTML = `
      <td class="t-marker">${({top:'🟢',mid:'🟡',bot:'🔴'})[it.tertile]}</td>
      <td><strong>@${it.channel}</strong> · ${it.post_id}</td>
      <td class="score">${it.score.toFixed(3)}</td>
      <td class="num" data-label="Q">${it.components.Q.norm.toFixed(2)}</td>
      <td class="num" data-label="F">${it.components.F.norm.toFixed(2)}</td>
      <td class="num" data-label="R">${it.components.R.norm.toFixed(2)}</td>
      <td class="num" data-label="V">${it.components.V.norm.toFixed(2)}</td>
      <td class="text-cell">${escapeHtml(it.text.slice(0, 120))}${it.text.length > 120 ? '…' : ''}</td>
      <td><a href="${it.link}" target="_blank" rel="noopener" aria-label="Открыть оригинал">↗</a></td>`;
    body.appendChild(tr);
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function renderDrilldown(it) {
  const c = it.components;
  return `
    <td colspan="9" class="drilldown">
      <div class="dd-grid">
        <section class="dd-text">
          <h3>Полный текст поста</h3>
          <p>${escapeHtml(it.text)}</p>
          <p class="reason"><strong>Почему попал в очередь:</strong> ${escapeHtml(it.reason)}</p>
        </section>
        <section class="dd-math">
          <h3>Разбор score</h3>
          <table class="math">
            <thead><tr><th>Компонент</th><th>Сырая</th><th>Норм.</th><th>× вес</th></tr></thead>
            <tbody>
              <tr><td>Q (качество)</td><td>${c.Q.raw}</td><td>${c.Q.norm}</td><td>${c.Q.weighted}</td></tr>
              <tr><td>F (пересылки)</td><td>${c.F.raw}</td><td>${c.F.norm}</td><td>${c.F.weighted}</td></tr>
              <tr><td>R (свежесть)</td><td>${c.R.raw_days_ago} дн.</td><td>${c.R.norm}</td><td>${c.R.weighted}</td></tr>
              <tr><td>V (просмотры)</td><td>${c.V.raw}</td><td>${c.V.norm}</td><td>${c.V.weighted}</td></tr>
              <tr class="total"><td colspan="3">Итого score</td><td>${it.score}</td></tr>
            </tbody>
          </table>
          <p class="tertile-label">→ <strong>${({top:'TOP',mid:'MID',bot:'BOT'})[it.tertile]}</strong> тертиль</p>
          <p><a href="${it.link}" target="_blank" rel="noopener">Открыть оригинальный пост ↗</a></p>
        </section>
      </div>
    </td>`;
}

function renderTertileDonut(items) {
  const counts = { top: 0, mid: 0, bot: 0 };
  for (const it of items) counts[it.tertile] = (counts[it.tertile] || 0) + 1;
  const total = items.length;
  const C = 2 * Math.PI * 32; // circumference
  function setSeg(id, n, offset) {
    const len = total > 0 ? (n / total) * C : 0;
    const el = document.querySelector('.' + id);
    if (el) {
      el.setAttribute('stroke-dasharray', `${len} ${C - len}`);
      el.setAttribute('stroke-dashoffset', -offset);
    }
  }
  const lenTop = total > 0 ? (counts.top / total) * C : 0;
  const lenMid = total > 0 ? (counts.mid / total) * C : 0;
  setSeg('seg-top', counts.top, 0);
  setSeg('seg-mid', counts.mid, lenTop);
  setSeg('seg-bot', counts.bot, lenTop + lenMid);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('donut-total', total);
  set('donut-top', counts.top);
  set('donut-mid', counts.mid);
  set('donut-bot', counts.bot);
}

function renderAlgoExample() {
  if (!state.raw.items.length) return;
  const top = state.raw.items.find(it => it.tertile === 'top') || state.raw.items[0];
  const c = top.components;
  document.getElementById('algo-example').innerHTML = `
    <p class="algo-example-label">Пример (top пост сейчас):</p>
    <p class="algo-example">
      <strong>@${top.channel}</strong> · post #${top.post_id} ·
      score = ${c.Q.weighted} + ${c.F.weighted} + ${c.R.weighted} + ${c.V.weighted} = <strong>${top.score}</strong> · 🟢
    </p>`;
}

function wireEvents() {
  document.getElementById('filter-channel').addEventListener('change', e => {
    state.filters.channel = e.target.value; applyFilters();
  });
  document.getElementById('filter-tertile').addEventListener('change', e => {
    state.filters.tertile = e.target.value; applyFilters();
  });
  let searchTimer;
  document.getElementById('filter-search').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.filters.search = e.target.value; applyFilters(); }, 200);
  });
  document.querySelectorAll('#queue-table thead th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (state.sort.key === k) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
      else state.sort = { key: k, dir: 'desc' };
      applyFilters();
    });
  });
}

function wireDrilldown() {
  document.getElementById('queue-body').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr || e.target.tagName === 'A') return;
    const id = tr.dataset.id;
    const next = tr.nextElementSibling;
    if (next && next.classList.contains('dd-row')) {
      next.remove();
      tr.classList.remove('expanded');
      return;
    }
    const it = state.filtered.find(x => x.id === id);
    if (!it) return;
    const ddRow = document.createElement('tr');
    ddRow.className = 'dd-row';
    ddRow.innerHTML = renderDrilldown(it);
    tr.insertAdjacentElement('afterend', ddRow);
    tr.classList.add('expanded');
  });
}

async function init() {
  state.raw = await loadData();
  document.getElementById('stats-text').textContent = fmtStats(state.raw.stats, state.raw.generated_at);
  populateChannelFilter(state.raw.items);
  renderAlgoExample();
  renderTertileDonut(state.raw.items);
  wireEvents();
  wireDrilldown();
  state.filtered = [...state.raw.items];
  applySort();
  render();
}

init();
