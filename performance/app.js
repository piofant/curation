'use strict';

const DATA_URL = './data.json';

async function load() {
  const r = await fetch(DATA_URL, { cache: 'no-store' });
  return r.json();
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function renderStats(d) {
  const dt = new Date(d.generated_at);
  const when = dt.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' });
  document.getElementById('stats-text').textContent =
    `${d.total_posts} опубликованных постов · средний ERR ${d.overall.mean_err}% · медиана ${d.overall.median_err}% · обновлено ${when} МСК`;
  document.getElementById('date-range').textContent = `${d.date_range.min} – ${d.date_range.max}`;
}

function renderChannels(rows) {
  const max = Math.max(...rows.map(r => r.mean_err));
  const html = rows.map(r => {
    const pct = (r.mean_err / max * 100).toFixed(0);
    const platCls = r.platform === 'telegram' ? 'tg' : r.platform === 'vk' ? 'vk' : '';
    return `<div class="hbar-row">
      <div class="hbar-label">@${escapeHtml(r.channel)}</div>
      <div class="hbar-track"><div class="hbar-fill ${platCls}" style="width:${pct}%"></div></div>
      <div class="hbar-value">${r.mean_err}%</div>
      <div class="hbar-meta">n=${r.posts}</div>
    </div>`;
  }).join('');
  document.getElementById('chart-channels').innerHTML = html;
}

function renderVerticalBars(rows, mountId, opts) {
  const o = opts || {};
  const valueKey = o.valueKey || 'mean_err';
  const labelKey = o.labelKey || 'day';
  const max = Math.max(...rows.map(r => r[valueKey]));
  const html = rows.map(r => {
    const h = max > 0 ? Math.max((r[valueKey] / max * 100), 2) : 2;
    const n = r.n != null ? r.n : null;
    const weak = n != null && n < (o.weakThreshold || 3);
    const showValue = !o.hideValue && r[valueKey] > 0;
    return `<div class="vbar" title="${escapeHtml(String(r[labelKey]))}: ${r[valueKey]}${o.suffix||''}${n!=null?` (n=${n})`:''}">
      ${showValue ? `<div class="vbar-value">${r[valueKey]}${o.shortSuffix||''}</div>` : ''}
      <div class="vbar-fill ${weak ? 'weak' : ''}" style="height:${h}%"></div>
      <div class="vbar-label">${escapeHtml(String(r[labelKey]))}</div>
    </div>`;
  }).join('');
  document.getElementById(mountId).innerHTML = html;
}

function renderCompare(rows, mountId, opts) {
  const o = opts || {};
  const labelKey = o.labelKey || 'platform';
  const max = Math.max(...rows.map(r => r.mean_err));
  const html = `<div class="compare-rows">` + rows.map(r => {
    const pct = max > 0 ? (r.mean_err / max * 100).toFixed(0) : 0;
    return `<div class="compare-row">
      <div class="lbl">${escapeHtml(String(r[labelKey]))} <small style="color:#888">(n=${r.posts})</small></div>
      <div class="bar"><div style="width:${pct}%"></div></div>
      <div class="val">${r.mean_err}%</div>
    </div>`;
  }).join('') + `</div>`;
  document.getElementById(mountId).innerHTML = html;
}

function renderTopForwarded(rows) {
  const html = rows.map(r => `
    <div class="tf-row">
      <div class="tf-date">${escapeHtml(r.date)}</div>
      <div class="tf-source">@${escapeHtml(r.source)}</div>
      <div class="tf-num">${r.forwards}↗</div>
      <div class="tf-num">${r.err}%</div>
      <div class="tf-text">${escapeHtml(r.text)}…</div>
      <a href="${escapeHtml(r.link)}" target="_blank" rel="noopener" aria-label="Открыть пост">↗</a>
    </div>`).join('');
  document.getElementById('top-forwarded').innerHTML = html;
}

async function init() {
  const d = await load();
  renderStats(d);
  renderChannels(d.top_channels);
  renderVerticalBars(d.by_day_of_week, 'chart-dow', { labelKey: 'day', shortSuffix: '%' });
  renderVerticalBars(d.by_hour, 'chart-hour', { labelKey: 'hour', shortSuffix: '%', weakThreshold: 3 });
  renderCompare(d.by_platform, 'chart-platform', { labelKey: 'platform' });
  renderCompare(d.by_text_length, 'chart-length', { labelKey: 'length' });
  renderVerticalBars(d.err_histogram, 'chart-histogram', { labelKey: 'bin', valueKey: 'n', hideValue: false, shortSuffix: '' });
  renderTopForwarded(d.top_forwarded);
}

init().catch(e => {
  document.getElementById('stats-text').textContent = 'Ошибка загрузки данных: ' + e;
});
