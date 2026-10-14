/* GATASIA server-first profile synchronization.
 * Server data wins when it already exists; local profile seeds the server only on first visit.
 */
(function () {
  'use strict';
  const API = '/api';
  const PROFILE_KEY = 'gatasiaProfile';
  const PLAYER_KEY = 'gatasiaPlayerId';
  let playerId = localStorage.getItem(PLAYER_KEY);
  if (!playerId) {
    playerId = 'player_' + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());
    localStorage.setItem(PLAYER_KEY, playerId);
  }
  let hydrating = true;
  let saveTimer = null;
  let lastServerProfile = null;
  const request = async (url, options = {}) => {
    const response = await fetch(API + url, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(data.error || `API gagal (${response.status})`);
      err.status = response.status;
      throw err;
    }
    return data;
  };
  function readLocal() {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function normalize(p) {
    const xp = Math.max(0, Number(p.xp ?? 1450) || 0);
    return { ...p, name: p.name || 'Penjelajah', avatar: p.avatar || p.emoji || '🧭', xp,
      quizzes: Number(p.quizzes || 0), provinces: Number(p.provinces || 0),
      missions: Number(p.missions || 0), earned: Array.isArray(p.earned) ? p.earned : [],
      history: Array.isArray(p.history) ? p.history : [] };
  }
  function writeLocal(p) {
    const normalized = normalize(p);
    // Native setItem avoids triggering the sync wrapper during server hydration.
    nativeSetItem.call(localStorage, PROFILE_KEY, JSON.stringify(normalized));
    paintSharedStats(normalized);
    window.dispatchEvent(new CustomEvent('gatasia:profile-updated', { detail: normalized }));
  }
  const nativeSetItem = Storage.prototype.setItem;
  function paintSharedStats(profile = readLocal()) {
    const p = normalize(profile);
    const xp = p.xp;
    const level = Math.floor(xp / 500) + 1;
    document.querySelectorAll('.level-pill b, #level, #levelTop').forEach(el => { el.textContent = level; });
    document.querySelectorAll('.xp-pill small b, #xpLabel').forEach(el => {
      el.textContent = xp.toLocaleString('id-ID') + (el.id === 'xpLabel' ? ' XP' : '');
    });
    document.querySelectorAll('.xp-pill .progress i, #xpFill').forEach(el => { el.style.width = (xp % 500 / 5) + '%'; });
  }
  async function saveToServer(profile) {
    if (hydrating) return;
    const normalized = normalize(profile);
    const saved = await request('/profile/' + encodeURIComponent(playerId), {
      method: 'PUT', body: JSON.stringify(normalized)
    });
    lastServerProfile = saved;
    return saved;
  }
  function queueSave() {
    if (hydrating) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveToServer(readLocal()).then(saved => {
      if (saved && Number(saved.xp) > Number(readLocal().xp || 0)) writeLocal({ ...readLocal(), ...saved });
    }).catch(err => {
      console.warn('[GATASIA] Sinkronisasi profil gagal:', err.message);
      window.dispatchEvent(new CustomEvent('gatasia:sync-error', { detail: err.message }));
    }), 40);
  }
  async function hydrateProfile() {
    // Fetch the canonical server profile before syncing local changes, to avoid replacing it with stale data.
    try {
      const serverProfile = await request('/profile/' + encodeURIComponent(playerId));
      lastServerProfile = serverProfile;
      writeLocal({ ...readLocal(), ...serverProfile, xp: serverProfile.xp });
    } catch (err) {
      if (err.status === 404) {
        const local = readLocal();
        const seed = Object.keys(local).length ? normalize(local) : normalize({ xp: 1450, name: 'Penjelajah' });
        const saved = await request('/profile/' + encodeURIComponent(playerId), {
          method: 'PUT', body: JSON.stringify(seed)
        });
        lastServerProfile = saved;
        writeLocal({ ...local, ...saved, xp: saved.xp });
      } else {
        console.warn('[GATASIA] Server belum dapat dihubungi; memakai profil lokal.', err.message);
      }
    } finally {
      hydrating = false;
      paintSharedStats();
    }
  }
  window.GATASIA_API = {
    playerId,
    getProfile: () => request('/profile/' + encodeURIComponent(playerId)),
    saveProfile: profile => saveToServer(profile),
    leaderboard: period => request('/leaderboard?period=' + encodeURIComponent(period || 'all')),
    submitQuiz: (provinceKey, answerIndex) => request('/quiz/submit', {
      method: 'POST', body: JSON.stringify({ playerId, provinceKey, answerIndex })
    }),
    syncNow: () => saveToServer(readLocal()),
    addXp: async amount => {
      await window.GATASIA_API.ready;
      const current = normalize(readLocal());
      const updated = { ...current, xp: current.xp + Math.max(0, Number(amount) || 0) };
      const saved = await saveToServer(updated);
      writeLocal({ ...updated, ...saved });
      return saved;
    },
    ready: hydrateProfile()
  };
  Storage.prototype.setItem = function (key, value) {
    nativeSetItem.call(this, key, value);
    if (key === PROFILE_KEY) {
      try { paintSharedStats(JSON.parse(value)); } catch {}
      queueSave();
    }
  };
  window.addEventListener('pageshow', () => paintSharedStats());
  window.addEventListener('beforeunload', () => {
    // Best effort only; normal saves use the debounce above.
    if (!hydrating && navigator.sendBeacon) {
      const body = JSON.stringify(normalize(readLocal()));
      // sendBeacon cannot add the JSON API method, so do not use it for profile PUT.
      void body;
    }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) paintSharedStats(); });

  // Server-backed leaderboard.
  if (location.pathname.endsWith('page4_papan_peringkat.html')) {
    let period = 'week';
    const fmt = n => Number(n || 0).toLocaleString('id-ID');
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    async function renderLive() {
      try {
        await window.GATASIA_API.ready;
        const data = await window.GATASIA_API.leaderboard(period);
        const sorted = data.players || [];
        const query = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
        const filtered = sorted.filter(p => String(p.name || '').toLowerCase().includes(query));
        const rows = document.getElementById('rankingRows');
        if (rows) rows.innerHTML = filtered.map(p => `<tr><td class="rank-num">#${sorted.findIndex(x => x.id === p.id) + 1}</td><td><div class="player"><span class="player-face">${esc(p.emoji || '🧭')}</span><span><span class="player-name">${esc(p.name)}</span><span class="player-level">Level ${Math.floor((Number(p.xp)||0)/500)+1} · Penjelajah Nusantara</span></span></div></td><td class="xp">${fmt(p.xp)} XP</td><td><span class="badge">${esc(p.badge || '🌱 Pemula')}</span></td></tr>`).join('');
        const empty = document.getElementById('emptyState'); if (empty) empty.style.display = filtered.length ? 'none' : 'block';
        const table = document.querySelector('table'); if (table) table.style.display = filtered.length ? 'table' : 'none';
        const podium = document.getElementById('podium');
        if (podium && sorted.length) {
          const top = sorted.slice(0, 3);
          const entries = [{p:top[1], cls:'second', medal:'🥈'}, {p:top[0], cls:'first', medal:'🥇'}, {p:top[2], cls:'third', medal:'🥉'}].filter(x=>x.p);
          podium.innerHTML = entries.map(({p,cls,medal}) => `<article class="podium-card ${cls}"><span class="place">${medal}</span><div class="face">${esc(p.emoji||'🧭')}</div><h3>${esc(p.name)}</h3><small>Level ${Math.floor((Number(p.xp)||0)/500)+1} · Penjelajah</small><div class="score">${fmt(p.xp)} <small>XP</small></div></article>`).join('');
        }
        const mine = sorted.findIndex(p => p.id === playerId);
        const rank = document.querySelector('.my-rank strong'); if (rank) rank.textContent = mine >= 0 ? '#' + (mine + 1) : '—';
        const rankText = document.querySelector('.my-rank span'); if (rankText) rankText.textContent = mine >= 0 ? 'Peringkat kamu dari data server' : 'Profil kamu belum masuk peringkat ini';
      } catch (err) { console.warn('[GATASIA] Papan peringkat server tidak tersedia:', err.message); }
    }
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('[data-period]').forEach(btn => btn.addEventListener('click', () => { period = btn.dataset.period === 'week' ? 'week' : 'all'; renderLive(); }));
      document.getElementById('searchInput')?.addEventListener('input', renderLive);
      renderLive();
    });
    window.addEventListener('gatasia:profile-updated', renderLive);
  }
  function fixMissionToast() {
    if (!location.pathname.endsWith('page3_misi_harian.html')) return;
    const style = document.createElement('style');
    style.textContent = '#toast.toast{box-sizing:border-box!important;width:max-content!important;height:auto!important;min-width:0!important;min-height:0!important;max-width:min(340px,calc(100vw - 28px))!important;max-height:100px!important;white-space:normal!important;writing-mode:horizontal-tb!important;overflow:hidden!important;flex-direction:row!important;align-items:center!important;padding:10px 15px!important;border-radius:999px!important;}';
    document.head.appendChild(style);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fixMissionToast); else fixMissionToast();
})();
