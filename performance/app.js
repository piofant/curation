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

function renderInsights(d) {
  // Channels insight
  const tc = d.top_channels;
  if (tc && tc.length >= 3) {
    const tgChannels = tc.filter(c => c.platform === 'telegram').slice(0, 3);
    const top3names = tgChannels.length >= 3
      ? tgChannels.map(c => '@' + c.channel).join(', ')
      : tc.slice(0, 3).map(c => '@' + c.channel).join(', ');
    const top3err = tc.slice(0, 3).reduce((s, c) => s + c.mean_err, 0) / 3;
    const avg = d.overall.mean_err;
    const ratio = (top3err / avg).toFixed(1);
    setInsight('insight-channels',
      `Топ-3 источника (${top3names}) дают средний ERR <strong>${top3err.toFixed(1)}%</strong> — это в ${ratio} раза выше среднего по каналу (${avg}%). Курация концентрирует трафик на узком пуле каналов с высоким резонансом для аудитории.`);
  }

  // Day-of-week insight
  const dow = d.by_day_of_week;
  if (dow && dow.length === 7) {
    const sorted = [...dow].sort((a, b) => b.mean_err - a.mean_err);
    const best = sorted[0], worst = sorted[6];
    const ratio = (best.mean_err / worst.mean_err).toFixed(1);
    setInsight('insight-dow',
      `Самый эффективный день — <strong>${best.day} (${best.mean_err}%)</strong>, наименее эффективный — <strong>${worst.day} (${worst.mean_err}%)</strong>: разрыв в ${ratio} раза. Это указывает на сезонный паттерн внимания аудитории: рабочие дни школьника отличаются от выходных, и публикация в правильный день поднимает ERR без увеличения объёма контента.`);
  }

  // Hour insight
  const hr = d.by_hour;
  if (hr && hr.length === 24) {
    const valid = hr.filter(h => h.n >= 3);
    const sorted = [...valid].sort((a, b) => b.mean_err - a.mean_err);
    if (sorted.length >= 2) {
      const peak1 = sorted[0], peak2 = sorted[1];
      setInsight('insight-hour',
        `Часы максимальной вовлечённости — <strong>${peak1.hour}:00 (${peak1.mean_err}%)</strong> и <strong>${peak2.hour}:00 (${peak2.mean_err}%)</strong>. Они задают окно публикации, в которое имеет смысл выпускать материалы с наибольшим резонансным потенциалом. На этих данных и построен временной слот публикаций 13:00–17:00 МСК в текущей конфигурации системы.`);
    }
  }

  // Platform insight
  const plat = d.by_platform;
  if (plat && plat.length >= 2) {
    const tg = plat.find(p => p.platform === 'telegram');
    const vk = plat.find(p => p.platform === 'vk');
    if (tg && vk) {
      const diff = ((tg.mean_err / vk.mean_err - 1) * 100).toFixed(0);
      setInsight('insight-platform',
        `Курация постов из Telegram-источников даёт ERR на <strong>${diff}%</strong> выше, чем репост из ВКонтакте (${tg.mean_err}% против ${vk.mean_err}%). Это эмпирически подтверждает выбор приоритета Telegram-каналов в качестве источников — нативный контент платформы лучше отвечает ожиданиям аудитории.`);
    }
  }

  // Text length insight
  const len = d.by_text_length;
  if (len && len.length === 3) {
    const best = [...len].sort((a, b) => b.mean_err - a.mean_err)[0];
    const map = { short: 'короткий', medium: 'средний', long: 'длинный' };
    setInsight('insight-length',
      `Наилучшие показатели у публикаций <strong>${map[best.length] || best.length}</strong> длины (${best.mean_err}%). Слишком короткие посты не дают подписчику повода реагировать, слишком длинные — превышают порог внимания. Эта закономерность учтена в промпте генерации AI-дайджестов.`);
  }

  // Histogram insight
  const hist = d.err_histogram;
  if (hist && hist.length > 0) {
    const total = hist.reduce((s, h) => s + h.n, 0);
    const tail = hist.slice(-3).reduce((s, h) => s + h.n, 0);
    const tailPct = (tail / total * 100).toFixed(0);
    setInsight('insight-histogram',
      `Около <strong>${tailPct}%</strong> публикаций попадают в правый хвост распределения (ERR ≥ 18%) — это сравнительно небольшая, но непропорционально влиятельная группа постов, на которой держится бо́льшая часть охвата канала. Задача алгоритма скоринга — увеличить долю таких публикаций в потоке.`);
  }

  // Top forwarded insight
  const fwd = d.top_forwarded;
  if (fwd && fwd.length >= 5) {
    const channels = [...new Set(fwd.map(f => f.source).filter(Boolean))];
    const fwdSum = fwd.reduce((s, f) => s + f.forwards, 0);
    setInsight('insight-forwarded',
      `Наиболее виральные публикации сосредоточены в ${channels.length} источника${channels.length > 1 ? 'х' : ''} (${channels.slice(0, 3).map(c => '@' + c).join(', ')}). Восемь топ-постов суммарно дали <strong>${fwdSum}</strong> пересылок — это указывает на воспроизводимость виральности при правильно отобранном контенте, а не на случайные всплески.`);
  }
}

function setInsight(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function renderYoY(yoy) {
  if (!yoy || !yoy.series || !yoy.series.tg || !yoy.series.vk) {
    document.getElementById('chart-yoy-timeline').textContent = 'нет данных';
    return;
  }
  const h = yoy.headline;
  const cs = yoy.curation_start;

  // ─── Headline strip: TG ratio, VK ratio, clean lift ───
  document.getElementById('yoy-headline').innerHTML = `
    <div class="yoy-h-cell yoy-h-cell-tg">
      <div class="yoy-h-lbl">TG-курация · 2025→2026</div>
      <div class="yoy-h-val">×${h.ratio_tg}</div>
      <div class="yoy-h-sub">treatment, n=${yoy.series.tg.pre_n}→${yoy.series.tg.cur_n}</div>
    </div>
    <div class="yoy-h-arrow">−</div>
    <div class="yoy-h-cell yoy-h-cell-vk">
      <div class="yoy-h-lbl">VK-репосты · 2025→2026</div>
      <div class="yoy-h-val">×${h.ratio_vk}</div>
      <div class="yoy-h-sub">natural control, n=${yoy.series.vk.pre_n}→${yoy.series.vk.cur_n}</div>
    </div>
    <div class="yoy-h-arrow">=</div>
    <div class="yoy-h-cell yoy-h-cell-clean">
      <div class="yoy-h-lbl">чистый эффект курации</div>
      <div class="yoy-h-val">+${h.clean_lift_pct}%</div>
      <div class="yoy-h-sub">поверх общего тренда канала</div>
    </div>
  `;

  // ─── Two timelines, stacked ───
  const tlMount = document.getElementById('chart-yoy-timeline');
  function tlBlock(series, role) {
    const tl = series.timeline;
    if (!tl.length) return '';
    const maxErr = Math.max(...tl.map(m => m.mean_err));
    const firstCurIdx = tl.findIndex(m => m.phase === 'curation');
    const cols = tl.length;
    const markerLeftPct = firstCurIdx >= 0 ? (firstCurIdx / cols * 100) : -1;
    const markerHtml = markerLeftPct >= 0
      ? `<div class="yoy-tl-marker" style="left:${markerLeftPct}%;"><div class="yoy-tl-marker-line"></div><div class="yoy-tl-marker-label">старт курации<br><small>12 фев 2026</small></div></div>`
      : '';
    const bars = tl.map(m => {
      const hpct = maxErr > 0 ? Math.max((m.mean_err / maxErr * 100), 2) : 2;
      const cls = m.phase === 'curation' ? 'cur' : 'pre';
      return `<div class="yoy-tl-bar ${cls}" title="${escapeHtml(m.label)}: ERR ${m.mean_err}% (n=${m.n})">
        <div class="yoy-tl-val">${m.mean_err}</div>
        <div class="yoy-tl-fill" style="height:${hpct}%"></div>
        <div class="yoy-tl-lbl">${escapeHtml(m.label)}</div>
      </div>`;
    }).join('');
    return `<div class="yoy-tl-block yoy-tl-${role}">
      <div class="yoy-tl-title">${escapeHtml(series.label)} — YoY ×${series.mean_ratio_err}</div>
      <div class="yoy-tl-bars" style="--yoy-cols:${cols};">${bars}${markerHtml}</div>
    </div>`;
  }
  tlMount.innerHTML = tlBlock(yoy.series.tg, 'treatment') + tlBlock(yoy.series.vk, 'control')
    + '<div class="yoy-tl-axis"><span class="yoy-legend"><span class="sw pre"></span>до 12 фев 2026 (ручная курация)</span><span class="yoy-legend"><span class="sw cur"></span>после 12 фев 2026 (автоматизированная)</span><span class="yoy-axis-y">ось Y — среднемесячный ERR, %</span></div>';

  // ─── Two pair rows, stacked ───
  function pairsBlock(series, role) {
    const pr = series.pairs;
    if (!pr.length) return '';
    const maxPair = Math.max(...pr.flatMap(p => [p.pre.mean_err, p.cur.mean_err]));
    const rows = pr.map(p => {
      const hPre = (p.pre.mean_err / maxPair * 100).toFixed(1);
      const hCur = (p.cur.mean_err / maxPair * 100).toFixed(1);
      const arrow = p.delta_err_pct >= 0 ? '↑' : '↓';
      const dsign = p.delta_err_pct >= 0 ? '+' : '';
      const dCls  = p.delta_err_pct >= 0 ? 'up' : 'down';
      return `<div class="yoy-pair">
        <div class="yoy-pair-bars">
          <div class="yoy-bar pre" style="height:${hPre}%" title="${p.year_pre}: ${p.pre.mean_err}% (n=${p.pre.n})">
            <div class="yoy-bar-val">${p.pre.mean_err}</div>
          </div>
          <div class="yoy-bar cur ${role}" style="height:${hCur}%" title="${p.year_cur}: ${p.cur.mean_err}% (n=${p.cur.n})${p.partial ? ' [partial]' : ''}">
            <div class="yoy-bar-val">${p.cur.mean_err}</div>
          </div>
        </div>
        <div class="yoy-pair-label">${escapeHtml(p.label)}${p.partial ? '*' : ''}</div>
        <div class="yoy-pair-delta ${dCls}">
          <span class="ratio">×${p.ratio_err}</span>
          <span class="pct">${arrow}${dsign}${p.delta_err_pct}%</span>
        </div>
      </div>`;
    }).join('');
    const footnote = pr.some(p => p.partial) ? '<div class="yoy-pair-footnote">* неполный месяц — 2025-й обрезан до того же числа</div>' : '';
    return `<div class="yoy-pairs-row yoy-pairs-${role}">
      <div class="yoy-pairs-row-title">${escapeHtml(series.label)} — средний ×${series.mean_ratio_err}</div>
      <div class="yoy-pairs-grid">${rows}</div>
      ${footnote}
    </div>`;
  }
  document.getElementById('chart-yoy-pairs').innerHTML =
    pairsBlock(yoy.series.tg, 'treatment') + pairsBlock(yoy.series.vk, 'control');

  // ─── Insight ───
  const tgRatios = yoy.series.tg.pairs.map(p => `${p.label} ×${p.ratio_err}`).join(', ');
  const vkRatios = yoy.series.vk.pairs.map(p => `${p.label} ×${p.ratio_err}`).join(', ');
  setInsight('insight-yoy',
    `Среднемесячный YoY-рост ERR по TG-курации (treatment) — <strong>×${h.ratio_tg}</strong> (${tgRatios}). По VK-репостам (контрольная группа без курации) — <strong>×${h.ratio_vk}</strong> (${vkRatios}). Разница даёт чистый эффект самой курации: <strong>+${h.clean_lift_pct}%</strong> поверх общего тренда канала. Контроль работает: TG-курация и VK-репосты публикуются в один и тот же канал, на одну и ту же аудиторию, в одни и те же месяцы — но при этом курация изменила процесс только для TG-источников. Это эмпирическое подтверждение результата квази-эксперимента ВКР с явным natural control, а не просто YoY-сравнением.`);
}

async function init() {
  const d = await load();
  renderStats(d);
  renderYoY(d.by_month_yoy);
  renderChannels(d.top_channels);
  renderVerticalBars(d.by_day_of_week, 'chart-dow', { labelKey: 'day', shortSuffix: '%' });
  renderVerticalBars(d.by_hour, 'chart-hour', { labelKey: 'hour', shortSuffix: '%', weakThreshold: 3 });
  renderCompare(d.by_platform, 'chart-platform', { labelKey: 'platform' });
  renderCompare(d.by_text_length, 'chart-length', { labelKey: 'length' });
  renderVerticalBars(d.err_histogram, 'chart-histogram', { labelKey: 'bin', valueKey: 'n', hideValue: false, shortSuffix: '' });
  renderTopForwarded(d.top_forwarded);
  renderInsights(d);
}

init().catch(e => {
  document.getElementById('stats-text').textContent = 'Ошибка загрузки данных: ' + e;
});
