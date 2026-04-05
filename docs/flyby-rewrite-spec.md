# Free Return Flyby Rewrite Specification

## Status: Ready to implement

## Reference: Standard Patched-Conic Flyby Algorithm
Source: [Orbital Mechanics & Astrodynamics — Planetary Flyby](https://orbital-mechanics.space/interplanetary-maneuvers/planetary-arrival-flyby.html)

The standard textbook algorithm IS:
1. Compute v_infinity = spacecraft_vel - planet_vel (at SOI boundary)
2. Compute a = -μ/v_inf², e = 1 + r_p·v_inf²/μ
3. Compute turn angle δ = 2·arcsin(1/e)  
4. Rotate v_infinity direction by ±δ to get departure v_infinity
5. Add planet velocity back to get heliocentric exit velocity

This is what our code does. The key question is whether Bug #1 (treating
SOI speed as v_infinity) matters in practice. The standard approximation
treats v_SOI ≈ v_infinity in direction and uses v_infinity for orbit
sizing. The magnitude relationship is v_SOI = sqrt(v_inf² + 2μ/r_SOI).

For the Moon with SOI = 66,183 km and μ_Moon = 4.905e12:
  2μ/r_SOI = 2 × 4.905e12 / 6.618e7 = 148,200 m²/s²
  If v_inf = 1000 m/s: v_SOI = sqrt(1e6 + 148200) = 1072 m/s (7% difference)

The 7% speed difference is small, but the DIRECTION difference matters
more at the SOI boundary vs asymptote. For the Moon's relatively small
SOI, this may be the source of the 78-degree direction error the physics
agent found — the approach is nearly radial at the SOI because the orbit
is near apoapsis, not asymptotic.

## Problem Summary

The `computeLunarFlyby` function in the patched-conic solver has three critical physics errors that make the Free Return section non-functional. The solver's return orbit math is correct, but the flyby computation feeds it garbage inputs.

## The Three Bugs

### Bug 1: SOI speed treated as v_infinity

**Where**: `trajectory-solver.ts`, inside `computeFlyby`

**What's wrong**: The code computes `vInf = |relVel|` from the spacecraft's velocity at the SOI boundary relative to the Moon. This is the speed *at the SOI boundary*, not v_infinity (the speed infinitely far from the Moon). At the SOI boundary, the spacecraft is already inside the Moon's gravity well and moving faster.

**Correct formula**:
```
v_at_SOI = |relVel|                          // what we measure
v_infinity = sqrt(v_at_SOI² - 2·μ_Moon/r_SOI)  // subtract potential energy
a_hyp = -μ_Moon / v_infinity²                   // use true v_inf for orbit size
```

Or equivalently, use vis-viva directly:
```
a_hyp = 1 / (2/r_SOI - v_at_SOI²/μ_Moon)    // vis-viva at the actual position
```
This gives `a_hyp` directly without needing to compute v_infinity first.

**Numerical impact**: a_hyp = -4,406 km (buggy) vs -5,082 km (correct). The eccentricity and all downstream quantities are wrong.

### Bug 2: Asymptotic turn angle applied at SOI boundary

**Where**: `trajectory-solver.ts`, inside `computeFlyby`

**What's wrong**: The turn angle δ = 2·arcsin(1/e) is the deflection between the *asymptotic* velocity directions (infinitely far away). At the SOI boundary (finite distance), the velocity direction is different from the asymptote. The code applies the asymptotic turn angle to the SOI-boundary velocity direction, producing a **78-degree error** in the exit velocity.

**Correct approach**: 
1. Compute the hyperbolic orbit's eccentricity vector from the actual state at SOI entry
2. Find the true anomaly at SOI entry: `cos(ν) = (p/r - 1)/e` with sign from angular momentum
3. The exit true anomaly is `-ν` (symmetric about periapsis) — but actually it's `+ν_SOI` if entry was at `-ν_SOI`
4. Compute position and velocity at exit true anomaly using the orbital state equations
5. Transform back to Earth-centered frame

This replaces the approximate "rotate by turn angle" with exact orbit propagation.

### Bug 3: Exit speed uses v_infinity instead of SOI speed

**Where**: Same function, exit velocity computation

**What's wrong**: `exitVx = vInf * cos(exitAngle)` uses v_infinity magnitude. The speed at the SOI boundary is larger: `v_SOI = sqrt(v_inf² + 2·μ_Moon/r_SOI)`.

**Fix**: Subsumed by Bug 2 fix — computing the actual state at exit true anomaly gives the correct speed automatically.

## The Correct Algorithm

Replace the entire `computeFlyby` function with this approach:

```
Input: entryState (pos, vel in Earth frame), moonPos, moonVel, desired flybyPeriapsis

1. Convert to Moon-centered frame:
   relPos = entryState.pos - moonPos
   relVel = entryState.vel - moonVel
   r_SOI = |relPos|  (should be ≈ SOI_MOON)
   v_SOI = |relVel|

2. Compute the ACTUAL hyperbolic orbit from the state vector:
   a_hyp = 1 / (2/r_SOI - v_SOI²/μ_Moon)          // vis-viva (will be negative)
   
   // Eccentricity vector (in Moon-centered frame):
   rdotv = relPos · relVel
   e_vec = (1/μ_Moon) · [(v² - μ/r)·relPos - rdotv·relVel]
   e_hyp = |e_vec|
   omega_hyp = atan2(e_vec.y, e_vec.x)   // periapsis direction
   
   // Actual flyby periapsis (NOT the slider value — see Design Bug below):
   actual_periapsis = a_hyp · (1 - e_hyp)   // since a_hyp < 0: |a|·(e-1)

3. Compute true anomaly at SOI entry:
   p = |a_hyp| · (e² - 1)
   cos_nu = (p/r_SOI - 1) / e_hyp
   nu_entry = ±arccos(cos_nu)   // sign from: rdotv < 0 means approaching (ν < 0)

4. Exit true anomaly (symmetric flyby):
   nu_exit = -nu_entry   // opposite side of periapsis

5. Compute exit state in perifocal frame:
   r_exit = p / (1 + e·cos(nu_exit))
   // Position and velocity from orbital state equations at nu_exit
   // (use orbitStateAtAnomaly with the hyperbolic elements)

6. Rotate from perifocal to Moon-centered frame by omega_hyp

7. Transform back to Earth-centered frame:
   exitState.pos = exit_moon + moonPos
   exitState.vel = exit_vel_moon + moonVel
```

## The Flyby Altitude Problem (Design Bug)

The slider says "flyby altitude" but the actual flyby periapsis is determined by the SOI entry geometry, not by a free parameter. For the nominal case, the actual periapsis is ~64,000 km, not 6,500 km.

**Solution**: Add a targeting loop. To achieve a desired flyby periapsis:
1. The orbit orientation `omega` (argument of periapsis of the departure ellipse) controls the SOI entry geometry
2. Different omega values produce different approach angles, which produce different flyby periapses
3. Use bisection on `omega_offset` (small perturbation to `omega = moonAngle - π + offset`) to find the offset that produces the desired flyby periapsis

```
function solveForFlybyAlt(injectionV, desiredFlybyAlt):
  target_periapsis = desiredFlybyAlt + R_MOON
  
  for omega_offset in bisection(-5°, +5°):
    omega = moonAngle - π + omega_offset
    find SOI intersection
    compute flyby (using correct algorithm above)
    actual_periapsis = |a_hyp| · (e_hyp - 1)
    
    if actual_periapsis ≈ target_periapsis: done
    if actual_periapsis > target_periapsis: adjust offset
    if actual_periapsis < target_periapsis: adjust other way
```

This makes the flyby altitude slider actually control the flyby altitude.

## Files to Modify

1. **`src/physics/trajectory-solver.ts`** — rewrite `computeFlyby` function with the correct algorithm above. Add the targeting loop to `solve()`.
2. **`src/physics/trajectory-renderer.ts`** — the flyby arc generation needs to use the correct hyperbolic orbit (from eccentricity vector) instead of the approximate arc. The entry/exit true anomalies are now known exactly.
3. **`src/test/physics-tests.ts`** — add tests for the flyby computation: verify energy conservation across the SOI boundary, verify v_infinity matches vis-viva, verify the exit state produces a reasonable return perigee.

## Files NOT to Modify

- `constants.ts`, `orbits.ts`, `kepler.ts` — all correct
- Section components — they already use the solver+renderer pipeline
- `patched-conics.ts` — deprecated, can be deleted

## Verification

After implementation, run the numerical trace script (`scripts/test-solver.ts`) and verify:

1. `v_at_SOI` ≠ `v_infinity` (should differ by ~70 m/s)
2. `a_hyp` from vis-viva matches `-μ/v_inf²` where `v_inf = sqrt(v_SOI² - 2μ/r_SOI)`
3. Exit speed at SOI equals entry speed at SOI (energy conservation in Moon frame)
4. Exit position is on the SOI boundary (|exit_pos - moonPos| = SOI_MOON)
5. Return perigee is in the range 0-200 km for at least one parameter combination with the default slider ranges
6. The figure-8 shape is visible: departure y-values have opposite sign from return y-values in the co-rotating frame
7. Sweeping flyby altitude from 5,000 to 15,000 km should sweep the return perigee from "too steep" through "hits" to "too shallow"

## Parameter Ranges (confirmed by numerical sweep)

These should stay as-is once the flyby is fixed:
- Newton's Cannon: 6,000–12,000 m/s, step 50, default 7784
- Transfer Orbits: 0–3,500 m/s, step 10, default 0  
- Free Return flyby: 5,000–15,000 km, step 100, default 6,500 (Artemis II nominal)
- Free Return injection Δv: 3,100–3,220 m/s, step 1, default 3,133

The targeting loop should make the default (6,500 km at Δv=3,133) produce a near-valid free return.
