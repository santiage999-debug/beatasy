// Lector mínimo de SoundFont 2 + reproductor con Web Audio
(function (root) {
  function SF2(ab) {
    const dv = new DataView(ab), u8 = new Uint8Array(ab);
    const str = (o, n) => { let s = ''; for (let i = 0; i < n; i++) { const c = u8[o + i]; if (!c) break; s += String.fromCharCode(c); } return s.trim(); };
    const chunks = {};
    function walk(o, end) {
      while (o + 8 <= end) {
        const id = str(o, 4), sz = dv.getUint32(o + 4, true);
        if (id === 'RIFF' || id === 'LIST') walk(o + 12, o + 8 + sz); else chunks[id] = { o: o + 8, sz };
        o += 8 + sz + (sz & 1);
      }
    }
    walk(0, ab.byteLength);
    const rec = (id, size, fn) => { const c = chunks[id], a = []; for (let o = c.o; o + size <= c.o + c.sz; o += size) a.push(fn(o)); return a; };
    this.smpl = new Int16Array(ab, chunks.smpl.o, chunks.smpl.sz >> 1);
    const phdr = rec('phdr', 38, o => ({ name: str(o, 20), preset: dv.getUint16(o + 20, true), bank: dv.getUint16(o + 22, true), bag: dv.getUint16(o + 24, true) }));
    const pbag = rec('pbag', 4, o => dv.getUint16(o, true));
    const gen = id => rec(id, 4, o => ({ op: dv.getUint16(o, true), s: dv.getInt16(o + 2, true), lo: u8[o + 2], hi: u8[o + 3] }));
    const pgen = gen('pgen'), igen = gen('igen');
    const inst = rec('inst', 22, o => ({ name: str(o, 20), bag: dv.getUint16(o + 20, true) }));
    const ibag = rec('ibag', 4, o => dv.getUint16(o, true));
    this.shdr = rec('shdr', 46, o => ({ name: str(o, 20), start: dv.getUint32(o + 20, true), end: dv.getUint32(o + 24, true), ls: dv.getUint32(o + 28, true), le: dv.getUint32(o + 32, true), rate: dv.getUint32(o + 36, true), key: u8[o + 40], corr: dv.getInt8(o + 41) }));
    const zones = (bags, gens, from, to) => {
      const z = [];
      for (let b = from; b < to; b++) {
        const g = {}; for (let k = bags[b]; k < bags[b + 1]; k++) { const x = gens[k]; g[x.op] = x; }
        z.push(g);
      }
      return z;
    };
    this.presets = [];
    for (let i = 0; i < phdr.length - 1; i++) {
      const p = phdr[i];
      const pz = zones(pbag, pgen, p.bag, phdr[i + 1].bag);
      const pglob = pz.length && pz[0][41] === undefined ? pz.shift() : {};
      const regions = [];
      for (const z of pz) {
        if (!z[41]) continue;
        const ii = z[41].s, I = inst[ii];
        const iz = zones(ibag, igen, I.bag, inst[ii + 1].bag);
        const iglob = iz.length && iz[0][53] === undefined ? iz.shift() : {};
        const pg = Object.assign({}, pglob, z);
        for (const q of iz) {
          if (!q[53]) continue;
          const g = Object.assign({}, iglob, q);
          const kr = g[43] ? [g[43].lo, g[43].hi] : [0, 127];
          const pkr = pg[43] ? [pg[43].lo, pg[43].hi] : [0, 127];
          const vr = g[44] ? [g[44].lo, g[44].hi] : [0, 127];
          const v = op => (g[op] ? g[op].s : 0) + (pg[op] ? pg[op].s : 0);
          regions.push({
            lo: Math.max(kr[0], pkr[0]), hi: Math.min(kr[1], pkr[1]), vlo: vr[0], vhi: vr[1],
            sample: g[53].s, root: g[58] ? g[58].s : -1, tune: v(51) * 100 + v(52),
            mode: g[54] ? g[54].s & 3 : 0, atten: v(48), pan: v(17),
            scale: g[56] ? g[56].s : 100,
            so: (g[0] ? g[0].s : 0) + (g[4] ? g[4].s * 32768 : 0), eo: (g[1] ? g[1].s : 0) + (g[12] ? g[12].s * 32768 : 0),
            lso: (g[2] ? g[2].s : 0) + (g[45] ? g[45].s * 32768 : 0), leo: (g[3] ? g[3].s : 0) + (g[50] ? g[50].s * 32768 : 0),
            release: g[38] ? g[38].s + (pg[38] ? pg[38].s : 0) : -3000 + (pg[38] ? pg[38].s : 0),
            attack: g[34] ? g[34].s : -12000,
          });
        }
      }
      this.presets.push({ name: p.name, bank: p.bank, program: p.preset, regions });
    }
  }

  function Synth(ctx, sf, out) {
    this.ctx = ctx; this.sf = sf; this.out = out; this.cache = {}; this.voices = {};
  }
  Synth.prototype.find = function (bank, prog) {
    return this.sf.presets.find(p => p.bank === bank && p.program === prog) || this.sf.presets.find(p => p.bank === bank) || this.sf.presets[0];
  };
  Synth.prototype.buffer = function (r) {
    const key = r.sample + ':' + r.so + ':' + r.eo;
    if (this.cache[key]) return this.cache[key];
    const s = this.sf.shdr[r.sample];
    const a = s.start + r.so, b = s.end + r.eo;
    const n = Math.max(1, b - a), buf = this.ctx.createBuffer(1, n, Math.max(8000, Math.min(96000, s.rate)));
    const d = buf.getChannelData(0), src = this.sf.smpl;
    for (let i = 0; i < n; i++) d[i] = src[a + i] / 32768;
    return (this.cache[key] = buf);
  };
  // noteOn: devuelve un id de voz; dest opcional
  Synth.prototype.noteOn = function (bank, prog, midi, vel, when, dest) {
    const ctx = this.ctx, t = when || ctx.currentTime;
    const p = this.find(bank, prog);
    const regs = p.regions.filter(r => midi >= r.lo && midi <= r.hi && vel >= r.vlo && vel <= r.vhi);
    const nodes = [];
    for (const r of regs) {
      const s = this.sf.shdr[r.sample];
      const src = ctx.createBufferSource();
      src.buffer = this.buffer(r);
      const root = r.root >= 0 ? r.root : s.key;
      const cents = (midi - root) * r.scale + r.tune - s.corr;
      src.playbackRate.value = Math.pow(2, cents / 1200);
      const looping = r.mode === 1 || r.mode === 3;
      if (looping) {
        const base = s.start + r.so;
        src.loop = true;
        src.loopStart = (s.ls + r.lso - base) / src.buffer.sampleRate;
        src.loopEnd = (s.le + r.leo - base) / src.buffer.sampleRate;
      }
      const g = ctx.createGain();
      const amp = Math.pow(10, -Math.max(0, r.atten) * 0.4 / 200) * Math.pow(vel / 127, 2) * 0.5;
      const att = Math.min(1, Math.max(0.002, Math.pow(2, r.attack / 1200)));
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + att);
      let last = g;
      if (ctx.createStereoPanner) { const pn = ctx.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, r.pan / 500)); g.connect(pn); last = pn; }
      src.connect(g); last.connect(dest || this.out);
      src.start(t);
      nodes.push({ src, g, amp, rel: Math.min(2.5, Math.max(0.03, Math.pow(2, r.release / 1200))), looping });
    }
    return nodes;
  };
  Synth.prototype.noteOff = function (nodes, when) {
    const t = when || this.ctx.currentTime;
    for (const n of nodes || []) {
      try {
        n.g.gain.cancelScheduledValues(t); n.g.gain.setValueAtTime(n.g.gain.value || n.amp, t);
        n.g.gain.exponentialRampToValueAtTime(0.0001, t + n.rel);
        n.src.stop(t + n.rel + 0.05);
      } catch (e) {}
    }
  };
  const api = { SF2, Synth };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else Object.assign(root, api);
})(this);
