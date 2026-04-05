/**
 * Test that the trajectory-solver + trajectory-renderer pipeline
 * produces a figure-8 shape in the co-rotating frame.
 */

// We need to import from the actual source files. Use dynamic import.
// Since these are TS files with imports, we'll just duplicate the core logic.

import { solve } from '../src/physics/trajectory-solver'
import { renderTrajectory } from '../src/physics/trajectory-renderer'

const result = solve(7788.5 + 3170, 11000e3)

console.log('=== Solver Result ===')
console.log(`Success: ${result.success}`)
console.log(`Error: ${result.error ?? 'none'}`)
if (!result.success) process.exit(1)

console.log(`Moon angle: ${(result.moonAngle * 180 / Math.PI).toFixed(1)}°`)
console.log(`Turn angle: ${(result.turnAngle * 180 / Math.PI).toFixed(1)}°`)
console.log(`Turn sign: ${result.turnSign}`)
console.log(`Return perigee alt: ${(result.returnPerigeeAlt / 1000).toFixed(0)} km`)
console.log(`Hits Earth: ${result.hitsEarth}`)

// Render in co-rotating frame
const corot = renderTrajectory(result, 'corotating', 50)!
const inert = renderTrajectory(result, 'inertial', 50)!

console.log(`\n=== Co-rotating frame ===`)
console.log(`Departure: ${corot.departurePts.length} pts`)
console.log(`Flyby: ${corot.flybyPts.length} pts`)
console.log(`Return: ${corot.returnPts.length} pts`)
console.log(`Moon: (${(corot.moonPos.x / 1e6).toFixed(1)}, ${(corot.moonPos.y / 1e6).toFixed(1)}) Mm`)

// Check figure-8: departure should be on one side, return on the other
const depYs = corot.departurePts.map(p => p.y)
const retYs = corot.returnPts.map(p => p.y)
const depAvgY = depYs.reduce((a, b) => a + b, 0) / depYs.length
const retAvgY = retYs.reduce((a, b) => a + b, 0) / retYs.length

console.log(`\nDeparture avg Y: ${(depAvgY / 1e6).toFixed(1)} Mm (${depAvgY > 0 ? 'ABOVE' : 'BELOW'})`)
console.log(`Return avg Y: ${(retAvgY / 1e6).toFixed(1)} Mm (${retAvgY > 0 ? 'ABOVE' : 'BELOW'})`)
console.log(`\n${Math.sign(depAvgY) !== Math.sign(retAvgY) ? 'FIGURE-8 ✓ — departure and return on opposite sides' : 'NOT A FIGURE-8 ✗ — same side'}`)

// Print some key points
console.log('\nDeparture first 5:')
corot.departurePts.slice(0, 5).forEach(p => console.log(`  (${(p.x/1e6).toFixed(1)}, ${(p.y/1e6).toFixed(1)})`))
console.log('Departure last 5:')
corot.departurePts.slice(-5).forEach(p => console.log(`  (${(p.x/1e6).toFixed(1)}, ${(p.y/1e6).toFixed(1)})`))
console.log('Return first 5:')
corot.returnPts.slice(0, 5).forEach(p => console.log(`  (${(p.x/1e6).toFixed(1)}, ${(p.y/1e6).toFixed(1)})`))
console.log('Return last 5:')
corot.returnPts.slice(-5).forEach(p => console.log(`  (${(p.x/1e6).toFixed(1)}, ${(p.y/1e6).toFixed(1)})`))
