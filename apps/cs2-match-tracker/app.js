// EZ Match Tracker - players in your CS2 match with FACEIT + Leetify stats.
const $ = (s) => document.querySelector(s);
const CACHE_MS = 10 * 60 * 1000;
const DEFAULT_CSREP = 'https://csrep.gg/player/{steam64}';

let cfg = { faceitKey: '', leetifyKey: '', csrepUrl: DEFAULT_CSREP };
let gs = null;            // latest CS2 GSI state
let players = [];         // [{ name, steam64 }]
let lastRefresh = 0;
let visible = false;
let lastMap = '';
const cache = new Map();  // steam64 -> { t, faceit, leetify }

// ---------------------------------------------------------------- helpers
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (v) => (v === null || v === undefined || v === '' || isNaN(+v) ? null : +v);
const pct = (v) => (v === null ? null : v <= 1 ? Math.round(v * 100) : Math.round(v));
const stat = (label, v, suffix = '') =>
  v === null || v === undefined ? `<span class="na">${label} -</span>` : `${label} <b>${esc(v)}${suffix}</b>`;

function notice(html) {
  const n = $('#notice');
  n.innerHTML = html || '';
  n.classList.toggle('hidden', !html);
}

async function getJson(url, headers) {
  const r = await ez.net.fetch(url, { headers });
  if (r.status === 404) return null;
  if (r.status >= 400) throw new Error(`${new URL(url).host} ${r.status}`);
  return JSON.parse(r.body);
}

function premierColor(r) {
  if (r >= 30000) return '#ffd700';
  if (r >= 25000) return '#eb4b4b';
  if (r >= 20000) return '#d32ce6';
  if (r >= 15000) return '#8847ff';
  if (r >= 10000) return '#4b69ff';
  if (r >= 5000) return '#5e98d9';
  return '#b0c3d9';
}

// ---------------------------------------------------------------- data sources
async function faceit(steam64) {
  if (!cfg.faceitKey) return { missingKey: true };
  const h = { Authorization: 'Bearer ' + cfg.faceitKey };
  const p = await getJson(`https://open.faceit.com/data/v4/players?game=cs2&game_player_id=${steam64}`, h);
  if (!p) return null;
  const g = (p.games && p.games.cs2) || {};
  const out = { nickname: p.nickname, level: num(g.skill_level), elo: num(g.faceit_elo) };
  try {
    const s = await getJson(`https://open.faceit.com/data/v4/players/${p.player_id}/stats/cs2`, h);
    const l = (s && s.lifetime) || {};
    out.kd = num(l['Average K/D Ratio']);
    out.winrate = num(l['Win Rate %']);
    out.hs = num(l['Average Headshots %']);
    out.matches = num(l['Matches']);
  } catch (_) {}
  return out;
}

async function leetify(steam64) {
  const h = cfg.leetifyKey ? { _leetify_key: cfg.leetifyKey } : {};
  const p = await getJson(`https://api-public.cs-prod.leetify.com/v3/profile?steam64_id=${steam64}`, h);
  if (!p) return null;
  const ranks = p.ranks || {};
  const rating = p.rating || {};
  return {
    premier: num(ranks.premier),
    leetify: num(ranks.leetify),
    winrate: num(p.winrate),
    matches: num(p.total_matches),
    aim: num(rating.aim),
    banned: Array.isArray(p.bans) ? p.bans.length > 0 : false,
  };
}

async function lookup(steam64) {
  const hit = cache.get(steam64);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit;
  const [f, l] = await Promise.allSettled([faceit(steam64), leetify(steam64)]);
  const entry = {
    t: Date.now(),
    faceit: f.status === 'fulfilled' ? f.value : { error: String(f.reason) },
    leetify: l.status === 'fulfilled' ? l.value : { error: String(l.reason) },
  };
  cache.set(steam64, entry);
  return entry;
}

// ---------------------------------------------------------------- teams
function teamOf(steam64) {
  const ap = gs && gs.allplayers;
  if (ap && ap[steam64] && ap[steam64].team) return ap[steam64].team;
  if (gs && gs.player && gs.player.steamid === steam64) return gs.player.team || null;
  return null;
}

function myId() {
  return (gs && gs.provider && gs.provider.steamid) || null;
}

// ---------------------------------------------------------------- render
function playerCard(p) {
  const d = cache.get(p.steam64);
  const me = p.steam64 === myId();
  let stats = '<span class="loading">Loading…</span>';
  if (d) {
    const f = d.faceit || {};
    const l = d.leetify || {};
    const parts = [];
    if (f.missingKey) parts.push('<span class="na">FACEIT: add key in ⚙</span>');
    else if (f.error) parts.push('<span class="na">FACEIT error</span>');
    else if (!d.faceit) parts.push('<span class="na">No FACEIT</span>');
    else {
      parts.push(f.level ? `<span><span class="lvl l${f.level}">${f.level}</span><b>${f.elo ?? ''}</b></span>` : stat('FACEIT', null));
      parts.push(stat('K/D', f.kd));
      parts.push(stat('HS', f.hs, '%'));
    }
    if (l.error) parts.push('<span class="na">Leetify error</span>');
    else if (!d.leetify) parts.push('<span class="na">Not on Leetify</span>');
    else {
      if (l.premier) parts.push(`<span class="premier" style="background:${premierColor(l.premier)}">${l.premier.toLocaleString()}</span>`);
      parts.push(stat('Leetify', l.leetify !== null ? (l.leetify > 0 ? '+' : '') + l.leetify.toFixed(2) : null));
      parts.push(stat('Aim', l.aim !== null ? Math.round(l.aim) : null));
      parts.push(stat('Win', pct(l.winrate ?? (f && f.winrate)), '%'));
      parts.push(stat('Matches', l.matches));
      if (l.banned) parts.push('<span class="ban">BANNED</span>');
    }
    stats = parts.join('');
  }
  return `
    <div class="p ${me ? 'me' : ''}">
      <div class="name" title="${esc(p.name)}">${esc(p.name || p.steam64)}</div>
      <div class="links">
        <button class="csrep" data-open="csrep" data-id="${p.steam64}">csrep</button>
        <button data-open="leetify" data-id="${p.steam64}">Leetify</button>
        <button data-open="faceit" data-id="${p.steam64}">FACEIT</button>
        <button data-open="steam" data-id="${p.steam64}">Steam</button>
      </div>
      <div class="stats">${stats}</div>
    </div>`;
}

function teamBlock(cls, label, list) {
  const elos = list.map((p) => cache.get(p.steam64)?.faceit?.elo).filter(Boolean);
  const avg = elos.length ? `avg FACEIT ${Math.round(elos.reduce((a, b) => a + b, 0) / elos.length)}` : '';
  return `<div class="team ${cls}"><h3>${label} <span class="avg">${avg}</span></h3>${list.map(playerCard).join('')}</div>`;
}

function render() {
  const main = $('#teams');
  if (gs && gs.map) {
    const m = gs.map;
    $('#match').innerHTML = `<b>${esc((m.name || '').replace(/^de_/, ''))}</b> · CT ${m.team_ct?.score ?? 0} : ${m.team_t?.score ?? 0} T · ${esc(m.mode || '')}`;
  }
  if (!players.length) {
    main.className = 'single';
    main.innerHTML = '<div class="empty">No players yet. Join a match and press Refresh (Alt+R).</div>';
    return;
  }
  const ct = [], t = [], other = [];
  for (const p of players) {
    const team = teamOf(p.steam64);
    (team === 'CT' ? ct : team === 'T' ? t : other).push(p);
  }
  if (ct.length || t.length) {
    main.className = '';
    let html = teamBlock('ct', 'Counter-Terrorists', ct) + teamBlock('t', 'Terrorists', t);
    if (other.length) html += `<div style="grid-column:1/-1">${teamBlock('other', 'Team unknown', other)}</div>`;
    main.innerHTML = html;
  } else {
    main.className = 'single';
    main.innerHTML = teamBlock('other', `Players in server (${players.length})`, other);
  }
}

// ---------------------------------------------------------------- actions
async function refresh() {
  notice('');
  let res;
  try {
    res = await ez.cs2.status();
  } catch (e) {
    notice(esc(String(e)).replace('-netconport 2121', '<code>-netconport 2121</code>'));
    render();
    return;
  }
  lastRefresh = Date.now();
  players = res.players || [];
  if (!players.length) {
    notice('CS2 answered but listed no players. Are you in a match? (Bots and empty servers show nothing.)');
  } else if (!cfg.faceitKey) {
    notice('Add your FACEIT API key in ⚙ to see FACEIT levels.');
  }
  render();

  // Fetch stats 3 at a time, re-rendering as they arrive.
  const queue = players.map((p) => p.steam64);
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      await lookup(id).catch(() => {});
      render();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

async function setVisible(v) {
  visible = v;
  await ez.window.setVisible(v);
  if (v && Date.now() - lastRefresh > 60 * 1000) refresh();
}

function openLink(kind, id) {
  const urls = {
    csrep: (cfg.csrepUrl || DEFAULT_CSREP).replace('{steam64}', id),
    leetify: `https://leetify.com/app/profile/${id}`,
    faceit: `https://www.faceit.com/en/search?q=${id}`,
    steam: `https://steamcommunity.com/profiles/${id}`,
  };
  const f = cache.get(id)?.faceit;
  if (kind === 'faceit' && f && f.nickname) urls.faceit = `https://www.faceit.com/en/players/${encodeURIComponent(f.nickname)}`;
  ez.openUrl(urls[kind]).catch((e) => notice(esc(String(e))));
}

// ---------------------------------------------------------------- settings
async function loadSettings() {
  try {
    const saved = await ez.storage.get('settings');
    if (saved) cfg = { ...cfg, ...saved };
  } catch (_) {}
  $('#faceit-key').value = cfg.faceitKey;
  $('#leetify-key').value = cfg.leetifyKey;
  $('#csrep-url').value = cfg.csrepUrl;
}

$('#save').onclick = async () => {
  cfg.faceitKey = $('#faceit-key').value.trim();
  cfg.leetifyKey = $('#leetify-key').value.trim();
  cfg.csrepUrl = $('#csrep-url').value.trim() || DEFAULT_CSREP;
  await ez.storage.set('settings', cfg);
  cache.clear();
  $('#settings').classList.add('hidden');
  $('#teams').classList.remove('hidden');
  refresh();
};
$('#gear').onclick = () => {
  $('#settings').classList.toggle('hidden');
  $('#teams').classList.toggle('hidden');
};
$('#get-faceit').onclick = () => notice('Create an app at developers.faceit.com → App Studio → API Keys → Server-side key, then paste it here.');
$('#refresh').onclick = refresh;
$('#hide').onclick = () => setVisible(false);
$('#teams').addEventListener('click', (e) => {
  const b = e.target.closest('[data-open]');
  if (b) openLink(b.dataset.open, b.dataset.id);
});

// ---------------------------------------------------------------- events
ez.hotkeys.onPress((id) => {
  if (id === 'toggle') setVisible(!visible);
  if (id === 'refresh') { refresh(); if (!visible) setVisible(true); }
});

ez.cs2.onState((state) => {
  gs = state;
  const map = (state.map && state.map.name) || '';
  // New map loaded: grab the lobby and pop up for a few seconds.
  if (map && map !== lastMap) {
    lastMap = map;
    setTimeout(async () => {
      await refresh();
      if (!visible) {
        await setVisible(true);
        setTimeout(() => { if (visible) setVisible(false); }, 15000);
      }
    }, 4000);
  }
  // GSI sends updates ~10x a second; only redraw when something we show changes.
  const key = `${map}|${state.map?.team_ct?.score}|${state.map?.team_t?.score}|${Object.keys(state.allplayers || {}).length}|${state.player?.team}`;
  if (visible && key !== lastKey) render();
  lastKey = key;
});
let lastKey = '';

loadSettings().then(render);
