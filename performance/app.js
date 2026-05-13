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
  renderInsights(d);
}

init().catch(e => {
  document.getElementById('stats-text').textContent = 'Ошибка загрузки данных: ' + e;
});
