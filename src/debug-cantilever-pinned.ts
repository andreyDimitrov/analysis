
import { StructuralSolver } from './lib/analysis/solver';
import { Node, Member, Support, Load } from './lib/types';

const nodes: Node[] = [
    { id: 'n1', x: 0, y: 0 },
    { id: 'n2', x: 10, y: 0 }
];
const members: Member[] = [
    {
        id: 'm1', startNodeId: 'n1', endNodeId: 'n2',
        startRelease: 'pinned', endRelease: 'pinned', // User default
        properties: { E: 200e9, I: 1e-4, A: 0.01 }
    }
];
const supports: Support[] = [
    { id: 's1', nodeId: 'n1', type: 'fixed', angle: 0 }
];
const loads: Load[] = [
    { id: 'l1', memberId: 'm1', type: 'point', magnitude: -10, position: 10 }
];

const solver = new StructuralSolver(nodes, members, supports, loads);
try {
    const result = solver.solve();
    console.log("Pinned Cantilever Results:");
    console.log("Max Moment:", Math.max(...result.diagrams['m1'].moment.map(Math.abs)));
    console.log("End Deflection:", result.diagrams['m1'].displacement[result.diagrams['m1'].displacement.length - 1]);
} catch (e) {
    console.log("Solver failed as expected:", e.message);
}
