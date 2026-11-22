import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import widget from '../yjb-fund-widget.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const PREVIEW_DIR = path.join(REPO_ROOT, 'preview');
const PREVIEW_HTML = path.join(PREVIEW_DIR, 'index.html');

export const FAMILIES = [
  { id: 'systemSmall', label: '小号 (Small)', width: 158, height: 158, radius: 22, lock: false },
  { id: 'systemMedium', label: '中号 (Medium)', width: 338, height: 158, radius: 22, lock: false },
  { id: 'systemLarge', label: '大号 (Large)', width: 338, height: 354, radius: 22, lock: false },
  { id: 'systemExtraLarge', label: '超大号 (XL)', width: 715, height: 354, radius: 24, lock: false },
  { id: 'accessoryRectangular', label: '锁屏矩形', width: 172, height: 76, radius: 14, lock: true },
  { id: 'accessoryCircular', label: '锁屏圆形', width: 76, height: 76, radius: 38, lock: true },
  { id: 'accessoryInline', label: '锁屏单行', width: 240, height: 24, radius: 12, lock: true },
];

const jsonResp = (data, status = 200) => ({
  status,
  json: async () => ({ code: status === 200 ? 200 : status, data }),
});

function shanghaiToday() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function makeStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getJSON: async (key) => values.get(key),
    setJSON: async (key, value) => { values.set(key, value); },
  };
}

export function validateDsl(node, nodePath = 'widget') {
  const errors = [];
  if (!node || typeof node !== 'object') {
    return [`${nodePath}: node must be an object`];
  }
  const allowedTypes = new Set(['widget', 'stack', 'text', 'image', 'spacer', 'date']);
  if (!allowedTypes.has(node.type)) {
    errors.push(`${nodePath}: invalid type "${node.type}"`);
    return errors;
  }
  if (node.opacity !== undefined && !['text', 'image', 'date'].includes(node.type)) {
    errors.push(`${nodePath}: opacity is not supported on "${node.type}"`);
  }
  if ((node.borderRadius !== undefined || node.borderWidth !== undefined || node.borderColor !== undefined)
    && !['stack', 'image'].includes(node.type)) {
    errors.push(`${nodePath}: border properties are only supported on stack/image`);
  }
  if ((node.width !== undefined || node.height !== undefined) && !['stack', 'image'].includes(node.type)) {
    errors.push(`${nodePath}: width/height are only supported on stack/image`);
  }
  if (node.backgroundGradient) {
    const grad = node.backgroundGradient;
    if (!Array.isArray(grad.colors) || grad.colors.length === 0) {
      errors.push(`${nodePath}: backgroundGradient requires non-empty colors array`);
    }
    if (grad.stops && (!Array.isArray(grad.stops) || grad.stops.length !== grad.colors.length)) {
      errors.push(`${nodePath}: backgroundGradient stops length must match colors length`);
    }
  }
  if (node.type === 'text') {
    if (typeof node.text !== 'string') errors.push(`${nodePath}: text.text must be a string`);
    if (node.maxLines !== undefined && (!Number.isInteger(node.maxLines) || node.maxLines < 1)) {
      errors.push(`${nodePath}: text.maxLines must be positive integer`);
    }
    if (node.minScale !== undefined && (typeof node.minScale !== 'number' || node.minScale <= 0 || node.minScale > 1)) {
      errors.push(`${nodePath}: text.minScale must be in (0, 1]`);
    }
  }
  if (node.type === 'image') {
    if (typeof node.src !== 'string' || (!node.src.startsWith('sf-symbol:') && !node.src.startsWith('data:'))) {
      errors.push(`${nodePath}: image.src must start with sf-symbol: or data:`);
    }
  }
  if (node.type === 'stack') {
    if (node.direction !== undefined && !['row', 'column'].includes(node.direction)) {
      errors.push(`${nodePath}: stack.direction must be row or column`);
    }
    if (!Array.isArray(node.children)) {
      errors.push(`${nodePath}: stack.children must be an array`);
    }
  }
  if (Array.isArray(node.children)) {
    node.children.forEach((child, index) => {
      errors.push(...validateDsl(child, `${nodePath}.children[${index}]`));
    });
  }
  return errors;
}

function buildScenarios() {
  const today = shanghaiToday();
  const nowIso = new Date().toISOString();
  const baseHoldings = [
    { fund_id: 1001, short_name: '易方达蓝筹精选混合', money: 18500 },
    { fund_id: 1002, short_name: '中欧医疗健康混合A', money: 12400 },
    { fund_id: 1003, short_name: '招商中证白酒指数(LOF)A', money: 9600 },
    { fund_id: 1004, short_name: '广发纳斯达克100ETF联接(QDII)C', money: 14200 },
  ];

  const denseHoldings = [
    { fund_id: 2001, short_name: '易方达消费行业股票型证券投资基金', money: 22000 },
    { fund_id: 2002, short_name: '华夏沪深300交易型开放式指数联接A', money: 18000 },
    { fund_id: 2003, short_name: '富国天惠精选成长混合型(LOF)A', money: 15600 },
    { fund_id: 2004, short_name: '景顺长城新兴成长混合型证券投资基金', money: 12300 },
    { fund_id: 2005, short_name: '广发双擎升级混合型证券投资基金A', money: 9800 },
    { fund_id: 2006, short_name: '南方中证500ETF联接基金C类份额', money: 11200 },
    { fund_id: 2007, short_name: '兴全合润混合型证券投资基金(LOF)', money: 13400 },
    { fund_id: 2008, short_name: '交银施罗德定期支付双息平衡混合', money: 8900 },
    { fund_id: 2009, short_name: '汇添富中证主要消费ETF联接A', money: 7600 },
    { fund_id: 2010, short_name: '诺安成长混合型证券投资基金', money: 6400 },
  ];

  const makeLiveCtx = (holdings, rates, {
    marketStatus = 'open',
    valuationDate = today,
    navMap = null,
    envExtra = {},
    cacheSeed = {},
    failQuotes = false,
  } = {}) => ({
    env: { YJB_TOKEN: 'preview-token', YJB_SIGNING_SECRET: 'preview-secret', ...envExtra },
    storage: makeStorage(cacheSeed),
    http: {
      get: async (url) => {
        if (url.includes('/users/v1/user-account')) return jsonResp({ list: [{ id: 1 }] });
        if (url.includes('/fund-accounts/')) {
          return jsonResp({
            list: holdings.map((h) => ({
              ...h,
              market_status: marketStatus,
              ...(navMap && navMap[h.fund_id] !== undefined ? { last_net: navMap[h.fund_id] } : {}),
            })),
          });
        }
        if (failQuotes && /increase-rate|gz-data|fund\/overview|fund-history-nav/.test(url)) {
          throw new Error('quote endpoint unavailable');
        }
        if (url.includes('/increase-rate')) {
          const id = Number(new URL(url).searchParams.get('fund_id'));
          const item = rates[id];
          if (!item) return jsonResp({ market_status: marketStatus });
          return jsonResp({
            weighted_increase_rate: item.pct,
            increase_amount: item.amt,
            market_status: marketStatus,
            time: nowIso,
            true_valuation_date: item.date || valuationDate,
          });
        }
        if (url.includes('/gz-data') || url.includes('/fund/overview')) return jsonResp({});
        if (url.includes('/fund-history-nav')) return jsonResp({ list: [] });
        throw new Error(`Unexpected URL: ${url}`);
      },
      post: async () => jsonResp(holdings.map((h) => ({
        fund_id: h.fund_id,
        short_name: h.short_name,
        market_status: marketStatus,
        ...(rates[h.fund_id] ? { day_growth_rate: rates[h.fund_id].pct } : {}),
        ...(navMap && navMap[h.fund_id] !== undefined ? { nav: navMap[h.fund_id] } : {}),
      }))),
    },
  });

  return [
    {
      id: 'live',
      label: '开市 · 实时',
      ctx: () => makeLiveCtx(baseHoldings, {
        1001: { pct: 1.84, amt: 340.40 },
        1002: { pct: 0.62, amt: 76.88 },
        1003: { pct: -1.15, amt: -110.40 },
        1004: { pct: 0.00, amt: 0.00 },
      }),
    },
    {
      id: 'partial',
      label: '部分实时',
      ctx: () => makeLiveCtx(baseHoldings, {
        1001: { pct: 1.52, amt: 281.20, date: today },
        1002: { pct: -0.45, amt: -55.80, date: today },
        1003: { pct: 0.35, amt: 33.60, date: '2000-01-01' },
      }),
    },
    {
      id: 'closed',
      label: '休市 · 最新净值',
      ctx: () => makeLiveCtx(
        baseHoldings,
        {
          1001: { pct: 1.42, amt: 262.70 },
          1002: { pct: -0.78, amt: -96.72 },
          1003: { pct: 0.31, amt: 29.76 },
          1004: { pct: null, amt: null },
        },
        { marketStatus: 'closed', navMap: { 1001: 1.842, 1002: 1.125 } },
      ),
    },
    {
      id: 'delayed',
      label: '数据延迟',
      ctx: () => makeLiveCtx(baseHoldings, {
        1001: { pct: 0.94, amt: 173.90, date: '2000-01-01' },
        1002: { pct: -0.32, amt: -39.68, date: '2000-01-01' },
      }),
    },
    {
      id: 'quote-error',
      label: '行情源故障 (缓存)',
      ctx: () => makeLiveCtx(baseHoldings.slice(0, 3), {}, {
        failQuotes: true,
        cacheSeed: {
          'yjb-fund-widget-cache-v2': {
            rows: [
              { id: '1001', name: '易方达蓝筹精选混合', dailyChangeAmount: 215.40, dailyChangePct: 1.18, estimateNav: 1.82 },
              { id: '1002', name: '中欧医疗健康混合A', dailyChangeAmount: -48.20, dailyChangePct: -0.39, estimateNav: 1.11 },
              { id: '1003', name: '招商中证白酒指数(LOF)A', dailyChangeAmount: 64.00, dailyChangePct: 0.67, estimateNav: 0.94 },
            ],
            marketStatus: '开市',
            updatedAt: '11/22 14:15',
            savedAt: Date.now(),
          },
        },
      }),
    },
    {
      id: 'loading',
      label: '加载中',
      fastDeadline: true,
      ctx: () => ({
        env: { YJB_TOKEN: 'preview-token', YJB_SIGNING_SECRET: 'preview-secret' },
        storage: makeStorage(),
        http: {
          get: () => new Promise(() => {}),
          post: () => new Promise(() => {}),
        },
      }),
    },
    {
      id: 'empty',
      label: '空持仓',
      ctx: () => ({
        env: { YJB_TOKEN: 'preview-token', YJB_SIGNING_SECRET: 'preview-secret' },
        storage: makeStorage(),
        http: {
          get: async (url) => {
            if (url.includes('/users/v1/user-account')) return jsonResp({ list: [{ id: 1 }] });
            if (url.includes('/fund-accounts/')) return jsonResp({ list: [] });
            throw new Error(url);
          },
          post: async () => jsonResp([]),
        },
      }),
    },
    {
      id: 'token-missing',
      label: 'Token 未配置',
      ctx: () => ({
        env: { YJB_SIGNING_SECRET: 'preview-secret' },
        storage: makeStorage(),
        http: { get: async () => jsonResp({}), post: async () => jsonResp({}) },
      }),
    },
    {
      id: 'token-invalid',
      label: 'Token 失效',
      ctx: () => ({
        env: { YJB_TOKEN: 'expired', YJB_SIGNING_SECRET: 'preview-secret' },
        storage: makeStorage(),
        http: {
          get: async () => ({ status: 401, json: async () => ({ code: 401, message: 'unauthorized' }) }),
          post: async () => jsonResp({}),
        },
      }),
    },
    {
      id: 'fields-disabled',
      label: '字段已关闭',
      ctx: () => makeLiveCtx(baseHoldings.slice(0, 3), {
        1001: { pct: 1.12, amt: 207.20 },
        1002: { pct: -0.45, amt: -55.80 },
        1003: { pct: 0.25, amt: 24.00 },
      }, {
        envExtra: {
          YJB_SHOW_DAILY_CHANGE_AMOUNT: '0',
          YJB_SHOW_DAILY_CHANGE_PCT: '0',
        },
      }),
    },
    {
      id: 'dense-10',
      label: '10只长名称持仓',
      ctx: () => makeLiveCtx(denseHoldings, {
        2001: { pct: 2.35, amt: 517.00 },
        2002: { pct: 1.48, amt: 266.40 },
        2003: { pct: 0.85, amt: 132.60 },
        2004: { pct: 0.42, amt: 51.66 },
        2005: { pct: -0.18, amt: -17.64 },
        2006: { pct: -0.64, amt: -71.68 },
        2007: { pct: -1.12, amt: -150.08 },
        2008: { pct: 0.15, amt: 13.35, date: '2000-01-01' },
        2009: { pct: -0.92, amt: -69.92, date: '2000-01-01' },
        2010: { pct: null, amt: null },
      }),
    },
  ];
}

async function renderScenarioFamily(scenario, familyId) {
  const baseCtx = scenario.ctx();
  const ctx = { ...baseCtx, widgetFamily: familyId };
  if (!scenario.fastDeadline) {
    return widget(ctx);
  }
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, delay, ...args) => (
    Number(delay) >= 50000
      ? realSetTimeout(fn, 0, ...args)
      : realSetTimeout(fn, delay, ...args)
  );
  try {
    return await widget(ctx);
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
}

export async function renderAll() {
  const scenarios = buildScenarios();
  const renders = [];
  const errors = [];
  for (const scenario of scenarios) {
    const familyMap = {};
    for (const family of FAMILIES) {
      const dsl = await renderScenarioFamily(scenario, family.id);
      const issues = validateDsl(dsl, `${scenario.id}.${family.id}`);
      if (issues.length) errors.push(...issues);
      familyMap[family.id] = dsl;
    }
    renders.push({
      id: scenario.id,
      label: scenario.label,
      families: familyMap,
    });
  }
  return { scenarios: renders, families: FAMILIES, errors };
}

function buildHtml(data) {
  const payload = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>养基宝 Egern 小组件视觉预览</title>
<style>
  :root {
    color-scheme: dark;
    --page-bg: #07090f;
    --panel-bg: rgba(17, 24, 39, 0.78);
    --panel-border: rgba(255, 255, 255, 0.10);
    --text-main: #f8fafc;
    --text-sub: #94a3b8;
    --accent: #60a5fa;
    --accent-bg: rgba(96, 165, 250, 0.16);
    --good: #3dd68c;
    --bad: #ff6b6b;
  }
  body.light-backdrop {
    --page-bg: #e2e8f0;
    --panel-bg: rgba(255, 255, 255, 0.85);
    --panel-border: rgba(15, 23, 42, 0.12);
    --text-main: #0f172a;
    --text-sub: #475569;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif;
    background: radial-gradient(circle at top left, rgba(59, 130, 246, 0.12), transparent 36%), var(--page-bg);
    color: var(--text-main);
    min-height: 100vh;
    padding: 24px;
    transition: background 0.2s ease, color 0.2s ease;
  }
  .toolbar {
    max-width: 1320px;
    margin: 0 auto 20px;
    padding: 16px 20px;
    border-radius: 16px;
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(18px);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .toolbar-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .title-wrap h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .title-wrap p {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--text-sub);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .pill {
    appearance: none;
    border: 1px solid var(--panel-border);
    background: rgba(255, 255, 255, 0.04);
    color: var(--text-sub);
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .pill:hover:not(:disabled) {
    border-color: rgba(96, 165, 250, 0.5);
    color: var(--text-main);
    transform: translateY(-1px);
  }
  .pill:active:not(:disabled) {
    transform: scale(0.97);
  }
  .pill:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .pill.active {
    background: var(--accent-bg);
    border-color: rgba(96, 165, 250, 0.65);
    color: var(--accent);
    font-weight: 600;
  }
  .pill:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .grid {
    max-width: 1320px;
    margin: 0 auto;
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    align-items: flex-start;
  }
  .card {
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    border-radius: 18px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .card-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 12px;
  }
  .card-meta strong { font-weight: 600; }
  .badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
  }
  .badge.ok { color: var(--good); background: rgba(61, 214, 140, 0.14); }
  .badge.fail { color: var(--bad); background: rgba(255, 107, 107, 0.16); }
  .widget-frame {
    position: relative;
    overflow: hidden;
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    cursor: pointer;
    transition: transform 0.16s ease;
  }
  .widget-frame:hover { transform: translateY(-2px); }
  .widget-frame.lock-frame {
    background: linear-gradient(135deg, rgba(148, 163, 184, 0.24), rgba(51, 65, 85, 0.36));
    backdrop-filter: blur(12px);
    color: #ffffff;
  }
  .dsl-text {
    margin: 0;
    line-height: 1.2;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dsl-text.multiline {
    white-space: normal;
    display: -webkit-box;
    -webkit-box-orient: vertical;
  }
  .drawer {
    position: fixed;
    right: 20px;
    bottom: 20px;
    width: min(520px, calc(100vw - 40px));
    max-height: 60vh;
    background: #0f172a;
    color: #e2e8f0;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
    display: none;
    flex-direction: column;
    z-index: 40;
  }
  .drawer.open { display: flex; }
  .drawer-head {
    padding: 10px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 600;
  }
  .drawer pre {
    margin: 0;
    padding: 12px 14px;
    overflow: auto;
    font-size: 11px;
    line-height: 1.45;
  }
</style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-top">
      <div class="title-wrap">
        <h1>养基宝 Egern 小组件视觉预览</h1>
        <p>覆盖全部 7 种小组件尺寸与 11 种业务/异常状态 · 点击任意小组件卡片可查看 DSL JSON</p>
      </div>
      <div class="actions">
        <button id="toggleBackdrop" class="pill" type="button">切换浅色壁纸</button>
      </div>
    </div>
    <div id="scenarioPills" class="pill-row"></div>
    <div id="familyPills" class="pill-row"></div>
  </div>

  <div id="grid" class="grid"></div>

  <div id="drawer" class="drawer" role="dialog" aria-label="DSL Inspector">
    <div class="drawer-head">
      <span id="drawerTitle">Widget DSL</span>
      <button id="closeDrawer" class="pill" type="button">关闭</button>
    </div>
    <pre id="drawerBody"></pre>
  </div>

<script>
const DATA = ${payload};
const FONT_MAP = {
  largeTitle: 34, title: 28, title2: 22, title3: 20, headline: 17,
  body: 17, callout: 16, subheadline: 15, footnote: 13, caption1: 12, caption2: 11
};
const WEIGHT_MAP = {
  ultraLight: 100, thin: 200, light: 300, regular: 400, medium: 500,
  semibold: 600, bold: 700, heavy: 800, black: 900
};
const SYMBOL_SVG = {
  'chart.line.uptrend.xyaxis': '<path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/>',
  'bolt.fill': '<path fill="currentColor" stroke="none" d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/>',
  'clock.fill': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  'clock.arrow.circlepath': '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  'moon.fill': '<path fill="currentColor" stroke="none" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  'exclamationmark.triangle.fill': '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/>',
  'exclamationmark.circle.fill': '<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><circle cx="12" cy="16" r="1" fill="currentColor" stroke="none"/>',
  'arrow.triangle.2.circlepath': '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  'tray': '<path d="M3 13l2-7h14l2 7v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z"/><path d="M3 13h5l2 3h4l2-3h5"/>',
  'checkmark.shield.fill': '<path d="M12 2l8 4v6c0 5-3.4 9.7-8 11-4.6-1.3-8-6-8-11V6l8-4z"/><path d="M9 12l2 2 4-4"/>',
  'exclamationmark.shield.fill': '<path d="M12 2l8 4v6c0 5-3.4 9.7-8 11-4.6-1.3-8-6-8-11V6l8-4z"/><path d="M12 8v5"/><circle cx="12" cy="16" r="1" fill="currentColor" stroke="none"/>',
  'key.fill': '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M21 2l-9.6 9.6"/><path d="M15.5 7.5l3 3"/>',
  'wifi.exclamationmark': '<path d="M5 12.6a10 10 0 0 1 14 0"/><path d="M8.5 16.1a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none"/><path d="M12 5v5"/>',
  'eye.slash': '<path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.1A10.9 10.9 0 0 1 12 5c5.5 0 9.6 4.4 10.5 7a11.7 11.7 0 0 1-4.1 5"/><path d="M6.6 6.6A12 12 0 0 0 1.5 12c1 2.6 5 7 10.5 7 1.6 0 3.1-.4 4.4-1"/>',
  'questionmark.circle': '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/>'
};

function padCss(padding) {
  if (padding === undefined) return '0px';
  if (typeof padding === 'number') return padding + 'px';
  if (Array.isArray(padding) && padding.length === 2) return padding[0] + 'px ' + padding[1] + 'px';
  if (Array.isArray(padding) && padding.length === 4) return padding.map((v) => v + 'px').join(' ');
  return '0px';
}

function gradCss(grad) {
  if (!grad || !Array.isArray(grad.colors)) return '';
  const stops = grad.colors.map((c, i) => grad.stops ? c + ' ' + (grad.stops[i] * 100) + '%' : c).join(', ');
  return 'linear-gradient(135deg, ' + stops + ')';
}

function renderNode(node, parentDir = 'column') {
  if (!node) return document.createTextNode('');
  if (node.type === 'spacer') {
    const sp = document.createElement('div');
    if (node.length) {
      sp.style.width = parentDir === 'row' ? node.length + 'px' : '1px';
      sp.style.height = parentDir === 'column' ? node.length + 'px' : '1px';
      sp.style.flexShrink = '0';
    } else {
      sp.style.flex = '1 1 0';
      sp.style.minWidth = '2px';
      sp.style.minHeight = '2px';
    }
    return sp;
  }
  if (node.type === 'text') {
    const p = document.createElement('p');
    p.className = 'dsl-text' + ((node.maxLines && node.maxLines > 1) ? ' multiline' : '');
    p.textContent = node.text;
    const size = node.font && node.font.size !== undefined
      ? (typeof node.font.size === 'number' ? node.font.size : (FONT_MAP[node.font.size] || 14))
      : 14;
    p.style.fontSize = size + 'px';
    if (node.font && node.font.weight) p.style.fontWeight = WEIGHT_MAP[node.font.weight] || 400;
    p.style.color = node.textColor || '#ffffff';
    p.style.textAlign = node.textAlign || 'left';
    if (node.maxLines && node.maxLines > 1) p.style.webkitLineClamp = String(node.maxLines);
    if (node.flex !== undefined) {
      p.style.flex = String(node.flex) + ' 1 0';
      p.style.minWidth = '0';
    }
    p.dataset.baseSize = String(size);
    p.dataset.minScale = String(node.minScale || 1);
    return p;
  }
  if (node.type === 'image') {
    const wrap = document.createElement('span');
    wrap.style.display = 'inline-flex';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'center';
    wrap.style.flexShrink = '0';
    const w = node.width || 14;
    const h = node.height || 14;
    wrap.style.width = w + 'px';
    wrap.style.height = h + 'px';
    wrap.style.color = node.color || '#ffffff';
    const sym = String(node.src || '').replace('sf-symbol:', '');
    wrap.innerHTML = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (SYMBOL_SVG[sym] || '<circle cx="12" cy="12" r="8"/>') + '</svg>';
    return wrap;
  }
  const el = document.createElement('div');
  const dir = node.direction || 'row';
  el.style.display = 'flex';
  el.style.flexDirection = dir === 'column' ? 'column' : 'row';
  el.style.gap = (node.gap || 0) + 'px';
  el.style.padding = padCss(node.padding);
  if (node.alignItems === 'start') el.style.alignItems = 'flex-start';
  else if (node.alignItems === 'end') el.style.alignItems = 'flex-end';
  else el.style.alignItems = 'center';
  if (dir === 'column' && !node.alignItems) el.style.alignItems = 'stretch';
  if (node.width) el.style.width = node.width + 'px';
  if (node.height) el.style.height = node.height + 'px';
  if (node.flex !== undefined) {
    el.style.flex = String(node.flex) + ' 1 0';
    el.style.minWidth = '0';
  }
  if (node.backgroundGradient) el.style.background = gradCss(node.backgroundGradient);
  else if (node.backgroundColor) el.style.backgroundColor = node.backgroundColor;
  if (node.borderRadius !== undefined) el.style.borderRadius = node.borderRadius + 'px';
  if (node.borderWidth) {
    el.style.borderWidth = node.borderWidth + 'px';
    el.style.borderStyle = 'solid';
    el.style.borderColor = node.borderColor || 'transparent';
  }
  (node.children || []).forEach((child) => el.appendChild(renderNode(child, dir)));
  return el;
}

function fitMinScale(container) {
  container.querySelectorAll('.dsl-text').forEach((el) => {
    const minScale = Number(el.dataset.minScale || 1);
    const base = Number(el.dataset.baseSize || 12);
    if (minScale < 1 && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      const ratio = Math.max(minScale, el.clientWidth / el.scrollWidth);
      el.style.fontSize = (base * ratio).toFixed(2) + 'px';
    }
  });
}

let activeScenario = DATA.scenarios[0].id;
let activeFamily = 'all';

function renderToolbar() {
  const sp = document.getElementById('scenarioPills');
  sp.innerHTML = '';
  DATA.scenarios.forEach((s) => {
    const btn = document.createElement('button');
    btn.className = 'pill' + (s.id === activeScenario ? ' active' : '');
    btn.textContent = s.label;
    btn.type = 'button';
    btn.onclick = () => { activeScenario = s.id; renderToolbar(); renderGrid(); };
    sp.appendChild(btn);
  });

  const fp = document.getElementById('familyPills');
  fp.innerHTML = '';
  [{ id: 'all', label: '全部尺寸' }, ...DATA.families].forEach((f) => {
    const btn = document.createElement('button');
    btn.className = 'pill' + (f.id === activeFamily ? ' active' : '');
    btn.textContent = f.label;
    btn.type = 'button';
    btn.onclick = () => { activeFamily = f.id; renderToolbar(); renderGrid(); };
    fp.appendChild(btn);
  });
}

function renderGrid() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  const scenario = DATA.scenarios.find((s) => s.id === activeScenario);
  const families = activeFamily === 'all' ? DATA.families : DATA.families.filter((f) => f.id === activeFamily);
  families.forEach((fam) => {
    const dsl = scenario.families[fam.id];
    const card = document.createElement('div');
    card.className = 'card';

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    const title = document.createElement('strong');
    title.textContent = fam.label + ' (' + fam.width + '×' + fam.height + ')';
    const badge = document.createElement('span');
    badge.className = 'badge ok';
    badge.textContent = '布局正常';
    meta.append(title, badge);

    const frame = document.createElement('div');
    frame.className = 'widget-frame' + (fam.lock ? ' lock-frame' : '');
    frame.style.width = fam.width + 'px';
    frame.style.height = fam.height + 'px';
    frame.style.borderRadius = fam.radius + 'px';
    frame.style.padding = padCss(dsl.padding);
    frame.style.gap = (dsl.gap || 0) + 'px';
    if (fam.id === 'accessoryCircular' || fam.id === 'accessoryInline') {
      frame.style.justifyContent = 'center';
      frame.style.alignItems = 'center';
    } else {
      frame.style.alignItems = 'stretch';
    }
    if (dsl.backgroundGradient) frame.style.background = gradCss(dsl.backgroundGradient);
    else if (dsl.backgroundColor) frame.style.backgroundColor = dsl.backgroundColor;

    (dsl.children || []).forEach((child) => frame.appendChild(renderNode(child, 'column')));
    frame.onclick = () => {
      document.getElementById('drawerTitle').textContent = scenario.label + ' · ' + fam.id;
      document.getElementById('drawerBody').textContent = JSON.stringify(dsl, null, 2);
      document.getElementById('drawer').classList.add('open');
    };

    card.append(meta, frame);
    grid.appendChild(card);

    requestAnimationFrame(() => {
      fitMinScale(frame);
      const overflowY = frame.scrollHeight > frame.clientHeight + 2;
      const overflowX = frame.scrollWidth > frame.clientWidth + 2;
      if (overflowY || overflowX) {
        badge.className = 'badge fail';
        badge.textContent = '溢出';
      }
    });
  });
}

document.getElementById('toggleBackdrop').onclick = (e) => {
  const light = document.body.classList.toggle('light-backdrop');
  e.target.textContent = light ? '切换深色壁纸' : '切换浅色壁纸';
};
document.getElementById('closeDrawer').onclick = () => {
  document.getElementById('drawer').classList.remove('open');
};
renderToolbar();
renderGrid();
</script>
</body>
</html>`;
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const buildOnly = args.includes('--build');
  const portIndex = args.indexOf('--port');
  const port = portIndex >= 0 && args[portIndex + 1] ? Number(args[portIndex + 1]) : 4173;

  const data = await renderAll();
  const total = data.scenarios.length * data.families.length;
  if (data.errors.length) {
    console.error(`DSL validation failed (${data.errors.length} issues):`);
    data.errors.forEach((err) => console.error(` - ${err}`));
    process.exit(1);
  }
  if (checkOnly) {
    console.log(`PASS: validated ${total} widget renders (${data.scenarios.length} scenarios × ${data.families.length} families)`);
    return;
  }

  const html = buildHtml(data);
  if (buildOnly) {
    await fs.mkdir(PREVIEW_DIR, { recursive: true });
    await fs.writeFile(PREVIEW_HTML, html, 'utf8');
    console.log(`BUILT: ${PREVIEW_HTML} (${total} renders)`);
    return;
  }

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, renders: total }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Preview server running at http://127.0.0.1:${port} (${total} renders)`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
