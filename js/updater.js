const CACHE_KEY = 'metahaters_live_openrouter_v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const PROVIDER_GEO = {
  openai: { country: 'US', flag: '🇺🇸', countryName: 'Estados Unidos', region: 'USA' },
  anthropic: { country: 'US', flag: '🇺🇸', countryName: 'Estados Unidos', region: 'USA' },
  google: { country: 'US', flag: '🇺🇸', countryName: 'Estados Unidos', region: 'USA' },
  'meta-llama': { country: 'US', flag: '🇺🇸', countryName: 'Estados Unidos', region: 'USA' },
  'x-ai': { country: 'US', flag: '🇺🇸', countryName: 'Estados Unidos', region: 'USA' },
  nvidia: { country: 'US', flag: '🇺🇸', countryName: 'Estados Unidos', region: 'USA' },
  microsoft: { country: 'US', flag: '🇺🇸', countryName: 'Estados Unidos', region: 'USA' },
  amazon: { country: 'US', flag: '🇺🇸', countryName: 'Estados Unidos', region: 'USA' },
  perplexity: { country: 'US', flag: '🇺🇸', countryName: 'Estados Unidos', region: 'USA' },
  deepseek: { country: 'CN', flag: '🇨🇳', countryName: 'China', region: 'China' },
  qwen: { country: 'CN', flag: '🇨🇳', countryName: 'China', region: 'China' },
  'z-ai': { country: 'CN', flag: '🇨🇳', countryName: 'China', region: 'China' },
  thudm: { country: 'CN', flag: '🇨🇳', countryName: 'China', region: 'China' },
  moonshotai: { country: 'CN', flag: '🇨🇳', countryName: 'China', region: 'China' },
  minimax: { country: 'CN', flag: '🇨🇳', countryName: 'China', region: 'China' },
  baidu: { country: 'CN', flag: '🇨🇳', countryName: 'China', region: 'China' },
  bytedance: { country: 'CN', flag: '🇨🇳', countryName: 'China', region: 'China' },
  stepfun: { country: 'CN', flag: '🇨🇳', countryName: 'China', region: 'China' },
  mistralai: { country: 'FR', flag: '🇫🇷', countryName: 'Francia', region: 'Europa' },
  cohere: { country: 'CA', flag: '🇨🇦', countryName: 'Canadá', region: 'USA' },
  ai21: { country: 'IL', flag: '🇮🇱', countryName: 'Israel', region: 'Asia-Pac' },
  upstage: { country: 'KR', flag: '🇰🇷', countryName: 'Corea del Sur', region: 'Asia-Pac' }
};

function fmtCtx(len) {
  if (!len) return 'N/A';
  if (len >= 1_000_000) return `${(len / 1_000_000).toFixed(len % 1_000_000 === 0 ? 0 : 1)}M`;
  return `${Math.round(len / 1000)}K`;
}

function toPerMillion(val) {
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Number((n * 1_000_000).toFixed(3));
}

export function getCachedLiveSync() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function fetchLiveOpenRouter(force = false) {
  if (!force) {
    const cached = getCachedLiveSync();
    if (cached) return { ...cached, fromCache: true };
  }

  const res = await fetch('https://openrouter.ai/api/v1/models');
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
  const payload = await res.json();
  const list = Array.isArray(payload.data) ? payload.data : [];

  const priceMap = {};
  for (const m of list) {
    priceMap[m.id] = {
      inputPer1M: toPerMillion(m.pricing?.prompt),
      outputPer1M: toPerMillion(m.pricing?.completion),
      context: fmtCtx(m.context_length)
    };
  }

  const liveModels = list
    .filter((m) => PROVIDER_GEO[m.id.split('/')[0]] && m.context_length >= 32000)
    .sort((a, b) => (b.created || 0) - (a.created || 0))
    .slice(0, 60)
    .map((m) => {
      const prefix = m.id.split('/')[0];
      const geo = PROVIDER_GEO[prefix];
      const inM = toPerMillion(m.pricing?.prompt);
      const outM = toPerMillion(m.pricing?.completion);
      return {
        id: m.id,
        name: m.name || m.id,
        provider: prefix,
        ...geo,
        context: fmtCtx(m.context_length),
        inputPer1M: inM,
        outputPer1M: outM,
        isFree: m.id.endsWith(':free') || (inM === 0 && outM === 0),
        created: m.created || 0
      };
    });

  const result = {
    ts: Date.now(),
    totalSeen: list.length,
    liveModels,
    priceMap,
    fromCache: false
  };

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(result));
  } catch {
    // Ignore storage quota issues
  }
  return result;
}

const FX_CACHE_KEY = 'metahaters_live_fx_v1';

export async function fetchLiveFX() {
  try {
    const cached = JSON.parse(localStorage.getItem(FX_CACHE_KEY) || 'null');
    if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) return cached;
  } catch { /* ignore */ }

  const res = await fetch('https://open.er-api.com/v6/latest/USD', {
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error(`FX HTTP ${res.status}`);
  const data = await res.json();
  if (!data?.rates) throw new Error('Invalid FX response');
  const payload = {
    ts: Date.now(),
    updated: data.time_last_update_utc || new Date().toISOString(),
    rates: data.rates
  };
  try {
    localStorage.setItem(FX_CACHE_KEY, JSON.stringify(payload));
  } catch { /* ignore */ }
  return payload;
}

const NEWS_CACHE_KEY = 'metahaters_dev_news_v1';
const NEWS_TTL_MS = 30 * 60 * 1000; // 30 min

export async function fetchDevNews(force = false) {
  if (!force) {
    try {
      const cached = JSON.parse(localStorage.getItem(NEWS_CACHE_KEY) || 'null');
      if (cached && (Date.now() - cached.ts) < NEWS_TTL_MS) return cached;
    } catch { /* ignore */ }
  }

  const [hnRes, devtoRes] = await Promise.allSettled([
    fetch('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=12', {
      signal: AbortSignal.timeout(8000)
    }).then((r) => r.ok ? r.json() : null),
    fetch('https://dev.to/api/articles?top=1&per_page=10', {
      signal: AbortSignal.timeout(8000)
    }).then((r) => r.ok ? r.json() : null)
  ]);

  const items = [];
  if (hnRes.status === 'fulfilled' && hnRes.value?.hits) {
    for (const h of hnRes.value.hits) {
      if (!h.title) continue;
      items.push({
        source: 'HN',
        title: h.title,
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        points: h.points || 0,
        comments: h.num_comments || 0,
        author: h.author || '',
        isAI: /\b(ai|llm|gpt|claude|deepseek|qwen|kimi|glm|agent|mcp|model|openai|anthropic|nvidia|mistral|gemini|ollama)\b/i.test(h.title)
      });
    }
  }
  if (devtoRes.status === 'fulfilled' && Array.isArray(devtoRes.value)) {
    for (const a of devtoRes.value) {
      items.push({
        source: 'Dev.to',
        title: a.title,
        url: a.url,
        points: a.public_reactions_count || 0,
        comments: a.comments_count || 0,
        author: a.user?.username || '',
        isAI: /\b(ai|llm|gpt|claude|deepseek|qwen|agent|mcp|rag|python|cursor|opencode)\b/i.test(`${a.title} ${(a.tag_list || []).join(' ')}`)
      });
    }
  }

  const payload = { ts: Date.now(), items };
  if (items.length) {
    try { localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(payload)); } catch { /* ignore */ }
  }
  return payload;
}
