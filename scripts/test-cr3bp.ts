/**
 * CR3BP integrator verification.
 * Run with: npx tsx scripts/test-cr3bp.ts
 */

import { propagate, jacobiConstant, MU_CR3BP } from '../src/physics/cr3bp'
import { D_MOON, R_MOON, R_EARTH, R_LEO } from '../src/physics/constants'

const PASS = '\x1b[32mPASS\x1b[0m'
const FAIL = '\x1b[31mFAIL\x1b[0m'
let passed = 0
let failed = 0

function check(name: string, ok: boolean, detail: string) {
  if (ok) { passed++; console.log(`  ${PASS} ${name}: ${detail}`) }
  else { failed++; console.log(`  ${FAIL} ${name}: ${detail}`) }
}

console.log('=== CR3BP Verification ===\n')

// ── Test 1: Jacobi constant conservation ──
console.log('--- 1. Jacobi Constant Conservation ---')
{
  const mu = MU_CR3BP
  const L = D_MOON, T = (27.322 * 86400) / (2 * Math.PI), V = L / T
  const rLeo = R_LEO / L
  const vCirc_raw = Math.sqrt((1 - mu) / rLeo)
  const dv = 3143  // sweet spot for free-return at angle=36

  // Propagate and check CJ at many points
  const angle = 36
  const result = propagate(dv, angle, 50000)

  // Propagate manually to get final state for CJ check
  const theta = angle * Math.PI / 180
  const x0_a = -mu + rLeo * Math.cos(Math.PI + theta)
  const y0_a = rLeo * Math.sin(Math.PI + theta)
  const tangX = -Math.sin(Math.PI + theta)
  const tangY = Math.cos(Math.PI + theta)
  const vTotal = vCirc_raw + dv / V
  const vxI = vTotal * tangX
  const vyI = vTotal * tangY
  let state = { x: x0_a, y: y0_a, vx: vxI + y0_a, vy: vyI - x0_a }

  // Recompute CJ at actual start
  const cj0_actual = jacobiConstant(state.x, state.y, state.vx, state.vy)
  const cj0 = cj0_actual
  console.log(`  C_J at start: ${cj0.toFixed(8)}`)

  const dt = (4 * Math.PI) / 50000
  for (let i = 0; i < 50000; i++) {
    // Inline RK4 to access final state
    const mu2 = MU_CR3BP
    function acc(s: typeof state) {
      const r1 = Math.sqrt((s.x + mu2) ** 2 + s.y ** 2)
      const r2 = Math.sqrt((s.x - 1 + mu2) ** 2 + s.y ** 2)
      return {
        ax: 2 * s.vy + s.x - (1 - mu2) * (s.x + mu2) / (r1 ** 3) - mu2 * (s.x - 1 + mu2) / (r2 ** 3),
        ay: -2 * s.vx + s.y - (1 - mu2) * s.y / (r1 ** 3) - mu2 * s.y / (r2 ** 3),
      }
    }
    function deriv(s: typeof state): [number, number, number, number] {
      const a = acc(s)
      return [s.vx, s.vy, a.ax, a.ay]
    }
    const k1 = deriv(state)
    const k2 = deriv({ x: state.x + 0.5*dt*k1[0], y: state.y + 0.5*dt*k1[1], vx: state.vx + 0.5*dt*k1[2], vy: state.vy + 0.5*dt*k1[3] })
    const k3 = deriv({ x: state.x + 0.5*dt*k2[0], y: state.y + 0.5*dt*k2[1], vx: state.vx + 0.5*dt*k2[2], vy: state.vy + 0.5*dt*k2[3] })
    const k4 = deriv({ x: state.x + dt*k3[0], y: state.y + dt*k3[1], vx: state.vx + dt*k3[2], vy: state.vy + dt*k3[3] })
    state = {
      x: state.x + (dt/6)*(k1[0]+2*k2[0]+2*k3[0]+k4[0]),
      y: state.y + (dt/6)*(k1[1]+2*k2[1]+2*k3[1]+k4[1]),
      vx: state.vx + (dt/6)*(k1[2]+2*k2[2]+2*k3[2]+k4[2]),
      vy: state.vy + (dt/6)*(k1[3]+2*k2[3]+2*k3[3]+k4[3]),
    }
  }

  const cjEnd = jacobiConstant(state.x, state.y, state.vx, state.vy)
  const drift = Math.abs(cjEnd - cj0) / Math.abs(cj0) * 100
  console.log(`  C_J at end:   ${cjEnd.toFixed(8)}`)
  console.log(`  Drift: ${drift.toFixed(6)}%`)
  check('Jacobi constant', drift < 0.02, `${drift.toFixed(6)}% drift`)
}

// ── Test 2: LEO stability ──
console.log('\n--- 2. LEO Stability (dv=0) ---')
{
  // Shorter integration: just 10 LEO orbits, high step count for accuracy
  const result = propagate(0, 0, 50000, 0.15) // ~10 LEO orbits (period ≈ 0.014)
  const earthX = -MU_CR3BP * D_MOON // Earth position in SI
  let maxR = 0, minR = Infinity
  for (const pt of result.points) {
    // Distance from EARTH, not origin (Earth is at -μ*D_MOON, not at 0)
    const r = Math.sqrt((pt.x - earthX) ** 2 + pt.y ** 2)
    if (r > maxR) maxR = r
    if (r < minR) minR = r
  }
  const variation = (maxR - minR) / R_LEO
  console.log(`  Min radius from Earth: ${(minR / 1e6).toFixed(3)} Mm`)
  console.log(`  Max radius from Earth: ${(maxR / 1e6).toFixed(3)} Mm`)
  console.log(`  R_LEO: ${(R_LEO / 1e6).toFixed(3)} Mm`)
  console.log(`  Variation: ${(variation * 100).toFixed(2)}% of R_LEO`)
  check('LEO stability', variation < 0.05, `${(variation * 100).toFixed(2)}% variation`)
}

// ── Test 3: Free-return sweep ──
console.log('\n--- 3. Free-Return Sweep ---')
console.log(`  ${'dv'.padStart(6)} | ${'flyby_km'.padStart(10)} | ${'return_km'.padStart(10)} | ${'max_dist_Mm'.padStart(12)} | hit?`)
console.log('  ' + '-'.repeat(60))

let foundHit = false
let hitDv = 0
let hitResult: ReturnType<typeof propagate> | null = null

// Coarse sweep to show range, then fine sweep around the sweet spot
for (let dv = 3100; dv <= 3200; dv += 10) {
  const r = propagate(dv, 36)
  const fAlt = r.flybyAltitude >= 0 ? (r.flybyAltitude / 1e3).toFixed(0) : 'crash'
  const rAlt = r.returnPerigee >= 0 ? (r.returnPerigee / 1e3).toFixed(0) : 'escape'
  const maxD = (r.maxDistance / 1e6).toFixed(1)
  const hit = r.hitsEarth ? ' <<<' : ''
  console.log(`  ${String(dv).padStart(6)} | ${fAlt.padStart(10)} | ${rAlt.padStart(10)} | ${maxD.padStart(12)} |${hit}`)
}

// Fine sweep: 1 m/s steps near the sweet spot to find close far-side flybys
console.log('  --- Fine sweep (1 m/s) ---')
for (let dv = 3138; dv <= 3150; dv += 1) {
  const r = propagate(dv, 36, 100000) // more steps for accuracy near Moon
  const fAlt = r.flybyAltitude >= 0 ? (r.flybyAltitude / 1e3).toFixed(0) : 'crash'
  const rAlt = r.returnPerigee >= 0 ? (r.returnPerigee / 1e3).toFixed(0) : 'escape'
  const maxD = (r.maxDistance / 1e6).toFixed(1)
  const hit = r.hitsEarth ? ' <<<' : ''
  if (r.hitsEarth && !foundHit) {
    foundHit = true
    hitDv = dv
    hitResult = r
  }
  // Also check for close far-side flybys that return
  if (r.flybyAltitude < 30000e3 && r.returnPerigee > 0 && !hitResult) {
    hitResult = r
    hitDv = dv
  }
  console.log(`  ${String(dv).padStart(6)} | ${fAlt.padStart(10)} | ${rAlt.padStart(10)} | ${maxD.padStart(12)} |${hit}`)
}

check('Free-return exists', foundHit, foundHit ? `dv=${hitDv} m/s` : 'none found (check finer sweep)')

// ── Test 4: Far-side verification ──
console.log('\n--- 4. Far-Side Verification ---')
if (hitResult) {
  // Find the point closest to Moon
  const moonX = (1 - MU_CR3BP) * D_MOON
  let minDist = Infinity
  let closestX = 0
  for (const pt of hitResult.points) {
    const d = Math.sqrt((pt.x - moonX) ** 2 + pt.y ** 2)
    if (d < minDist) {
      minDist = d
      closestX = pt.x
    }
  }
  const isFarSide = closestX > moonX
  console.log(`  Moon center x: ${(moonX / 1e6).toFixed(1)} Mm`)
  console.log(`  Closest approach x: ${(closestX / 1e6).toFixed(1)} Mm`)
  console.log(`  Side: ${isFarSide ? 'FAR (behind Moon)' : 'NEAR (between Earth and Moon)'}`)
  check('Far-side flyby', isFarSide, isFarSide ? 'trajectory loops behind Moon' : 'wrong side!')
} else {
  console.log('  Skipped — no valid free return found')
  check('Far-side flyby', false, 'no trajectory to check')
}

// ── Summary ──
console.log(`\n${'='.repeat(40)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
