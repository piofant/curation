// piofant.github.io/curation/moderation/app.js
'use strict';

const DATA_URL = './data.json';
const FALLBACK_URL = './data.example.json';

async function loadData() {
  try {
    const r = await fetch(DATA_URL, { cache: 'no-store' });
    if (!r.ok) throw new Error('no data.json');
    return await r.json();
  } catch {
    try {
      const r = await fetch(FALLBACK_URL);
      if (!r.ok) throw new Error('no fallback');
      return await r.json();
    } catch {
      return null;
    }
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// Format a numeric value: integers stay integers, floats trimmed to 2 decimals.
function fmtNum(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!isFinite(n)) return escapeHtml(v);
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

function fmtInt(v) {
  if (v == null || v === '') return '0';
  const n = Number(v);
  if (!isFinite(n)) return '0';
  return String(Math.round(n));
}

function fmtAge(h) {
  if (h == null || h === '') return '—';
  const n = Number(h);
  if (!isFinite(n)) return '—';
  if (n < 24) return `${Math.round(n)} ч`;
  const d = Math.floor(n / 24);
  const rem = Math.round(n % 24);
  return rem > 0 ? `${d} д ${rem} ч` : `${d} д`;
}

function fmtWhen(iso) {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return escapeHtml(iso);
  return dt.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' });
}

// ─── Header stats bar ──────────────────────────────────────────
function renderHeaderStats(d) {
  const el = document.getElementById('stats-text');
  if (!d) { el.textContent = 'Нет данных'; return; }
  const mod = (d.moderator && d.moderator.stats) || {};
  const judge = (d.judge && d.judge.stats) || {};
  const parts = [];
  if (mod.evaluated != null) parts.push(`Проверено модератором: ${fmtInt(mod.evaluated)}`);
  if (mod.deleted_real != null) parts.push(`Удалено: ${fmtInt(mod.deleted_real)}`);
  if (judge.kept != null || judge.dropped != null) {
    parts.push(`Судья: ${fmtInt(judge.kept)} оставил / ${fmtInt(judge.dropped)} отклонил`);
  }
  parts.push(`Обновлено ${fmtWhen(d.generated_at)} МСК`);
  el.textContent = parts.join(' · ');
}

// ─── Mode badge (DRY-RUN / LIVE) ───────────────────────────────
function renderMode(mod) {
  const wrap = document.getElementById('mod-mode');
  const stats = (mod && mod.stats) || {};
  const isDry = !!stats.dry_run;
  wrap.innerHTML = isDry
    ? `<span class="mode-badge dry" title="Пометки к удалению не применяются, реальные удаления отключены">Режим DRY-RUN</span>`
    : `<span class="mode-badge live" title="Удаления применяются к каналу">Режим LIVE</span>`;
}

// ─── Moderator stat tiles ──────────────────────────────────────
function renderModStats(mod) {
  const mount = document.getElementById('mod-stats');
  const s = (mod && mod.stats) || null;
  if (!s) { mount.innerHTML = ''; return; }
  const tiles = [
    { cls: '', lbl: 'Проверено', val: fmtInt(s.evaluated), sub: '' },
    { cls: 't-del', lbl: 'Реклама → удаление', val: fmtInt(s.delete_ad), sub: `реально удалено: ${fmtInt(s.deleted_real)}` },
    { cls: 't-low', lbl: 'Низкий отклик', val: fmtInt(s.low_engagement), sub: '' },
    { cls: 't-kept', lbl: 'Оставлено', val: fmtInt(s.kept), sub: '' },
  ];
  let html = tiles.map(t => `
    <div class="stat-tile ${t.cls}">
      <span class="stat-lbl">${escapeHtml(t.lbl)}</span>
      <span class="stat-val">${t.val}</span>
      ${t.sub ? `<span class="stat-sub">${escapeHtml(t.sub)}</span>` : ''}
    </div>`).join('');
  // Secondary skip counts, only if present
  const skips = [];
  if (s.skip_human != null) skips.push(`пропущено (ручные): ${fmtInt(s.skip_human)}`);
  if (s.skip_fresh != null) skips.push(`пропущено (свежие): ${fmtInt(s.skip_fresh)}`);
  if (skips.length) {
    html += `<div class="stat-tile">
      <span class="stat-lbl">Пропуски</span>
      <span class="stat-sub" style="font-style:normal;margin-top:4px">${escapeHtml(skips.join(' · '))}</span>
    </div>`;
  }
  mount.innerHTML = html;
}

// ─── Judge stat tiles ──────────────────────────────────────────
function renderJudgeStats(judge) {
  const mount = document.getElementById('judge-stats');
  const s = (judge && judge.stats) || null;
  if (!s) { mount.innerHTML = ''; return; }
  mount.innerHTML = `
    <div class="stat-tile t-kept">
      <span class="stat-lbl">Оставлено</span>
      <span class="stat-val">${fmtInt(s.kept)}</span>
    </div>
    <div class="stat-tile t-drop">
      <span class="stat-lbl">Отклонено</span>
      <span class="stat-val">${fmtInt(s.dropped)}</span>
    </div>`;
}

// ─── Verdict badge ─────────────────────────────────────────────
const VERDICT_LABELS = {
  delete_ad: 'реклама',
  low_engagement: 'низкий отклик',
  kept: 'оставлен',
  skip_human: 'пропуск (ручной)',
  skip_fresh: 'пропуск (свежий)',
};
function verdictBadge(v) {
  const known = ['delete_ad', 'low_engagement', 'kept', 'skip_human', 'skip_fresh'];
  const cls = known.includes(v) ? v : 'other';
  const label = VERDICT_LABELS[v] || (v ? escapeHtml(v) : '—');
  return `<span class="verdict ${cls}">${label}</span>`;
}

// ─── Judge sub-cell inside moderation table ────────────────────
function judgeCell(j) {
  if (!j) return `<span class="judge-none">судья не вызывался</span>`;
  const flags = Array.isArray(j.flags) ? j.flags : [];
  const flagsHtml = flags.length
    ? `<div class="flags">${flags.map(f => `<span class="flag-chip">${escapeHtml(f)}</span>`).join('')}</div>`
    : '';
  return `
    <div class="judge-cell">
      <div class="judge-scores">
        <span class="jscore u" title="Полезность">польза <b>${fmtNum(j.usefulness)}</b></span>
        <span class="jscore h" title="Хайп/кликбейт">хайп <b>${fmtNum(j.hype)}</b></span>
      </div>
      ${flagsHtml}
      ${j.reason ? `<div class="judge-reason">${escapeHtml(j.reason)}</div>` : ''}
    </div>`;
}

// ─── Engagement sub-cell ───────────────────────────────────────
function engagementCell(e) {
  if (!e) return `<span class="judge-none">—</span>`;
  let ratioHtml = '';
  if (e.ratio != null && isFinite(Number(e.ratio))) {
    const r = Number(e.ratio);
    const cls = r >= 1 ? 'high' : (r >= 0.5 ? 'mid' : 'low');
    ratioHtml = `<span class="eng-ratio ${cls}" title="Отношение к медиане канала">×${fmtNum(r)} к медиане</span>`;
  }
  return `
    <div class="eng-cell">
      <div class="eng-metrics">
        <span><i>👁</i> ${fmtInt(e.views)}</span>
        <span><i>↗</i> ${fmtInt(e.forwards)}</span>
        <span><i>❤</i> ${fmtInt(e.reactions)}</span>
      </div>
      ${ratioHtml}
    </div>`;
}

// ─── Moderation table ──────────────────────────────────────────
function renderModTable(mod) {
  const body = document.getElementById('mod-body');
  const decisions = (mod && Array.isArray(mod.decisions)) ? mod.decisions.slice() : [];
  if (!decisions.length) {
    body.innerHTML = `<tr><td class="mod-empty" colspan="7">Нет данных</td></tr>`;
    return;
  }
  // freshest first: sort by ts desc (fallback to date)
  decisions.sort((a, b) => {
    const ta = new Date(a.ts || a.date || 0).getTime() || 0;
    const tb = new Date(b.ts || b.date || 0).getTime() || 0;
    return tb - ta;
  });
  body.innerHTML = decisions.map(it => {
    const id = it.id != null ? it.id : '';
    const href = it.link || (id !== '' ? `https://t.me/kompege/${id}` : '#');
    const linkText = id !== '' ? `t.me/kompege/${id}` : (it.link ? escapeHtml(it.link) : '—');
    const src = (it.source || '').toLowerCase();
    const srcCls = src === 'poster' ? 'poster' : (src === 'mirror' ? 'mirror' : '');
    const deleted = !!it.deleted;
    return `
      <tr>
        <td class="mod-link"><a href="${escapeHtml(href)}" target="_blank" rel="noopener">${linkText}</a></td>
        <td><span class="src-pill ${srcCls}">${escapeHtml(it.source || '—')}</span></td>
        <td class="mod-age">${fmtAge(it.age_h)}</td>
        <td>${judgeCell(it.judge)}</td>
        <td>${engagementCell(it.engagement)}</td>
        <td>${verdictBadge(it.verdict)}</td>
        <td class="mod-deleted ${deleted ? 'yes' : 'no'}" title="${deleted ? 'удалён' : (it.dry_run ? 'dry-run: не удалялся' : 'оставлен')}">${deleted ? '✓' : '—'}</td>
      </tr>`;
  }).join('');
}

// ─── Judge input table ─────────────────────────────────────────
function actionBadge(a) {
  const v = (a || '').toLowerCase();
  const cls = v === 'kept' ? 'kept' : (v === 'dropped' ? 'dropped' : 'other');
  const label = v === 'kept' ? 'оставлен' : (v === 'dropped' ? 'отклонён' : (a ? escapeHtml(a) : '—'));
  return `<span class="action ${cls}">${label}</span>`;
}

function renderJudgeTable(judge) {
  const body = document.getElementById('judge-body');
  const decisions = (judge && Array.isArray(judge.decisions)) ? judge.decisions.slice() : [];
  if (!decisions.length) {
    body.innerHTML = `<tr><td class="mod-empty" colspan="6">Нет данных</td></tr>`;
    return;
  }
  decisions.sort((a, b) => {
    const ta = new Date(a.ts || 0).getTime() || 0;
    const tb = new Date(b.ts || 0).getTime() || 0;
    return tb - ta;
  });
  body.innerHTML = decisions.map(it => {
    const flags = Array.isArray(it.flags) ? it.flags : [];
    const flagsHtml = flags.length
      ? `<div class="flags">${flags.map(f => `<span class="flag-chip">${escapeHtml(f)}</span>`).join('')}</div>`
      : `<span class="flags-none">—</span>`;
    const channel = it.channel ? `@${escapeHtml(it.channel)}` : '—';
    const postId = it.post_id != null ? ` · ${escapeHtml(it.post_id)}` : '';
    return `
      <tr>
        <td class="j-channel">${channel}${postId}</td>
        <td class="j-num">${fmtNum(it.usefulness)}</td>
        <td class="j-num">${fmtNum(it.hype)}</td>
        <td>${flagsHtml}</td>
        <td class="j-reason">${it.reason ? escapeHtml(it.reason) : '—'}</td>
        <td>${actionBadge(it.action)}</td>
      </tr>`;
  }).join('');
}

// ─── Init ──────────────────────────────────────────────────────
async function init() {
  const d = await loadData();
  renderHeaderStats(d);
  const mod = d && d.moderator ? d.moderator : null;
  const judge = d && d.judge ? d.judge : null;
  renderMode(mod);
  renderModStats(mod);
  renderModTable(mod);
  renderJudgeStats(judge);
  renderJudgeTable(judge);
}

init().catch(e => {
  const el = document.getElementById('stats-text');
  if (el) el.textContent = 'Ошибка загрузки данных: ' + e;
  const mb = document.getElementById('mod-body');
  if (mb) mb.innerHTML = `<tr><td class="mod-empty" colspan="7">Нет данных</td></tr>`;
  const jb = document.getElementById('judge-body');
  if (jb) jb.innerHTML = `<tr><td class="mod-empty" colspan="6">Нет данных</td></tr>`;
});
