import { de, contrast, lab, MAPLE, RING, OAK, hex } from './cvd.mjs';
const pairM = (a,b) => Math.min(de(a,b)/25, de(a,b,'deut')/14, de(a,b,'prot')/14);
const single = c => Math.min(contrast(c,MAPLE)/3, contrast(c,RING)/3.4, de(c,OAK)/35);
const CMAX = +process.argv[2] || 60, LMIN = +process.argv[3] || 20, TOL = +process.argv[4] || 40;
// hue families (CIELAB hue angle) from the current set: kind, current hex
const KINDS = [['corner','#3a6028'],['edge-mid','#378988'],['face-center','#753c60'],['guide','#5469a6'],['line','#4a86b8'],['line-cross','#3a4a8c'],['line-face','#341c00'],['offset','#f00058']];
const hueOf = c => { const [,a,b]=lab(c); return (Math.atan2(b,a)*180/Math.PI+360)%360; };
const target = KINDS.map(([,h])=>hueOf(hex(h)));
const CMIN = +process.argv[5] || 25;
const pen = (c,i) => { const [L,a,b]=lab(c); const C=Math.hypot(a,b); let m=Infinity; const cmin = i===6 ? 12 : CMIN; if (C<cmin) m=Math.min(m,C/cmin);
  if (L<LMIN && i!==6) m=Math.min(m,L/LMIN); if (C>CMAX && i!==7) m=Math.min(m,CMAX/C);
  let d=Math.abs(hueOf(c)-target[i]); d=Math.min(d,360-d); if (d>TOL) m=Math.min(m,TOL/d); return m; };
const score = cs => { let m=Infinity; cs.forEach((c,i)=>{m=Math.min(m,single(c),pen(c,i));});
  for(let i=0;i<cs.length;i++)for(let j=i+1;j<cs.length;j++)m=Math.min(m,pairM(cs[i],cs[j])); return m; };
let gbest=[-1];
for (let run=0;run<16;run++){
  let cs=KINDS.map(([,h])=>hex(h)); let s=score(cs);
  for (let it=0;it<25000;it++){ const T=0.04*(1-it/25000);
    const n=cs.map(c=>c.slice()); const k=Math.floor(Math.random()*8);
    n[k]=n[k].map(v=>Math.min(1,Math.max(0,v+(Math.random()-0.5)*0.12)));
    const s2=score(n); if (s2>=s||Math.random()<Math.exp((s2-s)/T)) {cs=n;s=s2;} }
  if (s>gbest[0]) gbest=[s,cs];
}
const h=c=>'#'+c.map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('');
console.log('Cmax',CMAX,'Lmin',LMIN,'tol',TOL,'margin',gbest[0].toFixed(3));
console.log(JSON.stringify(Object.fromEntries(gbest[1].map((c,i)=>[KINDS[i][0],h(c)]))));
console.log(gbest[1].map((c,i)=>{const [L,a,b]=lab(c);return `${KINDS[i][0]} L${L.toFixed(0)} C${Math.hypot(a,b).toFixed(0)}`}).join(' '));
