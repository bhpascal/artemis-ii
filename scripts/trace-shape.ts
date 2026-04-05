/**
 * Trace the trajectory shape to diagnose the figure-8 problem.
 * Outputs key points in both inertial and co-rotating frames.
 */
const MU_EARTH = 3.986004418e14, MU_MOON = 4.9048695e12, R_EARTH = 6.371e6, R_MOON = 1.7374e6
const D_MOON = 3.844e8, SOI_MOON = 6.6183e7, V_MOON = (2*Math.PI*D_MOON)/(27.322*86400), T_MOON = 27.322*86400, R_LEO = R_EARTH + 200e3
const vCirc = Math.sqrt(MU_EARTH / R_LEO)

function sma(mu: number,r: number,v: number){return 1/(2/r-(v*v)/mu)}
function ecc(a: number,rP: number){return 1-rP/a}
function apo(a: number,e: number){return a*(1+e)}
function rad(a: number,e: number,nu: number){return a*(1-e*e)/(1+e*Math.cos(nu))}
function state(a: number,e: number,mu: number,nu: number){const r=rad(a,e,nu),p=a*(1-e*e),h=Math.sqrt(mu*p);return{x:r*Math.cos(nu),y:r*Math.sin(nu),vx:-(mu/h)*Math.sin(nu),vy:(mu/h)*(e+Math.cos(nu))}}
function t2e(nu: number,e: number){return 2*Math.atan2(Math.sqrt(1-e)*Math.sin(nu/2),Math.sqrt(1+e)*Math.cos(nu/2))}
function t2m(nu: number,e: number){const E=t2e(nu,e);return E-e*Math.sin(E)}
function findSOI(a: number,e: number,om: number,mx: number,my: number){let bn=-1,be=1/0;for(let i=0;i<=500;i++){const nu=(i/500)*Math.PI,r=rad(a,e,nu);if(!isFinite(r)||r<=0)continue;const x=r*Math.cos(nu+om),y=r*Math.sin(nu+om),d=Math.sqrt((x-mx)**2+(y-my)**2),er=Math.abs(d-SOI_MOON);if(er<be){be=er;bn=nu}}if(bn<0||be>SOI_MOON*0.2)return null;let lo=Math.max(0,bn-Math.PI/250),hi=Math.min(Math.PI,bn+Math.PI/250);for(let i=0;i<50;i++){const m=(lo+hi)/2,r=rad(a,e,m),x=r*Math.cos(m+om),y=r*Math.sin(m+om),d=Math.sqrt((x-mx)**2+(y-my)**2);if(d<SOI_MOON)hi=m;else lo=m;if(Math.abs(d-SOI_MOON)<1000)break}const nu=(lo+hi)/2,M=t2m(nu,e),n=Math.sqrt(MU_EARTH/(a**3));return{nu,t:M/n}}

const dv = 3170, fAlt = 11000
const v = vCirc + dv
const a = sma(MU_EARTH, R_LEO, v), e = ecc(a, R_LEO)
const mw = 2 * Math.PI / T_MOON

let ma = 0, om = -Math.PI
let sf = findSOI(a, e, om, D_MOON, 0)!
for (let i = 0; i < 8; i++) { ma = sf.t * mw; om = ma - Math.PI; sf = findSOI(a, e, om, D_MOON * Math.cos(ma), D_MOON * Math.sin(ma))! }

const moonAngle = ma
console.log(`Moon angle: ${(moonAngle * 180 / Math.PI).toFixed(1)}°`)
console.log(`Omega: ${(om * 180 / Math.PI).toFixed(1)}°`)

// Sample departure points in INERTIAL frame
console.log('\n=== Departure (inertial) — first, mid, last ===')
const nuSOI = sf.nu
for (const frac of [0, 0.25, 0.5, 0.75, 1.0]) {
  const nu = frac * nuSOI
  const r = rad(a, e, nu)
  const x = r * Math.cos(nu + om)
  const y = r * Math.sin(nu + om)
  console.log(`  frac=${frac.toFixed(2)}: (${(x/1e6).toFixed(1)}, ${(y/1e6).toFixed(1)}) Mm`)
}

// Rotate to co-rotating
const cosM = Math.cos(-moonAngle), sinM = Math.sin(-moonAngle)
function rot(x: number, y: number) { return { x: x*cosM - y*sinM, y: x*sinM + y*cosM } }

console.log('\n=== Departure (co-rotating) — first, mid, last ===')
for (const frac of [0, 0.25, 0.5, 0.75, 1.0]) {
  const nu = frac * nuSOI
  const r = rad(a, e, nu)
  const ix = r * Math.cos(nu + om)
  const iy = r * Math.sin(nu + om)
  const { x, y } = rot(ix, iy)
  console.log(`  frac=${frac.toFixed(2)}: (${(x/1e6).toFixed(1)}, ${(y/1e6).toFixed(1)}) Mm`)
}

// Check where Earth and Moon are in co-rotating frame
const earthRot = rot(0, 0)
const moonRot = rot(D_MOON * Math.cos(ma), D_MOON * Math.sin(ma))
console.log(`\nEarth (co-rot): (${(earthRot.x/1e6).toFixed(1)}, ${(earthRot.y/1e6).toFixed(1)})`)
console.log(`Moon (co-rot): (${(moonRot.x/1e6).toFixed(1)}, ${(moonRot.y/1e6).toFixed(1)})`)

// Key question: does the departure go ABOVE or BELOW the E-M line?
// In co-rotating frame, E-M line is the x-axis (Earth at 0, Moon at D_MOON)
// The y-values of the departure should be positive (above) or negative (below)
console.log('\n=== Y-values of departure in co-rotating frame ===')
for (let i = 0; i <= 20; i++) {
  const nu = (i / 20) * nuSOI
  const r = rad(a, e, nu)
  const ix = r * Math.cos(nu + om)
  const iy = r * Math.sin(nu + om)
  const { x, y } = rot(ix, iy)
  console.log(`  ${i.toString().padStart(2)}: x=${(x/1e6).toFixed(0).padStart(5)} y=${(y/1e6).toFixed(0).padStart(5)}`)
}
