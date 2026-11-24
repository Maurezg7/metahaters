#!/usr/bin/env node
/**
 * metahaters auto-updater (zero dependencies, Node 20+)
 * Syncs live AI model pricing/context from OpenRouter API and GitHub stars/activity.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');

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
  '01-ai': { country: 'CN', flag: '🇨🇳', countryName: 'China', region: 'China' },
  stepfun: { country: 'CN', flag: '🇨🇳', countryName: 'China', region: 'China' },
  mistralai: { country: 'FR', flag: '🇫🇷', countryName: 'Francia', region: 'Europa' },
  cohere: { country: 'CA', flag: '🇨🇦', countryName: 'Canadá', region: 'USA' },
  ai21: { country: 'IL', flag: '🇮🇱', countryName: 'Israel', region: 'Asia-Pac' },
  upstage: { country: 'KR', flag: '🇰🇷', countryName: 'Corea del Sur', region: 'Asia-Pac' },
  liquid: { country: 'US', flag: '🇺🇸', countryName: 'Estados Unidos', region: 'USA' }
};

async function readJson(name) {
  return JSON.parse(await fs.readFile(path.join(DATA_DIR, name), 'utf8'));
}

async function writeJson(name, data) {
  await fs.writeFile(path.join(DATA_DIR, name), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function fmtCtx(len) {
  if (!len) return 'N/A';
  if (len >= 1_000_000) return `${(len / 1_000_000).toFixed(len % 1_000_000 === 0 ? 0 : 1)}M`;
  return `${Math.round(len / 1000)}K`;
}

function toPerMillion(val) {
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return null;
  return Number((n * 1_000_000).toFixed(3));
}

async function syncOpenRouter(models) {
  let liveModels = [];
  let updated = 0;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'User-Agent': 'metahaters-updater/1.0' },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const list = Array.isArray(payload.data) ? payload.data : [];
    const byId = new Map(list.map((m) => [m.id, m]));

    for (const item of models) {
      if (!item.openRouterId) continue;
      const live = byId.get(item.openRouterId) || list.find((m) => m.id.startsWith(item.openRouterId));
      if (!live) continue;
      const inM = toPerMillion(live.pricing?.prompt);
      const outM = toPerMillion(live.pricing?.completion);
      if (inM !== null) item.metrics.inputPer1M = inM;
      if (outM !== null) item.metrics.outputPer1M = outM;
      if (live.context_length) item.metrics.context = fmtCtx(live.context_length);
      item.liveSyncedAt = new Date().toISOString();
      updated++;
    }

    // Build compact live radar (latest free + frontier models from tracked providers)
    liveModels = list
      .filter((m) => {
        const prefix = m.id.split('/')[0];
        return Boolean(PROVIDER_GEO[prefix]) && m.context_length >= 32000;
      })
      .sort((a, b) => (b.created || 0) - (a.created || 0))
      .slice(0, 60)
      .map((m) => {
        const prefix = m.id.split('/')[0];
        const geo = PROVIDER_GEO[prefix] || { country: 'GL', flag: '🌍', countryName: 'Global', region: 'Global' };
        const inM = toPerMillion(m.pricing?.prompt) ?? 0;
        const outM = toPerMillion(m.pricing?.completion) ?? 0;
        const isFree = m.id.endsWith(':free') || (inM === 0 && outM === 0);
        return {
          id: m.id,
          name: m.name || m.id,
          provider: prefix,
          ...geo,
          context: fmtCtx(m.context_length),
          inputPer1M: inM,
          outputPer1M: outM,
          isFree,
          created: m.created || 0
        };
      });

    await writeJson('live-models.json', liveModels);
    return { status: 'ok', totalOpenRouter: list.length, curatedUpdated: updated, liveRadarCount: liveModels.length };
  } catch (err) {
    console.warn('[openrouter] sync skipped:', err.message);
    return { status: `fallback (${err.message})`, totalOpenRouter: 0, curatedUpdated: 0, liveRadarCount: 0 };
  }
}

async function syncGitHub(datasets) {
  const headers = { 'User-Agent': 'metahaters-updater/1.0', Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  let updated = 0;
  let rateLimited = false;

  for (const items of datasets) {
    for (const item of items) {
      if (!item.githubRepo || rateLimited) continue;
      try {
        const res = await fetch(`https://api.github.com/repos/${item.githubRepo}`, {
          headers,
          signal: AbortSignal.timeout(8000)
        });
        if (res.status === 403 || res.status === 429) {
          rateLimited = true;
          continue;
        }
        if (!res.ok) continue;
        const repo = await res.json();
        item.github = {
          stars: repo.stargazers_count,
          pushedAt: repo.pushed_at?.slice(0, 10) || null,
          license: repo.license?.spdx_id || null
        };
        updated++;
      } catch {
        // Ignore single repo failures to keep sync resilient
      }
    }
  }
  return { status: rateLimited ? 'partial (rate-limited)' : 'ok', updated };
}

async function main() {
  const files = ['models.json', 'apis.json', 'languages.json', 'tools.json'];
  const loaded = {};
  for (const f of files) loaded[f] = await readJson(f);

  const orStats = await syncOpenRouter(loaded['models.json']);
  const ghStats = await syncGitHub(Object.values(loaded));

  for (const f of files) await writeJson(f, loaded[f]);

  const meta = {
    name: 'metahaters',
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    autoUpdateIntervalHours: 6,
    counts: {
      models: loaded['models.json'].length,
      apis: loaded['apis.json'].length,
      languages: loaded['languages.json'].length,
      tools: loaded['tools.json'].length,
      liveModels: orStats.liveRadarCount
    },
    sources: [
      { name: 'OpenRouter Models API', url: 'https://openrouter.ai/api/v1/models', status: orStats.status, totalSeen: orStats.totalOpenRouter },
      { name: 'GitHub REST API', url: 'https://api.github.com', status: ghStats.status, reposUpdated: ghStats.updated }
    ]
  };

  await writeJson('meta.json', meta);
  console.log('metahaters sync complete:', JSON.stringify(meta, null, 2));
}

main();
