// Detección de tono (YIN) y conversión a notas. Usable en navegador y Node.
(function (root) {
  function yin(buf, sr, thr) {
    thr = thr || 0.15;
    const half = buf.length >> 1, d = new Float32Array(half);
    for (let t = 1; t < half; t++) {
      let s = 0;
      for (let i = 0; i < half; i++) { const x = buf[i] - buf[i + t]; s += x * x; }
      d[t] = s;
    }
    d[0] = 1; let run = 0;
    for (let t = 1; t < half; t++) { run += d[t]; d[t] = run ? d[t] * t / run : 1; }
    const minT = Math.floor(sr / 1500), maxT = Math.min(half - 1, Math.floor(sr / 60));
    let tau = -1;
    for (let t = minT; t < maxT; t++) {
      if (d[t] < thr) { while (t + 1 < maxT && d[t + 1] < d[t]) t++; tau = t; break; }
    }
    if (tau < 0) return { freq: 0, prob: 0 };
    const a = d[tau - 1], b = d[tau], c = d[tau + 1];
    const den = a + c - 2 * b;
    const better = den ? tau + (a - c) / (2 * den) : tau;
    return { freq: sr / better, prob: 1 - b };
  }
  function freqToMidi(f) { return 69 + 12 * Math.log2(f / 440); }
  const NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
  function midiName(m) { return NAMES[m % 12] + (Math.floor(m / 12) - 1); }
  // Convierte audio mono en lista de notas {midi, start, dur} (segundos)
  function audioToNotes(samples, sr, opt) {
    opt = opt || {};
    const win = opt.win || 2048, hop = opt.hop || 512, minDur = opt.minDur || 0.09;
    let peak = 0; for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    const gate = Math.max(0.01, peak * 0.08);
    const frames = [];
    for (let p = 0; p + win <= samples.length; p += hop) {
      const fr = samples.subarray(p, p + win);
      let e = 0; for (let i = 0; i < win; i++) e += fr[i] * fr[i];
      const rms = Math.sqrt(e / win);
      let m = null;
      if (rms > gate) { const r = yin(fr, sr); if (r.freq > 0) m = freqToMidi(r.freq); }
      frames.push({ t: p / sr, m: m, rms: rms });
    }
    // filtro de mediana (5) sobre valores con voz
    const sm = frames.map((f, i) => {
      if (f.m === null) return null;
      const w = []; for (let k = -2; k <= 2; k++) { const g = frames[i + k]; if (g && g.m !== null) w.push(g.m); }
      w.sort((a, b) => a - b); return Math.round(w[w.length >> 1]);
    });
    const notes = []; let cur = null; const hopT = hop / sr;
    for (let i = 0; i < sm.length; i++) {
      const m = sm[i];
      const onset = cur && m !== null && frames[i].rms > frames[i - 1].rms * 1.8 && frames[i - 1].rms < gate * 2.5;
      if (cur && (m === null || Math.abs(m - cur.midi) >= 1 || onset)) {
        // tolerar un frame aislado distinto
        if (m !== null && sm[i + 1] === cur.midi && !onset) { cur.end = frames[i].t + hopT; continue; }
        notes.push(cur); cur = null;
      }
      if (!cur && m !== null) cur = { midi: m, start: frames[i].t, end: frames[i].t + hopT };
      else if (cur) cur.end = frames[i].t + hopT;
    }
    if (cur) notes.push(cur);
    const out = [];
    for (const n of notes) {
      const dur = n.end - n.start;
      if (dur < minDur) continue;
      const last = out[out.length - 1];
      if (last && last.midi === n.midi && n.start - (last.start + last.dur) < 0.03) { last.dur = n.start + dur - last.start; continue; }
      out.push({ midi: n.midi, start: +n.start.toFixed(3), dur: +dur.toFixed(3) });
    }
    return out;
  }
  const api = { yin, freqToMidi, midiName, audioToNotes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Pitch = api;
})(this);
