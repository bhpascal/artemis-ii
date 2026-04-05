const MU_EARTH = 3.986004418e14, MU_MOON = 4.9048695e12, R_EARTH = 6.371e6, R_MOON = 1.7374e6
const D_MOON = 3.844e8, SOI_MOON = 6.6183e7, V_MOON = (2*Math.PI*D_MOON)/(27.322*86400), T_MOON = 27.322*86400, R_LEO = R_EARTH + 200e3
const vCirc = Math.sqrt(MU_EARTH / R_LEO)
function sma(mu:number,r:number,v:number){return 1/(2/r-(v*v)/mu)}
function ecc(a:number,rP:number){return 1-rP/a}
function apo(a:number,e:number){return a*(1+e)}
function peri(a:number,e:number){return a*(1-e)}
function rad(a:number,e:number,nu:number){return a*(1-e*e)/(1+e*Math.cos(nu))}
function stateAt(a:number,e:number,mu:number,nu:number){const r=rad(a,e,nu),p=a*(1-e*e),h=Math.sqrt(mu*p);return{x:r*Math.cos(nu),y:r*Math.sin(nu),vx:-(mu/h)*Math.sin(nu),vy:(mu/h)*(e+Math.cos(nu))}}
function t2e(nu:number,e:number){return 2*Math.atan2(Math.sqrt(1-e)*Math.sin(nu/2),Math.sqrt(1+e)*Math.cos(nu/2))}
function t2m(nu:number,e:number){const E=t2e(nu,e);return E-e*Math.sin(E)}
function findSOI(a:number,e:number,om:number,mx:number,my:number){let bn=-1,be=1/0;for(let i=0;i<=500;i++){const nu=(i/500)*Math.PI,r=rad(a,e,nu);if(!isFinite(r)||r<=0)continue;const x=r*Math.cos(nu+om),y=r*Math.sin(nu+om),d=Math.sqrt((x-mx)**2+(y-my)**2),er=Math.abs(d-SOI_MOON);if(er<be){be=er;bn=nu}}if(bn<0||be>SOI_MOON*0.2)return null;let lo=Math.max(0,bn-Math.PI/250),hi=Math.min(Math.PI,bn+Math.PI/250);for(let i=0;i<50;i++){const m=(lo+hi)/2,r=rad(a,e,m),x=r*Math.cos(m+om),y=r*Math.sin(m+om),d=Math.sqrt((x-mx)**2+(y-my)**2);if(d<SOI_MOON)hi=m;else lo=m;if(Math.abs(d-SOI_MOON)<1000)break}const nu=(lo+hi)/2,M=t2m(nu,e),n=Math.sqrt(MU_EARTH/(a**3));return{nu,t:M/n}}

const dv=3170, fAlt=11000, v=vCirc+dv
const a=sma(MU_EARTH,R_LEO,v), e=ecc(a,R_LEO), mw=2*Math.PI/T_MOON
let ma=0,om=-Math.PI,sf=findSOI(a,e,om,D_MOON,0)!
for(let i=0;i<8;i++){ma=sf.t*mw;om=ma-Math.PI;sf=findSOI(a,e,om,D_MOON*Math.cos(ma),D_MOON*Math.sin(ma))!}

const moonAngle=ma
const pf=stateAt(a,e,MU_EARTH,sf.nu),cO=Math.cos(om),sO=Math.sin(om)
const ex=pf.x*cO-pf.y*sO,ey=pf.x*sO+pf.y*cO
const evx=pf.vx*cO-pf.vy*sO,evy=pf.vx*sO+pf.vy*cO

const mx=D_MOON*Math.cos(ma),my=D_MOON*Math.sin(ma)
const mvx=-V_MOON*Math.sin(ma),mvy=V_MOON*Math.cos(ma)
const rvx=evx-mvx,rvy=evy-mvy,rx=ex-mx,ry=ey-my
const vi=Math.sqrt(rvx**2+rvy**2)
const L=rx*rvy-ry*rvx
const ts=L>0?1:-1

const rP=fAlt*1000+R_MOON,ah=-MU_MOON/(vi**2),eh=1-rP/ah
const ta=2*Math.asin(1/eh)
const aa=Math.atan2(rvy,rvx),ea=aa+ts*ta

const xvx=vi*Math.cos(ea)+mvx,xvy=vi*Math.sin(ea)+mvy
const pp=Math.abs(ah)*(eh**2-1);let cn=(pp/SOI_MOON-1)/eh;cn=Math.max(-1,Math.min(1,cn))
const ns=Math.acos(cn),eaA=Math.atan2(ry,rx),xpa=eaA+ts*2*ns
const xxp=mx+SOI_MOON*Math.cos(xpa),xyp=my+SOI_MOON*Math.sin(xpa)

// Rotate to co-rotating
const cosM=Math.cos(-moonAngle),sinM=Math.sin(-moonAngle)
function rot(x:number,y:number){return{x:x*cosM-y*sinM,y:x*sinM+y*cosM}}

const entryRot = rot(ex, ey)
const exitRot = rot(xxp, xyp)
const moonRot = rot(mx, my)
const exitVelRot = rot(xvx, xvy)

console.log('=== Co-rotating frame ===')
console.log(`Earth: (0, 0)`)
console.log(`Moon: (${(moonRot.x/1e6).toFixed(1)}, ${(moonRot.y/1e6).toFixed(1)})`)
console.log(`SOI entry: (${(entryRot.x/1e6).toFixed(1)}, ${(entryRot.y/1e6).toFixed(1)})`)
console.log(`SOI exit:  (${(exitRot.x/1e6).toFixed(1)}, ${(exitRot.y/1e6).toFixed(1)})`)
console.log(`Exit vel:  (${exitVelRot.x.toFixed(1)}, ${exitVelRot.y.toFixed(1)}) m/s`)
console.log()
console.log(`Entry y: ${(entryRot.y/1e6).toFixed(1)} Mm (${entryRot.y > 0 ? 'ABOVE' : 'BELOW'} E-M line)`)
console.log(`Exit y:  ${(exitRot.y/1e6).toFixed(1)} Mm (${exitRot.y > 0 ? 'ABOVE' : 'BELOW'} E-M line)`)
console.log(`Exit vy: ${exitVelRot.y.toFixed(1)} m/s (${exitVelRot.y > 0 ? 'heading UP' : 'heading DOWN'})`)
console.log()
console.log(`Figure-8 requires: entry and exit on OPPOSITE sides.`)
console.log(`Currently: entry ${entryRot.y > 0 ? 'above' : 'below'}, exit ${exitRot.y > 0 ? 'above' : 'below'}`)
console.log(`${Math.sign(entryRot.y) !== Math.sign(exitRot.y) ? 'FIGURE-8 ✓' : 'SAME SIDE ✗ — NOT A FIGURE-8'}`)
console.log()

// Debug the turn
console.log('=== Turn debug ===')
console.log(`L = ${L.toExponential(3)} → turnSign = ${ts} (${ts > 0 ? 'CCW' : 'CW'})`)
console.log(`Approach angle: ${(aa*180/Math.PI).toFixed(1)}°`)
console.log(`Turn angle: ${(ta*180/Math.PI).toFixed(1)}°`)
console.log(`Exit angle: ${(ea*180/Math.PI).toFixed(1)}°`)
console.log(`Entry pos angle: ${(eaA*180/Math.PI).toFixed(1)}°`)
console.log(`Exit pos angle: ${(xpa*180/Math.PI).toFixed(1)}°`)
console.log(`2*nuSOI: ${(2*ns*180/Math.PI).toFixed(1)}°`)
