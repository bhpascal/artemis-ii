# Live Artemis II Data Sources

## Status: Research — not yet integrated

Three sources of real telemetry and ephemeris data identified 2026-04-05 (mission day T+4).

---

## 1. NASA AROW OEM Files

**What:** Orbital Ephemeris Message files with actual spacecraft state vectors (position + velocity) at 4-minute intervals.

**Format:** J2000 Earth-centered inertial frame. Standard CCSDS OEM format (text-based, easy to parse).

**Source:** https://nasa.gov/trackartemis — downloadable ephemeris files published by JSC Mission Control from Orion's onboard sensors.

**Use case:** Section 5 (Real Mission scrubber) — replace simulated trajectory with actual telemetry. Time-stamped at 4-min intervals, so interpolation for smooth scrubbing is trivial.

## 2. JPL Horizons API

**What:** Moon position (and any solar system body) in the same J2000 reference frame as the OEM data.

**Endpoint:** https://ssd.jpl.nasa.gov/horizons_batch.cgi

**Use case:** Need the Moon's actual position at each mission timestamp to:
- Compute Earth-Moon-Orion geometry for the visualization
- Transform J2000 inertial positions into the co-rotating frame (for the figure-8 view)
- The CR3BP uses a circular Moon orbit approximation; real Moon position would be more accurate for Section 5

**Query params:** TBD — need to construct the right batch query for Moon state vectors over the mission window (April 1–10, 2026).

## 3. AROW Community API

**What:** REST API referenced by community tracker at artemis-tracker.netlify.app.

**Status:** Needs investigation — may provide a simpler endpoint for current/recent spacecraft state without downloading full OEM files.

**Use case:** Hook section (live current position) if the API supports real-time queries.

---

## Architecture: Three Layers

The ephemeris data complements (not replaces) the numerical integrator. Real state vectors serve as initial conditions for the CR3BP, and the divergence between simulation and reality is itself a teaching tool.

| Layer | Source | Sections | Purpose |
|-------|--------|----------|---------|
| Interactive CR3BP | Our integrator, synthetic ICs | 2–4 | Reader explores parameter space |
| Validated CR3BP | Our integrator, real ICs from OEM at TLI | 4 (Level 5) | "How good is our model?" |
| Real telemetry | OEM + Horizons | 5, Hook | Actual mission replay |

### Layer 1: Interactive CR3BP (existing)
Sections 2–4 keep the CR3BP simulation with synthetic initial conditions. These are about exploring parameter space, not showing real data.

### Layer 2: Validated CR3BP (Level 5 comparison)
Seed the CR3BP integrator with Orion's actual state vector at TLI (from OEM data). Propagate forward and overlay the real OEM trajectory on top. The divergence between the two IS the lesson:

- **Outbound leg:** CR3BP and reality match closely (two-body + Moon gravity dominates)
- **Lunar flyby:** Curves start diverging (Sun's gravity, lunar orbit eccentricity matter)
- **Return leg:** Further divergence (accumulated perturbations, J2 Earth oblateness)

This gives Level 5 readers a concrete, visual answer to "when does this approximation break down?" — exactly what a B.S. Physics audience wants.

### Layer 3: Real telemetry (Section 5 + Hook)
Replace `trajectory.ts` simulation with OEM data + Horizons Moon positions. The reader scrubs through the actual mission. Hook section shows live position.

## Decision: Use AROW API for Mission Sections

Sections 1 (Hook) and 5 (Real Mission) should pull directly from the AROW API / OEM files rather than computing trajectories. There's no reason to simulate what we can observe. The CR3BP stays for Sections 2-4 (interactive exploration) where the reader changes parameters.

## Technical Notes

- **Frame conversion:** OEM is J2000 (inertial). Co-rotating frame visualization requires rotating each point by the Moon's angular position at that timestamp. JPL Horizons provides the Moon position needed for this rotation.
- **Seeding the integrator:** Transform the OEM state at TLI from J2000 to co-rotating frame: one rotation matrix applied to both position and velocity, plus the frame velocity correction (ω × r).
- **Build-time vs runtime:** OEM files could be fetched at build time and bundled as JSON, or fetched at runtime. Build-time is simpler and works offline.
- **Validation metric:** At Level 5, show the position error (km) between CR3BP prediction and real trajectory as a function of mission elapsed time. This quantifies the approximation quality.
