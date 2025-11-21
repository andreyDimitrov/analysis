'use client';

import React, { useEffect, useState } from 'react';
import { StructuralSolver } from '@/lib/analysis/solver';
import { Node, Member, Support, Load, AnalysisResult } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

type TestCase = {
    name: string;
    setup: () => { nodes: Node[], members: Member[], supports: Support[], loads: Load[] };
    expected: {
        maxMoment: number;
        maxDeflection: number; // Absolute value
        startShear: number;
        endShear: number;
        startMoment: number;
        endMoment: number;
        startDeflection: number;
        endDeflection: number;
    };
};

export default function TestSolverPage() {
    const [results, setResults] = useState<any[]>([]);

    useEffect(() => {
        const testCases: TestCase[] = [
            {
                name: "Simply Supported Beam (Center Load)",
                setup: () => {
                    const nodes = [
                        { id: 'n1', x: 0, y: 0 },
                        { id: 'n2', x: 10, y: 0 }
                    ];
                    const members = [
                        {
                            id: 'm1', startNodeId: 'n1', endNodeId: 'n2',
                            startRelease: 'fixed' as const, endRelease: 'fixed' as const,
                            properties: { E: 200e9, I: 1e-4, A: 0.01 }
                        }
                    ];
                    const supports = [
                        { id: 's1', nodeId: 'n1', type: 'pin' as const, angle: 0 },
                        { id: 's2', nodeId: 'n2', type: 'roller' as const, angle: 0 }
                    ];
                    const loads = [
                        { id: 'l1', memberId: 'm1', type: 'point' as const, magnitude: -10, position: 5 }
                    ];
                    return { nodes, members, supports, loads };
                },
                expected: {
                    maxMoment: 25, // PL/4 = 10*10/4 = 25
                    maxDeflection: (10 * Math.pow(10, 3)) / (48 * 200e9 * 1e-4), // PL^3 / 48EI
                    startShear: 5, // P/2 (Upwards reaction)
                    endShear: -5, // -P/2 (Downwards reaction relative to member end)
                    startMoment: 0,
                    endMoment: 0,
                    startDeflection: 0,
                    endDeflection: 0
                }
            },
            {
                name: "Cantilever (End Load)",
                setup: () => {
                    const nodes = [
                        { id: 'n1', x: 0, y: 0 },
                        { id: 'n2', x: 10, y: 0 }
                    ];
                    const members = [
                        {
                            id: 'm1', startNodeId: 'n1', endNodeId: 'n2',
                            startRelease: 'fixed' as const, endRelease: 'fixed' as const,
                            properties: { E: 200e9, I: 1e-4, A: 0.01 }
                        }
                    ];
                    const supports = [
                        { id: 's1', nodeId: 'n1', type: 'fixed' as const, angle: 0 }
                    ];
                    const loads = [
                        { id: 'l1', memberId: 'm1', type: 'point' as const, magnitude: -10, position: 10 } // Load at end (x=10)
                    ];
                    return { nodes, members, supports, loads };
                },
                expected: {
                    maxMoment: 100, // At support
                    maxDeflection: (10 * Math.pow(10, 3)) / (3 * 200e9 * 1e-4), // PL^3 / 3EI
                    startShear: 10,
                    endShear: 10, // Constant shear
                    startMoment: -100, // Hogging at support
                    endMoment: 0,
                    startDeflection: 0,
                    endDeflection: -(10 * Math.pow(10, 3)) / (3 * 200e9 * 1e-4) // Downwards
                }
            },
            {
                name: "Fixed-Fixed Beam (Center Load)",
                setup: () => {
                    const nodes = [
                        { id: 'n1', x: 0, y: 0 },
                        { id: 'n2', x: 10, y: 0 }
                    ];
                    const members = [
                        {
                            id: 'm1', startNodeId: 'n1', endNodeId: 'n2',
                            startRelease: 'fixed' as const, endRelease: 'fixed' as const,
                            properties: { E: 200e9, I: 1e-4, A: 0.01 }
                        }
                    ];
                    const supports = [
                        { id: 's1', nodeId: 'n1', type: 'fixed' as const, angle: 0 },
                        { id: 's2', nodeId: 'n2', type: 'fixed' as const, angle: 0 }
                    ];
                    const loads = [
                        { id: 'l1', memberId: 'm1', type: 'point' as const, magnitude: -10, position: 5 }
                    ];
                    return { nodes, members, supports, loads };
                },
                expected: {
                    maxMoment: 12.5, // PL/8
                    maxDeflection: (10 * Math.pow(10, 3)) / (192 * 200e9 * 1e-4), // PL^3 / 192EI
                    startShear: 5,
                    endShear: -5,
                    startMoment: -12.5, // Hogging
                    endMoment: -12.5, // Hogging
                    startDeflection: 0,
                    endDeflection: 0
                }
            },
            {
                name: "Propped Cantilever (Fixed-Roller, Center Load)",
                setup: () => {
                    const nodes = [
                        { id: 'n1', x: 0, y: 0 },
                        { id: 'n2', x: 10, y: 0 }
                    ];
                    const members = [
                        {
                            id: 'm1', startNodeId: 'n1', endNodeId: 'n2',
                            startRelease: 'fixed' as const, endRelease: 'fixed' as const,
                            properties: { E: 200e9, I: 1e-4, A: 0.01 }
                        }
                    ];
                    const supports = [
                        { id: 's1', nodeId: 'n1', type: 'fixed' as const, angle: 0 },
                        { id: 's2', nodeId: 'n2', type: 'roller' as const, angle: 0 }
                    ];
                    const loads = [
                        { id: 'l1', memberId: 'm1', type: 'point' as const, magnitude: -10, position: 5 }
                    ];
                    return { nodes, members, supports, loads };
                },
                expected: {
                    maxMoment: 18.75, // Max absolute moment (at support)
                    maxDeflection: (7 * 10 * Math.pow(10, 3)) / (768 * 200e9 * 1e-4), // 7PL^3 / 768EI (approx for center load)
                    startShear: 6.875,
                    endShear: -3.125,
                    startMoment: -18.75,
                    endMoment: 0,
                    startDeflection: 0,
                    endDeflection: 0
                }
            },
            {
                name: "Simply Supported (Asymmetric Load)",
                setup: () => {
                    const nodes = [
                        { id: 'n1', x: 0, y: 0 },
                        { id: 'n2', x: 10, y: 0 }
                    ];
                    const members = [
                        {
                            id: 'm1', startNodeId: 'n1', endNodeId: 'n2',
                            startRelease: 'fixed' as const, endRelease: 'fixed' as const,
                            properties: { E: 200e9, I: 1e-4, A: 0.01 }
                        }
                    ];
                    const supports = [
                        { id: 's1', nodeId: 'n1', type: 'pin' as const, angle: 0 },
                        { id: 's2', nodeId: 'n2', type: 'roller' as const, angle: 0 }
                    ];
                    const loads = [
                        { id: 'l1', memberId: 'm1', type: 'point' as const, magnitude: -10, position: 2.5 } // L/4
                    ];
                    return { nodes, members, supports, loads };
                },
                expected: {
                    maxMoment: 18.75,
                    maxDeflection: 0, // Ignore for now
                    startShear: 7.5,
                    endShear: -2.5,
                    startMoment: 0,
                    endMoment: 0,
                    startDeflection: 0,
                    endDeflection: 0
                }
            },
            {
                name: "Fixed-Fixed Beam with Central Hinge",
                setup: () => {
                    const nodes = [
                        { id: 'n1', x: 0, y: 0 },
                        { id: 'n2', x: 5, y: 0 },
                        { id: 'n3', x: 10, y: 0 }
                    ];
                    const members = [
                        {
                            id: 'm1', startNodeId: 'n1', endNodeId: 'n2',
                            startRelease: 'fixed' as const, endRelease: 'pinned' as const, // Hinge at n2
                            properties: { E: 200e9, I: 1e-4, A: 0.01 }
                        },
                        {
                            id: 'm2', startNodeId: 'n2', endNodeId: 'n3',
                            startRelease: 'pinned' as const, endRelease: 'fixed' as const, // Hinge at n2
                            properties: { E: 200e9, I: 1e-4, A: 0.01 }
                        }
                    ];
                    const supports = [
                        { id: 's1', nodeId: 'n1', type: 'fixed' as const, angle: 0 },
                        { id: 's3', nodeId: 'n3', type: 'fixed' as const, angle: 0 }
                    ];
                    const loads = [
                        { id: 'l1', memberId: 'm1', type: 'point' as const, magnitude: -10, position: 2.5 } // Middle of m1
                    ];
                    return { nodes, members, supports, loads };
                },
                expected: {
                    // Analytical Solution:
                    // Structure: Fixed A - Hinge B - Fixed C.
                    // Load P=-10 on A-B at midspan (L1=5).
                    // B acts as a spring support for A-B.
                    // Stiffness of B-C at B (Vertical) is K_B = 3EI/L2^3.
                    // L2 = 5. K_B = 3EI/125.
                    // Beam A-B is Propped Cantilever (Fixed A, Spring B).
                    // Deflection at B due to P: delta_B_P = (P*a^2)/(6EI)*(3L-a) ... No, standard formula for cantilever.
                    // Let's use force method. Redundant R_B (upward reaction from B-C on A-B).
                    // Deflection at B (downward) = Deflection due to P - Deflection due to R_B.
                    // Deflection due to P (Cantilever): P=10, a=2.5.
                    // delta_B1 = (P*a^2)/(6EI) * (3L - a) = (10 * 2.5^2)/(6EI) * (15 - 2.5) = (62.5/6EI) * 12.5 = 781.25 / 6EI.
                    // Deflection due to R_B (Cantilever tip load): (R_B * L^3) / 3EI = (R_B * 125) / 3EI.
                    // Net deflection delta_B = delta_B1 - delta_B_RB.
                    // Also, delta_B = Force / Stiffness of B-C = R_B / K_B = R_B / (3EI/125) = (R_B * 125) / 3EI.
                    // Wait, B-C is a cantilever fixed at C, loaded at B. Tip deflection = (R_B * L^3) / 3EI.
                    // So the spring stiffness is indeed 3EI/L^3.
                    // So (781.25 / 6EI) - (R_B * 125 / 3EI) = (R_B * 125 / 3EI).
                    // 781.25 / 6 = 2 * (R_B * 125 / 3) = R_B * 250 / 3.
                    // 130.208 = R_B * 83.33.
                    // R_B = (781.25 / 6) / (250 / 3) = (781.25 / 6) * (3 / 250) = 781.25 / 500 = 1.5625.

                    // So Reaction at B (Shear transfer) is 1.5625.
                    // Shear in m2 (constant) = -1.5625 (if R_B is force on A-B, then force on B-C is down).
                    // Wait, R_B is reaction UP on A-B. So force DOWN on B-C is 1.5625.
                    // So Shear in m2 = 1.5625 (Start shear).

                    // Analyze m1 (A-B):
                    // Fixed at A, Load 10 down at 2.5, Force 1.5625 Up at 5.
                    // Shear A = 10 - 1.5625 = 8.4375.
                    // Moment A (Hogging) = 10*2.5 - 1.5625*5 = 25 - 7.8125 = 17.1875.
                    // Moment under load (Sagging relative to chord? No, absolute).
                    // M(2.5) = -17.1875 + 8.4375*2.5 = -17.1875 + 21.09375 = 3.90625.

                    // Max Moment = 17.1875 (at A).

                    maxMoment: 17.1875,
                    maxDeflection: 0, // Not calculating exact max deflection here, just checking forces
                    startShear: 8.4375,
                    endShear: -1.5625, // Shear at end of m2 (constant). Downward force on B-C -> Negative Shear.
                    startMoment: -17.1875,
                    endMoment: -7.8125, // Moment at C (Fixed end of m2). M = P*L = 1.5625 * 5 = 7.8125. Hogging -> -7.8125.
                    startDeflection: 0,
                    endDeflection: 0
                }
            }
        ];

        const runTests = () => {
            try {
                const testResults = testCases.map(test => {
                    try {
                        const { nodes, members, supports, loads } = test.setup();
                        const solver = new StructuralSolver(nodes, members, supports, loads);
                        const result = solver.solve();

                        const m1 = members[0].id;
                        const mLast = members[members.length - 1].id;

                        const momentDiag = result.diagrams[m1]?.moment || [];
                        const shearDiag = result.diagrams[m1]?.shear || [];
                        const dispDiag = result.diagrams[m1]?.displacement || [];

                        // For multi-member, we might need to check different members.
                        // Simplified: Check max of ALL members.
                        let maxMoment = 0;
                        let maxDeflection = 0;

                        members.forEach(m => {
                            const mDiag = result.diagrams[m.id];
                            if (mDiag) {
                                const mMaxMoment = Math.max(...mDiag.moment.map(Math.abs));
                                const mMaxDef = Math.max(...mDiag.displacement.map(Math.abs));
                                if (mMaxMoment > maxMoment) maxMoment = mMaxMoment;
                                if (mMaxDef > maxDeflection) maxDeflection = mMaxDef;
                            }
                        });

                        const startShear = shearDiag.length > 0 ? shearDiag[0] : 0;
                        const startMoment = momentDiag.length > 0 ? momentDiag[0] : 0;
                        const startDeflection = dispDiag.length > 0 ? dispDiag[0] : 0;

                        // End values from the LAST member
                        const shearDiagLast = result.diagrams[mLast]?.shear || [];
                        const momentDiagLast = result.diagrams[mLast]?.moment || [];
                        const dispDiagLast = result.diagrams[mLast]?.displacement || [];

                        const endShear = shearDiagLast.length > 0 ? shearDiagLast[shearDiagLast.length - 1] : 0;
                        const endMoment = momentDiagLast.length > 0 ? momentDiagLast[momentDiagLast.length - 1] : 0;
                        const endDeflection = dispDiagLast.length > 0 ? dispDiagLast[dispDiagLast.length - 1] : 0;

                        const check = (actual: number, expected: number, tol = 0.1) => Math.abs(actual - expected) < tol;
                        // For deflection, use smaller tolerance but handle the "ignore" case (0 expected for non-zero actual if we don't have formula)
                        // Actually, for asymmetric, we put 0 expected, so let's just check if it's close to 0 for supports.
                        const checkDef = (actual: number, expected: number, tol = 1e-5) => Math.abs(actual - expected) < tol;

                        return {
                            name: test.name,
                            expected: test.expected,
                            actual: {
                                maxMoment,
                                maxDeflection,
                                startShear,
                                endShear,
                                startMoment,
                                endMoment,
                                startDeflection,
                                endDeflection
                            },
                            passed: {
                                maxMoment: check(maxMoment, test.expected.maxMoment),
                                maxDeflection: test.expected.maxDeflection === 0 ? true : checkDef(maxDeflection, test.expected.maxDeflection),
                                startShear: check(startShear, test.expected.startShear),
                                endShear: check(endShear, test.expected.endShear),
                                startMoment: check(startMoment, test.expected.startMoment),
                                endMoment: check(endMoment, test.expected.endMoment),
                                startDeflection: checkDef(startDeflection, test.expected.startDeflection),
                                endDeflection: checkDef(endDeflection, test.expected.endDeflection)
                            }
                        };
                    } catch (e: any) {
                        return {
                            name: test.name,
                            error: e.message,
                            passed: { maxMoment: false }
                        };
                    }
                });
                setResults(testResults);
            } catch (e: any) {
                console.error("Test runner failed:", e);
            }
        };

        runTests();
    }, []);

    return (
        <div className="p-8 font-sans">
            <h1 className="text-2xl font-bold mb-4">Expanded Solver Verification</h1>
            <div className="space-y-8">
                {results.map((res, i) => (
                    <div key={i} className="border rounded-lg p-4 shadow-sm bg-white">
                        <h2 className="text-lg font-bold mb-2 border-b pb-2">{res.name}</h2>
                        {res.error ? (
                            <div className="text-red-600 font-bold">Error: {res.error}</div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-gray-500">
                                        <th className="pb-2">Metric</th>
                                        <th className="pb-2">Expected</th>
                                        <th className="pb-2">Actual</th>
                                        <th className="pb-2">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="py-1">Max Moment</td>
                                        <td>{res.expected.maxMoment.toFixed(3)}</td>
                                        <td>{res.actual.maxMoment.toFixed(3)}</td>
                                        <td className={res.passed.maxMoment ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                                            {res.passed.maxMoment ? 'PASS' : 'FAIL'}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="py-1">Max Deflection</td>
                                        <td>{res.expected.maxDeflection.toExponential(3)}</td>
                                        <td>{res.actual.maxDeflection.toExponential(3)}</td>
                                        <td className={res.passed.maxDeflection ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                                            {res.passed.maxDeflection ? 'PASS' : 'FAIL'}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="py-1">Start Shear</td>
                                        <td>{res.expected.startShear.toFixed(3)}</td>
                                        <td>{res.actual.startShear.toFixed(3)}</td>
                                        <td className={res.passed.startShear ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                                            {res.passed.startShear ? 'PASS' : 'FAIL'}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="py-1">End Shear</td>
                                        <td>{res.expected.endShear.toFixed(3)}</td>
                                        <td>{res.actual.endShear.toFixed(3)}</td>
                                        <td className={res.passed.endShear ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                                            {res.passed.endShear ? 'PASS' : 'FAIL'}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="py-1">Start Moment</td>
                                        <td>{res.expected.startMoment.toFixed(3)}</td>
                                        <td>{res.actual.startMoment.toFixed(3)}</td>
                                        <td className={res.passed.startMoment ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                                            {res.passed.startMoment ? 'PASS' : 'FAIL'}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="py-1">End Moment</td>
                                        <td>{res.expected.endMoment.toFixed(3)}</td>
                                        <td>{res.actual.endMoment.toFixed(3)}</td>
                                        <td className={res.passed.endMoment ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                                            {res.passed.endMoment ? 'PASS' : 'FAIL'}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="py-1">Start Deflection</td>
                                        <td>{res.expected.startDeflection.toExponential(3)}</td>
                                        <td>{res.actual.startDeflection.toExponential(3)}</td>
                                        <td className={res.passed.startDeflection ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                                            {res.passed.startDeflection ? 'PASS' : 'FAIL'}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="py-1">End Deflection</td>
                                        <td>{res.expected.endDeflection.toExponential(3)}</td>
                                        <td>{res.actual.endDeflection.toExponential(3)}</td>
                                        <td className={res.passed.endDeflection ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                                            {res.passed.endDeflection ? 'PASS' : 'FAIL'}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
