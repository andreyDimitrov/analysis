import { Node, Member, Support, Load, AnalysisResult } from '../types';
import * as math from 'mathjs';

export class StructuralSolver {
    nodes: Node[];
    members: Member[];
    supports: Support[];
    loads: Load[];
    dofMap: Map<string, number>; // Map "nodeId-dof" to global index
    totalDOF: number;

    constructor(nodes: Node[], members: Member[], supports: Support[], loads: Load[]) {
        this.nodes = nodes;
        this.members = members;
        this.supports = supports;
        this.loads = loads;
        this.dofMap = new Map();
        this.totalDOF = 0;
        this.initializeDOF();
    }

    private initializeDOF() {
        this.nodes.forEach((node, index) => {
            this.dofMap.set(`${node.id}-x`, index * 3);
            this.dofMap.set(`${node.id}-y`, index * 3 + 1);
            this.dofMap.set(`${node.id}-r`, index * 3 + 2);
        });
        this.totalDOF = this.nodes.length * 3;
    }

    solve(): AnalysisResult {
        if (this.nodes.length === 0) return { nodeDisplacements: {}, memberForces: {}, diagrams: {} };

        // 1. Assemble Global Stiffness Matrix (K)
        const K = math.zeros(this.totalDOF, this.totalDOF, 'sparse') as math.Matrix;

        this.members.forEach(member => {
            const startNode = this.nodes.find(n => n.id === member.startNodeId)!;
            const endNode = this.nodes.find(n => n.id === member.endNodeId)!;

            const k_global = this.getMemberGlobalStiffnessMatrix(member, startNode, endNode);

            const dofIndices = [
                this.dofMap.get(`${startNode.id}-x`)!,
                this.dofMap.get(`${startNode.id}-y`)!,
                this.dofMap.get(`${startNode.id}-r`)!,
                this.dofMap.get(`${endNode.id}-x`)!,
                this.dofMap.get(`${endNode.id}-y`)!,
                this.dofMap.get(`${endNode.id}-r`)!
            ];

            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < 6; j++) {
                    const val = k_global.get([i, j]);
                    const row = dofIndices[i];
                    const col = dofIndices[j];
                    const current = K.get([row, col]);
                    K.set([row, col], current + val);
                }
            }
        });

        // 2. Assemble Load Vector (F)
        const F = math.zeros(this.totalDOF, 1) as math.Matrix;

        this.loads.forEach(load => {
            const member = this.members.find(m => m.id === load.memberId)!;
            const startNode = this.nodes.find(n => n.id === member.startNodeId)!;
            const endNode = this.nodes.find(n => n.id === member.endNodeId)!;

            const fef_global = this.getGlobalFixedEndForces(member, load, startNode, endNode);

            const dofIndices = [
                this.dofMap.get(`${startNode.id}-x`)!,
                this.dofMap.get(`${startNode.id}-y`)!,
                this.dofMap.get(`${startNode.id}-r`)!,
                this.dofMap.get(`${endNode.id}-x`)!,
                this.dofMap.get(`${endNode.id}-y`)!,
                this.dofMap.get(`${endNode.id}-r`)!
            ];

            for (let i = 0; i < 6; i++) {
                const row = dofIndices[i];
                const current = F.get([row, 0]);
                // Add equivalent nodal loads = -FEF
                F.set([row, 0], current - fef_global[i]);
            }
        });

        // 3. Apply Boundary Conditions
        const freeDOFs: number[] = [];
        const constrainedDOFs: number[] = [];

        // Initialize all as free
        for (let i = 0; i < this.totalDOF; i++) freeDOFs.push(i);

        this.supports.forEach(support => {
            const xDOF = this.dofMap.get(`${support.nodeId}-x`)!;
            const yDOF = this.dofMap.get(`${support.nodeId}-y`)!;
            const rDOF = this.dofMap.get(`${support.nodeId}-r`)!;

            if (support.type === 'pin') {
                constrainedDOFs.push(xDOF, yDOF);
            } else if (support.type === 'fixed') {
                constrainedDOFs.push(xDOF, yDOF, rDOF);
            } else if (support.type === 'roller') {
                // Assume horizontal roller (constrain Y)
                // Ideally we use support.angle to determine direction.
                // For angle=0 (horizontal surface), constrain Y.
                constrainedDOFs.push(yDOF);
            }
        });

        // Remove constrained from free
        const finalFreeDOFs = freeDOFs.filter(dof => !constrainedDOFs.includes(dof));

        // Stabilize K for unconnected DOFs (e.g., rotations in a truss/pinned system)
        // If a diagonal element is zero (or very small), add a small stiffness to prevent singularity.
        for (let i = 0; i < this.totalDOF; i++) {
            if (Math.abs(K.get([i, i])) < 1e-9) {
                K.set([i, i], 1.0); // Small dummy stiffness
            }
        }

        // 4. Solve for Displacements
        let d_global = math.zeros(this.totalDOF, 1) as math.Matrix;

        if (finalFreeDOFs.length > 0) {
            const K_ff = math.subset(K, math.index(finalFreeDOFs, finalFreeDOFs));
            const F_f = math.subset(F, math.index(finalFreeDOFs, 0));

            try {
                // Using inv() for simplicity. For larger systems, use lusolve.
                // mathjs inv works on dense matrices mostly, let's ensure it handles it or convert if needed.
                // K_ff is likely sparse, but mathjs might handle it.
                const K_ff_inv = math.inv(K_ff);
                const d_f = math.multiply(K_ff_inv, F_f);

                finalFreeDOFs.forEach((dof, i) => {
                    d_global.set([dof, 0], (d_f as math.Matrix).get([i, 0]));
                });

            } catch (error) {
                console.error("Solver error", error);
                throw new Error("Structure is unstable or singular matrix.");
            }
        }

        return this.calculateResults(d_global);
    }

    private getMemberGlobalStiffnessMatrix(member: Member, startNode: Node, endNode: Node): math.Matrix {
        if (!startNode || !endNode) {
            throw new Error(`Invalid member ${member.id}: Missing node(s). Start: ${member.startNodeId}, End: ${member.endNodeId}`);
        }
        const E = member.properties.E;
        const I = member.properties.I;
        const A = member.properties.A;
        const dx = endNode.x - startNode.x;
        const dy = endNode.y - startNode.y;
        const L = Math.sqrt(dx * dx + dy * dy);
        if (L === 0) {
            throw new Error(`Invalid member ${member.id}: Length is zero.`);
        }
        const c = dx / L;
        const s = dy / L;

        const w1 = (E * A) / L;
        const w2 = (12 * E * I) / Math.pow(L, 3);
        const w3 = (6 * E * I) / Math.pow(L, 2);
        const w4 = (4 * E * I) / L;
        const w5 = (2 * E * I) / L;

        let k_local_vals = [
            [w1, 0, 0, -w1, 0, 0],
            [0, w2, w3, 0, -w2, w3],
            [0, w3, w4, 0, -w3, w5],
            [-w1, 0, 0, w1, 0, 0],
            [0, -w2, -w3, 0, w2, -w3],
            [0, w3, w5, 0, -w3, w4]
        ];

        // Handle releases
        if (member.startRelease === 'pinned' && member.endRelease === 'fixed') {
            const w4_mod = (3 * E * I) / L;
            const w3_mod = (3 * E * I) / Math.pow(L, 2);
            const w2_mod = (3 * E * I) / Math.pow(L, 3);
            k_local_vals = [
                [w1, 0, 0, -w1, 0, 0],
                [0, w2_mod, 0, 0, -w2_mod, w3_mod],
                [0, 0, 0, 0, 0, 0],
                [-w1, 0, 0, w1, 0, 0],
                [0, -w2_mod, 0, 0, w2_mod, -w3_mod],
                [0, w3_mod, 0, 0, -w3_mod, w4_mod]
            ];
        } else if (member.startRelease === 'fixed' && member.endRelease === 'pinned') {
            const w4_mod = (3 * E * I) / L;
            const w3_mod = (3 * E * I) / Math.pow(L, 2);
            const w2_mod = (3 * E * I) / Math.pow(L, 3);
            k_local_vals = [
                [w1, 0, 0, -w1, 0, 0],
                [0, w2_mod, w3_mod, 0, -w2_mod, 0],
                [0, w3_mod, w4_mod, 0, -w3_mod, 0],
                [-w1, 0, 0, w1, 0, 0],
                [0, -w2_mod, -w3_mod, 0, w2_mod, 0],
                [0, 0, 0, 0, 0, 0]
            ];
        } else if (member.startRelease === 'pinned' && member.endRelease === 'pinned') {
            // Truss-like behavior for bending (zero stiffness), but axial remains
            k_local_vals = [
                [w1, 0, 0, -w1, 0, 0],
                [0, 0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0, 0],
                [-w1, 0, 0, w1, 0, 0],
                [0, 0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0, 0]
            ];
        }

        const k_local = math.matrix(k_local_vals);

        const T = math.matrix([
            [c, s, 0, 0, 0, 0],
            [-s, c, 0, 0, 0, 0],
            [0, 0, 1, 0, 0, 0],
            [0, 0, 0, c, s, 0],
            [0, 0, 0, -s, c, 0],
            [0, 0, 0, 0, 0, 1]
        ]);

        return math.multiply(math.multiply(math.transpose(T), k_local), T) as math.Matrix;
    }
    private calculateLocalFixedEndForces(member: Member, load: Load, startNode: Node, endNode: Node): number[] {
        if (!startNode || !endNode) {
            throw new Error(`Invalid member ${member.id}: Missing node(s).`);
        }
        const dx = endNode.x - startNode.x;
        const dy = endNode.y - startNode.y;
        const L = Math.sqrt(dx * dx + dy * dy);
        const P = load.magnitude;
        const a = load.position;
        const b = L - a;

        // 1. Fixed-Fixed Values (Standard Formulas)
        // Standard formulas give Reactions (Up for Down Load).
        // But usually written as: R = P... (assuming P is load magnitude).
        // Here P is signed (-10).
        // We want Reaction Up (+).
        // So we need -P...

        const V_start_fixed = -(P * b * b * (3 * a + b)) / (L * L * L);
        const M_start_fixed = -(P * a * b * b) / (L * L);
        const V_end_fixed = -(P * a * a * (a + 3 * b)) / (L * L * L);
        const M_end_fixed = (P * a * a * b) / (L * L); // Note: Original was -(P...), so -( - ) = +

        let fy_start = V_start_fixed;
        let m_start = M_start_fixed;
        let fy_end = V_end_fixed;
        let m_end = M_end_fixed;

        // 2. Adjust for Releases
        if (member.startRelease === 'pinned' && member.endRelease === 'pinned') {
            // Simply Supported
            // Reactions: R_A = P*b/L.
            // If P=-10, R_A should be +5.
            // So -(P*b)/L.
            fy_start = -(P * b) / L;
            fy_end = -(P * a) / L;
            m_start = 0;
            m_end = 0;
        } else if (member.startRelease === 'pinned') {
            // Propped Cantilever (Pin at Start)
            // Release M_start.
            const M_rel = -m_start;
            const M_carry = 0.5 * M_rel;
            const V_change_FEF = (1.5 * M_rel) / L;

            fy_start += V_change_FEF;
            m_start = 0;
            fy_end -= V_change_FEF;
            m_end += M_carry;

        } else if (member.endRelease === 'pinned') {
            // Propped Cantilever (Pin at End)
            // Release M_end.
            const M_rel = -m_end;
            const M_carry = 0.5 * M_rel;
            const V_change_FEF = (1.5 * M_rel) / L;

            fy_start += V_change_FEF;
            m_start += M_carry;
            fy_end -= V_change_FEF;
            m_end = 0;
        }

        return [0, fy_start, m_start, 0, fy_end, m_end];
    }

    private getGlobalFixedEndForces(member: Member, load: Load, startNode: Node, endNode: Node): number[] {
        const dx = endNode.x - startNode.x;
        const dy = endNode.y - startNode.y;
        const L = Math.sqrt(dx * dx + dy * dy);
        const theta = Math.atan2(dy, dx);
        const c = Math.cos(theta);
        const s = Math.sin(theta);

        const [fx1, fy1, m1, fx2, fy2, m2] = this.calculateLocalFixedEndForces(member, load, startNode, endNode);

        const f_local = math.matrix([[fx1], [fy1], [m1], [fx2], [fy2], [m2]]);

        const T = math.matrix([
            [c, s, 0, 0, 0, 0],
            [-s, c, 0, 0, 0, 0],
            [0, 0, 1, 0, 0, 0],
            [0, 0, 0, c, s, 0],
            [0, 0, 0, -s, c, 0],
            [0, 0, 0, 0, 0, 1]
        ]);

        const f_global = math.multiply(math.transpose(T), f_local) as math.Matrix;
        return f_global.toArray().flat() as number[];
    }

    private calculateResults(d_global: math.Matrix): AnalysisResult {
        const nodeDisplacements: Record<string, { dx: number; dy: number; rotation: number }> = {};
        const memberForces: Record<string, any> = {};
        const diagrams: Record<string, any> = {};
        const reactions: Record<string, { Fx: number; Fy: number; Mz: number }> = {};

        this.nodes.forEach((node, i) => {
            nodeDisplacements[node.id] = {
                dx: d_global.get([i * 3, 0]),
                dy: d_global.get([i * 3 + 1, 0]),
                rotation: d_global.get([i * 3 + 2, 0])
            };
        });

        // Calculate Member Forces and Diagrams
        this.members.forEach(member => {
            const startNode = this.nodes.find(n => n.id === member.startNodeId)!;
            const endNode = this.nodes.find(n => n.id === member.endNodeId)!;

            const startIdx = this.dofMap.get(`${startNode.id}-x`)!;
            const endIdx = this.dofMap.get(`${endNode.id}-x`)!;

            const d_member_global = math.matrix([
                [d_global.get([startIdx, 0])],
                [d_global.get([startIdx + 1, 0])],
                [d_global.get([startIdx + 2, 0])],
                [d_global.get([endIdx, 0])],
                [d_global.get([endIdx + 1, 0])],
                [d_global.get([endIdx + 2, 0])]
            ]);

            const dx = endNode.x - startNode.x;
            const dy = endNode.y - startNode.y;
            const L = Math.sqrt(dx * dx + dy * dy);
            const c = dx / L;
            const s = dy / L;

            const T = math.matrix([
                [c, s, 0, 0, 0, 0],
                [-s, c, 0, 0, 0, 0],
                [0, 0, 1, 0, 0, 0],
                [0, 0, 0, c, s, 0],
                [0, 0, 0, -s, c, 0],
                [0, 0, 0, 0, 0, 1]
            ]);

            const d_member_local = math.multiply(T, d_member_global) as math.Matrix;

            // Reconstruct k_local (simplified for brevity, assuming standard or released)
            // Ideally this should be refactored to a helper method to avoid duplication
            // For now, we will use the getMemberGlobalStiffnessMatrix method to get K_global
            // and then calculate f_global = K_global * d_global + f_fixed_global

            // Calculate Global Fixed End Forces
            let f_fixed_global = math.zeros(6, 1) as math.Matrix;
            this.loads.filter(l => l.memberId === member.id).forEach(l => {
                const fef = this.getGlobalFixedEndForces(member, l, startNode, endNode);
                f_fixed_global = math.add(f_fixed_global, math.matrix(fef.map(v => [v]))) as math.Matrix;
            });

            const k_global = this.getMemberGlobalStiffnessMatrix(member, startNode, endNode);
            const f_global = math.add(math.multiply(k_global, d_member_global), f_fixed_global) as math.Matrix;

            // Transform global forces to local for memberForces and diagrams
            // f_local = T * f_global
            const f_local = math.multiply(T, f_global) as math.Matrix;

            memberForces[member.id] = {
                axial: f_local.get([0, 0]),
                shearStart: f_local.get([1, 0]),
                momentStart: f_local.get([2, 0]),
                shearEnd: -f_local.get([4, 0]),
                momentEnd: -f_local.get([5, 0])
            };

            // ... Diagram Calculation (Same as before) ...
            // (We need to preserve the diagram logic. Since I'm replacing the whole method, I must include it.)

            const numPoints = 50;
            const xVals: number[] = [];
            const shearVals: number[] = [];
            const momentVals: number[] = [];
            const dispVals: number[] = [];

            const u1 = d_member_local.get([0, 0]);
            const v1 = d_member_local.get([1, 0]);
            const th1 = d_member_local.get([2, 0]);
            const v2 = d_member_local.get([4, 0]);

            let evaluationPoints = new Set<number>();
            for (let i = 0; i <= numPoints; i++) evaluationPoints.add((i / numPoints) * L);
            this.loads.filter(l => l.memberId === member.id).forEach(l => {
                if (l.position >= 0 && l.position <= L) evaluationPoints.add(l.position);
            });
            const sortedPoints = Array.from(evaluationPoints).sort((a, b) => a - b);

            let theta_start = th1;
            if (member.startRelease === 'pinned') {
                const x_L = L;
                const M_start_for_calc = -f_local.get([2, 0]);
                const V_start_for_calc = f_local.get([1, 0]);
                const term1_L = M_start_for_calc * x_L * x_L / 2;
                const term2_L = V_start_for_calc * x_L * x_L * x_L / 6;
                let loadTerms_L = 0;
                this.loads.filter(l => l.memberId === member.id).forEach(load => {
                    const a = load.position;
                    const P = load.magnitude;
                    const theta = Math.atan2(dy, dx);
                    const Py_local = P * Math.cos(theta);
                    if (x_L > a) loadTerms_L += (Py_local / 6) * Math.pow(x_L - a, 3);
                });
                const E = member.properties.E;
                const I = member.properties.I;
                const v_bending_L = (1 / (E * I)) * (term1_L + term2_L + loadTerms_L);
                theta_start = (v2 - v1 - v_bending_L) / L;
            }

            for (const x of sortedPoints) {
                xVals.push(x);
                let V_start = f_local.get([1, 0]);
                let M_start = -f_local.get([2, 0]);
                let V = V_start;
                let M = M_start + V_start * x;
                let term1 = M_start * x * x / 2;
                let term2 = V_start * x * x * x / 6;
                let loadTerms = 0;

                this.loads.filter(l => l.memberId === member.id).forEach(load => {
                    const a = load.position;
                    const P = load.magnitude;
                    const theta = Math.atan2(dy, dx);
                    const Py_local = P * Math.cos(theta);
                    if (x > a) {
                        V += Py_local;
                        M += Py_local * (x - a);
                        loadTerms += (Py_local / 6) * Math.pow(x - a, 3);
                    }
                });

                const E = member.properties.E;
                const I = member.properties.I;
                const v_def = (1 / (E * I)) * (term1 + term2 + loadTerms) + theta_start * x + v1;

                shearVals.push(V);
                momentVals.push(M);
                dispVals.push(v_def);
            }

            diagrams[member.id] = { x: xVals, shear: shearVals, moment: momentVals, displacement: dispVals };
        });

        // Calculate Reactions
        this.supports.forEach(support => {
            const node = this.nodes.find(n => n.id === support.nodeId);
            if (!node) return;

            let Rx = 0;
            let Ry = 0;
            let Mz = 0;

            // Sum forces from connected members acting ON the node
            // Force exerted by member on node is -f_end (if we consider f as force on member)
            // Actually, f_global contains [fx_start, fy_start, m_start, fx_end, fy_end, m_end]
            // These are forces acting ON the member ends.
            // By Newton's 3rd law, force on node is -Force on member.
            // So Reaction + ExternalLoad + (-ForceOnMember) = 0
            // Reaction = ForceOnMember - ExternalLoad
            // (Assuming ExternalLoad is also on node, but we handle member loads via FEF)

            const connectedMembers = this.members.filter(m => m.startNodeId === node.id || m.endNodeId === node.id);

            connectedMembers.forEach(member => {
                const startNode = this.nodes.find(n => n.id === member.startNodeId)!;
                const endNode = this.nodes.find(n => n.id === member.endNodeId)!;

                // Recalculate f_global (or we could have stored it)
                // For robustness, let's recalculate quickly
                const startIdx = this.dofMap.get(`${startNode.id}-x`)!;
                const endIdx = this.dofMap.get(`${endNode.id}-x`)!;
                const d_member_global = math.matrix([
                    [d_global.get([startIdx, 0])],
                    [d_global.get([startIdx + 1, 0])],
                    [d_global.get([startIdx + 2, 0])],
                    [d_global.get([endIdx, 0])],
                    [d_global.get([endIdx + 1, 0])],
                    [d_global.get([endIdx + 2, 0])]
                ]);

                let f_fixed_global = math.zeros(6, 1) as math.Matrix;
                this.loads.filter(l => l.memberId === member.id).forEach(l => {
                    const fef = this.getGlobalFixedEndForces(member, l, startNode, endNode);
                    f_fixed_global = math.add(f_fixed_global, math.matrix(fef.map(v => [v]))) as math.Matrix;
                });

                const k_global = this.getMemberGlobalStiffnessMatrix(member, startNode, endNode);
                const f_global = math.add(math.multiply(k_global, d_member_global), f_fixed_global) as math.Matrix;

                if (member.startNodeId === node.id) {
                    Rx += f_global.get([0, 0]);
                    Ry += f_global.get([1, 0]);
                    Mz += f_global.get([2, 0]);
                } else {
                    Rx += f_global.get([3, 0]);
                    Ry += f_global.get([4, 0]);
                    Mz += f_global.get([5, 0]);
                }
            });

            // Subtract Nodal Loads (if any) - currently none implemented but good for completeness
            // Rx -= LoadX...

            reactions[node.id] = { Fx: Rx, Fy: Ry, Mz: Mz };
        });

        return { nodeDisplacements, memberForces, diagrams, reactions };
    }
}
