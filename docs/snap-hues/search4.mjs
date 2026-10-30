import { hex, de, contrast, lab, MAPLE, RING, OAK } from './cvd.mjs';
const FIX = { corner:'#3a6028','edge-mid':'#378988','face-center':'#753c60',guide:'#5469a6' };
const fx = Object.values(FIX).map(hex);
const pairM = (a,b) => Math.min(de(a,b)/25, de(a,b,'deut')/14, de(a,b,'prot')/14);
const ok = []; const S = +process.argv[2] || 8;
for (let r=0;r<256;r+=S) for (let g=0;g<256;g+=S) for (let b=0;b<256;b+=S) {
  const c=[r/255,g/255,b/255];
  let m = Math.min(contrast(c,MAPLE)/3, contrast(c,RING)/3.4, de(c,OAK)/35);
  if (m<1) continue;
  for (const f of fx) { m=Math.min(m,pairM(c,f)); if (m<1) break; }
  if (m<1) continue;
  const [L,A,B]=lab(c);
  ok.push({h:'#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join(''),c,m,L,C:Math.hypot(A,B),hue:(Math.atan2(B,A)*180/Math.PI+360)%360});
}
console.log('singles', ok.length);
const n=ok.length; const adj=ok.map(()=>[]);
for (let i=0;i<n;i++) for (let j=i+1;j<n;j++){ const m=pairM(ok[i].c,ok[j].c); if(m>=1){adj[i].push(j);} }
// count 4-cliques greedily: for each node, look for clique of 4 maximizing min margin (bounded)
let best=null, found=0;
const nb = adj.map(a=>new Set(a));
for (let a=0;a<n;a++) for (const b of adj[a]) { const ab=adj[b].filter(x=>nb[a].has(x));
  for (const c of ab) for (const d of adj[c]) { if(!nb[a].has(d)||!nb[b].has(d)) continue; found++;
    const q=[a,b,c,d]; let m=Math.min(...q.map(i=>ok[i].m));
    for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)m=Math.min(m,pairM(ok[q[i]].c,ok[q[j]].c));
    if(!best||m>best[0])best=[m,q];
    if(found>2e6) break; } }
console.log('4-sets', found);
if (best) console.log(best[0].toFixed(3), best[1].map(i=>`${ok[i].h} L${ok[i].L.toFixed(0)} C${ok[i].C.toFixed(0)} h${ok[i].hue.toFixed(0)}`).join(' | '));
// families of singles
const fam={}; for (const o of ok){const k=Math.floor(o.hue/30)*30+(o.L<25?'d':'l'); (fam[k]??=[]).push(o);}
for (const [k,v] of Object.entries(fam)) { v.sort((a,b)=>b.m-a.m); console.log(k, v.length, v.slice(0,2).map(o=>`${o.h} m${o.m.toFixed(2)} L${o.L.toFixed(0)}`).join(' | ')); }
