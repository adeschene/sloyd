import { hex, de, contrast, MAPLE, RING, OAK } from './cvd.mjs';
const C = { corner:'#3a6028','edge-mid':'#378988','face-center':'#753c60',guide:'#5469a6',line:'#4a86b8','line-cross':'#3a4a8c','line-face':'#341c00',offset:'#f00058', ...JSON.parse(process.argv[2]||'{}') };
const f = n => n.toFixed(1);
for (const [k,v] of Object.entries(C)) {
  const c = hex(v); const bad = [];
  const m = contrast(c,MAPLE), r = contrast(c,RING), o = de(c,OAK);
  if (m<3) bad.push('maple'); if (r<3.4) bad.push('ring'); if (o<35) bad.push('oak');
  const rows = Object.entries(C).filter(([j])=>j!==k).map(([j,w])=>{ const d=[de(c,hex(w)),de(c,hex(w),'deut'),de(c,hex(w),'prot')];
    if (d[0]<25||d[1]<14||d[2]<14) bad.push(j); return `${j} ${d.map(f).join('/')}`; });
  console.log(`${k} ${v} maple ${m.toFixed(2)} ring ${r.toFixed(2)} oak ${f(o)} ${bad.length?'FAIL '+bad.join(','):'ok'}\n   ${rows.join('; ')}`);
}
