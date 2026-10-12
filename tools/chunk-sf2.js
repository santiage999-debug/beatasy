// Divide TimGM6mb.sf2 en un fragmento por preset: sf/<bank>_<prog>.bin
// Formato: uint32 LE longitud JSON | JSON {regions, shdr} | (padding a 2) | PCM int16
const fs = require('fs'), path = require('path');
const { SF2 } = require('../app/src/main/assets/www/sf2.js');
const src = process.argv[2], out = process.argv[3];
const b = fs.readFileSync(src), sf = new SF2(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const index = [];
for (const p of sf.presets) {
  const map = new Map(), shdr = [], parts = []; let off = 0;
  const regions = p.regions.map(r => {
    if (!map.has(r.sample)) {
      const s = sf.shdr[r.sample], a = s.start, e = Math.min(sf.smpl.length, s.end + 64);
      parts.push(sf.smpl.subarray(a, e));
      shdr.push({ start: off, end: off + (s.end - a), ls: off + (s.ls - a), le: off + (s.le - a), rate: s.rate, key: s.key, corr: s.corr });
      map.set(r.sample, shdr.length - 1); off += e - a;
    }
    return Object.assign({}, r, { sample: map.get(r.sample), so: Math.max(0, r.so) });
  });
  let js = Buffer.from(JSON.stringify({ regions, shdr })); if ((4 + js.length) % 2) js = Buffer.concat([js, Buffer.from(' ')]);
  const pcm = Buffer.alloc(off * 2); let o = 0; for (const q of parts) { Buffer.from(q.buffer, q.byteOffset, q.byteLength).copy(pcm, o * 2); o += q.length; }
  const hd = Buffer.alloc(4); hd.writeUInt32LE(js.length);
  const file = `${p.bank}_${p.program}.bin`; const all = Buffer.concat([hd, js, pcm]);
  fs.writeFileSync(path.join(out, file), all);
  index.push({ name: p.name, bank: p.bank, program: p.program, file, size: all.length });
}
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index));
console.log(index.length, 'presets; total MB', (index.reduce((a, x) => a + x.size, 0) / 1e6).toFixed(1), 'piano KB', index.find(x => x.bank == 0 && x.program == 0).size >> 10, 'drums KB', index.find(x => x.bank == 128 && x.program == 0).size >> 10);
