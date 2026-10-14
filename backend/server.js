// GATASIA API backend — Node.js built-in modules only.
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'gatasia-db.json');
const PORT = Number(process.env.PORT || 3000);
fs.mkdirSync(DATA_DIR, { recursive: true });

function readDb() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { players: {}, quizAttempts: [], missionClaims: {} }; }
}
let db = readDb();
function saveDb() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
function getProvinces() {
  const source = fs.readFileSync(path.join(ROOT, 'assets', 'data', 'province_data.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { timeout: 1000 });
  return sandbox.window.GATASIA_PROVINCES || [];
}
function send(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 1_000_000) req.destroy(); });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON tidak valid')); }
    });
    req.on('error', reject);
  });
}
function cleanName(v) { return String(v || 'Penjelajah').replace(/[<>]/g, '').trim().slice(0, 40) || 'Penjelajah'; }
function safePlayer(p) {
  return { id:p.id, name:p.name, avatar:p.avatar || '🧭', xp:p.xp || 0,
    quizzes:p.quizzes || 0, provinces:p.provinces || 0, missions:p.missions || 0, streak:p.streak || 0,
    earned:p.earned || [], history:p.history || [], updatedAt:p.updatedAt || null };
}
function getPlayer(id) {
  if (!db.players[id]) db.players[id] = {
    id, name:'Penjelajah', avatar:'🧭', xp:0, quizzes:0, provinces:0, missions:0,
    earned:[], history:[], events:[], createdAt:new Date().toISOString(), updatedAt:null
  };
  return db.players[id];
}
function leaderboard(period) {
  const now = Date.now(), weekStart = now - 7*24*60*60*1000;
  return Object.values(db.players).map(p => {
    const xp = period === 'week'
      ? (p.events || []).filter(e => Date.parse(e.at) >= weekStart).reduce((n,e) => n + e.xp, 0)
      : Number(p.xp || 0);
    return { id:p.id, name:p.name, emoji:p.avatar || '🧭', level:Math.floor((p.xp||0)/500)+1,
      xp, badge:(p.earned||[]).length ? '🏅 Penjelajah' : '🌱 Pemula', short:'Penjelajah' };
  }).sort((a,b) => b.xp-a.xp || a.name.localeCompare(b.name)).slice(0,100);
}
const server = http.createServer(async (req,res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    if (req.method === 'GET' && url.pathname === '/api/health')
      return send(res, 200, { ok:true, service:'GATASIA API', timestamp:new Date().toISOString() });
    if (req.method === 'GET' && url.pathname === '/api/provinces')
      return send(res, 200, getProvinces().map(({province,key,question,options,explanation,x,y}) => ({province,key,question,options,explanation,x,y})));
    if (parts[0] === 'api' && parts[1] === 'profile' && parts[2]) {
      const id = parts[2].slice(0,100);
      if (req.method === 'GET') {
        if (!db.players[id]) return send(res, 404, { error:'Profil belum ditemukan' });
        return send(res, 200, safePlayer(db.players[id]));
      }
      if (req.method === 'PUT') {
        const body = await readBody(req);
        const p = getPlayer(id);
        const oldXp = Number(p.xp || 0);
        p.name = cleanName(body.name || p.name);
        p.avatar = String(body.avatar || p.avatar || '🧭').slice(0,12);
        // XP is monotonic in this prototype: a stale page cannot overwrite a newer server total.
        p.xp = Math.max(oldXp, 0, Math.min(10_000_000, Number(body.xp) || 0));
        p.quizzes = Math.max(0, Math.min(1_000_000, Number(body.quizzes) || 0));
        p.provinces = Math.max(0, Math.min(38, Number(body.provinces) || 0));
        p.missions = Math.max(0, Math.min(1_000_000, Number(body.missions) || 0));
        p.streak = Math.max(0, Math.min(10000, Number(body.streak) || 0));
        p.earned = Array.isArray(body.earned) ? [...new Set(body.earned.map(String))].slice(0,100) : p.earned;
        p.history = Array.isArray(body.history) ? body.history.slice(0,100) : p.history;
        const delta = p.xp - oldXp;
        if (delta > 0) {
          p.events = p.events || [];
          p.events.push({ xp:delta, at:new Date().toISOString(), source:'profile-sync' });
          p.events = p.events.slice(-1000);
        }
        p.updatedAt = new Date().toISOString();
        saveDb();
        return send(res, 200, safePlayer(p));
      }
    }
    if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'leaderboard') {
      const period = url.searchParams.get('period') === 'week' ? 'week' : 'all';
      return send(res, 200, { period, players:leaderboard(period) });
    }
    if (req.method === 'POST' && url.pathname === '/api/quiz/submit') {
      const body = await readBody(req);
      const playerId = String(body.playerId || '').slice(0,100);
      const key = String(body.provinceKey || '');
      const answerIndex = Number(body.answerIndex);
      if (!playerId || !key || !Number.isInteger(answerIndex)) return send(res, 400, {error:'playerId, provinceKey, dan answerIndex wajib diisi'});
      const province = getProvinces().find(p => p.key === key);
      if (!province) return send(res, 404, {error:'Provinsi tidak ditemukan'});
      const day = new Date().toISOString().slice(0,10);
      const attemptKey = `${playerId}:${key}:${day}`;
      if (db.quizAttempts.some(a => a.key === attemptKey)) return send(res, 409, {error:'Kuis provinsi ini sudah diklaim hari ini'});
      // Never accept the answer key from the client.
      const correct = answerIndex === Number(province.answer);
      const rewardXp = correct ? 50 : 5;
      const p = getPlayer(playerId);
      p.xp += rewardXp; p.quizzes += 1;
      p.events = p.events || []; p.events.push({xp:rewardXp,at:new Date().toISOString(),source:'quiz'});
      p.history = [{icon:correct?'✅':'📘',title:`Kuis ${province.province}`,desc:correct?'Jawaban benar, XP ditambahkan.':'Kuis selesai; tetap semangat belajar.',time:'Baru saja'},...(p.history||[])].slice(0,100);
      p.updatedAt = new Date().toISOString();
      db.quizAttempts.push({key:attemptKey,playerId,provinceKey:key,correct,at:new Date().toISOString()});
      saveDb();
      return send(res, 200, {correct, rewardXp, explanation:province.explanation, profile:safePlayer(p)});
    }
    // Serve website files from the project root.
    if (req.method === 'GET') {
      let requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const file = path.resolve(ROOT, '.' + requested);
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
        return send(res, 404, {error:'Tidak ditemukan'});
      const ext = path.extname(file).toLowerCase();
      const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
      res.writeHead(200, {'Content-Type':types[ext] || 'application/octet-stream'});
      return fs.createReadStream(file).pipe(res);
    }
    return send(res, 404, {error:'Endpoint tidak ditemukan'});
  } catch (err) {
    console.error(err);
    return send(res, 500, {error:'Kesalahan server', detail:process.env.NODE_ENV === 'production' ? undefined : err.message});
  }
});
server.listen(PORT, () => console.log(`GATASIA berjalan di http://localhost:${PORT}`));
