// Floors from SnapMarker.tsx's header (fu 249). CVD: Machado 2009 severity 1, in linear RGB.
const hex = h => [1,3,5].map(i => parseInt(h.slice(i,i+2),16)/255);
const lin = c => c <= 0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4;
const gam = c => { c = Math.min(1, Math.max(0, c)); return c <= 0.0031308 ? 12.92*c : 1.055*c**(1/2.4)-0.055; };
const M = {
  deut: [[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]],
  prot: [[0.152286,1.052583,-0.204868],[0.114503,0.786281,0.099216],[-0.003882,-0.048116,1.051998]],
};
export const sim = (rgb, k) => { const l = rgb.map(lin); return M[k].map(r => gam(r[0]*l[0]+r[1]*l[1]+r[2]*l[2])); };
const lum = rgb => { const l = rgb.map(lin); return 0.2126*l[0]+0.7152*l[1]+0.0722*l[2]; };
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); };
export const lab = rgb => {
  const [r,g,b] = rgb.map(lin);
  let X = (0.4124564*r+0.3575761*g+0.1804375*b)/0.95047, Y = 0.2126729*r+0.7151522*g+0.0721750*b, Z = (0.0193339*r+0.1191920*g+0.9503041*b)/1.08883;
  const f = t => t > 216/24389 ? Math.cbrt(t) : (24389/27*t+16)/116;
  [X,Y,Z] = [X,Y,Z].map(f);
  return [116*Y-16, 500*(X-Y), 200*(Y-Z)];
};
export function de2000([L1,a1,b1],[L2,a2,b2]) {
  const rad = Math.PI/180, C1 = Math.hypot(a1,b1), C2 = Math.hypot(a2,b2), Cb = (C1+C2)/2;
  const G = 0.5*(1-Math.sqrt(Cb**7/(Cb**7+25**7)));
  const ap1 = a1*(1+G), ap2 = a2*(1+G), Cp1 = Math.hypot(ap1,b1), Cp2 = Math.hypot(ap2,b2);
  const h = (b,a) => { if (a===0&&b===0) return 0; let x = Math.atan2(b,a)/rad; return x<0?x+360:x; };
  const hp1 = h(b1,ap1), hp2 = h(b2,ap2);
  const dL = L2-L1, dC = Cp2-Cp1;
  let dh = 0; if (Cp1*Cp2 !== 0) { dh = hp2-hp1; if (dh>180) dh-=360; else if (dh<-180) dh+=360; }
  const dH = 2*Math.sqrt(Cp1*Cp2)*Math.sin(dh*rad/2);
  const Lb = (L1+L2)/2, Cpb = (Cp1+Cp2)/2;
  let hb = hp1+hp2; if (Cp1*Cp2 !== 0) { if (Math.abs(hp1-hp2)>180) hb = hp1+hp2<360 ? hb+360 : hb-360; hb/=2; }
  const T = 1-0.17*Math.cos((hb-30)*rad)+0.24*Math.cos(2*hb*rad)+0.32*Math.cos((3*hb+6)*rad)-0.20*Math.cos((4*hb-63)*rad);
  const dth = 30*Math.exp(-(((hb-275)/25)**2)), RC = 2*Math.sqrt(Cpb**7/(Cpb**7+25**7));
  const SL = 1+0.015*(Lb-50)**2/Math.sqrt(20+(Lb-50)**2), SC = 1+0.045*Cpb, SH = 1+0.015*Cpb*T, RT = -Math.sin(2*dth*rad)*RC;
  return Math.sqrt((dL/SL)**2+(dC/SC)**2+(dH/SH)**2+RT*(dC/SC)*(dH/SH));
}
export const de = (a, b, k) => k ? de2000(lab(sim(a,k)), lab(sim(b,k))) : de2000(lab(a), lab(b));
export { hex };
export const MAPLE = hex('#ebe3d4'), RING = hex('#f5f2ec'), OAK = hex('#c8955a');
