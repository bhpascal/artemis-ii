/**
 * Spot-check the flyby rewrite against the spec's verification criteria.
 * Run with: npx tsx scripts/verify-flyby.ts
 */

import { solve } from '../src/physics/trajectory-solver'
import { MU_MOON, SOI_MOON, R_MOON, D_MOON } from '../src/physics/constants'

const PASS = '\x1b[32mPASS\x1b[0m'
const FAIL = '\x1b[31mFAIL\x1b[0m'

let passed = 0
let failed = 0

function check(name: string, ok: boolean, detail: string) {
  if (ok) { passed++; console.log(`  ${PASS} ${name}: ${detail}`) }
  else { failed++; console.log(`  ${FAIL} ${name}: ${detail}`) }
}

console.log('=== Flyby Rewrite Verification ===\n')

// Default parameters (back-derived from Artemis II mission data for 2D model)
const result = solve(7788.5 + 3140, 10500e3) // v_circ + 3140, 10500 km altitude
console.log(`Solver success: ${result.success}`)
if (!result.success) {
  console.log(`Error: ${result.error}`)
  process.exit(1)
}

// --- Verification 1: v_SOI ≠ v_infinity ---
const relVx = result.soiEntry.vel.x - (-1022 * Math.sin(result.moonAngle)) // approx moonVel
const relVy = result.soiEntry.vel.y - (1022 * Math.cos(result.moonAngle))
const moonVx = -(2 * Math.PI * D_MOON / (27.322 * 86400)) * Math.sin(result.moonAngle)
const moonVy = (2 * Math.PI * D_MOON / (27.322 * 86400)) * Math.cos(result.moonAngle)
const rvx = result.soiEntry.vel.x - moonVx
const rvy = result.soiEntry.vel.y - moonVy
const vSOI = Math.sqrt(rvx ** 2 + rvy ** 2)
const vInfFromEnergy = Math.sqrt(Math.max(0, vSOI ** 2 - 2 * MU_MOON / SOI_MOON))

console.log('\n--- Check 1: v_SOI vs v_infinity ---')
console.log(`  v_at_SOI:  ${vSOI.toFixed(1)} m/s`)
console.log(`  v_infinity: ${vInfFromEnergy.toFixed(1)} m/s (from energy)`)
console.log(`  Stored v_infinity: ${result.vInfinity.toFixed(1)} m/s`)
const vDiff = Math.abs(vSOI - vInfFromEnergy)
check('v_SOI ≠ v_infinity', vDiff > 30, `difference = ${vDiff.toFixed(1)} m/s`)

// --- Check 2: a_hyp consistency ---
console.log('\n--- Check 2: a_hyp vis-viva consistency ---')
const aFromVinf = -MU_MOON / (vInfFromEnergy ** 2)
console.log(`  a_hyp (solver):    ${(result.flybyA / 1e6).toFixed(3)} Mm`)
console.log(`  a_hyp (from v_inf): ${(aFromVinf / 1e6).toFixed(3)} Mm`)
check('a_hyp consistent', Math.abs(result.flybyA - aFromVinf) / Math.abs(aFromVinf) < 0.01,
  `ratio = ${(result.flybyA / aFromVinf).toFixed(6)}`)

// --- Check 3: Energy conservation (exit speed = entry speed in Moon frame) ---
console.log('\n--- Check 3: Energy conservation across flyby ---')
const exitRelVx = result.soiExit.vel.x - moonVx
const exitRelVy = result.soiExit.vel.y - moonVy
const vExitMoon = Math.sqrt(exitRelVx ** 2 + exitRelVy ** 2)
console.log(`  Entry speed (Moon frame): ${vSOI.toFixed(1)} m/s`)
console.log(`  Exit speed (Moon frame):  ${vExitMoon.toFixed(1)} m/s`)

// Actually need to compare at same radius. Entry is at SOI, exit should also be at SOI.
const exitRelX = result.soiExit.pos.x - D_MOON * Math.cos(result.moonAngle)
const exitRelY = result.soiExit.pos.y - D_MOON * Math.sin(result.moonAngle)
const rExitFromMoon = Math.sqrt(exitRelX ** 2 + exitRelY ** 2)
console.log(`  Exit dist from Moon: ${(rExitFromMoon / 1e6).toFixed(3)} Mm (SOI = ${(SOI_MOON / 1e6).toFixed(3)} Mm)`)

check('Entry/exit same speed', Math.abs(vSOI - vExitMoon) / vSOI < 0.001,
  `diff = ${Math.abs(vSOI - vExitMoon).toFixed(3)} m/s (${(100 * Math.abs(vSOI - vExitMoon) / vSOI).toFixed(4)}%)`)

// --- Check 4: Exit position on SOI boundary ---
console.log('\n--- Check 4: Exit position on SOI boundary ---')
check('Exit on SOI', Math.abs(rExitFromMoon - SOI_MOON) / SOI_MOON < 0.01,
  `dist = ${(rExitFromMoon / 1e6).toFixed(3)} Mm vs SOI = ${(SOI_MOON / 1e6).toFixed(3)} Mm`)

// --- Check 5: Flyby periapsis near target ---
console.log('\n--- Check 5: Flyby periapsis targeting ---')
const targetPeriapsis = 10500e3 + R_MOON
console.log(`  Target periapsis: ${((10500e3 + R_MOON) / 1e6).toFixed(3)} Mm`)
console.log(`  Actual periapsis: ${(result.flybyPeriapsis / 1e6).toFixed(3)} Mm`)
console.log(`  Actual flyby alt: ${((result.flybyPeriapsis - R_MOON) / 1e3).toFixed(0)} km`)
check('Periapsis near target', Math.abs(result.flybyPeriapsis - targetPeriapsis) < 100e3,
  `error = ${((result.flybyPeriapsis - targetPeriapsis) / 1e3).toFixed(0)} km`)

// --- Check 6: Return perigee ---
console.log('\n--- Check 6: Return orbit ---')
console.log(`  Return perigee alt: ${(result.returnPerigeeAlt / 1e3).toFixed(0)} km`)
console.log(`  Hits Earth: ${result.hitsEarth}`)

// --- Check 7: Sweep flyby altitude ---
console.log('\n--- Check 7: Parameter sweep (Δv=3140, flyby 5000-20000 km) ---')
console.log(`  ${'alt_km'.padStart(8)} | ${'periapsis_km'.padStart(12)} | ${'return_alt_km'.padStart(14)} | hit?`)
console.log('  ' + '-'.repeat(55))

let foundHit = false
for (const alt of [5000, 7000, 8500, 10000, 10500, 11000, 12000, 15000, 18000, 20000]) {
  const r = solve(7788.5 + 3140, alt * 1e3)
  if (r.success) {
    const pAlt = (r.flybyPeriapsis - R_MOON) / 1e3
    const retAlt = r.returnPerigeeAlt / 1e3
    const hit = r.hitsEarth ? ' <<<' : ''
    if (r.hitsEarth) foundHit = true
    console.log(`  ${String(alt).padStart(8)} | ${pAlt.toFixed(0).padStart(12)} | ${retAlt.toFixed(0).padStart(14)} |${hit}`)
  } else {
    console.log(`  ${String(alt).padStart(8)} | ${r.error}`)
  }
}

// --- Check 8: Sweep Δv ---
console.log('\n--- Check 8: Δv sweep at 10500 km flyby ---')
console.log(`  ${'dv'.padStart(6)} | ${'flyby_alt_km'.padStart(12)} | ${'return_alt_km'.padStart(14)} | hit?`)
console.log('  ' + '-'.repeat(55))

for (const dv of [3130, 3135, 3138, 3140, 3142, 3145, 3150, 3160]) {
  const vCirc = 7788.5
  const r = solve(vCirc + dv, 10500e3)
  if (r.success) {
    const pAlt = (r.flybyPeriapsis - R_MOON) / 1e3
    const retAlt = r.returnPerigeeAlt / 1e3
    const hit = r.hitsEarth ? ' <<<' : ''
    if (r.hitsEarth) foundHit = true
    console.log(`  ${String(dv).padStart(6)} | ${pAlt.toFixed(0).padStart(12)} | ${retAlt.toFixed(0).padStart(14)} |${hit}`)
  } else {
    console.log(`  ${String(dv).padStart(6)} | ${r.error}`)
  }
}

check('At least one valid reentry', foundHit, foundHit ? 'found!' : 'none found in default ranges')

// --- Summary ---
console.log(`\n${'='.repeat(40)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
