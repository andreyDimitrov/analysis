
import { StructuralSolver } from './lib/analysis/solver';
import { Node, Member, Support, Load } from './lib/types';

const nodes: Node[] = [
    { id: 'n1', x: 0, y: 0 },
    { id: 'n2', x: 10, y: 0 }
];
const members: Member[] = [
    {
        id: 'm1', startNodeId: 'n1', endNodeId: 'n2',
        startRelease: 'fixed', endRelease: 'fixed',
        properties: { E: 200e9, I: 1e-4, A: 0.01 }
    }
];
const supports: Support[] = [
    { id: 's1', nodeId: 'n1', type: 'pin', angle: 0 },
    { id: 's2', nodeId: 'n2', type: 'roller', angle: 0 }
];
const loads: Load[] = [
    { id: 'l1', memberId: 'm1', type: 'point', magnitude: -10, position: 5 }
];

const solver = new StructuralSolver(nodes, members, supports, loads);
const result = solver.solve();

const m1 = 'm1';
const diag = result.diagrams[m1];
const disp = diag.displacement;
const x = diag.x;

console.log("Start Deflection:", disp[0]);
console.log("End Deflection:", disp[disp.length - 1]);
console.log("Mid Deflection:", disp.find((_, i) => x[i] === 5));

// Access internal solver state if possible, or infer from results
// We can't access private members easily.
// But we can check the memberForces to see V_start, M_start.
console.log("Member Forces:", result.memberForces[m1]);
console.log("Node Displacements:", result.nodeDisplacements);
