
import { StructuralSolver } from './lib/analysis/solver';
import { Node, Member, Support, Load } from './lib/types';

const nodes: Node[] = [
    { id: 'n1', x: 0, y: 0 },
    { id: 'n2', x: 10, y: 0 }
];
const members: Member[] = [
    {
        id: 'm1', startNodeId: 'n1', endNodeId: 'n2',
        startRelease: 'fixed', endRelease: 'fixed', // Cantilever is Fixed-Free, but member is usually Fixed-Fixed internally? 
        // No, for Fixed-Free, the support at n1 is Fixed, n2 is Free.
        // Member releases: If n1 is fixed support, member start is usually fixed to node.
        // If n2 is free, member end is fixed to node (but node is free).
        // Wait, "Fixed-Free" usually means Support Fixed at A, No Support at B.
        // Member releases should be Fixed-Fixed (rigidly connected to nodes).
        properties: { E: 200e9, I: 1e-4, A: 0.01 }
    }
];
const supports: Support[] = [
    { id: 's1', nodeId: 'n1', type: 'fixed', angle: 0 }
];
const loads: Load[] = [
    { id: 'l1', memberId: 'm1', type: 'point', magnitude: -10, position: 10 } // Load at end
];

const solver = new StructuralSolver(nodes, members, supports, loads);
const result = solver.solve();

const m1 = 'm1';
const diag = result.diagrams[m1];
const disp = diag.displacement;
const moment = diag.moment;
const x = diag.x;

console.log("Cantilever Results:");
console.log("Max Moment:", Math.max(...moment.map(Math.abs)));
console.log("Start Moment:", moment[0]);
console.log("End Moment:", moment[moment.length - 1]);
console.log("End Deflection:", disp[disp.length - 1]);

// Check sign convention
// Load -10 at end (x=10).
// Reaction at A: Fy = 10 (Up). M = 10*10 = 100 (CCW).
// Internal Moment M(x):
// Cut at x. Left side: Reaction 10 Up, Moment 100 CCW.
// Sum M_cut = 0 => M_cut + 100 - 10*x = 0 => M_cut = 10*x - 100.
// At x=0, M=-100 (Hogging). At x=10, M=0.
// Deflection: EI v'' = 10x - 100.
// EI v' = 5x^2 - 100x + C1. v'(0)=0 -> C1=0.
// EI v = 5/3 x^3 - 50x^2 + C2. v(0)=0 -> C2=0.
// v(10) = (1/EI) * (5000/3 - 5000) = (1/EI) * (-10000/3).
// Negative deflection (Down).

console.log("Expected End Deflection:", (-10 * Math.pow(10, 3)) / (3 * 200e9 * 1e-4));
