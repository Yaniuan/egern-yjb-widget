const DEFAULT_BASE = 'https://app-api.yangjibao.com';
const CACHE_KEY = 'yjb-fund-widget-cache-v2';
const CACHE_TTL_SECONDS = 60 * 60 * 24;
const OPEN_REFRESH_SECONDS = 60;
const CLOSED_REFRESH_SECONDS = 15 * 60;
const ERROR_REFRESH_SECONDS = 5 * 60;
const QUOTE_CONCURRENCY = 3;
const QUOTE_ATTEMPTS = 2;
const QUOTE_RETRY_DELAY_MS = 180;
const HTTP_TIMEOUT_MS = 12000;
const FETCH_DEADLINE_MS = 55000;
const QUOTE_STALE_AFTER_SECONDS = 10 * 60;

const THEME = {
  bgGradient: {
    type: 'linear',
    colors: ['#141926', '#0E131E', '#0A0D16'],
    stops: [0, 0.55, 1],
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 1, y: 1 },
  },
  primary: '#F8FAFC',
  secondary: '#94A3B8',
  tertiary: '#64748B',
  positive: '#FF6B6B',
  negative: '#3DD68C',
  neutral: '#CBD5E1',
  accent: '#60A5FA',
  warning: '#FBBF24',
  disabledText: '#7C879B',
  cardBg: '#FFFFFF0D',
  cardBgAlt: '#FFFFFF12',
  cardBorder: '#FFFFFF18',
  divider: '#FFFFFF14',
  heroBgPositive: '#FF6B6B16',
  heroBorderPositive: '#FF6B6B38',
  heroBgNegative: '#3DD68C16',
  heroBorderNegative: '#3DD68C38',
  heroBgNeutral: '#FFFFFF0E',
  heroBorderNeutral: '#FFFFFF1A',
  pillPositiveBg: '#FF6B6B1E',
  pillNegativeBg: '#3DD68C1E',
  pillNeutralBg: '#FFFFFF12',
  disabledBg: '#FFFFFF0A',
  disabledBorder: '#FFFFFF16',
  noticeBg: '#FBBF2416',
  noticeBorder: '#FBBF2438',
};

function text(value, size, weight, color, maxLines = 1, minScale = 0.7, extra = null) {
  const node = {
    type: 'text',
    text: String(value),
    font: { size, weight },
    textColor: color,
    maxLines,
    minScale,
  };
  if (extra && typeof extra === 'object') Object.assign(node, extra);
  return node;
}

function symbol(name, size, color) {
  return {
    type: 'image',
    src: `sf-symbol:${name}`,
    width: size,
    height: size,
    color,
  };
}

function metricTone(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'neutral';
  const num = Number(value);
  return num > 0 ? 'positive' : num < 0 ? 'negative' : 'neutral';
}

function pillBgFor(value) {
  const tone = metricTone(value);
  if (tone === 'positive') return THEME.pillPositiveBg;
  if (tone === 'negative') return THEME.pillNegativeBg;
  return THEME.pillNeutralBg;
}

function statusStyleFor(dataStatus) {
  if (dataStatus === 'live') {
    return {
      color: '#3DD68C',
      bg: '#3DD68C1A',
      border: '#3DD68C40',
      icon: 'bolt.fill',
    };
  }
  if (dataStatus === 'partial') {
    return {
      color: '#FBBF24',
      bg: '#FBBF241A',
      border: '#FBBF2440',
      icon: 'clock.fill',
    };
  }
  if (dataStatus === 'delayed') {
    return {
      color: '#F59E0B',
      bg: '#F59E0B1A',
      border: '#F59E0B3D',
      icon: 'clock.arrow.circlepath',
    };
  }
  if (dataStatus === 'error' || dataStatus === 'quote-error') {
    return {
      color: '#FF6B6B',
      bg: '#FF6B6B1A',
      border: '#FF6B6B40',
      icon: 'exclamationmark.triangle.fill',
    };
  }
  if (dataStatus === 'loading') {
    return {
      color: '#60A5FA',
      bg: '#60A5FA1A',
      border: '#60A5FA40',
      icon: 'arrow.triangle.2.circlepath',
    };
  }
  if (dataStatus === 'closed') {
    return {
      color: '#94A3B8',
      bg: '#FFFFFF10',
      border: '#FFFFFF1C',
      icon: 'moon.fill',
    };
  }
  return {
    color: '#94A3B8',
    bg: '#FFFFFF10',
    border: '#FFFFFF1C',
    icon: 'tray',
  };
}

function tokenStyleFor(tokenState) {
  const status = tokenState && tokenState.status;
  if (status === 'success') return { color: '#3DD68C', icon: 'checkmark.shield.fill' };
  if (status === 'missing') return { color: '#FBBF24', icon: 'key.fill' };
  if (status === 'invalid') return { color: '#FF6B6B', icon: 'exclamationmark.shield.fill' };
  if (status === 'error') return { color: '#FF6B6B', icon: 'wifi.exclamationmark' };
  if (status === 'pending') return { color: '#60A5FA', icon: 'arrow.triangle.2.circlepath' };
  return { color: THEME.tertiary, icon: 'questionmark.circle' };
}

function formatNumber(value, suffix = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}${suffix}`;
}

function pickNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const normalized = typeof value === 'string'
      ? value.trim().replace(/,/g, '').replace(/[％%]/g, '').replace(/^[¥￥]/, '')
      : value;
    if (Number.isFinite(Number(normalized))) return Number(normalized);
  }
  return null;
}

function pickText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value);
  }
  return '';
}

function unwrap(value) {
  let current = value;
  for (let i = 0; i < 3; i += 1) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) break;
    const apiEnvelope = current.data !== undefined || current.message !== undefined || current.msg !== undefined;
    if (apiEnvelope && current.code !== undefined && Number(current.code) !== 200) {
      const error = new Error(current.message || `API 返回错误 (${current.code})`);
      error.code = Number(current.code);
      throw error;
    }
    if (current.data !== undefined) current = current.data;
    else break;
  }
  return current;
}

function readList(value) {
  const data = unwrap(value);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.list)) return data.list;
  if (data && Array.isArray(data.funds)) return data.funds;
  if (data && Array.isArray(data.items)) return data.items;
  if (data && Array.isArray(data.rows)) return data.rows;
  if (data && Array.isArray(data.fund_list)) return data.fund_list;
  if (data && data.result && (Array.isArray(data.result) || typeof data.result === 'object')) {
    const result = readList(data.result);
    if (result.length) return result;
  }
  if (data && typeof data === 'object') {
    const values = Object.values(data);
    const objectValues = values.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
    if (objectValues.length && objectValues.some((item) => fundIdOf(item) !== null)) {
      return objectValues;
    }
  }
  return [];
}

function readObject(value) {
  const data = unwrap(value);
  if (Array.isArray(data)) return data[0] && typeof data[0] === 'object' ? data[0] : {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  for (const key of ['list', 'items', 'rows', 'funds', 'fund_list']) {
    if (Array.isArray(data[key])) return data[key][0] && typeof data[key][0] === 'object' ? data[key][0] : {};
  }
  for (const key of ['quote', 'fund', 'result', 'quote_data', 'fund_data', 'gz_data', 'nv_info']) {
    if (data[key] && typeof data[key] === 'object') return { ...data, ...readObject(data[key]) };
  }
  return data;
}

function fundIdOf(value) {
  if (!value || typeof value !== 'object') return null;
  return value.fund_id ?? value.fundId ?? value.fund_code ?? value.fundCode
    ?? value.id ?? value.code ?? null;
}

function parseTimestamp(value, now = new Date()) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value))) {
    const number = Number(value);
    const milliseconds = number < 10000000000 ? number * 1000 : number;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const raw = String(value).trim();
  const timeOnly = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (timeOnly) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const dateParts = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return new Date(`${dateParts.year}-${dateParts.month}-${dateParts.day}T${timeOnly[1].padStart(2, '0')}:${timeOnly[2]}:${timeOnly[3] || '00'}+08:00`);
  }
  const normalized = raw.replace(/年|\//g, '-').replace(/月/g, '-').replace(/日/g, '').replace(/时/g, ':').replace(/分/g, '');
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized);
  const dateText = normalized.includes('T') || normalized.includes(' ') ? normalized.replace(' ', 'T') : `${normalized}T00:00:00`;
  const date = new Date(hasZone ? dateText : `${dateText}+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localTime(date) {
  if (!date || Number.isNaN(new Date(date).getTime())) return '--';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit',
  }).format(new Date(date));
}

function createTokenState(token) {
  return {
    status: token ? 'pending' : 'missing',
    attemptedAt: null,
    verifiedAt: null,
    reason: token ? '' : '未配置',
  };
}

function markTokenAttempt(tokenState) {
  if (!tokenState || tokenState.status === 'success') return;
  tokenState.attemptedAt = Date.now();
}

function markTokenSuccess(tokenState) {
  if (!tokenState) return;
  tokenState.status = 'success';
  tokenState.verifiedAt = tokenState.verifiedAt || Date.now();
  tokenState.reason = '';
}

function markTokenFailure(tokenState, reason = '请求失败', invalid = false) {
  if (!tokenState || tokenState.status === 'success') return;
  tokenState.status = invalid ? 'invalid' : 'error';
  tokenState.attemptedAt = tokenState.attemptedAt || Date.now();
  tokenState.reason = reason;
}

function tokenStatusText(tokenState) {
  const state = tokenState || { status: 'unknown' };
  const time = localTime(state.verifiedAt || state.attemptedAt);
  if (state.status === 'success') return `Token 验证成功 · ${time}`;
  if (state.status === 'missing') return 'Token 验证失败 · 未配置';
  if (state.status === 'invalid') return `Token 验证失败 · 令牌无效 · ${time}`;
  if (state.status === 'error') return `Token 验证失败 · ${state.reason || '请求失败'} · ${time}`;
  if (state.status === 'pending') return `Token 验证中 · ${time}`;
  return 'Token 未验证 · 暂无时间';
}

function chinaTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function isTradingWindow(date = new Date()) {
  const parts = chinaTimeParts(date);
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return (minutes >= 570 && minutes < 690) || (minutes >= 780 && minutes < 900);
}

function explicitMarketStatus(...values) {
  for (const value of values) {
    if (typeof value === 'boolean') return value ? '开市' : '休市';
    if (value === undefined || value === null) continue;
    const normalized = String(value).trim().toLowerCase();
    if (['开市', '交易中', 'trading', 'open', 'true', '1'].includes(normalized)
      || /^(开市|交易中|trading|open)(?:[ _-]|$)/.test(normalized)) return '开市';
    if (['休市', '收市', 'closed', 'close', 'false', '0'].includes(normalized)
      || /^(休市|收市|closed|close)(?:[ _-]|$)/.test(normalized)) return '休市';
  }
  return null;
}

function normalizeMarketStatus(...values) {
  return explicitMarketStatus(...values) || (isTradingWindow() ? '开市' : '休市');
}

function quoteIsFresh(quoteAt, now = Date.now()) {
  if (!quoteAt) return true;
  // Outside the configured mainland trading windows, a quote from the same
  // session is a valid last market value rather than a live quote that should
  // be aged out. The closed-state renderer marks it red separately.
  if (!isTradingWindow(new Date(now))) return true;
  const timestamp = new Date(quoteAt).getTime();
  if (!Number.isFinite(timestamp)) return true;
  const age = now - timestamp;
  return age < 0 || age <= QUOTE_STALE_AFTER_SECONDS * 1000;
}

function valuationIsCurrent(quote, now = new Date()) {
  const valuationDate = pickText(quote.true_valuation_date, quote.trueValuationDate);
  if (!valuationDate) return true;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const today = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return valuationDate.slice(0, 10) === `${today.year}-${today.month}-${today.day}`;
}

function colorFor(value, colors) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return colors.secondary;
  return Number(value) > 0 ? colors.positive : Number(value) < 0 ? colors.negative : colors.neutral;
}

function readToggle(env, key, defaultValue = true) {
  if (String(env[key] ?? '').trim() === '0') return false;
  if (String(env[key] ?? '').trim() === '1') return true;
  return defaultValue;
}

function readMaxFields(env) {
  const value = Number.parseInt(String(env.YJB_MAX_FIELDS ?? '2'), 10);
  return Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : 2;
}

function displayOptions(env = {}) {
  return {
    showDailyAmount: readToggle(env, 'YJB_SHOW_DAILY_CHANGE_AMOUNT', true),
    showDailyPct: readToggle(env, 'YJB_SHOW_DAILY_CHANGE_PCT', true),
    maxFields: readMaxFields(env),
  };
}

function normalizeRows(holdings, fundInfo, quoteById = new Map()) {
  const infoById = new Map();
  for (const info of fundInfo) {
    const id = fundIdOf(info);
    if (id !== null && id !== undefined) infoById.set(String(id), info);
  }
  return holdings.map((holding) => {
    const id = fundIdOf(holding);
    const info = infoById.get(String(id)) || {};
    const quote = quoteById.get(String(id)) || {};
    const quoteSource = quote._quoteSource || 'unknown';
    const liveDailyPct = pickNumber(
      quote.gszzl, quote.vgszzl, quote.zsgzzl, quote.increase_rate, quote.increaseRate,
      quote.day_growth_rate, quote.dayGrowthRate, quote.change_percent, quote.changePercent,
      quote.change_rate, quote.changeRate, quote.rate, quote.growth_rate, quote.growthRate,
      quote.rise_rate, quote.riseRate, quote.weighted_increase_rate, quote.average_increase_rate,
      quote.weightedIncreaseRate, quote.averageIncreaseRate, quote.increase, quote.change,
    );
    const publishedDailyPct = pickNumber(
      info.gszzl, info.vgszzl, info.zsgzzl, info.day_growth_rate, info.dayGrowthRate,
      info.increase_rate, info.increaseRate, info.rate, info.change_percent, info.changePercent,
      info.growth_rate, info.growthRate, info.rise_rate, info.riseRate,
      info.change_rate, info.changeRate, info.increase, info.change,
      info.weighted_increase_rate, info.average_increase_rate,
      info.weightedIncreaseRate, info.averageIncreaseRate,
      holding.day_growth_rate, holding.dayGrowthRate, holding.increase_rate, holding.increaseRate,
      holding.gszzl, holding.vgszzl, holding.zsgzzl, holding.change_rate, holding.changeRate,
      holding.rate, holding.growth_rate, holding.growthRate, holding.weighted_increase_rate,
      holding.average_increase_rate, holding.weightedIncreaseRate, holding.averageIncreaseRate,
    );
    const quoteNav = pickNumber(
      quote.gsz, quote.vgsz, quote.zsgz, quote.estimate_nav, quote.estimated_nav,
      quote.estimateNav, quote.estimatedNav, quote.nav,
      quote.latest_nav, quote.latestNav, quote.unit_nav, quote.unitNetValue,
    );
    const infoNav = pickNumber(
      info.gsz, info.vgsz, info.zsgz, info.estimate_nav, info.estimated_nav,
      info.estimateNav, info.estimatedNav, info.nav, info.latest_nav, info.latestNav,
      info.unit_nav, info.unitNetValue, info.dwjz,
    );
    const estimateNav = quoteNav ?? infoNav;
    const lastNav = pickNumber(
      quote.last_net, quote.last_nav, quote.lastNet, quote.previous_nav, quote.previousNav,
      holding.last_net, holding.last_nav, holding.lastNet, holding.net_value, holding.unit_nav,
      holding.nav, holding.netValue,
      info.last_net, info.last_nav, info.lastNet, info.net_value, info.unit_nav,
      info.nav, info.netValue, info.dwjz, info.unitNetValue, info.latest_nav,
    );
    const holdingLatestNav = pickNumber(
      holding.last_net, holding.last_nav, holding.lastNet, holding.net_value,
      holding.unit_nav, holding.nav, holding.netValue,
    );
    const derivedPct = publishedDailyPct === null && estimateNav !== null && lastNav !== null && lastNav !== 0
      ? (estimateNav - lastNav) / lastNav * 100
      : null;
    const dailyChangePct = liveDailyPct ?? publishedDailyPct ?? derivedPct;
    const shares = pickNumber(holding.hold_share, holding.shares, holding.share, holding.amount_share);
    const marketValue = pickNumber(
      holding.money, holding.market_value, holding.current_value, holding.total_value,
      holding.marketValue, holding.assets, holding.asset_value,
    ) ?? (shares !== null && (estimateNav ?? lastNav) !== null ? shares * (estimateNav ?? lastNav) : null);
    const quoteDailyChangeAmount = pickNumber(
      quote.estimate_amount, quote.estimated_amount, quote.gsz_change_amount, quote.vgsz_change_amount,
      quote.estimate_profit, quote.estimated_profit, quote.estimateProfit, quote.estimatedProfit,
      quote.increase_amount, quote.increaseAmount, quote.change_amount, quote.changeAmount,
      quote.daily_change_amount, quote.dailyChangeAmount, quote.day_earn, quote.today_earn,
      quote.daily_profit, quote.dailyProfit, quote.today_profit, quote.todayProfit,
      quote.day_income, quote.dayIncome, quote.profit_today, quote.profitToday,
      quote.profit, quote.income, quote.change, quote.today_change, quote.todayChange,
    );
    const supplementalDailyChangeAmount = pickNumber(
      info.estimate_amount, info.estimated_amount, info.increase_amount, info.increaseAmount,
      info.daily_change_amount, info.dailyChangeAmount, info.day_earn, info.today_earn, info.daily_profit,
      holding.estimate_amount, holding.estimated_amount, holding.daily_change_amount,
      holding.dailyChangeAmount, holding.day_earn, holding.today_earn, holding.daily_profit,
      holding.dailyProfit, holding.today_profit, holding.todayProfit, holding.day_income, holding.dayIncome,
      holding.today_change, holding.todayChange,
    );
    const directDailyChangeAmount = quoteDailyChangeAmount ?? supplementalDailyChangeAmount;
    const dailyChangeAmount = directDailyChangeAmount !== null
      ? directDailyChangeAmount
      : dailyChangePct !== null && marketValue !== null
        ? marketValue * dailyChangePct / 100
        : dailyChangePct !== null && shares !== null && estimateNav !== null && lastNav !== null
          ? shares * (estimateNav - lastNav)
          : null;
    const quoteTime = pickText(
      quote.time, quote.estimate_time, quote.quote_time, quote.update_time, quote.updated_at,
      quote.timestamp, quote.server_time, quote.serverTime, quote.last_update,
      quote.vgsztime, quote.zsgztime, quote.gztime,
    );
    const quoteAt = parseTimestamp(quoteTime || pickText(
      info.update_time, info.updated_at, info.timestamp, info.server_time, info.gztime,
    ));
    const sourceIsLive = (quoteSource === 'realtime' || quoteSource === 'estimate'
      || (quoteSource === 'overview' && !!quoteTime))
      && (liveDailyPct !== null || quoteDailyChangeAmount !== null);
    const fresh = quoteIsFresh(quoteAt);
    const currentValuation = valuationIsCurrent(quote);
    return {
      name: String(info.short_name || info.name || info.fund_name || info.fundName
        || holding.short_name || holding.name || holding.fund_name || holding.fundName || id || '基金'),
      id: String(id || ''),
      marketValue,
      estimateNav,
      lastNav,
      latestNavFetched: [quoteNav, infoNav, holdingLatestNav].some((value) => value !== null && value > 0),
      dailyChangeAmount,
      dailyChangePct,
      dailyChangeIsLive: sourceIsLive && fresh && currentValuation,
      dailyChangeSource: sourceIsLive && (!fresh || !currentValuation) ? 'stale' : quoteSource,
      marketStatus: normalizeMarketStatus(
        quote.market_status, quote.marketStatus, quote.status, quote.is_open,
        info.market_status, info.marketStatus, info.status, info.is_open,
        holding.market_status, holding.marketStatus, holding.status, holding.is_open,
      ),
      marketStatusExplicit: explicitMarketStatus(
        quote.market_status, quote.marketStatus, quote.status, quote.is_open,
        info.market_status, info.marketStatus, info.status, info.is_open,
        holding.market_status, holding.marketStatus, holding.status, holding.is_open,
      ) !== null,
      quoteAt: quoteAt ? quoteAt.toISOString() : null,
      quoteAvailable: dailyChangeAmount !== null || dailyChangePct !== null || estimateNav !== null,
    };
  });
}

function dailyChangeValue(row, compact, colors, options) {
  const candidates = [];
  if (options.showDailyAmount) {
    candidates.push({
      key: 'amount',
      text: `当日涨幅金额 ${row.dailyChangeAmount === null ? '--' : formatNumber(row.dailyChangeAmount)}`,
    });
  }
  if (options.showDailyPct) {
    candidates.push({
      key: 'pct',
      text: `当日涨幅 ${row.dailyChangePct === null ? '--' : formatNumber(row.dailyChangePct, '%')}`,
    });
  }
  const fields = candidates.slice(0, options.maxFields);
  return {
    fields,
    dailyChange: fields.length ? fields.map((field) => field.text).join(compact ? ' / ' : '\n') : '当日涨幅字段已关闭',
    dailyChangeColor: colorFor(row.dailyChangeAmount ?? row.dailyChangePct, colors),
    fontSize: compact ? 'caption2' : 'caption1',
  };
}

function latestQuoteTime(rows) {
  return rows.reduce((latest, row) => {
    const time = row.quoteAt ? new Date(row.quoteAt) : null;
    return time && !Number.isNaN(time.getTime()) && (!latest || time > latest) ? time : latest;
  }, null);
}

function displayUpdateTime(updatedAt, rows, dataStatus) {
  if (dataStatus === 'live' || dataStatus === 'partial') {
    const quoteTime = latestQuoteTime(rows);
    if (quoteTime) return localTime(quoteTime);
  }
  return updatedAt;
}

function normalizeCachedRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    ...row,
    latestNavFetched: false,
    dailyChangeAmount: row.dailyChangeAmount ?? row.estimateAmount ?? null,
    dailyChangePct: row.dailyChangePct ?? row.estimatePct ?? null,
    dailyChangeIsLive: row.dailyChangeIsLive ?? row.estimateIsLive ?? false,
    dailyChangeSource: row.dailyChangeSource || (row.dailyChangeIsLive ? 'realtime' : 'cache'),
  }));
}

function mergeCachedRows(rows, cachedRows) {
  const normalizedCache = normalizeCachedRows(cachedRows);
  if (!normalizedCache.length) return rows;
  const cachedById = new Map(normalizedCache.filter((row) => row.id).map((row) => [String(row.id), row]));
  const cachedByName = new Map(normalizedCache.map((row) => [String(row.name), row]));
  return rows.map((row) => {
    if (row.dailyChangeIsLive || row.quoteAvailable) return row;
    const cached = cachedById.get(String(row.id)) || cachedByName.get(String(row.name));
    if (!cached) return row;
    const cachedDailyChangeAmount = cached.dailyChangeAmount ?? cached.estimateAmount;
    const cachedDailyChangePct = cached.dailyChangePct ?? cached.estimatePct;
    const cachedEstimateNav = cached.estimateNav;
    const cachedLastNav = cached.lastNav;
    const hasCachedValuation = [cachedDailyChangePct, cachedDailyChangeAmount, cachedEstimateNav, cachedLastNav]
      .some((value) => value !== null && value !== undefined && value !== '');
    if (!hasCachedValuation) return row;
    return {
      ...row,
      dailyChangeAmount: cachedDailyChangeAmount ?? row.dailyChangeAmount,
      dailyChangePct: cachedDailyChangePct ?? row.dailyChangePct,
      dailyChangeIsLive: false,
      dailyChangeSource: cached.dailyChangeSource || 'cache',
      estimateNav: cachedEstimateNav ?? row.estimateNav,
      lastNav: cachedLastNav ?? row.lastNav,
      quoteAt: cached.quoteAt || row.quoteAt,
    };
  });
}

function resolveMarketStatus(rows) {
  const explicit = rows.filter((row) => row.marketStatusExplicit).map((row) => row.marketStatus);
  if (explicit.includes('开市')) return '开市';
  if (explicit.includes('休市')) return '休市';
  return isTradingWindow() ? '开市' : '休市';
}

function explicitStatusFromRecords(records) {
  const statuses = records
    .flatMap((record) => {
      if (!record || typeof record !== 'object') return [];
      return [explicitMarketStatus(
        record.market_status,
        record.marketStatus,
        record.status,
        record.is_open,
        record.isOpen,
      )];
    })
    .filter(Boolean);
  if (statuses.includes('开市')) return '开市';
  if (statuses.includes('休市')) return '休市';
  return null;
}

function liveRowCount(rows) {
  return rows.filter((row) => row.dailyChangeIsLive === true).length;
}

function resolveDataStatus(rows, marketStatus, requestState) {
  if (requestState === 'loading') return 'loading';
  if (marketStatus !== '开市') return 'closed';
  if (requestState === 'error') return 'error';
  if (requestState === 'quote-error') return 'quote-error';
  if (!rows.length) return 'empty';
  const liveCount = liveRowCount(rows);
  if (liveCount === rows.length) return 'live';
  if (liveCount > 0) return 'partial';
  return 'delayed';
}

function statusLabelFor(marketStatus, dataStatus) {
  if (dataStatus === 'loading') return '加载中';
  if (dataStatus === 'error') return marketStatus === '开市' ? '开市 · 更新失败' : '休市 · 更新失败';
  if (dataStatus === 'quote-error') return '开市 · 行情源请求失败';
  if (dataStatus === 'live') return '开市 · 实时';
  if (dataStatus === 'partial') return '开市 · 部分实时';
  if (dataStatus === 'delayed') return '开市 · 数据延迟';
  if (dataStatus === 'empty') return marketStatus === '开市' ? '开市 · 无持仓' : '休市 · 无持仓';
  if (dataStatus === 'closed') return '休市 · 最后成功';
  return marketStatus === '开市' ? '开市 · 未更新' : '休市 · 未更新';
}

function freshnessText(marketStatus, dataStatus, updatedAt, rows) {
  const time = updatedAt && updatedAt !== '--' ? updatedAt : '暂无';
  const liveCount = liveRowCount(rows);
  if (dataStatus === 'live') return `实时 · 更新于 ${time}`;
  if (dataStatus === 'partial') return `部分实时 ${liveCount}/${rows.length} · 最后成功 ${time}`;
  if (dataStatus === 'delayed') return `数据延迟 · 最后成功 ${time}`;
  if (dataStatus === 'error') return `更新失败 · 最后成功 ${time}`;
  if (dataStatus === 'loading') return '加载中 · 等待首次成功更新';
  if (dataStatus === 'closed') return `休市 · 最后成功 ${time}`;
  if (dataStatus === 'empty') return `无持仓 · 最近请求 ${time}`;
  return `${marketStatus} · 最后成功 ${time}`;
}

function statusDotColor(row, liveWindow = true, marketStatus = '开市') {
  if (liveWindow && row.dailyChangeIsLive === true) return '#43C89A';
  if (marketStatus === '休市' && row.latestNavFetched === true) return '#43C89A';
  const hasValue = [row.dailyChangeAmount, row.dailyChangePct, row.estimateNav, row.lastNav]
    .some((value) => value !== null && value !== undefined && value !== '');
  return hasValue ? '#FF5B5B' : '#A9AAB5';
}

function rowsByDotColorAndIncome(rows, marketStatus, liveWindow) {
  return rows
    .map((row, index) => {
      const dotColor = statusDotColor(row, liveWindow, marketStatus);
      const amount = Number(row.dailyChangeAmount);
      const percent = Number(row.dailyChangePct);
      return {
        row,
        index,
        rank: dotColor === '#43C89A' ? 0 : dotColor === '#FF5B5B' ? 1 : 2,
        amount: Number.isFinite(amount) ? amount : null,
        percent: Number.isFinite(percent) ? percent : null,
      };
    })
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank;
      if (left.amount === null && right.amount !== null) return 1;
      if (left.amount !== null && right.amount === null) return -1;
      if (left.amount !== null && right.amount !== null && left.amount !== right.amount) {
        return right.amount - left.amount;
      }
      if (left.percent === null && right.percent !== null) return 1;
      if (left.percent !== null && right.percent === null) return -1;
      if (left.percent !== null && right.percent !== null && left.percent !== right.percent) {
        return right.percent - left.percent;
      }
      return left.index - right.index;
    })
    .map(({ row }) => row);
}

function fundNameNode(row, size, weight, colors, maxLines = 1, minScale = 0.6, liveWindow = true, marketStatus = '开市') {
  const name = text(row.name, size, weight, colors.primary, maxLines, minScale, { flex: 1 });
  const dotSize = typeof size === 'number' && size <= 10 ? 8 : 9;
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 4,
    children: [
      text('●', dotSize, 'bold', statusDotColor(row, liveWindow, marketStatus), 1, 1),
      name,
    ],
  };
}

function aggregateDailyAmount(rows) {
  const values = rows
    .map((row) => Number(row.dailyChangeAmount))
    .filter((value) => Number.isFinite(value));
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function summaryCardNode(rows, dataStatus, family, denseLayout, colors) {
  if (family === 'systemSmall' || family.startsWith('accessory')) return null;
  const sourceRows = dataStatus === 'partial'
    ? rows.filter((row) => row.dailyChangeIsLive === true)
    : rows;
  const amount = aggregateDailyAmount(sourceRows);
  if (amount === null) return null;
  const live = dataStatus === 'live';
  const partial = dataStatus === 'partial';
  const label = live ? '当日涨幅金额' : partial ? '实时涨幅金额' : '最后有效涨幅金额';
  const amountColor = live || partial ? colorFor(amount, colors) : colors.secondary;
  const tone = live || partial ? metricTone(amount) : 'neutral';
  const backgroundColor = tone === 'positive'
    ? THEME.heroBgPositive
    : tone === 'negative'
      ? THEME.heroBgNegative
      : THEME.heroBgNeutral;
  const borderColor = tone === 'positive'
    ? THEME.heroBorderPositive
    : tone === 'negative'
      ? THEME.heroBorderNegative
      : THEME.heroBorderNeutral;

  if (family === 'systemMedium') {
    const padding = denseLayout ? [3, 8] : [5, 10];
    const borderRadius = denseLayout ? 8 : 10;
    const labelSize = denseLayout ? 10 : 10.5;
    const valueSize = denseLayout ? 12 : 14;
    return {
      type: 'stack',
      direction: 'row',
      alignItems: 'center',
      gap: 6,
      padding,
      borderRadius,
      backgroundColor,
      borderWidth: 0.5,
      borderColor,
      children: [
        text(label, labelSize, 'medium', THEME.secondary, 1, 0.7),
        { type: 'spacer' },
        text(formatNumber(amount), valueSize, 'bold', amountColor, 1, 0.6, { textAlign: 'right' }),
      ],
    };
  }

  const compactHero = rows.length > 8;
  const leftChildren = [
    text(label, compactHero ? 10 : 10.5, 'medium', THEME.secondary, 1, 0.7),
  ];
  if (partial) {
    leftChildren.push(text(`实时 ${liveRowCount(rows)}/${rows.length} 只`, 9, 'medium', THEME.warning, 1, 0.7));
  }
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 8,
    padding: compactHero ? [5, 10] : [8, 12],
    borderRadius: compactHero ? 9 : 11,
    backgroundColor,
    borderWidth: 0.5,
    borderColor,
    children: [
      {
        type: 'stack',
        direction: 'column',
        alignItems: 'start',
        gap: 1,
        flex: 1,
        children: leftChildren,
      },
      text(formatNumber(amount), compactHero ? 14 : 18, 'bold', amountColor, 1, 0.55, { textAlign: 'right' }),
    ],
  };
}

function headerNode(statusLabel, dataStatus, family) {
  const lockScreen = family.startsWith('accessory');
  const compact = family === 'systemSmall' || lockScreen;
  const style = statusStyleFor(dataStatus);
  if (lockScreen) {
    return {
      type: 'stack',
      direction: 'row',
      alignItems: 'center',
      gap: 4,
      children: [
        text('养基宝', 11, 'bold', THEME.primary, 1, 0.8),
        { type: 'spacer' },
        text(statusLabel, 9.5, 'semibold', style.color, 1, 0.65),
      ],
    };
  }
  const brandIcon = compact
    ? symbol('chart.line.uptrend.xyaxis', 11, THEME.accent)
    : {
      type: 'stack',
      direction: 'row',
      alignItems: 'center',
      width: 20,
      height: 20,
      borderRadius: 6,
      backgroundColor: '#60A5FA1F',
      borderWidth: 0.5,
      borderColor: '#60A5FA3D',
      padding: [4.5, 4.5],
      children: [symbol('chart.line.uptrend.xyaxis', 11, THEME.accent)],
    };
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 6,
    children: [
      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: compact ? 4 : 6,
        children: [
          brandIcon,
          text('养基宝', compact ? 13 : 15, 'bold', THEME.primary, 1, 0.8),
        ],
      },
      { type: 'spacer' },
      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: 3,
        padding: compact ? [2, 6] : [3, 8],
        borderRadius: 99,
        backgroundColor: style.bg,
        borderWidth: 0.5,
        borderColor: style.border,
        children: [
          symbol(style.icon, compact ? 8 : 9, style.color),
          text(statusLabel, compact ? 9 : 10, 'semibold', style.color, 1, 0.65),
        ],
      },
    ],
  };
}

function disabledFieldPill(compact) {
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 3,
    padding: compact ? [2, 5] : [3, 7],
    borderRadius: 6,
    backgroundColor: THEME.disabledBg,
    borderWidth: 0.5,
    borderColor: THEME.disabledBorder,
    children: [
      symbol('eye.slash', compact ? 8 : 9, THEME.disabledText),
      text('当日涨幅字段已关闭', compact ? 9 : 10, 'medium', THEME.disabledText, 1, 0.65),
    ],
  };
}

function resolveDenseMetrics(family, rowCount) {
  if (family === 'systemMedium') {
    if (rowCount <= 4) {
      return {
        rowPadding: [3, 8],
        rowRadius: 7,
        rowGap: 2.5,
        nameSize: 10.5,
        metricSize: 9.5,
        pillPadding: [1.5, 5],
      };
    }
    return {
      rowPadding: [2, 7],
      rowRadius: 6,
      rowGap: 2,
      nameSize: 9.5,
      metricSize: 8.5,
      pillPadding: [1, 4],
    };
  }
  if (rowCount <= 5) {
    return {
      rowPadding: [7, 10],
      rowRadius: 10,
      rowGap: 5,
      nameSize: 12,
      metricSize: 10.5,
      pillPadding: [2, 6],
    };
  }
  if (rowCount <= 8) {
    return {
      rowPadding: [5, 9],
      rowRadius: 8,
      rowGap: 4,
      nameSize: 11,
      metricSize: 10,
      pillPadding: [2, 5],
    };
  }
  return {
    rowPadding: [3, 8],
    rowRadius: 6,
    rowGap: 2.5,
    nameSize: 10,
    metricSize: 9,
    pillPadding: [1, 4],
  };
}

function holdingRow(row, family, colors, options, liveWindow = true, marketStatus = '开市') {
  const narrow = family === 'systemSmall' || family === 'accessoryRectangular';
  const lockScreen = family.startsWith('accessory');
  const result = dailyChangeValue(row, narrow || lockScreen, colors, options);

  if (family === 'accessoryInline') {
    return text(`● ${row.name} ${result.fields.length ? result.fields.map((field) => field.text).join(' / ') : result.dailyChange}`, 'caption2', 'medium', statusDotColor(row, liveWindow, marketStatus), 1, 0.7);
  }
  if (family === 'accessoryCircular') {
    return text(
      result.fields.length ? result.fields.map((field) => field.text).join('\n') : result.dailyChange,
      9.5,
      'semibold',
      result.dailyChangeColor,
      2,
      0.5,
      { textAlign: 'center' },
    );
  }
  if (family === 'accessoryRectangular') {
    const lineText = result.fields.length
      ? result.fields.map((field) => field.text).join(' · ')
      : result.dailyChange;
    return {
      type: 'stack',
      direction: 'column',
      alignItems: 'start',
      gap: 2,
      children: [
        fundNameNode(row, 11, 'semibold', colors, 1, 0.55, liveWindow, marketStatus),
        text(lineText, 10, 'semibold', result.dailyChangeColor, 1, 0.55),
      ],
    };
  }

  const toneBg = pillBgFor(row.dailyChangeAmount ?? row.dailyChangePct);
  if (family === 'systemSmall') {
    const cardChildren = [
      fundNameNode(row, 11.5, 'semibold', colors, 1, 0.55, liveWindow, marketStatus),
    ];
    if (!result.fields.length) {
      cardChildren.push(disabledFieldPill(true));
    } else {
      cardChildren.push(text(result.fields[0].text, 11.5, 'bold', result.dailyChangeColor, 1, 0.6));
      if (result.fields[1]) {
        cardChildren.push({
          type: 'stack',
          direction: 'row',
          alignItems: 'center',
          padding: [2, 6],
          borderRadius: 6,
          backgroundColor: toneBg,
          children: [
            text(result.fields[1].text, 10, 'semibold', result.dailyChangeColor, 1, 0.6),
          ],
        });
      }
    }
    return {
      type: 'stack',
      direction: 'column',
      alignItems: 'start',
      gap: 4,
      padding: [7, 9],
      borderRadius: 11,
      backgroundColor: THEME.cardBg,
      borderWidth: 0.5,
      borderColor: THEME.cardBorder,
      children: cardChildren,
    };
  }

  const rightNode = !result.fields.length
    ? disabledFieldPill(true)
    : {
      type: 'stack',
      direction: 'column',
      alignItems: 'end',
      gap: 2,
      children: [
        text(result.fields[0].text, 11, 'bold', result.dailyChangeColor, 1, 0.65, { textAlign: 'right' }),
        ...(result.fields[1] ? [{
          type: 'stack',
          direction: 'row',
          alignItems: 'center',
          padding: [1.5, 5],
          borderRadius: 5,
          backgroundColor: toneBg,
          children: [
            text(result.fields[1].text, 9.5, 'semibold', result.dailyChangeColor, 1, 0.65, { textAlign: 'right' }),
          ],
        }] : []),
      ],
    };

  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 8,
    padding: [6, 10],
    borderRadius: 10,
    backgroundColor: THEME.cardBg,
    borderWidth: 0.5,
    borderColor: THEME.cardBorder,
    children: [
      fundNameNode(row, 12.5, 'semibold', colors, 1, 0.6, liveWindow, marketStatus),
      rightNode,
    ],
  };
}

function denseHoldingRow(row, colors, options, liveWindow = true, marketStatus = '开市', index = 0, metrics = null) {
  const m = metrics || resolveDenseMetrics('systemLarge', 6);
  const result = dailyChangeValue(row, true, colors, options);
  const name = fundNameNode(row, m.nameSize, 'medium', colors, 1, 0.5, liveWindow, marketStatus);
  const rightNode = !result.fields.length
    ? disabledFieldPill(true)
    : {
      type: 'stack',
      direction: 'row',
      alignItems: 'center',
      padding: m.pillPadding,
      borderRadius: 6,
      backgroundColor: pillBgFor(row.dailyChangeAmount ?? row.dailyChangePct),
      children: [
        text(
          result.fields.map((field) => field.text).join(' · '),
          m.metricSize,
          'semibold',
          result.dailyChangeColor,
          1,
          0.45,
          { textAlign: 'right' },
        ),
      ],
    };
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 6,
    padding: m.rowPadding,
    borderRadius: m.rowRadius,
    backgroundColor: index % 2 === 0 ? THEME.cardBg : THEME.cardBgAlt,
    borderWidth: 0.5,
    borderColor: THEME.cardBorder,
    children: [
      name,
      rightNode,
    ],
  };
}

function stateVariantFor(state, resolvedDataStatus, tokenState) {
  if (state === '加载中' || resolvedDataStatus === 'loading') {
    return {
      icon: 'arrow.triangle.2.circlepath',
      color: THEME.accent,
      bg: '#60A5FA1E',
      border: '#60A5FA40',
      title: '正在读取持仓…',
      subtitle: '等待首次行情同步完成',
    };
  }
  if (state === '实时' || resolvedDataStatus === 'empty') {
    return {
      icon: 'tray',
      color: THEME.secondary,
      bg: '#94A3B81A',
      border: '#94A3B838',
      title: '暂无基金持仓',
      subtitle: '当前基金账户暂无持仓记录',
    };
  }
  if (tokenState && tokenState.status === 'missing') {
    return {
      icon: 'key.fill',
      color: THEME.warning,
      bg: '#FBBF241E',
      border: '#FBBF2440',
      title: '未配置登录令牌',
      subtitle: '请在模块 Env 中填写 YJB_TOKEN',
    };
  }
  if (tokenState && tokenState.status === 'invalid') {
    return {
      icon: 'exclamationmark.shield.fill',
      color: THEME.positive,
      bg: '#FF6B6B1E',
      border: '#FF6B6B40',
      title: '登录令牌已失效',
      subtitle: '请重新登录养基宝并更新 YJB_TOKEN',
    };
  }
  return {
    icon: 'wifi.exclamationmark',
    color: THEME.positive,
    bg: '#FF6B6B1E',
    border: '#FF6B6B40',
    title: state || '请求失败',
    subtitle: '请检查网络或配置，稍后自动重试',
  };
}

function stateCardNode(state, resolvedDataStatus, tokenState, family) {
  const variant = stateVariantFor(state, resolvedDataStatus, tokenState);
  if (family === 'accessoryCircular') {
    return text(variant.title, 9.5, 'medium', variant.color, 2, 0.55, { textAlign: 'center' });
  }
  if (family === 'accessoryRectangular') {
    return text(variant.title, 10.5, 'medium', variant.color, 2, 0.65);
  }
  if (family === 'systemMedium') {
    return {
      type: 'stack',
      direction: 'row',
      alignItems: 'center',
      gap: 10,
      padding: [10, 14],
      borderRadius: 12,
      backgroundColor: THEME.cardBg,
      borderWidth: 0.5,
      borderColor: THEME.cardBorder,
      children: [
        {
          type: 'stack',
          direction: 'row',
          alignItems: 'center',
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: variant.bg,
          borderWidth: 0.5,
          borderColor: variant.border,
          padding: [9, 9],
          children: [symbol(variant.icon, 14, variant.color)],
        },
        {
          type: 'stack',
          direction: 'column',
          alignItems: 'start',
          gap: 2,
          flex: 1,
          children: [
            text(variant.title, 13, 'semibold', THEME.primary, 1, 0.7),
            text(variant.subtitle, 10.5, 'regular', THEME.secondary, 1, 0.7),
          ],
        },
      ],
    };
  }
  const small = family === 'systemSmall';
  const badgeSize = small ? 24 : 36;
  const iconSize = small ? 12 : 16;
  const badgePad = (badgeSize - iconSize) / 2;
  return {
    type: 'stack',
    direction: 'column',
    alignItems: 'center',
    gap: small ? 4 : 6,
    padding: small ? [8, 10] : [16, 18],
    borderRadius: small ? 11 : 14,
    backgroundColor: THEME.cardBg,
    borderWidth: 0.5,
    borderColor: THEME.cardBorder,
    children: [
      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        width: badgeSize,
        height: badgeSize,
        borderRadius: badgeSize / 2,
        backgroundColor: variant.bg,
        borderWidth: 0.5,
        borderColor: variant.border,
        padding: [badgePad, badgePad],
        children: [symbol(variant.icon, iconSize, variant.color)],
      },
      text(variant.title, small ? 11.5 : 14, 'semibold', THEME.primary, 1, 0.65, { textAlign: 'center' }),
      text(variant.subtitle, small ? 9.5 : 11, 'regular', THEME.secondary, 2, 0.7, { textAlign: 'center' }),
    ],
  };
}

function cacheNoticeNode(resolvedDataStatus) {
  const noticeText = resolvedDataStatus === 'quote-error'
    ? '行情源请求失败，当前展示可用数据或缓存'
    : '当前显示缓存数据，稍后将自动重试';
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 5,
    padding: [4, 8],
    borderRadius: 7,
    backgroundColor: THEME.noticeBg,
    borderWidth: 0.5,
    borderColor: THEME.noticeBorder,
    children: [
      symbol('exclamationmark.circle.fill', 10, THEME.warning),
      text(noticeText, 9.5, 'medium', THEME.warning, 1, 0.65),
    ],
  };
}

function footerNode(tokenState, compact) {
  const style = tokenStyleFor(tokenState);
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 4,
    children: [
      symbol(style.icon, compact ? 9 : 10, style.color),
      text(tokenStatusText(tokenState), compact ? 9 : 10, 'medium', style.color, 1, 0.65),
    ],
  };
}

function makeWidget(rows, updatedAt, state, marketStatus, refreshSeconds, family, options, dataStatus = null, tokenState = null, widgetUrl = '') {
  const compact = family === 'systemSmall' || family.startsWith('accessory');
  const lockScreen = family.startsWith('accessory');
  const resolvedDataStatus = dataStatus || resolveDataStatus(rows, marketStatus, state === '加载中' ? 'loading' : state === '实时' ? 'success' : 'error');
  const liveWindow = marketStatus === '开市' && (resolvedDataStatus === 'live' || resolvedDataStatus === 'partial');
  const displayRows = rowsByDotColorAndIncome(rows, marketStatus, liveWindow);
  const statusLabel = statusLabelFor(marketStatus, resolvedDataStatus);
  const denseLayout = !lockScreen && (
    family === 'systemLarge'
    || family === 'systemExtraLarge'
    || (family === 'systemMedium' && rows.length > 2)
  );
  const colors = {
    primary: THEME.primary,
    secondary: THEME.secondary,
    positive: THEME.positive,
    negative: THEME.negative,
    neutral: THEME.neutral,
  };
  const refreshAfter = new Date(Date.now() + refreshSeconds * 1000).toISOString();
  const cleanUrl = widgetUrl ? String(widgetUrl).trim() : '';

  if (family === 'accessoryInline') {
    const row = displayRows[0];
    const value = row ? holdingRow(row, family, colors, options, liveWindow, marketStatus).text : state;
    const inlineWidget = {
      type: 'widget',
      refreshAfter,
      children: [text(`养基宝 · ${statusLabel} · ${value}`, 'caption2', 'medium', colors.primary, 1, 0.7)],
    };
    if (cleanUrl) inlineWidget.url = cleanUrl;
    return inlineWidget;
  }

  if (family === 'accessoryCircular') {
    const circularChildren = [
      text(statusLabel, 8.5, 'semibold', statusStyleFor(resolvedDataStatus).color, 1, 0.55, { textAlign: 'center' }),
    ];
    if (displayRows.length) {
      circularChildren.push(text(displayRows[0].name, 8, 'medium', colors.primary, 1, 0.5, { textAlign: 'center' }));
      circularChildren.push(holdingRow(displayRows[0], family, colors, options, liveWindow, marketStatus));
    } else {
      circularChildren.push(stateCardNode(state, resolvedDataStatus, tokenState, family));
    }
    const circularWidget = {
      type: 'widget',
      refreshAfter,
      padding: 4,
      gap: 1,
      children: [
        {
          type: 'stack',
          direction: 'column',
          alignItems: 'center',
          gap: 1,
          children: circularChildren,
        },
      ],
    };
    if (cleanUrl) circularWidget.url = cleanUrl;
    return circularWidget;
  }

  const children = [
    headerNode(statusLabel, resolvedDataStatus, family),
  ];

  let visibleCount = 0;
  let denseMetrics = null;
  if (!rows.length) {
    children.push({ type: 'spacer' });
    children.push(stateCardNode(state, resolvedDataStatus, tokenState, family));
  } else {
    const summaryCard = summaryCardNode(rows, resolvedDataStatus, family, denseLayout, colors);
    if (summaryCard) children.push(summaryCard);

    if (denseLayout) {
      const maxDenseRows = family === 'systemMedium'
        ? (displayRows.length > 5 ? 4 : displayRows.length)
        : (displayRows.length > 11 ? 10 : displayRows.length);
      const visible = displayRows.slice(0, maxDenseRows);
      visibleCount = visible.length;
      denseMetrics = resolveDenseMetrics(family, visible.length);
      visible.forEach((row, index) => {
        children.push(denseHoldingRow(row, colors, options, liveWindow, marketStatus, index, denseMetrics));
      });
      if (displayRows.length > visible.length) {
        children.push(text(
          `另有 ${displayRows.length - visible.length} 只`,
          family === 'systemMedium' ? 8.5 : 9.5,
          'medium',
          colors.secondary,
          1,
          0.7,
        ));
      }
    } else {
      const visible = displayRows.slice(0, family === 'systemSmall' ? 1 : lockScreen ? 1 : 2);
      visibleCount = visible.length;
      for (const row of visible) {
        children.push(holdingRow(row, family, colors, options, liveWindow, marketStatus));
      }
      if (displayRows.length > visible.length) {
        children.push(text(
          `另有 ${displayRows.length - visible.length} 只`,
          lockScreen ? 8.5 : 9.5,
          'medium',
          colors.secondary,
          1,
          0.7,
        ));
      }
    }

    if (
      (resolvedDataStatus === 'error' || resolvedDataStatus === 'quote-error')
      && (family === 'systemLarge' || family === 'systemExtraLarge')
      && displayRows.length <= 8
    ) {
      children.push(cacheNoticeNode(resolvedDataStatus));
    }
  }

  if (!lockScreen) {
    children.push({ type: 'spacer' });
    if (!compact) {
      children.push({
        type: 'stack',
        direction: 'row',
        height: 1,
        backgroundColor: THEME.divider,
        children: [{ type: 'spacer' }],
      });
    }
    children.push(footerNode(tokenState, compact));
  }

  const padding = lockScreen
    ? 4
    : family === 'systemSmall'
      ? 11
      : family === 'systemMedium'
        ? (denseLayout ? [9, 12] : [10, 12])
        : (denseLayout && visibleCount > 8 ? [11, 13] : 14);
  const gap = lockScreen
    ? 2
    : family === 'systemSmall'
      ? 5
      : family === 'systemMedium'
        ? (denseLayout ? (visibleCount > 4 ? 2 : 2.5) : 5)
        : (denseMetrics ? denseMetrics.rowGap : 8);

  const root = {
    type: 'widget',
    refreshAfter,
    padding,
    gap,
    children,
  };
  if (!lockScreen) root.backgroundGradient = THEME.bgGradient;
  if (cleanUrl) root.url = cleanUrl;
  return root;
}

function md5(input) {
  const bytes = unescape(encodeURIComponent(input));
  const words = [];
  for (let i = 0; i < bytes.length; i += 1) {
    words[i >> 2] = (words[i >> 2] || 0) | (bytes.charCodeAt(i) << ((i % 4) * 8));
  }
  const bitLength = bytes.length * 8;
  words[bitLength >> 5] = (words[bitLength >> 5] || 0) | (0x80 << (bitLength % 32));
  words[(((bitLength + 64) >>> 9) << 4) + 14] = bitLength;
  const add = (a, b) => (a + b) | 0;
  const rol = (value, shift) => (value << shift) | (value >>> (32 - shift));
  const ff = (a, b, c, d, x, s, t) => add(rol(add(add(a, (b & c) | (~b & d)), add(x, t)), s), b);
  const gg = (a, b, c, d, x, s, t) => add(rol(add(add(a, (b & d) | (c & ~d)), add(x, t)), s), b);
  const hh = (a, b, c, d, x, s, t) => add(rol(add(add(a, b ^ c ^ d), add(x, t)), s), b);
  const ii = (a, b, c, d, x, s, t) => add(rol(add(add(a, c ^ (b | ~d)), add(x, t)), s), b);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  for (let offset = 0; offset < words.length; offset += 16) {
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    a = ff(a,b,c,d,words[offset+0]||0,7,-680876936); d = ff(d,a,b,c,words[offset+1]||0,12,-389564586); c = ff(c,d,a,b,words[offset+2]||0,17,606105819); b = ff(b,c,d,a,words[offset+3]||0,22,-1044525330);
    a = ff(a,b,c,d,words[offset+4]||0,7,-176418897); d = ff(d,a,b,c,words[offset+5]||0,12,1200080426); c = ff(c,d,a,b,words[offset+6]||0,17,-1473231341); b = ff(b,c,d,a,words[offset+7]||0,22,-45705983);
    a = ff(a,b,c,d,words[offset+8]||0,7,1770035416); d = ff(d,a,b,c,words[offset+9]||0,12,-1958414417); c = ff(c,d,a,b,words[offset+10]||0,17,-42063); b = ff(b,c,d,a,words[offset+11]||0,22,-1990404162);
    a = ff(a,b,c,d,words[offset+12]||0,7,1804603682); d = ff(d,a,b,c,words[offset+13]||0,12,-40341101); c = ff(c,d,a,b,words[offset+14]||0,17,-1502002290); b = ff(b,c,d,a,words[offset+15]||0,22,1236535329);
    a = gg(a,b,c,d,words[offset+1]||0,5,-165796510); d = gg(d,a,b,c,words[offset+6]||0,9,-1069501632); c = gg(c,d,a,b,words[offset+11]||0,14,643717713); b = gg(b,c,d,a,words[offset+0]||0,20,-373897302);
    a = gg(a,b,c,d,words[offset+5]||0,5,-701558691); d = gg(d,a,b,c,words[offset+10]||0,9,38016083); c = gg(c,d,a,b,words[offset+15]||0,14,-660478335); b = gg(b,c,d,a,words[offset+4]||0,20,-405537848);
    a = gg(a,b,c,d,words[offset+9]||0,5,568446438); d = gg(d,a,b,c,words[offset+14]||0,9,-1019803690); c = gg(c,d,a,b,words[offset+3]||0,14,-187363961); b = gg(b,c,d,a,words[offset+8]||0,20,1163531501);
    a = gg(a,b,c,d,words[offset+13]||0,5,-1444681467); d = gg(d,a,b,c,words[offset+2]||0,9,-51403784); c = gg(c,d,a,b,words[offset+7]||0,14,1735328473); b = gg(b,c,d,a,words[offset+12]||0,20,-1926607734);
    a = hh(a,b,c,d,words[offset+5]||0,4,-378558); d = hh(d,a,b,c,words[offset+8]||0,11,-2022574463); c = hh(c,d,a,b,words[offset+11]||0,16,1839030562); b = hh(b,c,d,a,words[offset+14]||0,23,-35309556);
    a = hh(a,b,c,d,words[offset+1]||0,4,-1530992060); d = hh(d,a,b,c,words[offset+4]||0,11,1272893353); c = hh(c,d,a,b,words[offset+7]||0,16,-155497632); b = hh(b,c,d,a,words[offset+10]||0,23,-1094730640);
    a = hh(a,b,c,d,words[offset+13]||0,4,681279174); d = hh(d,a,b,c,words[offset+0]||0,11,-358537222); c = hh(c,d,a,b,words[offset+3]||0,16,-722521979); b = hh(b,c,d,a,words[offset+6]||0,23,76029189);
    a = hh(a,b,c,d,words[offset+9]||0,4,-640364487); d = hh(d,a,b,c,words[offset+12]||0,11,-421815835); c = hh(c,d,a,b,words[offset+15]||0,16,530742520); b = hh(b,c,d,a,words[offset+2]||0,23,-995338651);
    a = ii(a,b,c,d,words[offset+0]||0,6,-198630844); d = ii(d,a,b,c,words[offset+7]||0,10,1126891415); c = ii(c,d,a,b,words[offset+14]||0,15,-1416354905); b = ii(b,c,d,a,words[offset+5]||0,21,-57434055);
    a = ii(a,b,c,d,words[offset+12]||0,6,1700485571); d = ii(d,a,b,c,words[offset+3]||0,10,-1894986606); c = ii(c,d,a,b,words[offset+10]||0,15,-1051523); b = ii(b,c,d,a,words[offset+1]||0,21,-2054922799);
    a = ii(a,b,c,d,words[offset+8]||0,6,1873313359); d = ii(d,a,b,c,words[offset+15]||0,10,-30611744); c = ii(c,d,a,b,words[offset+6]||0,15,-1560198380); b = ii(b,c,d,a,words[offset+13]||0,21,1309151649);
    a = ii(a,b,c,d,words[offset+4]||0,6,-145523070); d = ii(d,a,b,c,words[offset+11]||0,10,-1120210379); c = ii(c,d,a,b,words[offset+2]||0,15,718787259); b = ii(b,c,d,a,words[offset+9]||0,21,-343485551);
    a0 = add(a0, a); b0 = add(b0, b); c0 = add(c0, c); d0 = add(d0, d);
  }
  const hex = (value) => {
    let output = '';
    for (let i = 0; i < 4; i += 1) {
      output += (`0${((value >> (i * 8)) & 0xff).toString(16)}`).slice(-2);
    }
    return output;
  };
  return `${hex(a0)}${hex(b0)}${hex(c0)}${hex(d0)}`;
}

function buildSignature(base, path, token, secret, timestamp, api) {
  const pathOnly = path.split('?')[0];
  const source = api === 'old'
    ? `${pathOnly}${token}${timestamp}${secret}`
    : `${base}${pathOnly}${token}${secret}${timestamp}`;
  return md5(source);
}

async function request(ctx, { base, path, token, secret, api, method = 'GET', body, policy, tokenState }) {
  markTokenAttempt(tokenState);
  const timestamp = Math.floor(Date.now() / 1000);
  const headers = {
    'Request-Time': String(timestamp),
    'Request-Sign': buildSignature(base, path, token, secret, timestamp, api),
    Authorization: api === 'new' ? `ios:${token}` : token,
    'Content-Type': 'application/json',
    Accept: api === 'new' ? '*/*' : 'application/json',
  };
  if (api === 'new') {
    headers['Accept-Language'] = 'zh-Hans-CN;q=1.0, en-CN;q=0.9';
    headers['Accept-Encoding'] = 'gzip, deflate';
    headers['User-Agent'] = 'YJB/2.0.13 (com.xiaoduotou.yjb; build:975; iOS 26.5.0) Alamofire/5.10.2 iPad8,6';
    headers.Cookie = 'cna=1c1bb34ac9014f8ab07e6e9943d98cb9';
  }
  const options = { headers, timeout: HTTP_TIMEOUT_MS };
  if (policy) options.policy = policy;
  if (body) options.body = body;
  let response;
  try {
    response = method === 'POST'
      ? await ctx.http.post(`${base}${path}`, options)
      : await ctx.http.get(`${base}${path}`, options);
  } catch (error) {
    markTokenFailure(tokenState, '网络错误');
    throw error;
  }
  if (response.status < 200 || response.status >= 300) {
    const invalid = response.status === 401 || response.status === 403;
    markTokenFailure(tokenState, invalid ? '令牌无效' : `HTTP ${response.status}`, invalid);
    throw new Error(invalid ? '登录令牌已失效，请重新登录' : `HTTP ${response.status}`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch (_) {
    markTokenFailure(tokenState, '响应解析失败');
    throw new Error('服务返回的内容无法解析');
  }
  try {
    const result = unwrap(payload);
    markTokenSuccess(tokenState);
    return result;
  } catch (error) {
    const invalid = Number(error && error.code) === 401 || Number(error && error.code) === 403;
    markTokenFailure(tokenState, invalid ? '令牌无效' : '请求失败', invalid);
    throw error;
  }
}

async function requestQuote(ctx, options) {
  const diagnostics = options.quoteDiagnostics;
  if (diagnostics) diagnostics.attempted += 1;
  try {
    const quote = readObject(await request(ctx, options));
    if (diagnostics) {
      if (hasUsableQuote(quote)) diagnostics.usable += 1;
      else diagnostics.empty += 1;
    }
    return quote;
  } catch (_) {
    if (diagnostics) diagnostics.failed += 1;
    return {};
  }
}

function hasDailyRate(quote = {}) {
  return pickNumber(
    quote.gszzl, quote.vgszzl, quote.zsgzzl, quote.increase_rate, quote.increaseRate,
    quote.day_growth_rate, quote.dayGrowthRate, quote.change_percent, quote.changePercent,
    quote.change_rate, quote.changeRate, quote.rate, quote.growth_rate, quote.growthRate,
    quote.rise_rate, quote.riseRate, quote.weighted_increase_rate, quote.average_increase_rate,
    quote.weightedIncreaseRate, quote.averageIncreaseRate, quote.increase, quote.change,
  ) !== null;
}

function hasDailyAmount(quote = {}) {
  return pickNumber(
    quote.estimate_amount, quote.estimated_amount, quote.gsz_change_amount,
    quote.vgsz_change_amount, quote.estimate_profit, quote.estimated_profit,
    quote.estimateProfit, quote.estimatedProfit, quote.increase_amount,
    quote.increaseAmount, quote.change_amount, quote.changeAmount,
    quote.daily_change_amount, quote.dailyChangeAmount, quote.day_earn,
    quote.today_earn, quote.daily_profit, quote.dailyProfit, quote.today_profit,
    quote.todayProfit, quote.day_income, quote.dayIncome, quote.profit_today,
    quote.profitToday, quote.profit, quote.income, quote.today_change, quote.todayChange,
  ) !== null;
}

function hasUsableQuote(quote = {}) {
  return hasDailyRate(quote) || hasDailyAmount(quote);
}

async function requestQuoteWithRetry(ctx, options, attempts = QUOTE_ATTEMPTS, requireRate = false) {
  let result = {};
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    result = await requestQuote(ctx, options);
    const complete = requireRate ? hasDailyRate(result) : hasUsableQuote(result);
    const usableAmount = requireRate && hasDailyAmount(result);
    if (complete || usableAmount) return result;
    if (attempt + 1 < attempts) {
      await new Promise((resolve) => setTimeout(resolve, QUOTE_RETRY_DELAY_MS * (attempt + 1)));
    }
  }
  return result;
}

function historyTimestamp(item) {
  return parseTimestamp(pickText(
    item.date, item.nav_date, item.navDate, item.trade_date, item.tradeDate,
    item.gztime, item.update_time, item.updated_at, item.timestamp, item.sjrq,
  ));
}

function historyNav(item) {
  return pickNumber(
    item.nav, item.unit_nav, item.unit_net, item.unitNetValue, item.net_value,
    item.netValue, item.dwjz, item.latest_nav, item.latestNav, item.value,
  );
}

async function fetchHistoryQuote(ctx, { base, token, secret, policy, fundId, tokenState, quoteDiagnostics }) {
  if (quoteDiagnostics) quoteDiagnostics.attempted += 1;
  try {
    const data = await request(ctx, {
      base,
      path: `/market/v1/fund-nav/fund-history-nav?fund_id=${encodeURIComponent(fundId)}`,
      token, secret, api: 'new', policy, tokenState,
    });
    const history = readList(data)
      .filter((item) => item && typeof item === 'object')
      .sort((a, b) => {
        const at = historyTimestamp(a)?.getTime() || 0;
        const bt = historyTimestamp(b)?.getTime() || 0;
        return bt - at;
      });
    if (!history.length) return {};
    const current = history[0];
    const previous = history.slice(1).find((item) => historyNav(item) !== null);
    const currentNav = historyNav(current);
    const previousNav = previous ? historyNav(previous) : null;
    const dailyRate = hasDailyRate(current)
      ? current
      : currentNav !== null && previousNav !== null && previousNav !== 0
        ? { ...current, day_growth_rate: (currentNav - previousNav) / previousNav * 100 }
        : current;
    if (quoteDiagnostics) {
      if (hasUsableQuote(dailyRate)) quoteDiagnostics.usable += 1;
      else quoteDiagnostics.empty += 1;
    }
    return {
      ...dailyRate,
      nav: currentNav,
      last_nav: previousNav,
      update_time: pickText(
        current.update_time, current.updated_at, current.timestamp,
        current.date, current.nav_date, current.trade_date,
      ),
    };
  } catch (_) {
    if (quoteDiagnostics) quoteDiagnostics.failed += 1;
    return {};
  }
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);
  const runners = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function createQuoteSourceHealth() {
  return {
    misses: new Map(),
    pending: new Map(),
    disabled: new Set(),
  };
}

async function requestQuoteSource(health, sourceKey, runner) {
  if (health.disabled.has(sourceKey)) return {};
  const misses = health.misses.get(sourceKey) || 0;
  const pending = health.pending.get(sourceKey) || 0;
  if (misses + pending >= 3) {
    health.disabled.add(sourceKey);
    return {};
  }
  health.pending.set(sourceKey, pending + 1);
  let result = {};
  try {
    result = await runner();
  } finally {
    const remaining = (health.pending.get(sourceKey) || 1) - 1;
    if (remaining > 0) health.pending.set(sourceKey, remaining);
    else health.pending.delete(sourceKey);
  }
  if (hasUsableQuote(result)) {
    health.misses.delete(sourceKey);
    health.disabled.delete(sourceKey);
    return result;
  }
  const totalMisses = (health.misses.get(sourceKey) || 0) + 1;
  health.misses.set(sourceKey, totalMisses);
  // A source that misses several consecutive funds is probably unavailable.
  // Stop probing it for the rest of this refresh and move to the next source.
  if (totalMisses >= 3) health.disabled.add(sourceKey);
  return {};
}

async function fetchNewQuotes(ctx, { base, token, secret, policy, fundIds, tokenState, quoteDiagnostics }) {
  const uniqueFundIds = [...new Set(fundIds.map((id) => String(id)))];
  const sourceHealth = createQuoteSourceHealth();
  const pairs = await mapWithConcurrency(uniqueFundIds, QUOTE_CONCURRENCY, async (fundId) => {
    // The rate endpoint is the lightest endpoint and contains the fields needed by
    // the widget. Query it first so a slow valuation endpoint cannot starve later funds.
    const rate = await requestQuoteSource(sourceHealth, 'increase-rate', () => requestQuoteWithRetry(ctx, {
      base,
      path: `/market/v1/fund/increase-rate?fund_id=${encodeURIComponent(fundId)}`,
      token, secret, api: 'new', policy, tokenState, quoteDiagnostics,
    }, QUOTE_ATTEMPTS, true));
    if (hasUsableQuote(rate)) return [fundId, { ...rate, _quoteSource: 'realtime' }];

    const estimate = await requestQuoteSource(sourceHealth, 'gz-data', () => requestQuoteWithRetry(ctx, {
      base,
      path: `/market/v1/fund/gz-data?fund_id=${encodeURIComponent(fundId)}&source=1`,
      token, secret, api: 'new', policy, tokenState, quoteDiagnostics,
    }, 1));
    let merged = { ...estimate, ...rate };
    if (!hasUsableQuote(merged)) {
      const overview = await requestQuoteSource(sourceHealth, 'overview', () => requestQuote(ctx, {
        base,
        path: `/market/v1/fund/overview?data_source=1&fund_id=${encodeURIComponent(fundId)}`,
        token, secret, api: 'new', policy, tokenState, quoteDiagnostics,
      }));
      merged = { ...overview, ...merged, _quoteSource: 'overview' };
    }
    if (!hasUsableQuote(merged)) {
      const history = await requestQuoteSource(sourceHealth, 'history', () => fetchHistoryQuote(ctx, {
        base, token, secret, policy, fundId, tokenState, quoteDiagnostics,
      }));
      merged = { ...history, ...merged, _quoteSource: 'history' };
    }
    if (!merged._quoteSource && hasUsableQuote(merged)) merged._quoteSource = 'estimate';
    return [fundId, merged];
  });
  return new Map(pairs);
}

async function fetchNew(ctx, env, tokenState) {
  const token = env.YJB_TOKEN;
  const secret = env.YJB_SIGNING_SECRET;
  const base = (env.YJB_API_BASE || DEFAULT_BASE).replace(/\/+$/, '');
  const policy = env.YJB_POLICY || '';
  if (!token || !secret) {
    if (!token) tokenState.status = 'missing';
    else markTokenFailure(tokenState, '签名密钥未配置');
    throw new Error('请在小组件配置中填写 YJB_TOKEN 和 YJB_SIGNING_SECRET');
  }
  let accountId = env.YJB_ACCOUNT_ID;
  if (!accountId) {
    const accountData = await request(ctx, {
      base, path: '/users/v1/user-account', token, secret, api: 'new', policy, tokenState,
    });
    const accounts = readList(accountData);
    accountId = accounts[0] && accounts[0].id;
    if (!accountId) return { rows: [], marketStatus: isTradingWindow() ? '开市' : '休市' };
  }
  const holdingsData = await request(ctx, {
    base,
    path: `/position/v1/static/fund-accounts/${encodeURIComponent(accountId)}/funds`,
    token, secret, api: 'new', policy,
    tokenState,
  });
  const holdings = readList(holdingsData);
  if (!holdings.length) return { rows: [], marketStatus: isTradingWindow() ? '开市' : '休市' };
  const fundIds = [...new Set(holdings
    .map(fundIdOf)
    .filter((id) => id !== undefined && id !== null)
    .map((id) => String(id)))];
  let fundInfo = [];
  if (fundIds.length) {
    try {
      fundInfo = readList(await request(ctx, {
        base,
        path: '/market/v1/fund/batch',
        token,
        secret,
        api: 'new',
        policy,
        tokenState,
        method: 'POST',
        body: { funds: fundIds.map((fund_id) => ({ fund_id, data_source: '1' })) },
      }));
    } catch (_) {
      // Fund metadata is supplemental. Keep holdings and let quote fallbacks
      // populate the values when the batch endpoint is unavailable.
      fundInfo = [];
    }
  }
  const explicitStatus = explicitStatusFromRecords([...holdings, ...fundInfo]);
  const quoteDiagnostics = { attempted: 0, usable: 0, empty: 0, failed: 0 };
  const quoteById = fundIds.length && explicitStatus !== '休市'
    ? await fetchNewQuotes(ctx, { base, token, secret, policy, fundIds, tokenState, quoteDiagnostics })
    : new Map();
  const rows = normalizeRows(holdings, fundInfo, quoteById);
  return { rows, marketStatus: resolveMarketStatus(rows), quoteDiagnostics };
}

async function fetchOld(ctx, env, tokenState) {
  const token = env.YJB_TOKEN;
  const secret = env.YJB_SIGNING_SECRET;
  const accountId = env.YJB_ACCOUNT_ID;
  if (!token || !secret || !accountId) {
    if (!token) tokenState.status = 'missing';
    else if (!secret || !accountId) markTokenFailure(tokenState, '旧接口配置不完整');
    throw new Error('旧接口需要配置 YJB_TOKEN、YJB_SIGNING_SECRET 和 YJB_ACCOUNT_ID');
  }
  const base = (env.YJB_API_BASE || 'http://browser-plug-api.yangjibao.com').replace(/\/+$/, '');
  const policy = env.YJB_POLICY || '';
  const data = await request(ctx, {
    base,
    path: `/fund_hold?account_id=${encodeURIComponent(accountId)}`,
    token,
    secret,
    api: 'old',
    policy,
    tokenState,
  });
  const rows = readList(data).map((holding) => {
    const nav = holding.nv_info || {};
    const dailyChangePct = pickNumber(nav.gszzl, nav.vgszzl, nav.zsgzzl, holding.day_growth_rate);
    const estimateNav = pickNumber(nav.gsz, nav.vgsz, nav.zsgz);
    const lastNav = pickNumber(holding.last_net, holding.last_nav);
    const shares = pickNumber(holding.hold_share, holding.shares);
    const marketValue = pickNumber(holding.money, holding.market_value);
    const dailyChangeAmount = dailyChangePct !== null && marketValue !== null
      ? marketValue * dailyChangePct / 100
      : dailyChangePct !== null && shares !== null && estimateNav !== null && lastNav !== null
        ? shares * (estimateNav - lastNav)
        : null;
    const explicitStatus = explicitMarketStatus(nav.market_status, nav.marketStatus, nav.status, nav.is_open);
    const quoteAt = parseTimestamp(pickText(nav.gztime, nav.vgsztime, nav.zsgztime, nav.update_time, nav.updated_at));
    const sourceIsLive = dailyChangePct !== null || dailyChangeAmount !== null;
    const fresh = quoteIsFresh(quoteAt);
    return {
      name: String(holding.short_name || holding.name || holding.code || '基金'),
      dailyChangeAmount,
      dailyChangePct,
      latestNavFetched: [estimateNav, lastNav].some((value) => value !== null && value > 0),
      dailyChangeIsLive: sourceIsLive && fresh,
      dailyChangeSource: sourceIsLive && !fresh ? 'stale' : 'realtime',
      marketStatus: explicitStatus || (isTradingWindow() ? '开市' : '休市'),
      marketStatusExplicit: explicitStatus !== null,
      quoteAt: quoteAt ? quoteAt.toISOString() : null,
    };
  });
  return { rows, marketStatus: resolveMarketStatus(rows) };
}

async function readCache(ctx) {
  try {
    const value = await ctx.storage.getJSON(CACHE_KEY);
    return value && typeof value === 'object' ? value : null;
  } catch (_) {
    return null;
  }
}

async function writeCache(ctx, value) {
  try {
    await ctx.storage.setJSON(CACHE_KEY, value);
  } catch (_) {
    // Storage is an optional optimization. A write failure must not turn a
    // successful API response into an error state.
  }
}

export default async function (ctx) {
  const env = ctx.env || {};
  const api = env.YJB_API === 'old' ? 'old' : 'new';
  const family = ctx.widgetFamily || 'systemMedium';
  const options = displayOptions(env);
  const widgetUrl = pickText(env.YJB_WIDGET_URL).trim();
  const tokenState = createTokenState(env.YJB_TOKEN);
  let rows = [];
  let state = '加载中';
  let updatedAt = '--';
  let marketStatus = isTradingWindow() ? '开市' : '休市';
  let refreshSeconds = marketStatus === '开市' ? OPEN_REFRESH_SECONDS : CLOSED_REFRESH_SECONDS;
  let dataStatus = 'loading';
  let cache;

  try {
    cache = await readCache(ctx);
    const fetchPromise = (api === 'old' ? fetchOld(ctx, env, tokenState) : fetchNew(ctx, env, tokenState))
      .then((value) => ({ ok: true, value }))
      .catch((error) => ({ ok: false, error }));
    let timeoutId;
    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve({ pending: true }), FETCH_DEADLINE_MS);
    });
    const outcome = await Promise.race([fetchPromise, timeoutPromise]);
    clearTimeout(timeoutId);
    if (outcome.pending) {
      if (cache && Array.isArray(cache.rows) && Date.now() - cache.savedAt < CACHE_TTL_SECONDS * 1000) {
        const cachedRows = normalizeCachedRows(cache.rows);
        const cachedStatus = cache.marketStatus || resolveMarketStatus(cachedRows);
        const cachedUpdatedAt = cache.updatedAt || (cache.lastSuccessAt ? localTime(new Date(cache.lastSuccessAt)) : '--');
        return makeWidget(cachedRows, cachedUpdatedAt, '缓存', cachedStatus, cachedStatus === '开市' ? OPEN_REFRESH_SECONDS : ERROR_REFRESH_SECONDS, family, options, resolveDataStatus(cachedRows, cachedStatus, 'error'), tokenState, widgetUrl);
      }
      return makeWidget([], '--', '加载中', marketStatus, ERROR_REFRESH_SECONDS, family, options, 'loading', tokenState, widgetUrl);
    }
    if (!outcome.ok) throw outcome.error;
    const fetched = outcome.value;
    const fetchedRows = Array.isArray(fetched) ? fetched : fetched.rows || [];
    rows = mergeCachedRows(fetchedRows, cache && cache.rows);
    marketStatus = Array.isArray(fetched) ? resolveMarketStatus(rows) : fetched.marketStatus || resolveMarketStatus(rows);
    const lastSuccessAt = Date.now();
    updatedAt = localTime(new Date(lastSuccessAt));
    state = '实时';
    const quoteDiagnostics = fetched.quoteDiagnostics;
    const quoteRequestState = quoteDiagnostics
      && quoteDiagnostics.usable === 0
      && quoteDiagnostics.failed > 0
      && quoteDiagnostics.empty === 0
      ? 'quote-error'
      : 'success';
    dataStatus = resolveDataStatus(rows, marketStatus, quoteRequestState);
    refreshSeconds = marketStatus === '开市' ? OPEN_REFRESH_SECONDS : CLOSED_REFRESH_SECONDS;
    await writeCache(ctx, { rows, marketStatus, updatedAt, lastSuccessAt, savedAt: lastSuccessAt });
  } catch (error) {
    if (cache && Array.isArray(cache.rows) && Date.now() - cache.savedAt < CACHE_TTL_SECONDS * 1000) {
      rows = normalizeCachedRows(cache.rows);
      updatedAt = cache.updatedAt || (cache.lastSuccessAt ? localTime(new Date(cache.lastSuccessAt)) : '--');
      marketStatus = cache.marketStatus || resolveMarketStatus(rows);
      state = `缓存 · ${String(error.message || '请求失败').slice(0, 22)}`;
      dataStatus = resolveDataStatus(rows, marketStatus, 'error');
    } else {
      state = String(error.message || '请求失败').slice(0, 28);
      dataStatus = resolveDataStatus(rows, marketStatus, 'error');
    }
    refreshSeconds = marketStatus === '开市' ? OPEN_REFRESH_SECONDS : ERROR_REFRESH_SECONDS;
  }

  return makeWidget(rows, updatedAt, state, marketStatus, refreshSeconds, family, options, dataStatus, tokenState, widgetUrl);
}
