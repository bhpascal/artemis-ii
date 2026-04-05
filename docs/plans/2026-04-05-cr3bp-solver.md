# CR3BP Solver — Replace Patched Conics

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the patched-conic trajectory solver with a CR3BP (Circular Restricted 3-Body Problem) integrator that naturally produces correct free-return trajectories with far-side lunar flybys.

**Architecture:** A single RK4 integrator propagates the spacecraft state in the Earth-Moon co-rotating frame, where both gravity fields act simultaneously. No SOI boundaries, no patching, no targeting loops. The solver outputs a time-series of (x, y) positions plus derived quantities (flyby altitude, return perigee). The renderer simplifies to just reading the point array.

**Tech Stack:** Pure TypeScript, no dependencies. RK4 integration of 4 coupled ODEs.

---

## Background

The patched-conic model can't produce a 2D trajectory that both loops around the Moon's far side AND returns to Earth. This is a fundamental limitation of the 2D patching geometry, not a code bug. The CR3BP solves this by computing both gravity fields simultaneously in the rotating frame — the same frame we already render in.

### CR3BP equations of motion (co-rotating frame, normalized)

The system uses normalized units where Earth-Moon distance = 1, orbital period = 2pi, and mass parameter mu = M_Moon / (M_Earth + M_Moon).

```
ẍ = 2ẏ + x - (1-μ)(x+μ)/r₁³ - μ(x-1+μ)/r₂³
ÿ = -2ẋ + y - (1-μ)y/r₁³ - μy/r₂³

where:
  r₁ = sqrt((x+μ)² + y²)        distance to Earth (at x=-μ)
  r₂ = sqrt((x-1+μ)² + y²)      distance to Moon (at x=1-μ)
  μ  = M_Moon/(M_Earth+M_Moon) ≈ 0.01215
```

The 2ẏ and -2ẋ terms are Coriolis acceleration from the rotating frame.

### What changes

| Component | Before (patched conics) | After (CR3BP) |
|-----------|------------------------|---------------|
| `trajectory-solver.ts` | 500 lines: SOI finder, flyby computation, targeting loop, return orbit | ~150 lines: RK4 integrator, event detection |
| `trajectory-renderer.ts` | 140 lines: reconstruct arcs from orbital elements | ~30 lines: pass through point array from solver |
| `SolverResult` interface | Orbital elements, flyby params, SOI states | Point array, scalar readouts |
| FreeReturnSection | Two sliders: Δv + flyby altitude | One slider: injection Δv (flyby altitude is a readout, not an input) |
| Flyby altitude slider | Targeting loop adjusts omega to hit target periapsis | Removed — flyby altitude is determined by Δv |

### Key design decision: flyby altitude slider

The flyby altitude is no longer an independent parameter. In the CR3BP, the trajectory is fully determined by the injection state (position + velocity at LEO). The flyby altitude is a *consequence*, displayed as a readout. This is actually better pedagogy — the reader learns that "how fast you leave LEO determines everything else."

If we want a second slider, it can control the injection angle (flight path angle at TLI) rather than flyby altitude. But for v1, one slider (Δv) is cleaner.

---

## Task 1: CR3BP integrator module

**Files:**
- Create: `src/physics/cr3bp.ts`
- Test: `scripts/test-cr3bp.ts`

### Step 1: Write the CR3BP module

```typescript
// src/physics/cr3bp.ts

// Normalized CR3BP units:
//   length: D_MOON (Earth-Moon distance)
//   time: T_MOON / (2*pi) (so one orbit = 2pi time units)
//   mass: M_Earth + M_Moon

export const MU = 0.012150585  // M_Moon / (M_Earth + M_Moon)

export interface CR3BPState {
  x: number   // position (normalized)
  y: number
  vx: number  // velocity (normalized)
  vy: number
}

export interface TrajectoryResult {
  points: Array<{ x: number; y: number }>  // co-rotating frame, SI units (meters)
  flybyAltitude: number   // closest approach to Moon surface (m), -1 if no flyby
  returnPerigee: number   // closest approach to Earth surface (m), -1 if escape
  hitsEarth: boolean      // return perigee 0-200 km
  maxDistance: number      // max distance from Earth (m)
  success: boolean
  error?: string
}

/** CR3BP acceleration in the co-rotating frame */
function accel(s: CR3BPState): { ax: number; ay: number } {
  const { x, y, vx, vy } = s
  const r1 = Math.sqrt((x + MU) ** 2 + y ** 2)       // dist to Earth
  const r2 = Math.sqrt((x - 1 + MU) ** 2 + y ** 2)   // dist to Moon
  const r1_3 = r1 ** 3
  const r2_3 = r2 ** 3

  const ax = 2 * vy + x - (1 - MU) * (x + MU) / r1_3 - MU * (x - 1 + MU) / r2_3
  const ay = -2 * vx + y - (1 - MU) * y / r1_3 - MU * y / r2_3

  return { ax, ay }
}

/** RK4 step */
function rk4Step(s: CR3BPState, dt: number): CR3BPState {
  function deriv(s: CR3BPState): [number, number, number, number] {
    const { ax, ay } = accel(s)
    return [s.vx, s.vy, ax, ay]
  }

  const k1 = deriv(s)
  const k2 = deriv({
    x: s.x + 0.5 * dt * k1[0], y: s.y + 0.5 * dt * k1[1],
    vx: s.vx + 0.5 * dt * k1[2], vy: s.vy + 0.5 * dt * k1[3]
  })
  const k3 = deriv({
    x: s.x + 0.5 * dt * k2[0], y: s.y + 0.5 * dt * k2[1],
    vx: s.vx + 0.5 * dt * k2[2], vy: s.vy + 0.5 * dt * k2[3]
  })
  const k4 = deriv({
    x: s.x + dt * k3[0], y: s.y + dt * k3[1],
    vx: s.vx + dt * k3[2], vy: s.vy + dt * k3[3]
  })

  return {
    x: s.x + (dt / 6) * (k1[0] + 2*k2[0] + 2*k3[0] + k4[0]),
    y: s.y + (dt / 6) * (k1[1] + 2*k2[1] + 2*k3[1] + k4[1]),
    vx: s.vx + (dt / 6) * (k1[2] + 2*k2[2] + 2*k3[2] + k4[2]),
    vy: s.vy + (dt / 6) * (k1[3] + 2*k2[3] + 2*k3[3] + k4[3]),
  }
}

/**
 * Propagate a free-return trajectory from LEO injection.
 *
 * @param injectionDv - delta-v above circular velocity (m/s)
 * @param nSteps - integration steps (default 10000)
 * @param maxTime - max integration time in normalized units (default 4*pi = 2 orbits)
 */
export function propagate(
  injectionDv: number,
  nSteps: number = 10000,
  maxTime: number = 4 * Math.PI
): TrajectoryResult {
  // ... (see Step 3 for unit conversion and initial conditions)
}
```

### Step 2: Write the verification script

Create `scripts/test-cr3bp.ts` that:
1. Verifies the Jacobi constant is conserved (the CR3BP's energy integral)
2. Checks that circular LEO velocity produces a stable orbit
3. Checks that escape velocity produces an escape trajectory
4. Finds a Δv that produces a free-return (return perigee 0-200 km)
5. Verifies the flyby goes around the far side of the Moon (x > x_Moon at closest approach)

### Step 3: Implement initial conditions (unit conversion)

The tricky part: converting from physical units (LEO radius in meters, Δv in m/s) to normalized CR3BP units.

```typescript
// Conversion factors
const L = D_MOON                                    // length unit (m)
const T = T_MOON / (2 * Math.PI)                    // time unit (s)
const V = L / T                                     // velocity unit (m/s)

// Earth position in rotating frame: x = -MU, y = 0
// Moon position: x = 1-MU, y = 0

// LEO: circular orbit around Earth at radius R_LEO
// In normalized coords: r_LEO = R_LEO / L (very small, ~0.017)
// Injection from LEO at the sub-lunar point (toward Moon):
//   position: x = -MU + r_LEO, y = 0
//   velocity: tangential (perpendicular to Earth-spacecraft line)
//     v_circ in rotating frame = sqrt((1-MU)/r_LEO) - but need to add frame rotation
//     The co-rotating frame already rotates at omega=1, so a body at distance r_LEO
//     from Earth has frame velocity omega * (x_Earth + r_LEO) in the y direction.
//     The inertial circular velocity is sqrt((1-MU)/r_LEO) (normalized).
//     In the rotating frame: vy = v_inertial - omega * x_position
//     where x_position = -MU + r_LEO

const rLEO = R_LEO / L
const xStart = -MU + rLEO
const yStart = 0

// Circular velocity around Earth (normalized, inertial)
const vCircInertial = Math.sqrt((1 - MU) / rLEO)
// Convert to rotating frame: subtract frame rotation (omega=1, so v_frame = 1 * x)
const vCircRotating = vCircInertial - xStart  // vy component

// Add injection Δv (converted to normalized)
const dvNorm = injectionDv / V
const vyStart = vCircRotating + dvNorm
const vxStart = 0  // tangential injection, no radial component
```

### Step 4: Implement the propagation loop

```typescript
export function propagate(injectionDv: number, nSteps = 10000, maxTime = 4 * Math.PI): TrajectoryResult {
  const L = D_MOON, T_unit = T_MOON / (2 * Math.PI), V_unit = L / T_unit

  const rLEO = R_LEO / L
  const xStart = -MU + rLEO
  const vCirc = Math.sqrt((1 - MU) / rLEO)
  const vyStart = vCirc - xStart + injectionDv / V_unit

  let state: CR3BPState = { x: xStart, y: 0, vx: 0, vy: vyStart }
  const dt = maxTime / nSteps

  const points: Array<{ x: number; y: number }> = []
  let minMoonDist = Infinity
  let minEarthDist = Infinity
  let maxEarthDist = 0
  let closestMoonX = 0  // x-coord at closest Moon approach

  for (let i = 0; i <= nSteps; i++) {
    // Record point in SI units
    points.push({ x: state.x * L, y: state.y * L })

    // Track distances
    const rEarth = Math.sqrt((state.x + MU) ** 2 + state.y ** 2) * L
    const rMoon = Math.sqrt((state.x - 1 + MU) ** 2 + state.y ** 2) * L
    if (rMoon < minMoonDist) {
      minMoonDist = rMoon
      closestMoonX = state.x * L
    }
    if (rEarth > maxEarthDist) maxEarthDist = rEarth

    // Check for Earth return (after initial departure)
    // Skip the first ~500 steps to avoid triggering on departure
    if (i > nSteps / 4 && rEarth < minEarthDist) {
      minEarthDist = rEarth
    }

    // Stop if crashed into Earth or Moon
    if (rEarth < R_EARTH || rMoon < R_MOON) break

    // Integrate
    state = rk4Step(state, dt)
  }

  const flybyAltitude = minMoonDist - R_MOON
  const returnPerigee = minEarthDist === Infinity ? -1 : minEarthDist - R_EARTH
  const hitsEarth = returnPerigee > 0 && returnPerigee < 200e3

  return {
    points,
    flybyAltitude,
    returnPerigee,
    hitsEarth,
    maxDistance: maxEarthDist,
    success: true,
  }
}
```

### Step 5: Run verification

```bash
npx tsx scripts/test-cr3bp.ts
```

Expected output:
- Jacobi constant conserved to <0.001% over full integration
- Circular LEO produces near-circular orbit (radius variation < 1%)
- A Δv around 3130-3150 m/s produces a free-return with return perigee 0-200 km
- Closest Moon approach is at x > Moon_x (far side)

### Step 6: Commit

```bash
git add src/physics/cr3bp.ts scripts/test-cr3bp.ts
git commit -m "feat: CR3BP integrator — replaces patched-conic solver"
```

---

## Task 2: New renderer for CR3BP output

**Files:**
- Modify: `src/physics/trajectory-renderer.ts`

The old renderer reconstructed arcs from orbital elements. The CR3BP solver outputs a point array in the co-rotating frame — the renderer just needs to split it into departure/flyby/return segments by proximity to Moon, and optionally rotate to inertial frame.

### Step 1: Simplify the renderer

```typescript
import { D_MOON, R_MOON } from './constants'
import type { TrajectoryResult } from './cr3bp'

export interface TrajectoryPoints {
  departurePts: Array<{ x: number; y: number }>
  flybyPts: Array<{ x: number; y: number }>
  returnPts: Array<{ x: number; y: number }>
  moonPos: { x: number; y: number }
}

export function renderTrajectory(
  result: TrajectoryResult,
  _frame: 'corotating' | 'inertial' = 'corotating'
): TrajectoryPoints | null {
  if (!result.success || result.points.length === 0) return null

  const moonX = D_MOON  // Moon at +x in co-rotating frame
  const moonY = 0
  const SOI_APPROX = 6.6e7  // approximate SOI for visual segmentation

  // Split points into segments by proximity to Moon
  const depPts: Array<{ x: number; y: number }> = []
  const flyPts: Array<{ x: number; y: number }> = []
  const retPts: Array<{ x: number; y: number }> = []

  let phase: 'departure' | 'flyby' | 'return' = 'departure'

  for (const pt of result.points) {
    const moonDist = Math.sqrt((pt.x - moonX) ** 2 + (pt.y - moonY) ** 2)

    if (phase === 'departure') {
      depPts.push(pt)
      if (moonDist < SOI_APPROX) phase = 'flyby'
    } else if (phase === 'flyby') {
      flyPts.push(pt)
      if (moonDist > SOI_APPROX) phase = 'return'
    } else {
      retPts.push(pt)
    }
  }

  return { departurePts: depPts, flybyPts: flyPts, returnPts: retPts, moonPos: { x: moonX, y: moonY } }
}
```

### Step 2: Commit

```bash
git add src/physics/trajectory-renderer.ts
git commit -m "refactor: simplify renderer for CR3BP point arrays"
```

---

## Task 3: Update SolverResult interface and FreeReturnSection

**Files:**
- Modify: `src/physics/trajectory-solver.ts` (keep as thin adapter or remove)
- Modify: `src/sections/FreeReturnSection.tsx`

### Step 1: Create adapter `solve()` function

Keep the `solve(injectionV, flybyAltitude)` signature for backward compat, but internally call `propagate()`. The `flybyAltitude` parameter becomes unused (or used for display comparison only).

```typescript
// src/physics/trajectory-solver.ts — simplified adapter

import { propagate } from './cr3bp'
import { R_MOON } from './constants'

export interface SolverResult {
  success: boolean
  error?: string
  points: Array<{ x: number; y: number }>
  flybyPeriapsis: number
  flybyEccentricity: number  // approximate, for display
  turnAngle: number          // approximate, for display
  turnSign: number
  returnPerigeeAlt: number
  hitsEarth: boolean
  maxDistance: number
}

export function solve(injectionDv: number, _flybyAltitude?: number): SolverResult {
  const result = propagate(injectionDv)

  if (!result.success) return { success: false, error: result.error, /* ... zero defaults ... */ }

  return {
    success: true,
    points: result.points,
    flybyPeriapsis: result.flybyAltitude + R_MOON,
    flybyEccentricity: 0,  // TODO: compute from closest-approach state if needed
    turnAngle: 0,           // TODO: compute from entry/exit velocities if needed
    turnSign: 1,
    returnPerigeeAlt: result.returnPerigee,
    hitsEarth: result.hitsEarth,
    maxDistance: result.maxDistance,
  }
}
```

### Step 2: Update FreeReturnSection

1. Remove the flyby altitude slider (flyby altitude is now a readout)
2. Keep the Δv slider as the primary control
3. Display flyby altitude and return perigee as computed values
4. The `renderTrajectory` call stays the same (same output interface)

### Step 3: Update HookSection and RealMissionSection

Replace `solve(vCirc + 3140, 10500e3)` with `solve(3140)` (just the Δv).

### Step 4: Commit

```bash
git add src/physics/trajectory-solver.ts src/sections/*.tsx
git commit -m "refactor: wire FreeReturnSection to CR3BP solver"
```

---

## Task 4: Parameter sweep and default tuning

**Files:**
- Create: `scripts/sweep-cr3bp.ts`

### Step 1: Sweep Δv to find valid free returns

```bash
npx tsx scripts/sweep-cr3bp.ts
```

Find the Δv range that produces:
- Flyby altitude 2,000-20,000 km
- Return perigee 0-200 km
- Far-side flyby (closest approach x > Moon x)

### Step 2: Set defaults

Update the slider ranges in FreeReturnSection based on the sweep results. The default Δv should produce a valid free return (hitsEarth = true).

### Step 3: Commit

```bash
git add scripts/sweep-cr3bp.ts src/sections/FreeReturnSection.tsx
git commit -m "fix: tune CR3BP defaults from parameter sweep"
```

---

## Task 5: Verification and cleanup

### Step 1: Run all checks

```bash
npx tsc --noEmit          # type check
npx vite build            # production build
npx tsx scripts/test-cr3bp.ts  # physics verification
```

### Step 2: Visual check

Start dev server, verify:
- Free Return section shows figure-8 in co-rotating frame
- Flyby arc loops around Moon's far side
- Sweeping Δv shows trajectories going from "misses Earth" through "hits" to "too steep"
- Hook and RealMission sections show smooth trajectories

### Step 3: Delete dead code

- Remove `src/physics/patched-conics.ts` if still present
- Remove patched-conic helpers from `trajectory-solver.ts` (findSOIEntry, computeFlyby, etc.)
- Remove `flybyA`, `flybyOmega`, `flybyEntryNu`, `flybyExitNu` from SolverResult
- Clean up unused imports

### Step 4: Final commit

```bash
git add -A
git commit -m "refactor: remove patched-conic dead code after CR3BP migration"
```

---

## Performance notes

The integrator runs ~10,000 RK4 steps. Each step is ~20 floating-point operations. Total: ~200,000 ops. At 1 GHz, that's 0.2 ms. Even at 50,000 steps for higher accuracy, it's 1 ms — well within the 16 ms frame budget for real-time scrubbing.

If scrubbing feels laggy, reduce `nSteps` to 5,000 (the trajectory will be slightly less smooth but the physics won't change). Or use adaptive step size (RK45) to concentrate steps near the Moon where the dynamics are fastest.

## What we keep from patched conics

- `orbits.ts` — vis-viva, Kepler solver, orbital elements (used by Newton's Cannon and Transfer Orbits sections)
- `constants.ts` — all physical constants
- `kepler.ts` — Kepler equation solver (used by transfer orbit timing)
- The Newton's Cannon and Transfer Orbit sections are unchanged — they use two-body physics correctly
