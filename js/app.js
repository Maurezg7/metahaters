import { fetchLiveOpenRouter, getCachedLiveSync, fetchLiveFX, fetchDevNews } from './updater.js';

const state = {
  items: [],
  osList: [],
  liveModels: [],
  agents: null,
  comparisons: null,
  frameworks: null,
  apiOccasions: [],
  apiOccFilter: 'all',
  intel: null,
  osTuning: null,
  warroom: null,
  devPicks: null,
  devNews: [],
  newsFilter: 'all',
  fxRates: null,
  meta: null,
  view: 'catalog',
  cat: 'all',
  price: 'all',
  region: 'all',
  sort: 'hackathon',
  query: '',
  osType: 'all',
  osFamily: 'all',
  osSort: 'processes',
  osQuery: '',
  browserSort: 'privacy',
  browserPlat: 'all',
  fwArea: 'all',
  agentTier: 'all',
  rankTab: 'overall',
  radarFilter: 'all',
  compareIds: []
};

function logoBadge(obj) {
  if (!obj.logo) {
    return `<span class="flag" title="${esc(obj.countryName || '')}">${obj.flag || ''}</span>`;
  }
  const abbr = esc((obj.name || 'OS').slice(0, 2).toUpperCase());
  return `
    <div class="logo-stack" title="${esc(obj.name)} · ${esc(obj.countryName || '')}">
      <div class="logo-tile">
        <img src="${esc(obj.logo)}" alt="${esc(obj.name)} logo" loading="lazy"
          onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${abbr}',style:'font-family:var(--mono);font-size:0.75rem;font-weight:700;color:var(--accent)'}))" />
      </div>
      <span class="flag-mini">${obj.flag || ''} ${esc(obj.country || '')}</span>
    </div>
  `;
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function esc(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function fmtStars(n) {
  if (!n) return '';
  return n >= 1000 ? `★ ${(n / 1000).toFixed(1)}k` : `★ ${n}`;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

async function copyText(text, label = 'Copiado al portapapeles') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    toast('No se pudo copiar automáticamente');
  }
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`Descargado ${filename}`);
}

function applyLivePricing(priceMap) {
  if (!priceMap) return;
  for (const item of state.items) {
    if (!item.openRouterId) continue;
    const live = priceMap[item.openRouterId];
    if (!live) continue;
    item.metrics.inputPer1M = live.inputPer1M;
    item.metrics.outputPer1M = live.outputPer1M;
    item.metrics.context = live.context;
  }
}

function renderKPIs() {
  const counts = { models: 0, apis: 0, languages: 0, tools: 0 };
  let freeCount = 0;
  let usSum = 0, usN = 0, cnSum = 0, cnN = 0;

  for (const it of state.items) {
    if (counts[it.category] !== undefined) counts[it.category]++;
    if (it.pricingTier === 'gratis' || it.pricingTier === 'freemium') freeCount++;
    if (it.country === 'US') { usSum += it.scores.hackathon; usN++; }
    if (it.country === 'CN') { cnSum += it.scores.hackathon; cnN++; }
  }

  $('#kpi-total').textContent = state.items.length + state.osList.length;
  $('#kpi-breakdown').textContent = `${counts.models} AI · ${counts.apis} APIs · ${counts.languages} Langs · ${counts.tools} Tools · ${state.osList.length} OS`;
  $('#kpi-live').textContent = state.liveModels.length ? `${state.liveModels.length} radar / ${state.meta?.sources?.[0]?.totalSeen || state.liveModels.length}` : '—';
  $('#kpi-geo').textContent = `🇺🇸 ${(usSum / Math.max(usN, 1)).toFixed(1)} vs 🇨🇳 ${(cnSum / Math.max(cnN, 1)).toFixed(1)}`;
  $('#kpi-free').textContent = `${Math.round((freeCount / Math.max(state.items.length, 1)) * 100)}% (${freeCount})`;

  if (state.meta?.lastUpdated) {
    const dt = new Date(state.meta.lastUpdated);
    const fmt = dt.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
    $('#kpi-updated').textContent = `Último sync: ${fmt}`;
    $('#footer-meta').textContent = `Sync: ${fmt} · ${state.items.length} curados + ${state.liveModels.length} radar en vivo`;
  }
}

function getFilteredItems() {
  const q = state.query.trim().toLowerCase();
  return state.items
    .filter((it) => {
      if (state.cat !== 'all' && it.category !== state.cat) return false;
      if (state.price !== 'all' && it.pricingTier !== state.price) return false;
      if (state.region !== 'all' && it.region !== state.region) return false;
      if (q) {
        const hay = `${it.name} ${it.provider} ${it.subType} ${it.countryName} ${it.region} ${it.pricingTier} ${it.bestFor} ${it.freeTier} ${it.agentTip}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (state.sort === 'stars') return (b.github?.stars || 0) - (a.github?.stars || 0);
      return (b.scores[state.sort] || 0) - (a.scores[state.sort] || 0);
    });
}

function renderCatalog() {
  const list = getFilteredItems();
  $('#results-count').textContent = `${list.length} resultado${list.length === 1 ? '' : 's'}`;
  const grid = $('#catalog-grid');

  if (!list.length) {
    grid.innerHTML = `<div class="panel"><p class="muted">Sin resultados para esos filtros. Prueba limpiar la búsqueda o cambiar de región.</p></div>`;
    return;
  }

  grid.innerHTML = list.map((it) => {
    const inCompare = state.compareIds.includes(it.id);
    const stars = fmtStars(it.github?.stars);
    const extraMetric = it.category === 'models'
      ? `Ctx ${esc(it.metrics.context)} · ${it.metrics.speedTps || '—'} tok/s`
      : it.category === 'apis'
        ? `Setup ${it.metrics.setupMin}m · ${it.metrics.latencyMs}ms`
        : esc(it.subType);

    const fwHtml = it.frameworks?.length
      ? `<div class="fw-list">${it.frameworks.slice(0, 3).map((fw) =>
        `<div class="fw-item"><strong>${esc(fw.name)}</strong>: ${esc(fw.advantage)}</div>`
      ).join('')}</div>`
      : '';

    return `
      <article class="card" data-id="${esc(it.id)}">
        <div class="card-top">
          <div class="card-title-row">
            ${logoBadge(it)}
            <div>
              <h3 class="card-title" data-open="${esc(it.id)}">${esc(it.name)}</h3>
              <div class="card-sub">${esc(it.provider)} · ${esc(it.countryName)}</div>
            </div>
          </div>
          <span class="score-badge" title="Hackathon Score">${it.scores.hackathon}</span>
        </div>

        <div class="badges">
          <span class="tag tag-${esc(it.pricingTier)}">${esc(it.pricingTier.toUpperCase())}</span>
          <span class="tag">${esc(it.subType)}</span>
          ${stars ? `<span class="tag">${stars}</span>` : ''}
        </div>

        <p class="card-desc">${esc(it.bestFor)}</p>
        ${fwHtml}
        <div class="card-price">${esc(it.priceLabel)} · <span class="muted">${extraMetric}</span></div>

        <div class="mini-bars">
          <div class="mini-bar">
            <div class="mini-bar-top"><span>Vel</span><span>${it.scores.speed}</span></div>
            <div class="track"><div class="fill" style="width:${it.scores.speed}%"></div></div>
          </div>
          <div class="mini-bar">
            <div class="mini-bar-top"><span>Valor</span><span>${it.scores.value}</span></div>
            <div class="track"><div class="fill" style="width:${it.scores.value}%"></div></div>
          </div>
          <div class="mini-bar">
            <div class="mini-bar-top"><span>Calidad</span><span>${it.scores.quality}</span></div>
            <div class="track"><div class="fill" style="width:${it.scores.quality}%"></div></div>
          </div>
        </div>

        <div class="card-foot">
          <button class="btn btn-sm btn-accent" data-open="${esc(it.id)}">Config &amp; Tutorial</button>
          <a class="btn btn-sm btn-ghost" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">Sitio ↗</a>
          <button class="btn btn-sm ${inCompare ? 'btn-accent' : 'btn-ghost'}" data-compare="${esc(it.id)}">
            ${inCompare ? '✓' : '+'}
          </button>
        </div>
      </article>
    `;
  }).join('');
}

function renderOS() {
  const q = state.osQuery.trim().toLowerCase();
  const list = state.osList
    .filter((o) => {
      if (state.osType === 'gaming' || state.osType === 'security' || state.osType === 'win3rd') {
        if (!(o.tags || []).includes(state.osType)) return false;
      } else if (state.osType !== 'all' && o.osType !== state.osType) {
        return false;
      }
      if (state.osFamily !== 'all') {
        if (state.osFamily === 'Mobile') {
          if (o.family !== 'Mobile' && o.family !== 'Other') return false;
        } else if (o.family !== state.osFamily) return false;
      }
      if (q) {
        const hay = `${o.name} ${o.family} ${o.osType} ${o.base} ${o.initSystem} ${o.countryName} ${o.bestFor} ${o.pros.join(' ')} ${o.cons.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (state.osSort === 'processes') return a.resources.idleProcesses - b.resources.idleProcesses;
      if (state.osSort === 'ram') return a.resources.idleRamMb - b.resources.idleRamMb;
      if (state.osSort === 'boot') return a.resources.bootSec - b.resources.bootSec;
      return (b.scores[state.osSort] || 0) - (a.scores[state.osSort] || 0);
    });

  $('#os-count-tag').textContent = `${list.length} sistemas`;

  const maxProcs = Math.max(...list.map((x) => x.resources.idleProcesses), 300);
  const maxRam = Math.max(...list.map((x) => x.resources.idleRamMb), 4200);

  $('#os-process-bars').innerHTML = list.slice(0, 12).map((o) => {
    const pPct = Math.max(4, Math.round((o.resources.idleProcesses / maxProcs) * 100));
    const rPct = Math.max(3, Math.round((o.resources.idleRamMb / maxRam) * 100));
    const color = o.resources.idleProcesses <= 80 ? '#4ADE80' : o.resources.idleProcesses <= 150 ? '#FFB21E' : '#FB7185';
    return `
      <div class="battle-row" style="cursor:pointer;" data-open-os="${esc(o.id)}">
        <div class="battle-head">
          <span>${o.flag} <strong>${esc(o.name)}</strong> <span class="muted">(${esc(o.initSystem)})</span></span>
          <span class="mono"><strong>${o.resources.idleProcesses} procs</strong> · ${o.resources.idleRamMb} MB RAM · CPU ${o.resources.cpuIdlePct}% · Boot ${o.resources.bootSec}s</span>
        </div>
        <div class="battle-track">
          <div class="battle-fill" style="width:${pPct}%; background:${color};" title="Procesos: ${o.resources.idleProcesses} | RAM: ${o.resources.idleRamMb}MB (${rPct}%)"></div>
        </div>
      </div>
    `;
  }).join('');

  $('#os-grid').innerHTML = list.map((o) => {
    const r = o.resources;
    const procCls = r.idleProcesses <= 80 ? 'low' : r.idleProcesses <= 150 ? 'med' : 'high';
    const ramCls = r.idleRamMb <= 550 ? 'low' : r.idleRamMb <= 1400 ? 'med' : 'high';
    return `
      <article class="card">
        <div class="card-top">
          <div class="card-title-row">
            ${logoBadge(o)}
            <div>
              <h3 class="card-title" data-open-os="${esc(o.id)}">${esc(o.name)}</h3>
              <div class="card-sub">${esc(o.osType)} · ${esc(o.base)} · Init: ${esc(o.initSystem)}</div>
            </div>
          </div>
          <span class="score-badge" title="Hackathon Score">${o.scores.hackathon}</span>
        </div>

        <div class="res-grid">
          <div class="res-cell"><span>Procesos</span><strong class="${procCls}">~${r.idleProcesses}</strong></div>
          <div class="res-cell"><span>RAM Idle</span><strong class="${ramCls}">${r.idleRamMb} MB</strong></div>
          <div class="res-cell"><span>Disco</span><strong>${r.diskGb} GB</strong></div>
          <div class="res-cell"><span>Boot / CPU</span><strong>${r.bootSec}s · ${r.cpuIdlePct}%</strong></div>
        </div>

        <p class="card-desc">${esc(o.bestFor)}</p>

        <div class="mini-pros">
          <div>
            <strong style="color:#86efac;">Ventajas</strong>
            <span>${esc(o.pros[0])}</span>
          </div>
          <div>
            <strong style="color:#fda4af;">Desventajas</strong>
            <span>${esc(o.cons[0])}</span>
          </div>
        </div>

        <div class="card-foot">
          <span class="tag tag-${esc(o.pricingTier || 'gratis')}">${esc(o.priceLabel || 'Gratis')}</span>
          <div style="display:flex;gap:6px;">
            ${o.url ? `<a class="btn btn-sm btn-ghost" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">Sitio ↗</a>` : ''}
            <button class="btn btn-sm btn-accent" data-open-os="${esc(o.id)}">Detalle &amp; Setup</button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function openOSDetail(id) {
  const o = state.osList.find((x) => x.id === id);
  if (!o) return;
  const r = o.resources;

  $('#modal-title-wrap').innerHTML = `
    <div class="card-title-row">
      <span class="flag" style="font-size:1.6rem;">${o.flag}</span>
      <div>
        <h2>${esc(o.name)}</h2>
        <p class="muted">${esc(o.osType)} · ${esc(o.family)} · Base: ${esc(o.base)} · Init: ${esc(o.initSystem)}</p>
      </div>
    </div>
  `;

  const osGuide = getOSInstallGuide(o);
  const cfgTitle = o.config?.title || 'Comando rápido / Post-instalación';
  const cfgLang = o.config?.lang || 'bash';
  const cfgCode = o.config?.code || o.command || `# Descarga oficial desde ${o.url || 'el sitio oficial'}`;

  $('#modal-body').innerHTML = `
    <div class="badges">
      <span class="tag tag-${esc(o.pricingTier || 'gratis')}">${esc(o.priceLabel || 'Gratis')}</span>
      <span class="tag">Hackathon: ${o.scores.hackathon}/100</span>
      <span class="tag">Ligereza: ${o.scores.lightness}/100</span>
      <span class="tag">Dev XP: ${o.scores.devXp}/100</span>
      <span class="tag">Estabilidad: ${o.scores.stability}/100</span>
      ${o.url ? `<a class="tag" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">Sitio oficial ↗</a>` : ''}
    </div>

    <div class="res-grid">
      <div class="res-cell"><span>Procesos en reposo</span><strong>~${r.idleProcesses} procesos</strong></div>
      <div class="res-cell"><span>RAM en reposo</span><strong>${r.idleRamMb} MB</strong></div>
      <div class="res-cell"><span>Espacio base</span><strong>${r.diskGb} GB</strong></div>
      <div class="res-cell"><span>CPU Idle / Arranque</span><strong>${r.cpuIdlePct}% · ${r.bootSec}s</strong></div>
    </div>

    ${renderInstallTabsHTML(osGuide, o.url)}

    <div class="pros-cons">
      <div class="box">
        <h4 style="color:#86efac;">Ventajas</h4>
        <ul class="bullet-list">${o.pros.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      </div>
      <div class="box">
        <h4 style="color:#fda4af;">Desventajas</h4>
        <ul class="bullet-list">${o.cons.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      </div>
    </div>

    <div class="code-block">
      <div class="code-head">
        <span>${esc(cfgTitle)} (${esc(cfgLang)})</span>
        <button class="btn btn-sm btn-accent" id="modal-copy-code">Copiar comando</button>
      </div>
      <pre>${esc(cfgCode)}</pre>
    </div>
  `;

  bindInstallTabs(osGuide);
  $('#modal-copy-code').onclick = () => copyText(cfgCode, 'Comando copiado');
  $('#detail-modal').showModal();
}

function getOSInstallGuide(o) {
  const url = o.url || '';
  if (o.id === 'os-graphene') {
    return {
      linux: `# 1. Abre Chromium/Brave en Linux y entra al Web Installer oficial:\n#    https://grapheneos.org/install/web\n# 2. Conecta tu Google Pixel por USB-C con OEM Unlocking activado y sigue el asistente.`,
      macos: `# 1. Abre Chrome/Brave en macOS y entra a:\n#    https://grapheneos.org/install/web\n# 2. Conecta tu Google Pixel por USB-C (sin instalar drivers extra).`,
      windows: `# 1. Instala el driver USB de Google (Windows Update -> Opcionales).\n# 2. Abre Chrome/Brave en https://grapheneos.org/install/web y conecta tu Pixel.`,
      android: `# Puedes flashear GrapheneOS desde otro teléfono Android usando Chrome/Brave en:\n# https://grapheneos.org/install/web con un cable USB-C a USB-C.`,
      ios: `# No soportado desde iOS (WebUSB requerido). Usa una PC o Android con Chrome/Brave.`
    };
  }
  if ((o.tags || []).includes('win3rd')) {
    return {
      linux: `# 1. Descarga la ISO oficial de Windows desde microsoft.com.\n# 2. Crea USB booteable con Ventoy (https://www.ventoy.net).\n# 3. Tras instalar Windows, descarga el playbook/script oficial en: ${url}`,
      macos: `# 1. Descarga ISO oficial Windows + herramienta/playbook desde: ${url}\n# 2. En Mac Apple Silicon puedes probarlo en VM con UTM (brew install --cask utm) o Parallels.`,
      windows: `# 1. Instala Windows 10/11 oficial limpio (o descarga la ISO oficial).\n# 2. Descarga y ejecuta el playbook/script oficial desde:\n#    ${url}\n# 3. Reinicia y verifica procesos en Administrador de Tareas.`,
      android: `# Solo PC x86_64/ARM64. Puedes descargar los archivos en el celular desde ${url} y pasarlos por USB.`,
      ios: `# Solo PC. Consulta la guía oficial en: ${url}`
    };
  }
  return {
    linux: `# 1. Descarga la ISO oficial desde: ${url}\n# 2. Grábala en un pendrive USB (8GB+) con Ventoy o BalenaEtcher:\n#    flatpak install flathub io.balena.etcher  # o: sudo dd if=imagen.iso of=/dev/sdX bs=4M status=progress\n# 3. Arranca desde USB (F12 / ESC) e instala.`,
    macos: `# 1. Descarga la ISO oficial desde: ${url}\n# 2. Para USB booteable: brew install --cask balenaetcher\n# 3. Para probar en máquina virtual (Apple Silicon/Intel): brew install --cask utm`,
    windows: `# 1. Descarga la ISO oficial desde: ${url}\n# 2. Crea un USB booteable con Rufus o Ventoy:\n#    winget install Rufus.Rufus   # o: winget install Ventoy.Ventoy\n# 3. Arranca desde el USB (F12 / F8 / DEL) e instala.`,
    android: `# Puedes crear el USB booteable desde Android sin PC usando EtchDroid (F-Droid) + adaptador OTG,\n# descargando la ISO oficial desde: ${url}`,
    ios: `# Descarga o consulta documentación oficial en: ${url}\n# Para crear el USB booteable necesitarás una PC o Android con EtchDroid.`
  };
}

function getInstallGuide(item) {
  const ov = state.osTuning?.installOverrides?.[item.id];
  if (ov) return ov;
  const name = item.name || 'Herramienta';
  const url = item.url || '';
  if (item.category === 'models' || item.category === 'apis') {
    const base = `# 1. Instala el SDK OpenAI-compatible (funciona igual en todos los OS)\nnpm install openai   # o: pip install openai\n\n# 2. Exporta tu API Key (consíguela en ${url})\nexport API_KEY="tu-key-aqui"\n\n# 3. Pega el snippet de configuración de abajo y listo.`;
    return {
      linux: base,
      macos: base,
      windows: `# PowerShell:\nnpm install openai   # o: pip install openai\n$env:API_KEY="tu-key-aqui"\n# Obtén la key en: ${url}`,
      android: `# En Termux (descargar desde F-Droid):\npkg update && pkg install -y nodejs-lts python\nnpm install openai\nexport API_KEY="tu-key-aqui"`,
      ios: `# En iOS usa la web oficial (${url}) o intégralo en tu app Swift/Flutter apuntando al endpoint HTTPS.`
    };
  }
  if (item.category === 'languages') {
    const id = item.id || '';
    const langMap = {
      typescript: {
        linux: "curl -fsSL https://fnm.vercel.app/install | bash && fnm install 22\nnpm i -g typescript tsx pnpm",
        macos: "brew install node pnpm && npm i -g typescript tsx",
        windows: "winget install OpenJS.NodeJS.LTS && npm i -g typescript tsx pnpm",
        android: "# En Termux:\npkg install -y nodejs-lts && npm i -g typescript tsx"
      },
      python: {
        linux: "curl -LsSf https://astral.sh/uv/install.sh | sh\nuv python install 3.12",
        macos: "brew install uv python@3.12",
        windows: "winget install Astral-Sh.Uv Python.Python.3.12",
        android: "# En Termux:\npkg install -y python python-pip"
      },
      go: {
        linux: "# Arch: sudo pacman -S go\n# Debian/Ubuntu: sudo apt install golang-go\n# Oficial: https://go.dev/dl/",
        macos: "brew install go",
        windows: "winget install GoLang.Go",
        android: "# En Termux:\npkg install -y golang"
      },
      rust: {
        linux: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
        macos: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
        windows: "winget install Rustlang.Rustup",
        android: "# En Termux:\npkg install -y rust"
      }
    };
    if (langMap[id]) return langMap[id];
  }
  return {
    linux: `# Descarga / instala ${name} en Linux:\n# Sitio oficial: ${url}\n# Revisa el snippet de configuración abajo para el comando exacto.`,
    macos: `# Instala ${name} en macOS (Homebrew o web oficial):\n# brew search ${name.toLowerCase().split(' ')[0]}\n# Sitio oficial: ${url}`,
    windows: `# Instala ${name} en Windows (winget o web oficial):\n# winget search "${name.split(' ')[0]}"\n# Sitio oficial: ${url}`,
    android: `# En Android usa Termux (F-Droid) si es CLI/API, o instala la app / web oficial desde:\n# ${url}`,
    ios: `# En iOS abre el sitio oficial o busca la app oficial en App Store:\n# ${url}`
  };
}

function renderInstallTabsHTML(guide, url = '') {
  return `
    <div class="box" id="install-guide-box">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
        <h4 style="margin:0;color:var(--accent-strong);">Cómo Instalar según tu Dispositivo</h4>
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
          ${url ? `<a class="btn btn-sm btn-ghost" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Sitio oficial ↗</a>` : ''}
          <div class="chip-group" id="modal-os-tabs">
            <button class="chip active" data-mos="linux">Linux</button>
            <button class="chip" data-mos="macos">macOS</button>
            <button class="chip" data-mos="windows">Windows</button>
            <button class="chip" data-mos="android">Android</button>
            <button class="chip" data-mos="ios">iOS</button>
          </div>
        </div>
      </div>
      <div class="code-block" style="margin:0;">
        <div class="code-head">
          <span id="modal-os-label">Linux</span>
          <button class="btn btn-sm btn-accent" id="modal-copy-install">Copiar comando</button>
        </div>
        <pre id="modal-os-pre">${esc(guide.linux || '')}</pre>
      </div>
    </div>
  `;
}

function bindInstallTabs(guide) {
  const labels = { linux: 'Linux', macos: 'macOS', windows: 'Windows', android: 'Android (Termux / APK)', ios: 'iOS (iPhone / iPad)' };
  let cur = 'linux';
  $('#modal-os-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mos]');
    if (!btn) return;
    cur = btn.dataset.mos;
    $$('#modal-os-tabs .chip').forEach((c) => c.classList.toggle('active', c === btn));
    $('#modal-os-label').textContent = labels[cur] || cur;
    $('#modal-os-pre').textContent = guide[cur] || guide.linux || '';
  });
  const copyBtn = $('#modal-copy-install');
  if (copyBtn) copyBtn.onclick = () => copyText(guide[cur] || '', `Comando para ${labels[cur]} copiado`);
}

function renderOsTuning() {
  if (!state.osTuning?.tuningGuides) return;
  $('#os-tuning-grid').innerHTML = state.osTuning.tuningGuides.map((g) => `
    <article class="card">
      <div class="card-top">
        <div class="card-title-row">
          ${logoBadge({ name: g.os, logo: g.logo, flag: g.flag, country: '' })}
          <div>
            <span class="tag tag-gratis">${esc(g.badge)}</span>
            <h3 class="card-title" style="margin-top:4px;">${esc(g.os)}</h3>
          </div>
        </div>
        <button class="btn btn-sm btn-accent" data-copy-tune="${esc(g.id)}">Copiar</button>
      </div>
      <p class="card-desc">${esc(g.summary)}</p>
      <div class="code-block">
        <div class="code-head"><span>Comandos de optimización</span><span>listos</span></div>
        <pre>${esc(g.commands)}</pre>
      </div>
    </article>
  `).join('');
}

function openBrowserDetail(id) {
  const b = state.intel?.browsers?.find((x) => x.id === id);
  if (!b) return;
  const guide = getInstallGuide(b);
  $('#modal-title-wrap').innerHTML = `
    <div class="card-title-row">
      ${logoBadge(b)}
      <div>
        <h2>${esc(b.name)}</h2>
        <p class="muted">${esc(b.engine)} · Privacidad ${b.privacy}/100 · RAM ~${b.idleRamMb} MB</p>
      </div>
    </div>
  `;
  $('#modal-body').innerHTML = `
    <div class="box"><h4>Ideal para</h4><div>${esc(b.bestFor)}</div></div>
    ${renderInstallTabsHTML(guide, b.url)}
    <div class="pros-cons">
      <div class="box"><h4 style="color:#86efac;">Ventajas</h4><ul class="bullet-list">${b.pros.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="box"><h4 style="color:#fda4af;">Cuidados</h4><ul class="bullet-list">${b.cons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
    </div>
  `;
  bindInstallTabs(guide);
  $('#detail-modal').showModal();
}

function renderBrowsers() {
  if (!state.intel?.browsers) return;
  const list = state.intel.browsers
    .filter((b) => state.browserPlat === 'all' || b.platforms.includes(state.browserPlat))
    .sort((a, b) =>
      state.browserSort === 'lightness' ? a.idleRamMb - b.idleRamMb : b.privacy - a.privacy
    );
  $('#browser-count').textContent = `${list.length} ${list.length === 1 ? 'navegador' : 'navegadores'}`;
  $('#browsers-grid').innerHTML = list.map((b) => {
    const ramCls = b.idleRamMb <= 250 ? 'low' : b.idleRamMb <= 380 ? 'med' : 'high';
    const platsHtml = b.platforms.map((p) => `<span class="tag">${p === 'PC' ? 'Escritorio' : esc(p)}</span>`).join('');
    return `
      <article class="card">
        <div class="card-top">
          <div class="card-title-row">
            ${logoBadge(b)}
            <div>
              <h3 class="card-title">${esc(b.name)}</h3>
              <div class="card-sub">${esc(b.engine)}</div>
            </div>
          </div>
          <span class="score-badge" title="Privacidad">${b.privacy}</span>
        </div>
        <div class="badges">${platsHtml}</div>
        <div class="res-grid">
          <div class="res-cell"><span>RAM Idle</span><strong class="${ramCls}">${b.idleRamMb} MB</strong></div>
          <div class="res-cell"><span>Procesos</span><strong>~${b.idleProcs}</strong></div>
          <div class="res-cell"><span>Privacidad</span><strong class="low">${b.privacy}/100</strong></div>
          <div class="res-cell"><span>Ligereza</span><strong>${b.lightness}/100</strong></div>
        </div>
        <p class="card-desc">${esc(b.bestFor)}</p>
        <div class="mini-pros">
          <div><strong style="color:#86efac;">Pro</strong><ul>${b.pros.slice(0, 2).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
          <div><strong style="color:#fda4af;">Contra</strong><ul>${b.cons.slice(0, 2).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        </div>
        <div class="card-foot">
          <button class="btn btn-sm btn-accent" data-open-browser="${esc(b.id)}">Tutorial Descarga</button>
          ${b.url ? `<a class="btn btn-sm btn-ghost" href="${esc(b.url)}" target="_blank" rel="noopener noreferrer">Sitio oficial ↗</a>` : ''}
        </div>
      </article>
    `;
  }).join('');
}

function renderApiOccasions() {
  if (!state.apiOccasions?.length) return;
  const filtersEl = $('#api-occ-filters');
  if (!filtersEl.dataset.ready) {
    filtersEl.innerHTML = `<button class="chip active" data-apiocc="all">Todas las Ocasiones</button>` +
      state.apiOccasions.map((o) => `<button class="chip" data-apiocc="${esc(o.id)}">${esc(o.occasion)}</button>`).join('');
    filtersEl.dataset.ready = '1';
  }
  const shown = state.apiOccFilter === 'all'
    ? state.apiOccasions
    : state.apiOccasions.filter((o) => o.id === state.apiOccFilter);

  $('#api-occ-grid').innerHTML = shown.map((o) => `
    <div class="box">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
        <div>
          <h3 style="margin:0;font-size:1rem;">${esc(o.occasion)}</h3>
          <div class="card-sub" style="margin-top:3px;">
            <strong style="color:#86efac;">Mejor Gratis:</strong> ${esc(o.winnerFree)} &nbsp;·&nbsp;
            <strong style="color:var(--accent-strong);">Mejor Pago:</strong> ${esc(o.winnerPaid)}
          </div>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>#</th><th>API</th><th>Tipo</th><th>Free Tier</th><th>Costo Pago</th><th>Score</th><th>Cuándo usarla</th></tr>
          </thead>
          <tbody>
            ${o.apis.map((a) => `
              <tr>
                <td class="mono">#${a.rank}</td>
                <td><div class="card-title-row">${logoBadge({ name: a.name, logo: a.logo, flag: a.flag, country: '' })}<a href="${esc(a.url || '#')}" target="_blank" rel="noopener noreferrer" style="color:var(--text);font-weight:700;text-decoration:none;">${esc(a.name)} <span style="color:var(--accent-strong);">↗</span></a></div></td>
                <td><span class="tag tag-${esc(a.tier)}">${esc(a.tier.toUpperCase())}</span></td>
                <td>${esc(a.freeLimit)}</td>
                <td class="mono">${esc(a.paidCost)}</td>
                <td><span class="score-pill ${a.score >= 96 ? 'gold' : 'hi'}">${a.score}</span></td>
                <td class="card-sub" style="color:#D4D4DD;">${esc(a.bestFor)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `).join('');
}

function renderFrameworks() {
  if (!state.frameworks) return;
  const areas = state.frameworks.byArea;
  const filtersEl = $('#fw-area-filters');
  if (!filtersEl.dataset.ready) {
    filtersEl.innerHTML = `<button class="chip active" data-fwarea="all">Todas las Áreas</button>` +
      areas.map((a) => `<button class="chip" data-fwarea="${esc(a.id)}">${esc(a.area)}</button>`).join('');
    filtersEl.dataset.ready = '1';
  }

  const shown = state.fwArea === 'all' ? areas : areas.filter((a) => a.id === state.fwArea);
  $('#fw-areas-grid').innerHTML = shown.map((a) => `
    <article class="card">
      <div class="card-top">
        <div>
          <span class="tag tag-gratis">GANADOR DEL ÁREA</span>
          <h3 class="card-title" style="margin-top:6px;">${esc(a.area)}</h3>
        </div>
      </div>
      <div class="box" style="margin:6px 0;">
        <strong style="color:var(--accent-strong);">${esc(a.winner)}</strong>
        <div class="card-sub" style="margin-top:4px;color:#D4D4DD;">${esc(a.whyWinner)}</div>
      </div>
      <div class="fw-list">
        ${a.frameworks.map((f) => `
          <div class="fw-item"><strong>${esc(f.name)}</strong> <span class="muted">(${esc(f.lang)})</span> — ${esc(f.use)}. <span style="color:#86efac;">${esc(f.edge)}</span></div>
        `).join('')}
      </div>
    </article>
  `).join('');

  $('#fw-by-lang-grid').innerHTML = state.frameworks.byLanguage.map((l) => `
    <article class="card">
      <div class="card-top">
        <div class="card-title-row">
          ${logoBadge({ name: l.lang, logo: l.logo, flag: l.flag, country: '' })}
          <h3 class="card-title">${esc(l.lang)}</h3>
        </div>
      </div>
      <ul class="bullet-list">${l.top.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </article>
  `).join('');
}

function updateFxConverter() {
  const rates = state.fxRates || state.intel?.fallbackFx?.rates;
  if (!rates) return;
  const amt = parseFloat($('#fx-amount').value || '0');
  const from = $('#fx-from').value || 'USD';
  const to = $('#fx-to').value || 'ARS';
  if (!rates[from] || !rates[to]) return;
  const out = (amt / rates[from]) * rates[to];
  $('#fx-result').textContent = `${amt.toLocaleString('es-AR')} ${from} = ${out.toLocaleString('es-AR', { maximumFractionDigits: 2 })} ${to}`;
}

function renderIntel() {
  if (!state.intel) return;
  const rates = state.fxRates || state.intel.fallbackFx.rates;
  const codes = Object.keys(state.intel.fallbackFx.rates);
  const fromEl = $('#fx-from');
  const toEl = $('#fx-to');
  if (!fromEl.options.length) {
    codes.forEach((c) => {
      fromEl.add(new Option(c, c, c === 'USD', c === 'USD'));
      toEl.add(new Option(c, c, c === 'ARS', c === 'ARS'));
    });
  }
  updateFxConverter();

  $('#fx-table-body').innerHTML = state.intel.topFiatCurrencies.map((c) => {
    const r = rates[c.code];
    return `
      <tr>
        <td>${c.flag} <strong>${esc(c.code)}</strong> <span class="muted">${esc(c.name)}</span></td>
        <td class="mono" style="color:var(--accent-strong);">${r ? r.toLocaleString('es-AR', { maximumFractionDigits: 3 }) : '—'}</td>
        <td class="mono">${esc(c.share)}</td>
        <td>${esc(c.rail)}</td>
        <td class="card-sub" style="color:#D4D4DD;">${esc(c.use)}</td>
      </tr>
    `;
  }).join('');

  $('#job-human-langs').innerHTML = state.intel.jobHumanLanguages.map((h) => `
    <div class="battle-row">
      <div class="battle-head">
        <span>${h.flag} <strong>${esc(h.lang)}</strong> <span class="muted">· ${esc(h.salaryBoost)}</span></span>
        <span class="mono">${h.demand}/100</span>
      </div>
      <div class="battle-track"><div class="battle-fill" style="width:${h.demand}%;background:var(--accent);"></div></div>
      <div class="card-sub" style="margin-top:3px;">${esc(h.why)}</div>
    </div>
  `).join('');

  $('#job-prog-langs').innerHTML = state.intel.jobProgLanguages.map((p) => `
    <div class="battle-row">
      <div class="battle-head">
        <span>${p.flag} <strong>${esc(p.lang)}</strong> <span class="tag">${esc(p.salaryTier)}</span></span>
        <span class="mono">${p.demand}/100</span>
      </div>
      <div class="battle-track"><div class="battle-fill" style="width:${p.demand}%;background:#4ADE80;"></div></div>
      <div class="card-sub" style="margin-top:3px;">${esc(p.avgRole)} — ${esc(p.note)}</div>
    </div>
  `).join('');

  $('#crypto-contracts-grid').innerHTML = state.intel.cryptoContracts.map((c, idx) => `
    <article class="card">
      <div class="card-top">
        <div>
          <span class="tag tag-freemium">${c.flag} ${esc(c.chain)}</span>
          <h3 class="card-title" style="margin-top:6px;">${esc(c.standard)}</h3>
        </div>
        <div style="display:flex;gap:6px;">
          ${c.url ? `<a class="btn btn-sm btn-ghost" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">Spec ↗</a>` : ''}
          <button class="btn btn-sm btn-accent" data-copy-crypto="${idx}">Copiar Snippet</button>
        </div>
      </div>
      <div class="card-sub"><strong>${esc(c.share)}</strong> · ${esc(c.usage)}</div>
      <p class="card-desc">${esc(c.why)}</p>
      <div class="code-block">
        <div class="code-head"><span>${esc(c.standard)}</span><span>ready</span></div>
        <pre>${esc(c.snippet)}</pre>
      </div>
    </article>
  `).join('');
}

let timerPresetSec = 86400;
let timerRemainSec = 86400;
let timerInterval = null;

function fmtTimer(sec) {
  const s = Math.max(0, sec);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const r = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${r}`;
}

function renderNews() {
  const list = state.devNews.filter((n) => {
    if (state.newsFilter === 'ai') return n.isAI;
    if (state.newsFilter === 'HN') return n.source === 'HN';
    if (state.newsFilter === 'Dev.to') return n.source === 'Dev.to';
    return true;
  });
  $('#dev-news-list').innerHTML = list.length
    ? list.map((n) => `
      <a class="box" href="${esc(n.url)}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:5px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <span class="tag ${n.source === 'HN' ? 'tag-freemium' : 'tag-gratis'}">${esc(n.source)}${n.isAI ? ' · AI' : ''}</span>
          <span class="card-sub mono">▲ ${n.points} · 💬 ${n.comments}</span>
        </div>
        <div style="font-weight:700;font-size:0.9rem;line-height:1.3;">${esc(n.title)}</div>
        <div class="card-sub">por ${esc(n.author)} ↗</div>
      </a>
    `).join('')
    : `<div class="muted">Sin noticias en este filtro. Pulsa "Actualizar".</div>`;
}

function renderWarRoom() {
  if (!state.warroom) return;
  const saved = JSON.parse(localStorage.getItem('metahaters_checklist_v1') || '{}');
  const items = state.warroom.checklist;
  const done = items.filter((i) => saved[i.id]).length;
  $('#checklist-progress').textContent = `${done}/${items.length}`;
  $('#warroom-checklist').innerHTML = items.map((i) => `
    <label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer;font-size:0.86rem;${saved[i.id] ? 'opacity:0.55;text-decoration:line-through;' : ''}">
      <input type="checkbox" data-chk="${esc(i.id)}" ${saved[i.id] ? 'checked' : ''} style="margin-top:3px;accent-color:var(--accent);" />
      <span><strong style="color:var(--accent-strong);font-family:var(--mono);">[${esc(i.phase)}]</strong> ${esc(i.text)}</span>
    </label>
  `).join('');

  $('#pitch-template-pre').textContent = state.warroom.pitchTemplate;

  $('#emergency-cmds-list').innerHTML = state.warroom.emergencyCommands.map((c, idx) => `
    <div class="box" style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <div style="min-width:0;">
        <div style="font-size:0.8rem;color:var(--muted);">${esc(c.title)}</div>
        <code style="font-family:var(--mono);font-size:0.78rem;color:var(--accent-strong);word-break:break-all;">${esc(c.cmd)}</code>
      </div>
      <button class="btn btn-sm btn-ghost" data-copy-ecmd="${idx}">Copiar</button>
    </div>
  `).join('');

  $('#free-credits-grid').innerHTML = state.warroom.freeCredits.map((fc) => `
    <a class="card" href="${esc(fc.url)}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit;">
      <div class="card-top">
        <div class="card-title-row">
          <span class="flag">${fc.flag}</span>
          <h3 class="card-title">${esc(fc.name)}</h3>
        </div>
        <span class="tag tag-gratis">↗</span>
      </div>
      <p class="card-desc">${esc(fc.perk)}</p>
    </a>
  `).join('');

  renderNews();
}

async function loadDevNews(force = false) {
  $('#news-status').textContent = 'Sincronizando Hacker News y Dev.to en vivo…';
  try {
    const res = await fetchDevNews(force);
    state.devNews = res.items || [];
    const dt = new Date(res.ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    $('#news-status').textContent = `${state.devNews.length} noticias cargadas (${dt}) · Hacker News + Dev.to`;
    renderNews();
  } catch {
    $('#news-status').textContent = 'Sin conexión para cargar noticias en vivo.';
  }
}

function renderStats() {
  // Geo head-to-head
  // AI by Task Matrix & Third-Party Tools
  if (state.comparisons?.aiTaskMatrix) {
    const sc = (v) => `<span class="score-pill ${v >= 95 ? 'gold' : v >= 88 ? 'hi' : ''}">${v}</span>`;
    $('#ai-task-matrix-body').innerHTML = state.comparisons.aiTaskMatrix.map((row) => `
      <tr>
        <td><strong>${esc(row.task)}</strong></td>
        <td>${esc(row.bestPaid)}</td>
        <td style="color:#86efac;">${esc(row.bestFree)}</td>
        <td>${sc(row.coding)}</td>
        <td>${sc(row.reasoning)}</td>
        <td>${sc(row.speed)}</td>
        <td class="card-sub" style="color:#D4D4DD;">${esc(row.why)}</td>
      </tr>
    `).join('');
  }
  if (state.comparisons?.thirdPartyTools) {
    $('#third-party-grid').innerHTML = state.comparisons.thirdPartyTools.map((t) => `
      <article class="card">
        <div class="card-top">
          <div class="card-title-row">
            ${logoBadge(t)}
            <div>
              <h3 class="card-title">${esc(t.name)}</h3>
              <div class="card-sub">${esc(t.cat)}</div>
            </div>
          </div>
          <span class="tag tag-gratis">${esc(t.price)}</span>
        </div>
        <p class="card-desc">${esc(t.use)}</p>
        <div class="card-foot">
          <button class="btn btn-sm btn-accent" data-open-tp="${esc(t.id || '')}">Cómo Instalar</button>
          <a class="btn btn-sm btn-ghost" href="${esc(t.url || '#')}" target="_blank" rel="noopener noreferrer">Sitio oficial ↗</a>
        </div>
      </article>
    `).join('');
  }

  // IDE & Coding Agents Comparison Matrix
  if (state.comparisons?.ideMatrix) {
    const sc = (v) => `<span class="score-pill ${v >= 96 ? 'gold' : v >= 92 ? 'hi' : ''}">${v}</span>`;
    $('#ide-matrix-body').innerHTML = state.comparisons.ideMatrix.map((row) => `
      <tr>
        <td>${row.flag} <a href="${esc(row.url || '#')}" target="_blank" rel="noopener noreferrer" style="color:var(--text);font-weight:700;text-decoration:none;">${esc(row.name)} <span style="color:var(--accent-strong);">↗</span></a><div class="card-sub">${esc(row.type)}</div></td>
        <td class="mono">${esc(row.price)}</td>
        <td>${esc(row.freeOption)}</td>
        <td>${sc(row.autonomy)}</td>
        <td>${sc(row.reasoning)}</td>
        <td>${sc(row.coding)}</td>
        <td>${sc(row.speed)}</td>
        <td class="card-sub" style="color:#D4D4DD;">${esc(row.bestWhen)}</td>
      </tr>
    `).join('');

    $('#emergency-chain').innerHTML = state.comparisons.emergencyChain.map((s) => `
      <div class="box">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span class="tag tag-gratis">PASO ${esc(s.step)} · ${esc(s.cost)}</span>
          <span class="card-sub">${esc(s.when)}</span>
        </div>
        <div style="font-weight:700;margin-bottom:4px;">${esc(s.switchTo)}</div>
        <div class="card-sub">${esc(s.note)}</div>
      </div>
    `).join('');
  }

  const regions = [
    { key: 'USA', label: '🇺🇸 Estados Unidos / Norteamérica', color: '#38bdf8' },
    { key: 'China', label: '🇨🇳 China', color: '#f59e0b' },
    { key: 'Europa', label: '🇪🇺 Europa', color: '#22c55e' },
    { key: 'Latam', label: '🌎 Latinoamérica', color: '#a78bfa' },
    { key: 'Asia-Pac', label: '🌏 Asia-Pacífico', color: '#fb7185' }
  ];

  const battleHtml = regions.map((r) => {
    const subset = state.items.filter((i) => i.region === r.key);
    const avg = (k) => subset.length ? (subset.reduce((s, x) => s + x.scores[k], 0) / subset.length) : 0;
    const hack = avg('hackathon');
    const val = avg('value');
    const qual = avg('quality');
    return `
      <div class="battle-row">
        <div class="battle-head">
          <strong>${r.label} <span class="muted">(${subset.length})</span></strong>
          <span class="mono">Hack ${hack.toFixed(1)} · Valor ${val.toFixed(1)} · Calidad ${qual.toFixed(1)}</span>
        </div>
        <div class="battle-track">
          <div class="battle-fill" style="width:${hack.toFixed(1)}%; background:${r.color};"></div>
        </div>
      </div>
    `;
  }).join('');
  $('#geo-battle').innerHTML = battleHtml;

  // Leaderboard
  let ranked = [...state.items];
  if (state.rankTab === 'free') ranked = ranked.filter((i) => i.pricingTier === 'gratis' || i.pricingTier === 'freemium');
  if (state.rankTab === 'paid') ranked = ranked.filter((i) => i.pricingTier === 'pago' || i.pricingTier === 'freemium');
  const metric = state.rankTab === 'speed' ? 'speed' : state.rankTab === 'free' ? 'value' : 'hackathon';
  ranked.sort((a, b) => b.scores[metric] - a.scores[metric]);

  $('#leaderboard-list').innerHTML = ranked.slice(0, 8).map((it, idx) => `
    <div class="rank-item" data-open="${esc(it.id)}">
      <span class="rank-num">#${idx + 1}</span>
      <div>
        <strong>${it.flag} ${esc(it.name)}</strong>
        <div class="card-sub">${esc(it.provider)} · ${esc(it.priceLabel)}</div>
      </div>
      <span class="score-badge">${it.scores[metric]}</span>
    </div>
  `).join('');

  // Live Radar
  const radar = state.liveModels.filter((m) => {
    if (state.radarFilter === 'free') return m.isFree;
    if (state.radarFilter === 'CN') return m.country === 'CN';
    if (state.radarFilter === 'US') return m.country === 'US';
    if (state.radarFilter === 'EU') return m.region === 'Europa';
    return true;
  });

  $('#live-radar-body').innerHTML = radar.length
    ? radar.map((m) => `
      <tr>
        <td>${m.flag} ${esc(m.countryName)}</td>
        <td><strong>${esc(m.name)}</strong><div class="card-sub">${esc(m.id)}</div></td>
        <td class="mono">${esc(m.context)}</td>
        <td class="mono ${m.isFree ? 'win-cell' : ''}">${m.isFree ? '$0' : '$' + m.inputPer1M}</td>
        <td class="mono ${m.isFree ? 'win-cell' : ''}">${m.isFree ? '$0' : '$' + m.outputPer1M}</td>
        <td><span class="tag ${m.isFree ? 'tag-gratis' : 'tag-pago'}">${m.isFree ? 'GRATIS' : 'PAGO'}</span></td>
      </tr>
    `).join('')
    : `<tr><td colspan="6" class="muted">Sin modelos en este filtro. Pulsa "Sync en vivo" para actualizar.</td></tr>`;
}

const usd = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 5
});
const fmtUsd = (value) => `US$ ${usd.format(value)}`;

function pickLinks(item) {
  const link = (label, url) =>
    `<a class="btn btn-sm btn-ghost" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`;
  return `<div class="card-foot">
    ${link('Sitio oficial', item.url)}
    ${link('Tarifas', item.pricingUrl)}
    ${item.guideUrl ? link('Guía de instalación', item.guideUrl) : ''}
  </div>`;
}

function renderCiPicks() {
  const runners = [...state.devPicks.ci].sort((a, b) => a.usdPerMinute - b.usdPerMinute);
  $('#ci-grid').innerHTML = runners.map((runner) => `
    <article class="card">
      <div class="card-title-row">
        ${logoBadge(runner)}
        <div>
          <h3 class="card-title">${esc(runner.name)}</h3>
          <div class="card-sub">${esc(runner.label)}</div>
        </div>
      </div>
      <p class="card-price">${fmtUsd(runner.usdPerMinute)}/min · ${fmtUsd(runner.usdPerMinute * 1000)} por 1.000 min</p>
      <p class="card-desc">${esc(runner.description)}</p>
      <p class="card-desc">${esc(runner.terms)}</p>
      ${pickLinks(runner)}
    </article>
  `).join('');
}

function renderVideoPicks() {
  if (!state.devPicks) return;
  const byPrice = (a, b) => a.usdPerSecond - b.usdPerSecond;
  const byRank = (a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || byPrice(a, b);
  const videos = [...state.devPicks.video].sort($('#video-sort-select').value === 'price' ? byPrice : byRank);
  $('#video-grid').innerHTML = videos.map((video) => `
    <article class="card">
      <div class="card-title-row">
        ${logoBadge(video)}
        <div>
          <h3 class="card-title">${esc(video.name)}</h3>
          <div class="card-sub">${esc(video.provider)} · ${video.rank ? `#${video.rank} en Arena` : 'Sin puesto verificado'}</div>
        </div>
      </div>
      <p class="card-price">${fmtUsd(video.usdPerSecond)}/s · ${fmtUsd(video.usdPerSecond * 5)} por 5 s</p>
      <div class="card-sub">${esc(video.resolution)} · ${esc(video.billingProvider)}</div>
      <p class="card-desc">${esc(video.description)}</p>
      ${pickLinks(video)}
    </article>
  `).join('');
}

let devPicksRequest;
function loadDevPicks() {
  if (devPicksRequest) return;
  const statuses = ['#ci-status', '#video-status'].map($);
  statuses.forEach((el) => { el.textContent = 'Cargando comparativa…'; });
  devPicksRequest = fetch('./data/dev-picks.json')
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((picks) => {
      state.devPicks = picks;
      renderCiPicks();
      renderVideoPicks();
      statuses.forEach((el) => { el.hidden = true; });
    })
    .catch(() => {
      state.devPicks = null;
      devPicksRequest = null;
      statuses.forEach((el) => { el.textContent = 'No se pudo cargar. Pulsa la pestaña para reintentar.'; });
    });
}

function renderAgents() {
  if (!state.agents) return;

  const list = state.agents.subAgents.filter((sa) => {
    if (state.agentTier === 'all') return true;
    return (sa.tier || 'hackathon') === state.agentTier;
  });

  $('#subagents-grid').innerHTML = list.map((sa) => `
    <article class="card">
      <div class="card-top">
        <div>
          <span class="tag ${sa.tier === 'booster' ? 'tag-gratis' : 'tag-freemium'}">${esc(sa.badge)}</span>
          <h3 class="card-title" style="margin-top:6px;">${esc(sa.role)}</h3>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
          <button class="btn btn-sm btn-accent" data-dl-agent="${esc(sa.id)}">⬇ Descargar .md</button>
          <button class="btn btn-sm btn-ghost" data-copy-prompt="${esc(sa.id)}">Copiar</button>
        </div>
      </div>
      <p class="card-desc">${esc(sa.mission)}</p>
      <div class="card-sub"><strong>Gratis:</strong> ${esc(sa.recommendedFree)}</div>
      <div class="card-sub"><strong>Pago:</strong> ${esc(sa.recommendedPaid)}</div>
      <div class="badges">${sa.tools.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      <div class="code-block">
        <div class="code-head"><span>${esc(sa.filename || (sa.id + '.md'))}</span><span>1-click ready</span></div>
        <pre>${esc(sa.prompt)}</pre>
      </div>
    </article>
  `).join('');

  if (state.agents.multiAgentCommands?.length) {
    $('#multiagent-grid').innerHTML = state.agents.multiAgentCommands.map((mc) => `
      <article class="card">
        <div class="card-top">
          <div>
            <span class="tag tag-gratis">${esc(mc.badge)}</span>
            <h3 class="card-title" style="margin-top:6px;">${esc(mc.title)}</h3>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
            <button class="btn btn-sm btn-accent" data-dl-ma="${esc(mc.id)}">⬇ Descargar</button>
            <button class="btn btn-sm btn-ghost" data-copy-ma="${esc(mc.id)}">Copiar</button>
          </div>
        </div>
        <p class="card-desc">${esc(mc.summary)}</p>
        <div class="card-sub"><strong>Protocolo:</strong> ${esc(mc.protocol)}</div>
        <div class="code-block">
          <div class="code-head"><span>${esc(mc.filename)}</span><span>listo para correr</span></div>
          <pre>${esc(mc.command)}</pre>
        </div>
      </article>
    `).join('');
  }

  $('#stacks-grid').innerHTML = state.agents.stacks.map((st) => `
    <article class="card">
      <div class="card-top">
        <div>
          <div class="card-sub">${st.flags} · <strong>${esc(st.cost)}</strong></div>
          <h3 class="card-title">${esc(st.name)}</h3>
        </div>
        <button class="btn btn-sm btn-accent" data-copy-stack="${esc(st.id)}">Copiar Init</button>
      </div>
      <p class="card-desc">${esc(st.summary)}</p>
      <ul class="bullet-list">${st.components.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      <div class="code-block">
        <div class="code-head"><span>Quick Start</span><span>bash</span></div>
        <pre>${esc(st.initCmd)}</pre>
      </div>
    </article>
  `).join('');

  $('#master-configs').innerHTML = state.agents.masterConfigs.map((cfg) => `
    <div class="code-block">
      <div class="code-head">
        <span>${esc(cfg.title)}</span>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-ghost" data-dl-cfg="${esc(cfg.id)}">Descargar</button>
          <button class="btn btn-sm btn-accent" data-copy-cfg="${esc(cfg.id)}">Copiar</button>
        </div>
      </div>
      <pre>${esc(cfg.code)}</pre>
    </div>
  `).join('');
}

function openDetail(id) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;

  $('#modal-title-wrap').innerHTML = `
    <div class="card-title-row">
      ${logoBadge(it)}
      <div>
        <h2>${esc(it.name)}</h2>
        <p class="muted">${esc(it.provider)} · ${esc(it.countryName)} · ${esc(it.subType)} ${it.github?.stars ? '· ' + fmtStars(it.github.stars) : ''}</p>
      </div>
    </div>
  `;

  const fwModalHtml = it.frameworks?.length
    ? `<div class="box"><h4>Frameworks más usados &amp; ventajas</h4><ul class="bullet-list">${it.frameworks.map((fw) => `<li><strong>${esc(fw.name)}</strong>: ${esc(fw.advantage)}</li>`).join('')}</ul></div>`
    : '';

  $('#modal-body').innerHTML = `
    <div class="badges">
      <span class="tag tag-${esc(it.pricingTier)}">${esc(it.pricingTier.toUpperCase())}</span>
      <span class="tag">Hackathon: ${it.scores.hackathon}/100</span>
      <span class="tag">Vel: ${it.scores.speed}</span>
      <span class="tag">Valor: ${it.scores.value}</span>
      <span class="tag">Calidad: ${it.scores.quality}</span>
      <a class="tag" href="${esc(it.url)}" target="_blank" rel="noopener">Docs oficiales ↗</a>
    </div>

    <div class="box">
      <h4>Precio &amp; Free Tier</h4>
      <div><strong>${esc(it.priceLabel)}</strong> — ${esc(it.freeTier)}</div>
    </div>
    ${fwModalHtml}
    ${renderInstallTabsHTML(getInstallGuide(it), it.url)}

    <div class="pros-cons">
      <div class="box">
        <h4 style="color:#86efac;">Ventajas</h4>
        <ul class="bullet-list">${it.pros.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      </div>
      <div class="box">
        <h4 style="color:#fda4af;">Cuidados</h4>
        <ul class="bullet-list">${it.cons.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      </div>
    </div>

    <div class="box">
      <h4 style="color:#7dd3fc;">Tip para Agentes &amp; Sub-Agentes</h4>
      <div>${esc(it.agentTip)}</div>
    </div>

    <div class="code-block">
      <div class="code-head">
        <span>${esc(it.config.title)} (${esc(it.config.lang)})</span>
        <button class="btn btn-sm btn-accent" id="modal-copy-code">Copiar configuración</button>
      </div>
      <pre>${esc(it.config.code)}</pre>
    </div>
  `;

  bindInstallTabs(getInstallGuide(it));
  $('#modal-copy-code').onclick = () => copyText(it.config.code, 'Configuración copiada');
  $('#detail-modal').showModal();
}

function toggleCompare(id) {
  const idx = state.compareIds.indexOf(id);
  if (idx >= 0) {
    state.compareIds.splice(idx, 1);
  } else {
    if (state.compareIds.length >= 4) {
      toast('Máximo 4 elementos en el comparador');
      return;
    }
    state.compareIds.push(id);
  }
  $('#compare-count').textContent = state.compareIds.length;
  renderCatalog();
}

function openCompare() {
  const items = state.compareIds.map((id) => state.items.find((x) => x.id === id)).filter(Boolean);
  const body = $('#compare-body');

  if (items.length < 2) {
    body.innerHTML = `<p class="muted">Selecciona al menos 2 elementos con "+ Comparar" para compararlos lado a lado (actualmente: ${items.length}).</p>`;
    $('#compare-modal').showModal();
    return;
  }

  const maxScore = (k) => Math.max(...items.map((x) => x.scores[k]));
  const rows = [
    { label: 'País', fn: (x) => `${x.flag} ${esc(x.countryName)}` },
    { label: 'Categoría', fn: (x) => esc(x.subType) },
    { label: 'Precio', fn: (x) => `<span class="tag tag-${esc(x.pricingTier)}">${esc(x.pricingTier.toUpperCase())}</span> ${esc(x.priceLabel)}` },
    { label: 'Hackathon Score', scoreKey: 'hackathon' },
    { label: 'Velocidad', scoreKey: 'speed' },
    { label: 'Valor / Gratis', scoreKey: 'value' },
    { label: 'Calidad', scoreKey: 'quality' },
    { label: 'Free Tier', fn: (x) => esc(x.freeTier) },
    { label: 'Ideal para', fn: (x) => esc(x.bestFor) },
    { label: 'Tip de Agente', fn: (x) => esc(x.agentTip) }
  ];

  body.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Métrica</th>
            ${items.map((x) => `<th>${x.flag} ${esc(x.name)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td><strong>${r.label}</strong></td>
              ${items.map((x) => {
                if (r.scoreKey) {
                  const v = x.scores[r.scoreKey];
                  const win = v === maxScore(r.scoreKey);
                  return `<td class="mono ${win ? 'win-cell' : ''}">${v}/100 ${win ? '🏆' : ''}</td>`;
                }
                return `<td style="white-space:normal;min-width:170px;">${r.fn(x)}</td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  $('#compare-modal').showModal();
}

async function runLiveSync(force = false) {
  const dot = $('#sync-dot');
  const label = $('#sync-label');
  dot.classList.add('syncing');
  label.textContent = 'Sincronizando...';

  try {
    const res = await fetchLiveOpenRouter(force);
    state.liveModels = res.liveModels;
    applyLivePricing(res.priceMap);
    if (state.meta) {
      state.meta.lastUpdated = new Date(res.ts).toISOString();
      if (state.meta.sources?.[0]) state.meta.sources[0].totalSeen = res.totalSeen;
    }
    renderKPIs();
    renderCatalog();
    renderStats();
    label.textContent = res.fromCache ? 'Sync OK (caché)' : 'Sync en vivo OK';
    if (force) toast(`Actualizados ${res.totalSeen} modelos desde OpenRouter`);
  } catch {
    label.textContent = 'Modo estático';
    if (force) toast('Sin conexión a OpenRouter; usando catálogo local');
  } finally {
    dot.classList.remove('syncing');
  }
}

function bindEvents() {
  // Main view tabs
  $$('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      $$('.tab-btn').forEach((b) => { b.classList.toggle('active', b === btn); b.setAttribute('aria-selected', String(b === btn)); });
      $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${state.view}`));
      if (state.view === 'ci' || state.view === 'video') loadDevPicks();
    });
  });

  // Search & sort
  $('#search-input').addEventListener('input', (e) => { state.query = e.target.value; renderCatalog(); });
  $('#sort-select').addEventListener('change', (e) => { state.sort = e.target.value; renderCatalog(); });
  $('#os-search-input').addEventListener('input', (e) => { state.osQuery = e.target.value; renderOS(); });
  $('#os-sort-select').addEventListener('change', (e) => { state.osSort = e.target.value; renderOS(); });
  $('#browser-sort-select').addEventListener('change', (e) => { state.browserSort = e.target.value; renderBrowsers(); });
  $('#video-sort-select').addEventListener('change', renderVideoPicks);

  // Filter chips helper
  const bindChips = (sel, attr, key, cb) => {
    $(sel).addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      state[key] = btn.dataset[attr];
      $$(sel + ' .chip').forEach((c) => {
        c.classList.toggle('active', c === btn);
        if (c.hasAttribute('aria-pressed')) c.setAttribute('aria-pressed', String(c === btn));
      });
      cb();
    });
  };
  bindChips('#cat-filters', 'cat', 'cat', renderCatalog);
  bindChips('#price-filters', 'price', 'price', renderCatalog);
  bindChips('#region-filters', 'region', 'region', renderCatalog);
  bindChips('#os-type-filters', 'ostype', 'osType', renderOS);
  bindChips('#os-family-filters', 'osfam', 'osFamily', renderOS);
  bindChips('#browser-plat-filters', 'bplat', 'browserPlat', renderBrowsers);
  bindChips('#fw-area-filters', 'fwarea', 'fwArea', renderFrameworks);
  bindChips('#api-occ-filters', 'apiocc', 'apiOccFilter', renderApiOccasions);
  bindChips('#agent-tier-filters', 'atier', 'agentTier', renderAgents);
  bindChips('#rank-tabs', 'rank', 'rankTab', renderStats);
  bindChips('#radar-filters', 'radar', 'radarFilter', renderStats);
  bindChips('#news-filters', 'nfilter', 'newsFilter', renderNews);

  $('#refresh-news-btn').addEventListener('click', () => loadDevNews(true));
  $('#copy-pitch-btn').addEventListener('click', () => {
    if (state.warroom) copyText(state.warroom.pitchTemplate, 'Plantilla de Pitch 3 min copiada');
  });

  // Hackathon timer
  const syncTimerUI = () => { $('#hack-timer-display').textContent = fmtTimer(timerRemainSec); };
  $$('[data-timer-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      clearInterval(timerInterval); timerInterval = null;
      timerPresetSec = Number(btn.dataset.timerPreset);
      timerRemainSec = timerPresetSec;
      $$('[data-timer-preset]').forEach((b) => b.classList.toggle('active', b === btn));
      $('#timer-mode-tag').textContent = btn.textContent;
      syncTimerUI();
    });
  });
  $('#timer-start-btn').addEventListener('click', () => {
    if (timerInterval) return;
    timerInterval = setInterval(() => {
      if (timerRemainSec > 0) { timerRemainSec--; syncTimerUI(); }
      else { clearInterval(timerInterval); timerInterval = null; toast('¡Tiempo cumplido!'); }
    }, 1000);
  });
  $('#timer-pause-btn').addEventListener('click', () => { clearInterval(timerInterval); timerInterval = null; });
  $('#timer-reset-btn').addEventListener('click', () => { clearInterval(timerInterval); timerInterval = null; timerRemainSec = timerPresetSec; syncTimerUI(); });

  $('#warroom-checklist').addEventListener('change', (e) => {
    const chk = e.target.closest('[data-chk]');
    if (!chk) return;
    const saved = JSON.parse(localStorage.getItem('metahaters_checklist_v1') || '{}');
    saved[chk.dataset.chk] = chk.checked;
    localStorage.setItem('metahaters_checklist_v1', JSON.stringify(saved));
    renderWarRoom();
  });

  $('#fx-amount').addEventListener('input', updateFxConverter);
  $('#fx-from').addEventListener('change', updateFxConverter);
  $('#fx-to').addEventListener('change', updateFxConverter);

  $('#download-all-agents-btn').addEventListener('click', () => {
    if (!state.agents) return;
    const lines = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'mkdir -p .opencode/agent .claude/agents',
      ''
    ];
    for (const sa of state.agents.subAgents) {
      const fn = sa.filename || `${sa.id}.md`;
      lines.push(`cat <<'METAHATERS_EOF' > ".opencode/agent/${fn}"`);
      lines.push(sa.prompt);
      lines.push('METAHATERS_EOF');
      lines.push(`cp ".opencode/agent/${fn}" ".claude/agents/${fn}"`);
      lines.push('');
    }
    for (const cfg of state.agents.masterConfigs) {
      const fn = cfg.title.split(' ')[0];
      lines.push(`cat <<'METAHATERS_EOF' > "${fn}"`);
      lines.push(cfg.code);
      lines.push('METAHATERS_EOF');
      lines.push('');
    }
    for (const mc of (state.agents.multiAgentCommands || [])) {
      lines.push(`cat <<'METAHATERS_EOF' > "${mc.filename}"`);
      lines.push(mc.command);
      lines.push('METAHATERS_EOF');
      if (mc.filename.endsWith('.sh') || mc.filename.endsWith('.py') || mc.filename.endsWith('.mjs')) {
        lines.push(`chmod +x "${mc.filename}"`);
      }
      lines.push('');
    }
    lines.push('echo "✓ Pack metahaters instalado: .opencode/agent/, .claude/agents/, scripts multi-agente A2A y configs maestras"');
    downloadFile('install-metahaters-agents.sh', lines.join('\n'));
  });

  // Delegated clicks
  document.addEventListener('click', (e) => {
    const openBr = e.target.closest('[data-open-browser]');
    if (openBr) return openBrowserDetail(openBr.dataset.openBrowser);

    const openTp = e.target.closest('[data-open-tp]');
    if (openTp) {
      const t = state.comparisons?.thirdPartyTools?.find((x) => x.id === openTp.dataset.openTp);
      if (t) {
        const g = getInstallGuide(t);
        $('#modal-title-wrap').innerHTML = `<div class="card-title-row">${logoBadge(t)}<div><h2>${esc(t.name)}</h2><p class="muted">${esc(t.cat)} · ${esc(t.price)}</p></div></div>`;
        $('#modal-body').innerHTML = `<div class="box"><h4>Para qué sirve</h4><div>${esc(t.use)}</div></div>${renderInstallTabsHTML(g, t.url)}`;
        bindInstallTabs(g);
        $('#detail-modal').showModal();
      }
      return;
    }

    const copyTune = e.target.closest('[data-copy-tune]');
    if (copyTune) {
      const g = state.osTuning?.tuningGuides?.find((x) => x.id === copyTune.dataset.copyTune);
      if (g) copyText(g.commands, `Optimización ${g.os} copiada`);
    }

    const openOs = e.target.closest('[data-open-os]');
    if (openOs) return openOSDetail(openOs.dataset.openOs);

    const openEl = e.target.closest('[data-open]');
    if (openEl) return openDetail(openEl.dataset.open);

    const cmpEl = e.target.closest('[data-compare]');
    if (cmpEl) return toggleCompare(cmpEl.dataset.compare);

    const copyEcmd = e.target.closest('[data-copy-ecmd]');
    if (copyEcmd) {
      const c = state.warroom?.emergencyCommands?.[Number(copyEcmd.dataset.copyEcmd)];
      if (c) copyText(c.cmd, 'Comando copiado');
    }

    const copyCryptoBtn = e.target.closest('[data-copy-crypto]');
    if (copyCryptoBtn) {
      const c = state.intel?.cryptoContracts?.[Number(copyCryptoBtn.dataset.copyCrypto)];
      if (c) copyText(c.snippet, `Snippet ${c.standard} copiado`);
    }

    const dlMaBtn = e.target.closest('[data-dl-ma]');
    if (dlMaBtn) {
      const mc = (state.agents.multiAgentCommands || []).find((x) => x.id === dlMaBtn.dataset.dlMa);
      if (mc) downloadFile(mc.filename, mc.command);
    }

    const copyMaBtn = e.target.closest('[data-copy-ma]');
    if (copyMaBtn) {
      const mc = (state.agents.multiAgentCommands || []).find((x) => x.id === copyMaBtn.dataset.copyMa);
      if (mc) copyText(mc.command, `Comando ${mc.filename} copiado`);
    }

    const dlAgentBtn = e.target.closest('[data-dl-agent]');
    if (dlAgentBtn) {
      const sa = state.agents.subAgents.find((x) => x.id === dlAgentBtn.dataset.dlAgent);
      if (sa) downloadFile(sa.filename || `${sa.id}.md`, sa.prompt);
    }

    const promptBtn = e.target.closest('[data-copy-prompt]');
    if (promptBtn) {
      const sa = state.agents.subAgents.find((x) => x.id === promptBtn.dataset.copyPrompt);
      if (sa) copyText(sa.prompt, `Prompt de ${sa.role} copiado`);
    }

    const stackBtn = e.target.closest('[data-copy-stack]');
    if (stackBtn) {
      const st = state.agents.stacks.find((x) => x.id === stackBtn.dataset.copyStack);
      if (st) copyText(st.initCmd, 'Comando de inicio copiado');
    }

    const copyCfgBtn = e.target.closest('[data-copy-cfg]');
    if (copyCfgBtn) {
      const cfg = state.agents.masterConfigs.find((x) => x.id === copyCfgBtn.dataset.copyCfg);
      if (cfg) copyText(cfg.code, 'Configuración maestra copiada');
    }

    const dlCfgBtn = e.target.closest('[data-dl-cfg]');
    if (dlCfgBtn) {
      const cfg = state.agents.masterConfigs.find((x) => x.id === dlCfgBtn.dataset.dlCfg);
      if (cfg) downloadFile(cfg.title.split(' ')[0], cfg.code);
    }
  });

  // Modals & topbar actions
  $('#modal-close').onclick = () => $('#detail-modal').close();
  $('#compare-open-btn').onclick = openCompare;
  $('#compare-close').onclick = () => $('#compare-modal').close();
  $('#compare-clear').onclick = () => {
    state.compareIds = [];
    $('#compare-count').textContent = '0';
    renderCatalog();
    $('#compare-modal').close();
  };
  $('#live-sync-btn').onclick = () => runLiveSync(true);

  ['#detail-modal', '#compare-modal'].forEach((id) => {
    $(id).addEventListener('click', (e) => {
      if (e.target === $(id)) $(id).close();
    });
  });
}

async function init() {
  bindEvents();
  const [models, apis, languages, tools, osList, agents, comparisons, frameworks, apiOccasions, intel, osTuning, warroom, meta, liveStatic] = await Promise.all([
    fetch('./data/models.json').then((r) => r.json()),
    fetch('./data/apis.json').then((r) => r.json()),
    fetch('./data/languages.json').then((r) => r.json()),
    fetch('./data/tools.json').then((r) => r.json()),
    fetch('./data/os.json').then((r) => r.json()),
    fetch('./data/agents.json').then((r) => r.json()),
    fetch('./data/comparisons.json').then((r) => r.json()),
    fetch('./data/frameworks.json').then((r) => r.json()),
    fetch('./data/api-occasions.json').then((r) => r.json()),
    fetch('./data/intel.json').then((r) => r.json()),
    fetch('./data/os-tuning.json').then((r) => r.json()),
    fetch('./data/warroom.json').then((r) => r.json()),
    fetch('./data/meta.json').then((r) => r.json()),
    fetch('./data/live-models.json').then((r) => r.ok ? r.json() : []).catch(() => [])
  ]);

  state.items = [...models, ...apis, ...languages, ...tools];
  state.osList = osList;
  state.agents = agents;
  state.comparisons = comparisons;
  state.frameworks = frameworks;
  state.apiOccasions = apiOccasions;
  state.intel = intel;
  state.osTuning = osTuning;
  state.warroom = warroom;
  state.meta = meta;
  state.liveModels = liveStatic;

  renderKPIs();
  renderCatalog();
  renderApiOccasions();
  renderFrameworks();
  renderOS();
  renderOsTuning();
  renderBrowsers();
  renderStats();
  renderAgents();
  renderIntel();
  renderWarRoom();
  loadDevNews(false);

  // Live FX sync (open.er-api.com, 6h cache, silent fallback)
  fetchLiveFX().then((fx) => {
    state.fxRates = fx.rates;
    $('#fx-status').textContent = `Tasas en vivo actualizadas (${fx.updated}) · fuente open.er-api.com`;
    renderIntel();
  }).catch(() => {
    $('#fx-status').textContent = state.intel.fallbackFx.updated;
  });

  // Auto-sync in background if cache is missing or expired
  if (!getCachedLiveSync()) {
    runLiveSync(false);
  } else {
    runLiveSync(false);
  }
}

init();
