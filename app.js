'use strict';
if (window.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const icon = id => `<svg><use href="#i-${id}"/></svg>`;
const AC = window.AudioContext || window.webkitAudioContext;
let ctx; try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
let sf = null, synth = null;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 1900); }

/* ---- Desbloqueo de audio (iOS) ---- */
function unlock() {
  if (ctx.state !== 'running') ctx.resume();
  if (!unlock.done) { const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0); unlock.done = true; }
}
['touchstart', 'touchend', 'pointerdown', 'click'].forEach(e => document.addEventListener(e, unlock, { capture: true, passive: true }));

/* ================= Cadena de efectos (máster) ================= */
const input = ctx.createGain();
const wetDry = () => { const dry = ctx.createGain(), wet = ctx.createGain(), out = ctx.createGain(); dry.connect(out); wet.connect(out); wet.gain.value = 0; return { dry, wet, out }; };
const shaper = ctx.createWaveShaper(); shaper.oversample = '2x';
function setDrive(k) { const n = 2048, c = new Float32Array(n), a = 1 + k * 40; for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(a * x) / Math.tanh(a); } shaper.curve = c; }
const dist = wetDry(); input.connect(dist.dry); input.connect(shaper); shaper.connect(dist.wet);
const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 250;
const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1200; mid.Q.value = .8;
const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 4000;
dist.out.connect(low); low.connect(mid); mid.connect(high);
const ch = wetDry(), chDelay = ctx.createDelay(.1), lfo = ctx.createOscillator(), lfoG = ctx.createGain();
chDelay.delayTime.value = .02; lfoG.gain.value = .004; lfo.connect(lfoG); lfoG.connect(chDelay.delayTime); lfo.start();
high.connect(ch.dry); high.connect(chDelay); chDelay.connect(ch.wet);
const ec = wetDry(), dl = ctx.createDelay(2), fb = ctx.createGain();
ch.out.connect(ec.dry); ch.out.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(ec.wet);
const rv = wetDry(), conv = ctx.createConvolver();
function makeIR(sec) { const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); } conv.buffer = b; }
ec.out.connect(rv.dry); ec.out.connect(conv); conv.connect(rv.wet);
const master = ctx.createGain(), comp = ctx.createDynamicsCompressor();
rv.out.connect(master); master.connect(comp); comp.connect(ctx.destination);
const pct = v => Math.round(v * 100) + '%', db = v => ((v - .5) * 24).toFixed(1) + ' dB';
const FX = [
  { id: 'rev', name: 'Reverberación', desc: 'Espacio y ambiente de sala', c: '#7b5cff', on: true, p: [
    { k: 'mix', l: 'Cantidad', v: .25, f: pct, set: v => { rv.wet.gain.value = v; rv.dry.gain.value = 1 - v * .4; } },
    { k: 'size', l: 'Sala', v: .4, f: v => (0.4 + v * 4).toFixed(1) + ' s', set: v => makeIR(.4 + v * 4), lazy: true }] },
  { id: 'echo', name: 'Eco', desc: 'Repeticiones del sonido', c: '#36a3ff', on: false, p: [
    { k: 'mix', l: 'Cantidad', v: .35, f: pct, set: v => { ec.wet.gain.value = v; ec.dry.gain.value = 1 - v * .3; } },
    { k: 'time', l: 'Tiempo', v: .3, f: v => Math.round(50 + v * 950) + ' ms', set: v => dl.delayTime.value = .05 + v * .95 },
    { k: 'fb', l: 'Repetir', v: .4, f: pct, set: v => fb.gain.value = v * .85 }] },
  { id: 'chorus', name: 'Chorus', desc: 'Sonido más ancho y lleno', c: '#2ee59d', on: false, p: [
    { k: 'mix', l: 'Cantidad', v: .5, f: pct, set: v => { ch.wet.gain.value = v; ch.dry.gain.value = 1 - v * .5; } },
    { k: 'rate', l: 'Velocidad', v: .3, f: v => (.2 + v * 5).toFixed(1) + ' Hz', set: v => lfo.frequency.value = .2 + v * 5 }] },
  { id: 'dist', name: 'Distorsión', desc: 'Saturación tipo guitarra eléctrica', c: '#ff7a3d', on: false, p: [
    { k: 'mix', l: 'Cantidad', v: .5, f: pct, set: v => { dist.wet.gain.value = v * .5; dist.dry.gain.value = 1 - v; } },
    { k: 'drive', l: 'Fuerza', v: .3, f: pct, set: setDrive }] },
  { id: 'eq', name: 'Ecualizador', desc: 'Graves, medios y agudos', c: '#ffb020', on: true, p: [
    { k: 'low', l: 'Graves', v: .5, f: db, set: v => low.gain.value = (v - .5) * 24, neutral: .5 },
    { k: 'mid', l: 'Medios', v: .5, f: db, set: v => mid.gain.value = (v - .5) * 24, neutral: .5 },
    { k: 'high', l: 'Agudos', v: .5, f: db, set: v => high.gain.value = (v - .5) * 24, neutral: .5 }] },
  { id: 'vol', name: 'Máster', desc: 'Volumen general', c: '#ff3d71', on: true, fixed: true, p: [
    { k: 'v', l: 'Volumen', v: .8, f: pct, set: v => master.gain.value = v * 1.5 }] },
];
let fxSaved = JSON.parse(localStorage.getItem('fx2') || '{}');
const fxVal = (f, p) => fxSaved[f.id + '.' + p.k] ?? p.v, fxOn = f => f.fixed || (fxSaved[f.id + '.on'] ?? f.on);
function applyFx(f) { for (const p of f.p) { if (!fxOn(f) && p.k === 'mix') p.set(0); else if (!fxOn(f) && p.neutral != null) p.set(p.neutral); else p.set(fxVal(f, p)); } }
function arc(cx, cy, r, a0, a1) { const p = a => [cx + r * Math.cos((a - 90) * Math.PI / 180), cy + r * Math.sin((a - 90) * Math.PI / 180)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`; }
function knob(p, val, color, onChange) {
  const el = h('div', 'knob'); let v = val;
  el.innerHTML = `<svg viewBox="0 0 58 58"><path d="${arc(29, 29, 23, -135, 135)}" stroke="#2c2f3a" stroke-width="5" fill="none" stroke-linecap="round"/><path class="va" stroke="${color}" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="29" cy="29" r="16" fill="url(#kg)" stroke="#3a3d48"/><line class="ind" x1="29" y1="29" x2="29" y2="17" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><defs><radialGradient id="kg" cx=".4" cy=".3"><stop offset="0" stop-color="#3b3f4c"/><stop offset="1" stop-color="#1b1d24"/></radialGradient></defs></svg><div class="kv"></div><div class="kl">${p.l}</div>`;
  const draw = () => { const a = -135 + v * 270; el.querySelector('.va').setAttribute('d', v > .005 ? arc(29, 29, 23, -135, a) : ''); el.querySelector('.ind').setAttribute('transform', `rotate(${a} 29 29)`); el.querySelector('.kv').textContent = p.f(v); };
  let sy = 0, sv = 0, last = 0;
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); sy = e.clientY; sv = v; const now = Date.now(); if (now - last < 300) { v = p.v; draw(); onChange(v, true); } last = now; });
  el.addEventListener('pointermove', e => { if (!el.hasPointerCapture(e.pointerId)) return; v = Math.max(0, Math.min(1, sv + (sy - e.clientY) / 160)); draw(); onChange(v, false); });
  el.addEventListener('pointerup', () => onChange(v, true));
  draw(); return el;
}
function buildRack() {
  const rack = $('#rack'); rack.innerHTML = '';
  for (const f of FX) {
    const u = h('div', 'unit' + (fxOn(f) ? ' on' : '')); u.style.setProperty('--c', f.c);
    u.innerHTML = `<div class="uh"><span class="led"></span><b>${f.name}<small>${f.desc}</small></b>${f.fixed ? '' : '<button class="pwr" aria-label="Activar"></button>'}</div>`;
    const ks = h('div', 'knobs');
    for (const p of f.p) ks.append(knob(p, fxVal(f, p), f.c, (v, end) => {
      fxSaved[f.id + '.' + p.k] = v; if (fxOn(f) && (!p.lazy || end)) p.set(v);
      if (end) localStorage.setItem('fx2', JSON.stringify(fxSaved));
    }));
    u.append(ks);
    const pw = u.querySelector('.pwr');
    if (pw) pw.onclick = () => { fxSaved[f.id + '.on'] = !fxOn(f); u.classList.toggle('on', fxOn(f)); applyFx(f); localStorage.setItem('fx2', JSON.stringify(fxSaved)); };
    rack.append(u); applyFx(f);
  }
}
$('#fxReset').onclick = () => { fxSaved = {}; localStorage.removeItem('fx2'); buildRack(); toast('Efectos restablecidos'); };

/* ================= Proyecto / pistas ================= */
const COLORS = ['#ff3d71', '#7b5cff', '#2ee59d', '#36a3ff', '#ffb020', '#ff7a3d', '#e05cff', '#00d4d4'];
const FAM = [['Pianos', 'keys'], ['Percusión afinada', 'keys'], ['Órganos', 'organ'], ['Guitarras', 'guitar'], ['Bajos', 'guitar'], ['Cuerdas', 'violin'], ['Conjuntos y coros', 'choir'], ['Metales', 'brass'], ['Lengüetas', 'flute'], ['Flautas', 'flute'], ['Synth lead', 'wave'], ['Synth pad', 'wave'], ['Synth FX', 'spark'], ['Étnicos', 'guitar'], ['Percusión', 'drum'], ['Efectos', 'spark']];
const FAMCOL = ['#ff3d71', '#ff7a3d', '#ffb020', '#e8a33d', '#7b5cff', '#c45cff', '#e05cff', '#ffcf3d', '#2ee59d', '#00d4d4', '#36a3ff', '#5c7bff', '#9b5cff', '#2ec4a5', '#ff5c5c', '#8a8fa0'];
let proj = JSON.parse(localStorage.getItem('proj') || 'null');
let selId = null;
const save = () => localStorage.setItem('proj', JSON.stringify(proj));
const presetName = (bank, prog) => { const p = sf && sf.index.find(p => p.bank === bank && p.program === prog); return p ? p.name : '—'; };
const trackIcon = t => t.type === 'drums' ? 'drum' : t.voice ? 'mic' : FAM[t.prog >> 3][1];
const sel = () => proj.tracks.find(t => t.id === selId) || proj.tracks[0];
function newTrack(type, prog, voice) {
  const id = Date.now() + Math.floor(Math.random() * 1000);
  const t = { id, type, bank: type === 'drums' ? 128 : 0, prog: prog || 0, vol: .8, mute: false, solo: false, color: COLORS[proj.tracks.length % COLORS.length], notes: [], voice: !!voice };
  t.name = type === 'drums' ? 'Batería' : (voice ? 'Voz → ' : '') + presetName(t.bank, t.prog);
  proj.tracks.push(t); selId = id; save(); return t;
}
/* ganancia por pista */
const tgain = {};
function gainFor(t) { if (!tgain[t.id]) { tgain[t.id] = ctx.createGain(); tgain[t.id].connect(input); } return tgain[t.id]; }
function applyMix() { const solo = proj.tracks.some(t => t.solo); for (const t of proj.tracks) gainFor(t).gain.value = (t.mute || (solo && !t.solo)) ? 0 : t.vol; }

/* ================= Transporte ================= */
const T = { playing: false, rec: false, pos: 0, startCtx: 0, startPos: 0, sched: 0, timer: null, voices: [], recNotes: null };
const beatSec = () => 60 / proj.bpm, barSec = () => 4 * beatSec();
const songLen = () => Math.max(0, ...proj.tracks.flatMap(t => t.notes.map(n => n.start + n.dur)));
const loopLen = () => Math.max(1, Math.ceil((songLen() || barSec() * 4) / barSec())) * barSec();
function curPos() { if (!T.playing) return T.pos; const L = Math.max(0, ctx.currentTime - T.startCtx); return proj.loop && !T.rec ? (T.startPos + L) % T.loopLen : T.startPos + L; }
function click(t, acc) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = acc ? 1800 : 1200; g.gain.setValueAtTime(.25, t); g.gain.exponentialRampToValueAtTime(.001, t + .05); o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + .06); }
function tick() {
  const until = ctx.currentTime + .15 - T.startCtx; // tiempo lineal
  while (T.sched < until) {
    const L0 = T.sched, looping = proj.loop && !T.rec;
    const s0 = looping ? (T.startPos + L0) % T.loopLen : T.startPos + L0;
    const segLen = looping ? Math.min(until - L0, T.loopLen - s0) : until - L0;
    const s1 = s0 + segLen;
    for (const t of proj.tracks) {
      for (const n of t.notes) if (n.start >= s0 && n.start < s1) {
        const at = T.startCtx + L0 + (n.start - s0);
        const v = synth.noteOn(t.bank, t.prog, n.midi, n.vel || 100, at, gainFor(t)); synth.noteOff(v, at + n.dur);
        T.voices.push({ v, end: at + n.dur + 3 });
      }
    }
    if (proj.metro || T.rec && proj.metro) { const b0 = Math.ceil(s0 / beatSec() - 1e-9); for (let b = b0; b * beatSec() < s1; b++) click(T.startCtx + L0 + b * beatSec() - s0, b % 4 === 0); }
    T.sched = L0 + segLen + 1e-6;
    if (looping && segLen <= 1e-6) T.sched = L0 + 1e-3;
  }
  T.voices = T.voices.filter(x => x.end > ctx.currentTime);
  if (!proj.loop && !T.rec && curPos() > songLen() + .6) stop();
}
function ensureSounds() {
  const need = proj.tracks.filter(t => !sf.isLoaded(t.bank, t.prog));
  if (!need.length) return Promise.resolve();
  status('Cargando sonidos…');
  return Promise.all(need.map(t => sf.load(t.bank, t.prog))).then(() => status(''));
}
function play() {
  if (T.playing || T.waiting) return; unlock();
  if (proj.tracks.some(t => !sf.isLoaded(t.bank, t.prog))) { T.waiting = true; ensureSounds().then(() => { T.waiting = false; play(); }, e => { T.waiting = false; showErr(e); }); return; }
  T.loopLen = loopLen(); if (proj.loop && !T.rec && T.pos >= T.loopLen) T.pos = 0;
  T.startPos = T.pos; T.startCtx = ctx.currentTime + .06; T.sched = 0; T.playing = true;
  T.timer = setInterval(tick, 25); tick(); $('#tPlay').classList.add('on'); $('#tPlay').innerHTML = icon('stop'); raf();
}
function stop() {
  if (!T.playing) return;
  T.pos = curPos(); T.playing = false; clearInterval(T.timer);
  for (const x of T.voices) { try { x.v.forEach(n => { n.g.disconnect(); n.src.stop(); }); } catch (e) {} } T.voices = [];
  if (T.rec) endRec();
  $('#tPlay').classList.remove('on'); $('#tPlay').innerHTML = icon('play'); drawAll();
}
function startRec() {
  const t = sel(); if (!t) return toast('Añade una pista primero');
  stop(); T.rec = true; T.recNotes = []; $('#tRec').classList.add('on'); play();
  toast('Grabando en «' + t.name + '»');
  if ($('#v-studio').classList.contains('active')) show('v-play');
}
function endRec() {
  const t = sel(); T.rec = false; $('#tRec').classList.remove('on');
  if (t && T.recNotes && T.recNotes.length) { t.notes.push(...T.recNotes); t.notes.sort((a, b) => a.start - b.start); save(); toast(T.recNotes.length + ' notas grabadas'); }
  T.recNotes = null; renderTracks();
}
$('#tPlay').onclick = () => T.playing ? stop() : play();
$('#tRec').onclick = () => T.rec ? stop() : startRec();
$('#tBack').onclick = () => { const p = T.playing; stop(); T.pos = 0; if (p) play(); drawAll(); };
$('#tMetro').onclick = () => { proj.metro = !proj.metro; save(); syncTransport(); toast(proj.metro ? 'Metrónomo activado' : 'Metrónomo desactivado'); };
$('#tLoop').onclick = () => { proj.loop = !proj.loop; save(); syncTransport(); toast(proj.loop ? 'Bucle activado' : 'Bucle desactivado'); };
$('#tBpm').onclick = () => openSheet(`<div class="sh-h"><h3>Tempo</h3></div><div class="bpm-ctl"><button data-d="-5">−</button><b id="bpmBig">${proj.bpm}</b><button data-d="5">+</button></div>`, b => {
  b.querySelectorAll('[data-d]').forEach(x => x.onclick = () => { proj.bpm = Math.max(40, Math.min(220, proj.bpm + +x.dataset.d)); b.querySelector('#bpmBig').textContent = proj.bpm; save(); syncTransport(); drawAll(); });
});
function syncTransport() { $('#bpmVal').textContent = proj.bpm; $('#tMetro').classList.toggle('on', !!proj.metro); $('#tLoop').classList.toggle('on', !!proj.loop); }
function fmtPos(s) { const b = s / beatSec(); return (Math.floor(b / 4) + 1) + '.' + (Math.floor(b % 4) + 1); }
function fmtTime(s) { return Math.floor(s / 60) + ':' + (s % 60).toFixed(1).padStart(4, '0'); }
function raf() {
  const p = curPos(); $('#tPos').textContent = fmtPos(p); $('#tTime').textContent = fmtTime(p);
  $('#playhead').style.transform = `translateX(${p * pps()}px)`;
  if ($('#v-play').classList.contains('active')) drawProll();
  if (T.playing) requestAnimationFrame(raf);
}

/* ---- tocar en vivo ---- */
function liveOn(midi, vel) {
  const t = sel(); if (!t) return null;
  const v = synth.noteOn(t.bank, t.prog, midi, vel, 0, gainFor(t));
  const ev = T.rec && T.recNotes ? { midi, vel, start: +curPos().toFixed(3), dur: .2 } : null;
  if (ev) T.recNotes.push(ev);
  return { v, ev, t0: ctx.currentTime };
}
function liveOff(o) { if (!o) return; synth.noteOff(o.v); if (o.ev) o.ev.dur = Math.max(.05, +(ctx.currentTime - o.t0).toFixed(3)); }

/* ================= Arreglo (timeline) ================= */
const pps = () => 30 * proj.bpm / 60; // 30 px por pulso
function renderTracks() {
  const heads = $('#heads'), lanes = $('#lanes');
  heads.querySelectorAll('.th,.empty').forEach(e => e.remove()); lanes.querySelectorAll('.lane').forEach(e => e.remove());
  if (!proj.tracks.length) heads.append(h('div', 'empty', 'Sin pistas'));
  applyMix();
  for (const t of proj.tracks) {
    const d = h('div', 'th' + (t.id === selId ? ' sel' : ''));
    d.innerHTML = `<i class="stripe" style="background:${t.color}"></i><div class="r1"><span class="ico" style="background:${t.color}">${icon(trackIcon(t))}</span><span class="nm">${t.name}</span><button class="mo">${icon('more')}</button></div><div class="r2"><span class="rarm"></span><button class="ms m${t.mute ? ' on' : ''}">M</button><button class="ms s${t.solo ? ' on' : ''}">S</button><input type="range" min="0" max="1" step="0.01" value="${t.vol}"></div>`;
    d.onclick = e => { if (e.target.closest('button,input')) return; selId = t.id; renderTracks(); syncPlayView(); };
    d.querySelector('.m').onclick = () => { t.mute = !t.mute; save(); renderTracks(); };
    d.querySelector('.s').onclick = () => { t.solo = !t.solo; save(); renderTracks(); };
    const r = d.querySelector('input'); r.oninput = () => { t.vol = +r.value; applyMix(); }; r.onchange = save;
    d.querySelector('.mo').onclick = () => trackMenu(t);
    heads.append(d);
    const c = h('canvas', 'lane'); c.dataset.id = t.id; lanes.append(c);
  }
  drawAll(); syncPlayView();
}
const DPR = () => Math.min(2, devicePixelRatio || 1);
// Lienzos del tamaño de la ventana visible (no gigantes): se redibujan al desplazar. Evita fallos de WebKit/iOS con lienzos muy anchos.
function drawAll() {
  const bars = Math.max(16, Math.ceil(songLen() / barSec()) + 4), W = Math.ceil(bars * barSec() * pps()), dpr = DPR();
  const sc = $('#lanesScroll'), vw = Math.max(1, sc.clientWidth), ox = sc.scrollLeft;
  $('#lanes').style.width = W + 'px';
  const prep = (c, hgt) => { c.width = vw * dpr; c.height = hgt * dpr; c.style.width = vw + 'px'; c.style.height = hgt + 'px'; const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, -ox * dpr, 0); return g; };
  const b0 = Math.max(0, Math.floor(ox / (beatSec() * pps())) - 1), b1 = Math.ceil((ox + vw) / (beatSec() * pps())) + 1;
  const g = prep($('#ruler'), 28); g.font = '600 10px -apple-system,sans-serif';
  for (let b = b0; b < b1; b++) { const x = b * beatSec() * pps(); g.fillStyle = b % 4 ? '#3a3d48' : '#8a8fa0'; g.fillRect(x, b % 4 ? 20 : 12, 1, 28); if (b % 4 === 0) { g.fillStyle = '#9aa0ae'; g.fillText(String(b / 4 + 1), x + 4, 12); } }
  if (proj.loop) { g.fillStyle = 'rgba(255,61,113,.35)'; g.fillRect(0, 24, loopLen() * pps(), 4); }
  for (const c of $$('#lanes .lane')) {
    const t = proj.tracks.find(x => x.id == c.dataset.id); if (!t) continue;
    const q = prep(c, 76);
    for (let b = b0; b < b1; b++) { q.fillStyle = b % 4 ? 'rgba(255,255,255,.025)' : 'rgba(255,255,255,.07)'; q.fillRect(b * beatSec() * pps(), 0, 1, 76); }
    if (!t.notes.length) continue;
    const s = t.notes[0].start, e = Math.max(...t.notes.map(n => n.start + n.dur));
    const x0 = Math.floor(s / barSec()) * barSec() * pps(), x1 = Math.ceil(e / barSec()) * barSec() * pps();
    q.fillStyle = t.color + '33'; q.strokeStyle = t.color; q.lineWidth = 1.5;
    q.beginPath(); q.rect(x0 + 1, 5, x1 - x0 - 2, 66); q.fill(); q.stroke();
    q.fillStyle = t.color; q.fillRect(x0 + 1, 5, x1 - x0 - 2, 14);
    q.fillStyle = '#000'; q.font = '700 10px -apple-system,sans-serif'; q.fillText(t.name, x0 + 6, 15);
    const lo = Math.min(...t.notes.map(n => n.midi)), hi = Math.max(...t.notes.map(n => n.midi)), rows = Math.max(12, hi - lo + 1), nh = 48 / rows;
    q.fillStyle = '#fff';
    for (const n of t.notes) q.fillRect(n.start * pps(), 22 + (hi - n.midi) * nh + (rows - (hi - lo + 1)) * nh / 2, Math.max(2, n.dur * pps()), Math.max(2, nh - .5));
  }
  $('#playhead').style.transform = `translateX(${curPos() * pps()}px)`;
}
let scrollRaf = 0; $('#lanesScroll').addEventListener('scroll', () => { if (!scrollRaf) scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; drawAll(); }); }, { passive: true });
addEventListener('resize', () => { if (proj) drawAll(); });
$('#ruler').addEventListener('click', e => { const r = e.target.getBoundingClientRect(); const p = Math.max(0, (e.clientX - r.left) / pps()); const was = T.playing; stop(); T.pos = Math.round(p / beatSec()) * beatSec(); if (was) play(); raf(); drawAll(); });
function trackMenu(t) {
  openSheet(`<div class="sh-h"><h3>${t.name}</h3></div>
    <button class="opt" data-a="inst"><span class="ci" style="background:${t.color}">${icon(trackIcon(t))}</span><span><b>Cambiar ${t.type === 'drums' ? 'kit' : 'instrumento'}</b><small>${presetName(t.bank, t.prog)}</small></span></button>
    <button class="opt" data-a="play"><span class="ci" style="background:#2a2d38">${icon('keys')}</span><span><b>Tocar en esta pista</b><small>Abrir ${t.type === 'drums' ? 'pads' : 'teclado'}</small></span></button>
    <button class="opt" data-a="clear"><span class="ci" style="background:#2a2d38">${icon('close')}</span><span><b>Borrar notas</b><small>${t.notes.length} notas</small></span></button>
    <button class="opt danger" data-a="del"><span class="ci" style="background:#3a1d22">${icon('trash')}</span><span><b>Eliminar pista</b></span></button><div style="height:12px"></div>`, b => {
    b.querySelectorAll('.opt').forEach(o => o.onclick = () => {
      const a = o.dataset.a; closeSheet();
      if (a === 'inst') setTimeout(() => openBrowser(t), 250);
      if (a === 'play') { selId = t.id; show('v-play'); }
      if (a === 'clear') { t.notes = []; save(); renderTracks(); }
      if (a === 'del') { proj.tracks = proj.tracks.filter(x => x !== t); if (selId === t.id) selId = proj.tracks[0]?.id; save(); renderTracks(); }
    });
  });
}
$('#addTrackBtn').onclick = () => openSheet(`<div class="sh-h"><h3>Nueva pista</h3></div>
  <button class="opt" data-k="inst"><span class="ci" style="background:linear-gradient(135deg,#7b5cff,#36a3ff)">${icon('keys')}</span><span><b>Instrumento</b><small>128 instrumentos con teclado</small></span></button>
  <button class="opt" data-k="drums"><span class="ci" style="background:linear-gradient(135deg,#ff7a3d,#ff3d71)">${icon('drum')}</span><span><b>Batería</b><small>Pads de ritmo · 8 kits</small></span></button>
  <button class="opt" data-k="voz"><span class="ci" style="background:var(--grad)">${icon('mic')}</span><span><b>Voz a instrumento</b><small>Tararea y conviértelo en notas</small></span></button><div style="height:12px"></div>`, b => {
  b.querySelectorAll('.opt').forEach(o => o.onclick = () => {
    closeSheet(); const k = o.dataset.k;
    if (k === 'voz') return show('v-voz');
    const t = newTrack(k); renderTracks(); setTimeout(() => openBrowser(t), 260);
  });
});
$('#vozFab').onclick = () => show('v-voz');

/* ================= Hoja inferior / navegador de instrumentos ================= */
function openSheet(html, init) { $('#sheetBody').innerHTML = html; $('#scrim').hidden = false; requestAnimationFrame(() => $('#sheet').classList.add('open')); init && init($('#sheetBody')); }
function closeSheet() { $('#sheet').classList.remove('open'); $('#scrim').hidden = true; }
$('#scrim').onclick = closeSheet;
let sy0 = null; $('#sheet').addEventListener('touchstart', e => { if (e.target.closest('.grab,.sh-h')) sy0 = e.touches[0].clientY; }, { passive: true });
$('#sheet').addEventListener('touchend', e => { if (sy0 != null && e.changedTouches[0].clientY - sy0 > 60) closeSheet(); sy0 = null; });
// target: pista existente o {voz:true}
function openBrowser(target) {
  const drums = target.type === 'drums'; let cat = drums ? -1 : (target.prog >> 3), q = '';
  openSheet(`<div class="sh-h"><h3>${drums ? 'Kits de batería' : 'Instrumentos'}</h3><button class="ib sm" id="shX">${icon('close')}</button></div>
    ${drums ? '' : `<div class="search">${icon('search')}<input id="shQ" placeholder="Buscar entre 128 instrumentos"></div><div class="cats" id="shCats"></div>`}<div class="cards" id="shCards"></div>`, b => {
    b.querySelector('#shX').onclick = closeSheet;
    const cats = b.querySelector('#shCats'), cards = b.querySelector('#shCards');
    const drawCards = () => {
      cards.innerHTML = '';
      const list = sf.index.filter(p => p.bank === (drums ? 128 : 0) && (drums || q ? true : (p.program >> 3) === cat) && (!q || p.name.toLowerCase().includes(q) || FAM[p.program >> 3][0].toLowerCase().includes(q))).sort((a, b) => a.program - b.program);
      for (const p of list) {
        const f = drums ? 14 : p.program >> 3, on = p.program === target.prog;
        const c = h('button', 'card' + (on ? ' on' : ''), `<span class="ci" style="background:linear-gradient(135deg,${FAMCOL[f]},${FAMCOL[(f + 3) % 16]})">${icon(drums ? 'drum' : FAM[f][1])}</span><span class="ct"><b>${p.name}</b><small>${drums ? 'Kit' : FAM[f][0]} · ${p.program + 1}</small></span>`);
        c.onclick = () => {
          target.prog = p.program;
          if (target.id) { target.name = drums ? 'Batería · ' + p.name : (target.voice ? 'Voz → ' : '') + p.name; save(); renderTracks(); }
          else { localStorage.setItem('vozProg', p.program); syncVoz(); }
          cards.querySelectorAll('.card').forEach(x => x.classList.toggle('on', x === c));
          const bk = drums ? 128 : 0; c.classList.add('ld'); sf.load(bk, p.program).then(() => { c.classList.remove('ld'); const v = synth.noteOn(bk, p.program, drums ? 38 : 60, 100); setTimeout(() => synth.noteOff(v), 450); }, err => { c.classList.remove('ld'); showErr(err); });
        };
        cards.append(c);
      }
      if (!list.length) cards.innerHTML = '<div class="empty" style="grid-column:1/3">Sin resultados</div>';
    };
    if (cats) {
      FAM.forEach(([n], i) => { const c = h('button', 'cat' + (i === cat ? ' on' : ''), n); c.onclick = () => { cat = i; q = ''; b.querySelector('#shQ').value = ''; cats.querySelectorAll('.cat').forEach(x => x.classList.toggle('on', x === c)); drawCards(); }; cats.append(c); });
      b.querySelector('#shQ').oninput = e => { q = e.target.value.toLowerCase().trim(); drawCards(); };
      setTimeout(() => cats.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' }), 50);
    }
    drawCards();
  });
}

/* ================= Tocar: teclado, pads, piano roll ================= */
const NOTE = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
let oct = 3, WK = 52;
function buildPiano() {
  const pn = $('#piano'), keys = h('div', 'keys'); let x = 0;
  WK = Math.max(44, Math.floor(pn.clientWidth / 10) || 52);
  for (let m = 24; m <= 108; m++) {
    const black = [1, 3, 6, 8, 10].includes(m % 12), k = h('div', black ? 'bk' : 'wk'); k.dataset.m = m;
    if (black) { k.style.left = (x - WK * .3) + 'px'; k.style.width = WK * .6 + 'px'; }
    else { k.style.left = x + 'px'; k.style.width = WK + 'px'; if (m % 12 === 0) k.textContent = 'Do' + (m / 12 - 1); x += WK; }
    keys.append(k);
  }
  keys.style.width = x + 'px'; pn.innerHTML = ''; pn.append(keys);
  const held = {};
  const down = (e, k) => { if (held[e.pointerId]) up(e); k.classList.add('down'); held[e.pointerId] = { k, o: liveOn(+k.dataset.m, 100) }; };
  const up = e => { const o = held[e.pointerId]; if (!o) return; o.k.classList.remove('down'); liveOff(o.o); delete held[e.pointerId]; };
  keys.addEventListener('pointerdown', e => { const k = e.target.closest('.wk,.bk'); if (!k) return; e.preventDefault(); keys.releasePointerCapture?.(e.pointerId); down(e, k); });
  keys.addEventListener('pointermove', e => { const o = held[e.pointerId]; if (!o) return; const k = document.elementFromPoint(e.clientX, e.clientY)?.closest('.wk,.bk'); if (k && k !== o.k) down(e, k); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => keys.addEventListener(t, up));
  setOct(oct);
}
function setOct(o) { oct = Math.max(1, Math.min(6, o)); $('#piano .keys').style.transform = `translateX(${-(oct - 1) * 7 * WK}px)`; $('#octLbl').textContent = `Do${oct} – Do${oct + Math.round(($('#piano').clientWidth / WK) / 7)}`; drawProll(); }
$('#octDown').onclick = () => setOct(oct - 1); $('#octUp').onclick = () => setOct(oct + 1);
const PADS = [['Crash', 49, '#36a3ff'], ['Ride', 51, '#5c7bff'], ['Charles abierto', 46, '#2ec4a5'], ['Charles cerrado', 42, '#2ee59d'], ['Tom agudo', 50, '#e05cff'], ['Tom medio', 47, '#c45cff'], ['Tom grave', 45, '#9b5cff'], ['Pandereta', 54, '#ffcf3d'], ['Bombo', 36, '#ff3d71'], ['Caja', 38, '#ff7a3d'], ['Palmas', 39, '#ffb020'], ['Cencerro', 56, '#8a8fa0']];
function buildPads() {
  const box = $('#pads'); box.innerHTML = '';
  for (const [n, m, c] of PADS) {
    const d = h('div', 'pad', n); d.style.setProperty('--c', c);
    d.onpointerdown = e => { e.preventDefault(); d.classList.add('down'); const o = liveOn(m, 115); setTimeout(() => { d.classList.remove('down'); liveOff(o); }, 140); };
    box.append(d);
  }
}
function syncPlayView() {
  const t = sel(); const chip = $('#curTrackBtn');
  if (!t) { chip.querySelector('.nm').textContent = 'Sin pistas — añade una'; return; }
  chip.querySelector('.sw').style.background = t.color; chip.querySelector('.nm').textContent = t.name;
  $('#instBtn').textContent = t.type === 'drums' ? 'Kit' : 'Instrumento';
  $('#keysPanel').hidden = t.type === 'drums'; $('#padsPanel').hidden = t.type !== 'drums';
  drawProll();
}
$('#curTrackBtn').onclick = () => {
  if (!proj.tracks.length) return $('#addTrackBtn').click();
  openSheet(`<div class="sh-h"><h3>Elegir pista</h3></div>` + proj.tracks.map(t => `<button class="opt" data-id="${t.id}"><span class="ci" style="background:${t.color}">${icon(trackIcon(t))}</span><span><b>${t.name}</b><small>${t.notes.length} notas</small></span></button>`).join('') + '<div style="height:12px"></div>', b => {
    b.querySelectorAll('.opt').forEach(o => o.onclick = () => { selId = +o.dataset.id; closeSheet(); renderTracks(); });
  });
};
$('#instBtn').onclick = () => sel() ? openBrowser(sel()) : $('#addTrackBtn').click();
function drawProll() {
  const c = $('#proll'), t = sel(); if (!c.clientWidth) return;
  const dpr = DPR(), W = c.clientWidth, H = c.clientHeight; c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const drums = t && t.type === 'drums';
  const lo = drums ? 35 : oct * 12 + 12, hi = drums ? 59 : lo + 24, rows = hi - lo + 1, rh = H / rows;
  for (let m = lo; m <= hi; m++) { const y = (hi - m) * rh; g.fillStyle = [1, 3, 6, 8, 10].includes(m % 12) ? '#0d0e12' : '#121419'; g.fillRect(0, y, W, rh); if (m % 12 === 0 && !drums) { g.fillStyle = '#3a3d48'; g.font = '9px -apple-system'; g.fillText('Do' + (m / 12 - 1), 3, y + rh - 2); } }
  const p = curPos(), view = 6, left = Math.max(0, p - view * .3), sx = W / view;
  for (let b = Math.ceil(left / beatSec()); b * beatSec() < left + view; b++) { g.fillStyle = b % 4 ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.14)'; g.fillRect((b * beatSec() - left) * sx, 0, 1, H); }
  if (t) {
    const all = t.notes.concat(T.rec && T.recNotes ? T.recNotes : []);
    for (const n of all) {
      if (n.start + n.dur < left || n.start > left + view) continue;
      const m = Math.max(lo, Math.min(hi, n.midi)), x = (n.start - left) * sx, w = Math.max(3, n.dur * sx), y = (hi - m) * rh;
      g.fillStyle = t.color; g.beginPath(); g.roundRect ? g.roundRect(x, y + .5, w, Math.max(2, rh - 1), 2) : g.rect(x, y, w, rh); g.fill();
    }
  }
  g.fillStyle = T.rec ? '#ff4747' : '#fff'; g.fillRect((p - left) * sx, 0, 2, H);
  if (t && !t.notes.length && !T.playing) { g.fillStyle = '#646a78'; g.font = '13px -apple-system'; g.textAlign = 'center'; g.fillText('Pulsa ● para grabar lo que toques', W / 2, H / 2); g.textAlign = 'left'; }
}

/* ================= Voz a instrumento ================= */
let mic = null, vozBuf = [], vozNotes = [], analyser = null, vozT0 = 0;
const vozProg = () => +(localStorage.getItem('vozProg') || 0);
function syncVoz() { const p = vozProg(); sf.load(0, p).catch(() => {}); $('#vozInst .nm').textContent = presetName(0, p); $('#vozInst .ico').innerHTML = icon(FAM[p >> 3][1]); }
$('#vozInst').onclick = () => openBrowser({ type: 'inst', prog: vozProg() });
async function startVoz() {
  if (!navigator.mediaDevices?.getUserMedia) return toast('Este navegador no permite usar el micrófono (requiere https)');
  try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } }); }
  catch (e) { $('#vozStatus').textContent = 'Permiso de micrófono denegado. Actívalo en los ajustes del navegador o del sistema.'; return toast('Necesito permiso para el micrófono'); }
  unlock(); await ctx.resume(); stop();
  const src = ctx.createMediaStreamSource(mic); analyser = ctx.createAnalyser(); analyser.fftSize = 2048; src.connect(analyser);
  const z = ctx.createGain(); z.gain.value = 0; z.connect(ctx.destination);
  vozBuf = []; let total = 0; const onChunk = d => { vozBuf.push(d); total += d.length; if (total > ctx.sampleRate * 20) stopVoz(); };
  let node;
  try { if (!ctx.audioWorklet) throw 0; if (!startVoz.mod) { await ctx.audioWorklet.addModule('rec-worklet.js'); startVoz.mod = true; } node = new AudioWorkletNode(ctx, 'rec-proc'); node.port.onmessage = e => onChunk(e.data); }
  catch (e) { node = ctx.createScriptProcessor(4096, 1, 1); node.onaudioprocess = e => onChunk(new Float32Array(e.inputBuffer.getChannelData(0))); }
  src.connect(node); node.connect(z); mic._n = [src, node, z, analyser];
  vozT0 = performance.now(); $('#micBtn').classList.add('on'); $('#micBtn').innerHTML = '<span class="ring"></span>' + icon('stop');
  $('#vozStatus').textContent = 'Escuchando… pulsa de nuevo para terminar'; $('#vozResult').hidden = true; drawWave();
}
function stopVoz() {
  if (!mic) return;
  mic.getTracks().forEach(t => t.stop()); mic._n.forEach(n => { try { n.disconnect(); } catch (e) {} }); mic = null;
  $('#micBtn').classList.remove('on'); $('#micBtn').innerHTML = '<span class="ring"></span>' + icon('mic');
  $('#vozStatus').textContent = 'Analizando tu melodía…';
  setTimeout(() => {
    const n = vozBuf.reduce((a, b) => a + b.length, 0), all = new Float32Array(n); let o = 0; for (const b of vozBuf) { all.set(b, o); o += b.length; }
    const raw = Pitch.audioToNotes(all, ctx.sampleRate, { hop: 512 }), off = raw.length ? raw[0].start : 0;
    const q = $('#vozQuant').checked, grid = beatSec() / 4;
    vozNotes = raw.map(r => { let s = r.start - off, d = r.dur; if (q) { s = Math.round(s / grid) * grid; d = Math.max(grid, Math.round(d / grid) * grid); } return { midi: r.midi, start: +s.toFixed(3), dur: +d.toFixed(3), vel: 100 }; });
    $('#vozStatus').textContent = vozNotes.length ? `¡Listo! Detecté ${vozNotes.length} notas.` : 'No detecté notas. Acércate al micrófono y tararea claro ("tu-tu-tu").';
    $('#vozResult').hidden = !vozNotes.length;
    $('#vozNotes').innerHTML = vozNotes.map(x => `<span>${Pitch.midiName(x.midi)}</span>`).join('');
    drawVozRoll();
  }, 40);
}
function drawWave() {
  const c = $('#wave'), dpr = DPR(), W = c.clientWidth, H = c.clientHeight; c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const grd = g.createLinearGradient(0, 0, W, 0); grd.addColorStop(0, '#ff3d71'); grd.addColorStop(1, '#7b5cff');
  if (mic && analyser) {
    const d = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(d);
    let rms = 0; for (const v of d) rms += v * v; rms = Math.sqrt(rms / d.length);
    drawWave.hist = (drawWave.hist || []).concat(Math.min(1, rms * 5)).slice(-Math.floor(W / 4));
    $('#vozTimer').textContent = fmtTime((performance.now() - vozT0) / 1000).replace(/\.\d$/, '');
  }
  const hs = drawWave.hist || []; g.fillStyle = grd;
  for (let i = 0; i < Math.floor(W / 4); i++) { const v = hs[hs.length - Math.floor(W / 4) + i] || 0, bh = Math.max(2, v * (H - 16)); g.globalAlpha = hs.length ? 1 : .3; g.fillRect(i * 4, (H - bh) / 2, 2.5, bh); }
  if (mic) requestAnimationFrame(drawWave); else drawWave.hist = hs;
}
function drawVozRoll() {
  const c = $('#vozRoll'), dpr = DPR(), W = c.clientWidth, H = c.clientHeight; c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr); if (!vozNotes.length) return;
  const end = Math.max(...vozNotes.map(n => n.start + n.dur)), lo = Math.min(...vozNotes.map(n => n.midi)) - 2, hi = Math.max(...vozNotes.map(n => n.midi)) + 2, rh = H / (hi - lo + 1);
  const grd = g.createLinearGradient(0, 0, W, 0); grd.addColorStop(0, '#ff3d71'); grd.addColorStop(1, '#7b5cff'); g.fillStyle = grd;
  for (const n of vozNotes) { g.beginPath(); g.roundRect ? g.roundRect(6 + n.start / end * (W - 12), (hi - n.midi) * rh, Math.max(4, n.dur / end * (W - 12) - 2), rh - 1, 3) : g.rect(n.start / end * W, (hi - n.midi) * rh, n.dur / end * W, rh); g.fill(); }
}
$('#micBtn').onclick = () => mic ? stopVoz() : startVoz();
let vozPlaying = [];
$('#vozPlay').onclick = () => {
  vozPlaying.forEach(v => synth.noteOff(v)); vozPlaying = [];
  const t0 = ctx.currentTime + .05; for (const n of vozNotes) { const v = synth.noteOn(0, vozProg(), n.midi, 100, t0 + n.start); synth.noteOff(v, t0 + n.start + n.dur); vozPlaying.push(v); }
};
$('#vozAdd').onclick = () => {
  const t = newTrack('inst', vozProg(), true);
  const at = Math.round(T.pos / barSec()) * barSec();
  t.notes = vozNotes.map(n => ({ ...n, start: +(n.start + at).toFixed(3) })); save(); renderTracks(); show('v-studio'); toast('Pista de voz añadida');
};

/* ================= Navegación ================= */
function show(id) {
  $$('.view').forEach(s => s.classList.toggle('active', s.id === id));
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === id));
  if (id === 'v-play') { syncPlayView(); if (!$('#piano .keys') || !buildPiano.w || buildPiano.w !== $('#piano').clientWidth) { buildPiano(); buildPiano.w = $('#piano').clientWidth; } drawProll(); }
  if (id === 'v-voz') drawWave();
  if (id === 'v-studio') drawAll();
}
$$('#nav button').forEach(b => b.onclick = () => show(b.dataset.v));

/* ================= Tutorial (coach marks) ================= */
const STEPS = [
  ['#top', 'v-studio', '¡Bienvenido a Beatasy!', 'Tu estudio de música en el bolsillo. Te mostramos cada sección en unos segundos. Puedes volver a ver esta guía con el botón ? de arriba.'],
  ['#transport', 'v-studio', 'Barra de transporte', 'Reproduce ▶, detén y graba ● tu canción. Toca BPM para cambiar el tempo; activa el metrónomo y el bucle con los iconos de la derecha.'],
  ['#arr', 'v-studio', 'Pistas', 'Cada fila es una pista con su instrumento. M silencia, S la deja sola y el deslizador ajusta el volumen. Toca ⋯ para cambiar el instrumento o borrarla. Todas suenan juntas.'],
  ['#addTrackBtn', 'v-studio', 'Añadir pista', 'Crea pistas de instrumento (128 sonidos), batería o voz. Elige el sonido en el navegador de instrumentos por categorías.'],
  ['#nav [data-v="v-play"]', 'v-studio', 'Tocar', 'Toca el teclado o los pads de batería de la pista seleccionada. Usa las flechas para cambiar de octava. Pulsa ● para grabar mientras suenan las demás pistas.'],
  ['#nav [data-v="v-voz"]', 'v-studio', 'Voz a instrumento', 'Tararea una melodía y Beatasy la convierte en notas tocadas por el instrumento que elijas. La primera vez te pedirá permiso para usar el micrófono.'],
  ['#nav [data-v="v-fx"]', 'v-studio', 'Efectos', 'Reverberación, eco, chorus, distorsión y ecualizador. Enciéndelos y gira las perillas arrastrando arriba o abajo.'],
];
let step = 0;
function openCoach() { closeSheet(); step = 0; $('#coach').hidden = false; goStep(0); }
function goStep(i) {
  step = Math.max(0, Math.min(STEPS.length - 1, i)); const [selr, view, t, p] = STEPS[step];
  show(view); const r = $(selr).getBoundingClientRect(), pad = 6, sp = $('#spot');
  Object.assign(sp.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: Math.min(r.height, innerHeight * .5) + pad * 2 + 'px' });
  $('#tipStep').textContent = `Paso ${step + 1} de ${STEPS.length}`; $('#tipT').textContent = t; $('#tipP').textContent = p;
  $('#tipNext').textContent = step === STEPS.length - 1 ? '¡Empezar!' : 'Siguiente'; $('#tipPrev').style.visibility = step ? 'visible' : 'hidden';
  const tip = $('#tip'), th = tip.offsetHeight || 190, below = r.top + Math.min(r.height, innerHeight * .5) + 18;
  tip.style.top = (below + th < innerHeight - 10 ? below : Math.max(10, r.top - th - 18)) + 'px';
}
function closeCoach() { $('#coach').hidden = true; localStorage.setItem('tour2', '1'); }
$('#tipNext').onclick = () => step === STEPS.length - 1 ? closeCoach() : goStep(step + 1);
$('#tipPrev').onclick = () => goStep(step - 1); $('#tipSkip').onclick = closeCoach; $('#helpBtn').onclick = openCoach;
let cx0 = null; $('#coach').addEventListener('touchstart', e => cx0 = e.touches[0].clientX, { passive: true });
$('#coach').addEventListener('touchend', e => { if (cx0 == null) return; const dx = e.changedTouches[0].clientX - cx0; if (Math.abs(dx) > 50) goStep(step + (dx < 0 ? 1 : -1)); cx0 = null; });
addEventListener('resize', () => { if (!$('#coach').hidden) goStep(step); });

/* ================= Arranque ================= */
function status(msg) { const el = $('#netStatus'); el.textContent = msg; el.hidden = !msg; }
function showErr(e) { const m = (e && e.message) || String(e); status(''); toast('Error: ' + m); console.error(e); }
window.addEventListener('unhandledrejection', ev => showErr(ev.reason));
// actualizar service worker sin quedarse con versiones viejas
if ('serviceWorker' in navigator && location.protocol === 'https:' && !location.hostname.endsWith('.local')) {
  navigator.serviceWorker.register('sw.js').then(reg => reg.update && reg.update()).catch(() => {});
  let reloaded = false; navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded && !T.playing && !mic) { reloaded = true; } });
}
function boot() {
  const L = $('#loading'), msg = $('#ldMsg'), pctEl = $('#ldPct'), bar = $('#loading .bar i');
  $('#ldRetry').hidden = true; msg.textContent = 'Cargando instrumentos…'; pctEl.textContent = '0%'; bar.style.width = '0%'; bar.classList.remove('err');
  sf = new ChunkBank('sf/');
  fetchBin('sf/index.json', null, 20000).then(ab => {
    sf.index = JSON.parse(new TextDecoder().decode(new Uint8Array(ab)));
    synth = new Synth(ctx, sf, input);
    if (!proj) {
      proj = { bpm: 100, metro: false, loop: false, tracks: [] };
      const old = JSON.parse(localStorage.getItem('track') || '[]');
      newTrack('inst', +(localStorage.getItem('prog') || 0));
      if (old.length) proj.tracks[0].notes = old.filter(n => n.bank !== 128).map(({ midi, start, dur, vel }) => ({ midi, start, dur, vel }));
      newTrack('drums', 0);
    }
    selId = proj.tracks[0] && proj.tracks[0].id;
    // sonidos iniciales: los de las pistas (piano + batería por defecto)
    const first = [...new Set(proj.tracks.map(t => sf.entry(t.bank, t.prog).file))].map(f => sf.index.find(e => e.file === f));
    const total = first.reduce((a, e) => a + e.size, 0) || 1, got = {};
    sf.onprogress = (e, g) => { got[e.file] = g; const p = Math.min(100, Math.round(Object.values(got).reduce((a, b) => a + b, 0) / total * 100)); pctEl.textContent = p + '%'; bar.style.width = p + '%'; status(L.isConnected ? '' : 'Cargando sonido ' + e.name + '…'); };
    return Promise.all(first.map(e => sf.load(e.bank, e.program))).catch(err => { throw err; });
  }).then(() => {
    sf.onprogress = (e, g, size) => status(g >= size ? '' : `Cargando ${e.name} ${Math.round(g / size * 100)}%`);
    try { buildRack(); buildPads(); syncTransport(); syncVoz(); renderTracks(); raf(); }
    catch (e) { return fail(e); }
    L.style.opacity = 0; setTimeout(() => L.remove(), 400);
    if (!localStorage.getItem('tour2')) setTimeout(openCoach, 300);
  }).catch(fail);
  function fail(e) { msg.textContent = 'No se pudieron cargar los sonidos: ' + ((e && e.message) || e) + '. Revisa tu conexión.'; $('#ldRetry').hidden = false; bar.classList.add('err'); }
}
$('#ldRetry').onclick = boot;
boot();
