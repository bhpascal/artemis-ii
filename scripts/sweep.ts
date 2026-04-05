const MU_EARTH = 3.986004418e14, MU_MOON = 4.9048695e12, R_EARTH = 6.371e6, R_MOON = 1.7374e6
const D_MOON = 3.844e8, SOI_MOON = 6.6183e7, V_MOON = (2*Math.PI*D_MOON)/(27.322*86400), T_MOON = 27.322*86400, R_LEO = R_EARTH + 200e3
const vCirc = Math.sqrt(MU_EARTH / R_LEO)

function sma(mu: number,r: number,v: number){return 1/(2/r-(v*v)/mu)}
function ecc(a: number,rP: number){return 1-rP/a}
function apo(a: number,e: number){return a*(1+e)}
function peri(a: number,e: number){return a*(1-e)}
function rad(a: number,e: number,nu: number){return a*(1-e*e)/(1+e*Math.cos(nu))}
function state(a: number,e: number,mu: number,nu: number){const r=rad(a,e,nu),p=a*(1-e*e),h=Math.sqrt(mu*p);return{x:r*Math.cos(nu),y:r*Math.sin(nu),vx:-(mu/h)*Math.sin(nu),vy:(mu/h)*(e+Math.cos(nu))}}
function t2e(nu: number,e: number){return 2*Math.atan2(Math.sqrt(1-e)*Math.sin(nu/2),Math.sqrt(1+e)*Math.cos(nu/2))}
function t2m(nu: number,e: number){const E=t2e(nu,e);return E-e*Math.sin(E)}

function findSOI(a: number,e: number,om: number,mx: number,my: number){
  let bn=-1,be=1/0;for(let i=0;i<=500;i++){const nu=(i/500)*Math.PI,r=rad(a,e,nu);if(!isFinite(r)||r<=0)continue;const x=r*Math.cos(nu+om),y=r*Math.sin(nu+om),d=Math.sqrt((x-mx)**2+(y-my)**2),er=Math.abs(d-SOI_MOON);if(er<be){be=er;bn=nu}}
  if(bn<0||be>SOI_MOON*0.2)return null;let lo=Math.max(0,bn-Math.PI/250),hi=Math.min(Math.PI,bn+Math.PI/250);for(let i=0;i<50;i++){const m=(lo+hi)/2,r=rad(a,e,m),x=r*Math.cos(m+om),y=r*Math.sin(m+om),d=Math.sqrt((x-mx)**2+(y-my)**2);if(d<SOI_MOON)hi=m;else lo=m;if(Math.abs(d-SOI_MOON)<1000)break}
  const nu=(lo+hi)/2,M=t2m(nu,e),n=Math.sqrt(MU_EARTH/(a**3));return{nu,t:M/n}
}

function solve(dv: number,fAltKm: number): string | number {
  const v=vCirc+dv,a2=sma(MU_EARTH,R_LEO,v);if(a2<=0)return'esc';const e2=ecc(a2,R_LEO);if(e2>=1||apo(a2,e2)<D_MOON-SOI_MOON)return'nr'
  const mw=2*Math.PI/T_MOON;let ma=0,om=-Math.PI,sf=findSOI(a2,e2,om,D_MOON,0);if(!sf)return'ns'
  for(let i=0;i<5;i++){ma=sf.t*mw;om=ma-Math.PI;sf=findSOI(a2,e2,om,D_MOON*Math.cos(ma),D_MOON*Math.sin(ma));if(!sf)return'ns'}
  const pf=state(a2,e2,MU_EARTH,sf.nu),cO=Math.cos(om),sO=Math.sin(om)
  const ex=pf.x*cO-pf.y*sO,ey=pf.x*sO+pf.y*cO,evx=pf.vx*cO-pf.vy*sO,evy=pf.vx*sO+pf.vy*cO
  const mx=D_MOON*Math.cos(ma),my=D_MOON*Math.sin(ma),mvx=-V_MOON*Math.sin(ma),mvy=V_MOON*Math.cos(ma)
  const rvx=evx-mvx,rvy=evy-mvy,rx=ex-mx,ry=ey-my,vi=Math.sqrt(rvx**2+rvy**2)
  const rP=fAltKm*1000+R_MOON,ah=-MU_MOON/(vi**2),eh=1-rP/ah;if(eh<=1)return'bh'
  const ta=2*Math.asin(1/eh),L=rx*rvy-ry*rvx,ts=L>0?1:-1,aa=Math.atan2(rvy,rvx),ea=aa+ts*ta
  const xvx=vi*Math.cos(ea)+mvx,xvy=vi*Math.sin(ea)+mvy
  const pp=Math.abs(ah)*(eh**2-1);let cn=(pp/SOI_MOON-1)/eh;cn=Math.max(-1,Math.min(1,cn));const ns=Math.acos(cn)
  const eaA=Math.atan2(ry,rx),xpa=eaA+ts*2*ns,xxp=mx+SOI_MOON*Math.cos(xpa),xyp=my+SOI_MOON*Math.sin(xpa)
  const rr=Math.sqrt(xxp**2+xyp**2),vv=Math.sqrt(xvx**2+xvy**2),ar=sma(MU_EARTH,rr,vv)
  const rv=xxp*xvx+xyp*xvy,ex3=(1/MU_EARTH)*((vv**2-MU_EARTH/rr)*xxp-rv*xvx),ey3=(1/MU_EARTH)*((vv**2-MU_EARTH/rr)*xyp-rv*xvy),er=Math.sqrt(ex3**2+ey3**2)
  if(ar<=0||er>=1)return'esc';return(peri(ar,er)-R_EARTH)/1000
}

console.log('=== Fine sweep: flybyAlt=6500 km ===')
for(let dv=3100;dv<=3220;dv+=5){const r=solve(dv,6500);console.log(`dv=${dv}: ${typeof r==='string'?r:r.toFixed(0)+' km'}`)}

console.log('\n=== Fine sweep: dv=3175 ===')
for(let f=5000;f<=15000;f+=500){const r=solve(3175,f);console.log(`flyby=${f}: ${typeof r==='string'?r:r.toFixed(0)+' km'}`)}

console.log('\n=== Sweet spot hunt ===')
for(let dv=3170;dv<=3190;dv+=2){for(let f=8000;f<=13000;f+=500){const r=solve(dv,f);if(typeof r==='number'&&r>-500&&r<500)console.log(`dv=${dv}, flyby=${f}km: perigee=${r.toFixed(0)} km ${r>0&&r<200?' <<< HIT':''}`)}}
