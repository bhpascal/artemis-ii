/**
 * Standalone numerical verification of the trajectory solver.
 * Run with: npx tsx scripts/test-solver.ts
 */

// Inline the constants and functions to avoid module resolution issues
const MU_EARTH = 3.986004418e14
const MU_MOON = 4.9048695e12
const R_EARTH = 6.371e6
const R_MOON = 1.7374e6
const D_MOON = 3.844e8
const SOI_MOON = 6.6183e7
const V_MOON = (2 * Math.PI * D_MOON) / (27.322 * 86400)
const T_MOON = 27.322 * 86400
const R_LEO = R_EARTH + 200e3

function circularVelocity(mu: number, r: number) { return Math.sqrt(mu / r) }
function semiMajorAxis(mu: number, r: number, v: number) { return 1 / (2 / r - (v * v) / mu) }
function eccentricityFromPeriapsis(a: number, rP: number) { return 1 - rP / a }
function apoapsis(a: number, e: number) { return a * (1 + e) }
function periapsis(a: number, e: number) { return a * (1 - e) }
function radiusAtAnomaly(a: number, e: number, nu: number) { return a * (1 - e * e) / (1 + e * Math.cos(nu)) }

function orbitStateAtAnomaly(a: number, e: number, mu: number, nu: number) {
  const r = radiusAtAnomaly(a, e, nu)
  const p = a * (1 - e * e)
  const h = Math.sqrt(mu * p)
  return {
    x: r * Math.cos(nu), y: r * Math.sin(nu),
    vx: -(mu / h) * Math.sin(nu), vy: (mu / h) * (e + Math.cos(nu))
  }
}

function trueToEccentric(nu: number, e: number) {
  return 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2))
}
function trueToMeanAnomaly(nu: number, e: number) {
  const E = trueToEccentric(nu, e)
  return E - e * Math.sin(E)
}

console.log('=== Trajectory Solver Numerical Test ===\n')

const vCirc = circularVelocity(MU_EARTH, R_LEO)
console.log(`v_circ at LEO: ${vCirc.toFixed(1)} m/s`)

const injectionDv = 3133
const injectionV = vCirc + injectionDv
console.log(`Injection V: ${injectionV.toFixed(1)} m/s`)

// Departure orbit
const a = semiMajorAxis(MU_EARTH, R_LEO, injectionV)
const e = eccentricityFromPeriapsis(a, R_LEO)
const apoR = apoapsis(a, e)
console.log(`\n--- Departure Orbit ---`)
console.log(`a = ${(a / 1e6).toFixed(3)} Mm`)
console.log(`e = ${e.toFixed(6)}`)
console.log(`apoapsis = ${(apoR / 1e6).toFixed(3)} Mm (Moon at ${(D_MOON / 1e6).toFixed(3)} Mm)`)
console.log(`Reaches Moon SOI: ${apoR > D_MOON - SOI_MOON ? 'YES' : 'NO'}`)

// Moon angle iteration
const moonOmega = 2 * Math.PI / T_MOON
let moonAngle = 0
let omega = -Math.PI

function findSOI(a: number, e: number, omega: number, mx: number, my: number) {
  let bestNu = -1, bestErr = Infinity
  for (let i = 0; i <= 500; i++) {
    const nu = (i / 500) * Math.PI
    const r = radiusAtAnomaly(a, e, nu)
    if (!isFinite(r) || r <= 0) continue
    const x = r * Math.cos(nu + omega)
    const y = r * Math.sin(nu + omega)
    const dist = Math.sqrt((x - mx) ** 2 + (y - my) ** 2)
    if (Math.abs(dist - SOI_MOON) < bestErr) { bestErr = Math.abs(dist - SOI_MOON); bestNu = nu }
  }
  if (bestNu < 0 || bestErr > SOI_MOON * 0.2) return null

  let lo = Math.max(0, bestNu - Math.PI / 250)
  let hi = Math.min(Math.PI, bestNu + Math.PI / 250)
  for (let iter = 0; iter < 50; iter++) {
    const mid = (lo + hi) / 2
    const r = radiusAtAnomaly(a, e, mid)
    const x = r * Math.cos(mid + omega)
    const y = r * Math.sin(mid + omega)
    const dist = Math.sqrt((x - mx) ** 2 + (y - my) ** 2)
    if (dist < SOI_MOON) hi = mid; else lo = mid
    if (Math.abs(dist - SOI_MOON) < 1000) break
  }
  const nu = (lo + hi) / 2
  const M = trueToMeanAnomaly(nu, e)
  const n = Math.sqrt(MU_EARTH / (a ** 3))
  return { nu, transitTime: M / n }
}

let soiResult = findSOI(a, e, omega, D_MOON, 0)!
for (let iter = 0; iter < 8; iter++) {
  moonAngle = soiResult.transitTime * moonOmega
  omega = moonAngle - Math.PI
  soiResult = findSOI(a, e, omega, D_MOON * Math.cos(moonAngle), D_MOON * Math.sin(moonAngle))!
  if (!soiResult) { console.log('SOI LOST'); process.exit(1) }
}

console.log(`\n--- Moon & SOI ---`)
console.log(`Moon angle: ${(moonAngle * 180 / Math.PI).toFixed(2)}°`)
console.log(`omega: ${(omega * 180 / Math.PI).toFixed(2)}°`)
console.log(`SOI entry nu: ${(soiResult.nu * 180 / Math.PI).toFixed(2)}°`)
console.log(`Transit time: ${(soiResult.transitTime / 86400).toFixed(2)} days`)

// State at SOI entry
const perifocal = orbitStateAtAnomaly(a, e, MU_EARTH, soiResult.nu)
const cosO = Math.cos(omega), sinO = Math.sin(omega)
const entryX = perifocal.x * cosO - perifocal.y * sinO
const entryY = perifocal.x * sinO + perifocal.y * cosO
const entryVx = perifocal.vx * cosO - perifocal.vy * sinO
const entryVy = perifocal.vx * sinO + perifocal.vy * cosO

const moonX = D_MOON * Math.cos(moonAngle)
const moonY = D_MOON * Math.sin(moonAngle)
const moonVx = -V_MOON * Math.sin(moonAngle)
const moonVy = V_MOON * Math.cos(moonAngle)

console.log(`\n--- SOI Entry State (Earth frame) ---`)
console.log(`pos: (${(entryX / 1e6).toFixed(3)}, ${(entryY / 1e6).toFixed(3)}) Mm`)
console.log(`vel: (${entryVx.toFixed(1)}, ${entryVy.toFixed(1)}) m/s`)
console.log(`dist from Earth: ${(Math.sqrt(entryX ** 2 + entryY ** 2) / 1e6).toFixed(3)} Mm`)
console.log(`dist from Moon: ${(Math.sqrt((entryX - moonX) ** 2 + (entryY - moonY) ** 2) / 1e6).toFixed(3)} Mm (SOI = ${(SOI_MOON / 1e6).toFixed(3)} Mm)`)

// Relative state
const relVx = entryVx - moonVx
const relVy = entryVy - moonVy
const relX = entryX - moonX
const relY = entryY - moonY
const vInf = Math.sqrt(relVx ** 2 + relVy ** 2)

console.log(`\n--- Flyby (Moon frame) ---`)
console.log(`rel pos: (${(relX / 1e6).toFixed(3)}, ${(relY / 1e6).toFixed(3)}) Mm`)
console.log(`rel vel: (${relVx.toFixed(1)}, ${relVy.toFixed(1)}) m/s`)
console.log(`v_infinity: ${vInf.toFixed(1)} m/s`)

const L = relX * relVy - relY * relVx
console.log(`Angular momentum L: ${L.toExponential(3)} (${L > 0 ? 'CCW' : 'CW'})`)
const turnSign = L > 0 ? +1 : -1

const flybyAlt = 6.5e6
const rPeriapsis = flybyAlt + R_MOON
const aHyp = -MU_MOON / (vInf ** 2)
const eHyp = 1 - rPeriapsis / aHyp
const turnAngle = 2 * Math.asin(1 / eHyp)

console.log(`a_hyp: ${(aHyp / 1e6).toFixed(3)} Mm`)
console.log(`e_hyp: ${eHyp.toFixed(4)}`)
console.log(`Turn angle: ${(turnAngle * 180 / Math.PI).toFixed(2)}°`)
console.log(`Turn sign: ${turnSign} (${turnSign > 0 ? 'CCW' : 'CW'})`)

// Exit velocity
const approachAngle = Math.atan2(relVy, relVx)
const exitAngle = approachAngle + turnSign * turnAngle
const exitVx = vInf * Math.cos(exitAngle) + moonVx
const exitVy = vInf * Math.sin(exitAngle) + moonVy

// Exit position
const p = Math.abs(aHyp) * (eHyp ** 2 - 1)
let cosNuSOI = (p / SOI_MOON - 1) / eHyp
cosNuSOI = Math.max(-1, Math.min(1, cosNuSOI))
const nuSOI = Math.acos(cosNuSOI)
const entryAngle = Math.atan2(relY, relX)
const exitPosAngle = entryAngle + turnSign * 2 * nuSOI
const exitX = moonX + SOI_MOON * Math.cos(exitPosAngle)
const exitY = moonY + SOI_MOON * Math.sin(exitPosAngle)

console.log(`\n--- Exit State (Earth frame) ---`)
console.log(`exit pos: (${(exitX / 1e6).toFixed(3)}, ${(exitY / 1e6).toFixed(3)}) Mm`)
console.log(`exit vel: (${exitVx.toFixed(1)}, ${exitVy.toFixed(1)}) m/s`)
console.log(`exit speed: ${Math.sqrt(exitVx ** 2 + exitVy ** 2).toFixed(1)} m/s`)
console.log(`exit dist from Earth: ${(Math.sqrt(exitX ** 2 + exitY ** 2) / 1e6).toFixed(3)} Mm`)

// Return orbit
const rExit = Math.sqrt(exitX ** 2 + exitY ** 2)
const vExit = Math.sqrt(exitVx ** 2 + exitVy ** 2)
const aRet = semiMajorAxis(MU_EARTH, rExit, vExit)
const rdotv = exitX * exitVx + exitY * exitVy
const evx = (1 / MU_EARTH) * ((vExit ** 2 - MU_EARTH / rExit) * exitX - rdotv * exitVx)
const evy = (1 / MU_EARTH) * ((vExit ** 2 - MU_EARTH / rExit) * exitY - rdotv * exitVy)
const eRet = Math.sqrt(evx ** 2 + evy ** 2)
const omegaRet = Math.atan2(evy, evx)

console.log(`\n--- Return Orbit ---`)
console.log(`a_return: ${(aRet / 1e6).toFixed(3)} Mm`)
console.log(`e_return: ${eRet.toFixed(6)}`)
console.log(`omega_return: ${(omegaRet * 180 / Math.PI).toFixed(2)}°`)
console.log(`Bound orbit: ${aRet > 0 && eRet < 1 ? 'YES' : 'NO (escape!)'}`)

if (aRet > 0 && eRet < 1) {
  const retPerigee = periapsis(aRet, eRet)
  const retPerigeeAlt = retPerigee - R_EARTH
  console.log(`Return perigee: ${(retPerigee / 1e6).toFixed(3)} Mm`)
  console.log(`Return perigee altitude: ${(retPerigeeAlt / 1000).toFixed(0)} km`)
  console.log(`HITS EARTH: ${retPerigeeAlt > 0 && retPerigeeAlt < 200e3 ? 'YES!' : 'NO'}`)
} else {
  console.log(`Return orbit is HYPERBOLIC — spacecraft escapes Earth!`)
}

// Parameter sweep
console.log(`\n\n=== Parameter Sweep ===`)
console.log(`${'dv'.padStart(6)} | ${'flyby_km'.padStart(10)} | ${'result'.padStart(8)} | ${'perigee_alt_km'.padStart(16)}`)
console.log('-'.repeat(55))

for (const dv of [3100, 3120, 3140, 3160, 3180, 3200]) {
  for (const fAlt of [2000, 4000, 6000, 8000, 10000, 15000]) {
    const v = vCirc + dv
    const a2 = semiMajorAxis(MU_EARTH, R_LEO, v)
    if (a2 <= 0) { console.log(`${String(dv).padStart(6)} | ${String(fAlt).padStart(10)} | ${'escape'.padStart(8)} |`); continue }
    const e2 = eccentricityFromPeriapsis(a2, R_LEO)
    if (e2 >= 1 || apoapsis(a2, e2) < D_MOON - SOI_MOON) { console.log(`${String(dv).padStart(6)} | ${String(fAlt).padStart(10)} | ${'no reach'.padStart(8)} |`); continue }

    // Quick solve
    let ma = 0, om = -Math.PI
    let sf = findSOI(a2, e2, om, D_MOON, 0)
    if (!sf) { console.log(`${String(dv).padStart(6)} | ${String(fAlt).padStart(10)} | ${'no SOI'.padStart(8)} |`); continue }
    for (let i = 0; i < 5; i++) {
      ma = sf!.transitTime * moonOmega
      om = ma - Math.PI
      sf = findSOI(a2, e2, om, D_MOON * Math.cos(ma), D_MOON * Math.sin(ma))
      if (!sf) break
    }
    if (!sf) { console.log(`${String(dv).padStart(6)} | ${String(fAlt).padStart(10)} | ${'SOI lost'.padStart(8)} |`); continue }

    const pf = orbitStateAtAnomaly(a2, e2, MU_EARTH, sf.nu)
    const cO = Math.cos(om), sO = Math.sin(om)
    const ex2 = pf.x * cO - pf.y * sO, ey2 = pf.x * sO + pf.y * cO
    const evx2 = pf.vx * cO - pf.vy * sO, evy2 = pf.vx * sO + pf.vy * cO

    const mx2 = D_MOON * Math.cos(ma), my2 = D_MOON * Math.sin(ma)
    const mvx2 = -V_MOON * Math.sin(ma), mvy2 = V_MOON * Math.cos(ma)

    const rvx2 = evx2 - mvx2, rvy2 = evy2 - mvy2
    const rx2 = ex2 - mx2, ry2 = ey2 - my2
    const vi2 = Math.sqrt(rvx2 ** 2 + rvy2 ** 2)

    const rP2 = fAlt * 1000 + R_MOON
    const ah2 = -MU_MOON / (vi2 ** 2)
    const eh2 = 1 - rP2 / ah2
    if (eh2 <= 1) { console.log(`${String(dv).padStart(6)} | ${String(fAlt).padStart(10)} | ${'bad hyp'.padStart(8)} |`); continue }
    const ta2 = 2 * Math.asin(1 / eh2)

    const L2 = rx2 * rvy2 - ry2 * rvx2
    const ts2 = L2 > 0 ? +1 : -1
    const aa2 = Math.atan2(rvy2, rvx2)
    const ea2 = aa2 + ts2 * ta2
    const xvx = vi2 * Math.cos(ea2) + mvx2
    const xvy = vi2 * Math.sin(ea2) + mvy2

    const pp = Math.abs(ah2) * (eh2 ** 2 - 1)
    let cn = (pp / SOI_MOON - 1) / eh2
    cn = Math.max(-1, Math.min(1, cn))
    const ns = Math.acos(cn)
    const eaA = Math.atan2(ry2, rx2)
    const xpa = eaA + ts2 * 2 * ns
    const xxp = mx2 + SOI_MOON * Math.cos(xpa)
    const xyp = my2 + SOI_MOON * Math.sin(xpa)

    const rr = Math.sqrt(xxp ** 2 + xyp ** 2)
    const vv = Math.sqrt(xvx ** 2 + xvy ** 2)
    const ar = semiMajorAxis(MU_EARTH, rr, vv)

    const rv = xxp * xvx + xyp * xvy
    const ex3 = (1 / MU_EARTH) * ((vv ** 2 - MU_EARTH / rr) * xxp - rv * xvx)
    const ey3 = (1 / MU_EARTH) * ((vv ** 2 - MU_EARTH / rr) * xyp - rv * xvy)
    const er = Math.sqrt(ex3 ** 2 + ey3 ** 2)

    if (ar <= 0 || er >= 1) {
      console.log(`${String(dv).padStart(6)} | ${String(fAlt).padStart(10)} | ${'escape'.padStart(8)} |`)
    } else {
      const pAlt = (periapsis(ar, er) - R_EARTH) / 1000
      const hit = pAlt > 0 && pAlt < 200 ? ' <<<' : ''
      console.log(`${String(dv).padStart(6)} | ${String(fAlt).padStart(10)} | ${'OK'.padStart(8)} | ${pAlt.toFixed(0).padStart(16)}${hit}`)
    }
  }
}
