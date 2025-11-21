'use client';

import { useState, useEffect } from 'react';
import CanvasP5 from './CanvasP5';
import { Node, Member, Support, Load, SupportType } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';
import { MousePointer2, Minus, Triangle, ArrowDown, Play, Trash2, Activity, TrendingUp, Waves, CircleDot, ArrowRight, RotateCcw, ArrowUpFromLine } from 'lucide-react';
import { StructuralSolver } from '@/lib/analysis/solver';

export type Step = 'members' | 'supports' | 'joints' | 'loads' | 'analysis';

export default function Editor() {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [supports, setSupports] = useState<Support[]>([]);
    const [loads, setLoads] = useState<Load[]>([]);
    const [step, setStep] = useState<Step>('members');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    // Tool settings
    const [supportType, setSupportType] = useState<SupportType>('pin');
    const [loadMagnitude, setLoadMagnitude] = useState<number>(-10);
    const [analysisResults, setAnalysisResults] = useState<any>(null);
    const [viewMode, setViewMode] = useState<'none' | 'deflected' | 'sfd' | 'bmd' | 'reactions'>('none');

    const selectedMember = members.find(m => m.id === selectedId);
    const selectedNode = nodes.find(n => n.id === selectedId);

    const updateMember = (id: string, updates: Partial<Member>) => {
        setMembers(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
    };

    const handleRunAnalysis = () => {
        try {
            // Validate model
            const validMembers = members.filter(m => nodes.find(n => n.id === m.startNodeId) && nodes.find(n => n.id === m.endNodeId));
            if (validMembers.length !== members.length) {
                console.warn("Found invalid members (missing nodes). Removing them.");
                setMembers(validMembers);
            }

            const solver = new StructuralSolver(nodes, validMembers, supports, loads);
            const results = solver.solve();
            console.log("Analysis Results:", results);
            setAnalysisResults(results);
            setViewMode('deflected'); // Switch to deflected view on success
        } catch (error: any) {
            console.error(error);
            alert(`Analysis failed: ${error.message}`);
        }
    };

    const clearStep = () => {
        switch (step) {
            case 'members':
                setNodes([]);
                setMembers([]);
                setSupports([]);
                setLoads([]);
                setAnalysisResults(null);
                setViewMode('none');
                break;
            case 'supports':
                setSupports([]);
                setAnalysisResults(null);
                setViewMode('none');
                break;
            case 'joints':
                // Reset all releases to default (pinned) - or smart default based on connectivity?
                // For simplicity, let's reset to pinned, but maybe we should respect the "default" logic
                // which is: if connected to fixed support -> fixed, else pinned?
                // Actually, the user asked to "clear actions from current step".
                // In Joints step, the action is toggling releases.
                // So resetting to default state (pinned-pinned usually) seems appropriate.
                setMembers(prev => prev.map(m => ({ ...m, startRelease: 'pinned', endRelease: 'pinned' })));
                setAnalysisResults(null);
                setViewMode('none');
                break;
            case 'loads':
                setLoads([]);
                setAnalysisResults(null);
                setViewMode('none');
                break;
            case 'analysis':
                setAnalysisResults(null);
                setViewMode('none');
                break;
        }
        setShowClearConfirm(false);
    };

    // Helper to check for editable joints
    const hasEditableJoints = () => {
        // Editable joint: Node connected to > 1 member AND NOT supported by Fixed support
        return nodes.some(node => {
            const connectedMembers = members.filter(m => m.startNodeId === node.id || m.endNodeId === node.id);
            if (connectedMembers.length <= 1) return false; // End of cantilever or single member end

            const support = supports.find(s => s.nodeId === node.id);
            if (support && support.type === 'fixed') return false; // Fixed support

            return true;
        });
    };

    // Step Content
    const getStepContent = () => {
        switch (step) {
            case 'members':
                return {
                    title: "Members",
                    explanation: "Define the members by drawing a polyline on the canvas. Click NEXT when finished.",
                    topControls: null,
                    bottomControls: members.length > 0 ? (
                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowClearConfirm(true)}
                                className="px-6 py-2 bg-gray-800 text-white hover:bg-gray-700 rounded-md shadow-sm border-transparent transition-colors flex items-center gap-2 font-medium text-sm"
                            >
                                <RotateCcw size={16} /> Clear
                            </button>
                            <button
                                onClick={() => setStep('supports')}
                                className="px-6 py-2 bg-gray-800 text-white hover:bg-gray-700 rounded-md shadow-sm border-transparent font-medium text-sm flex items-center gap-2 transition-colors"
                            >
                                Next <ArrowRight size={16} />
                            </button>
                        </div>
                    ) : null
                };
            case 'supports':
                return {
                    title: "Supports",
                    explanation: "Click on nodes to add supports",
                    topControls: (
                        <div className="flex bg-white/90 backdrop-blur-sm p-1 rounded-lg shadow-sm border border-gray-200 mt-4">
                            <button
                                onClick={() => setSupportType('fixed')}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${supportType === 'fixed' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Fixed
                            </button>
                            <button
                                onClick={() => setSupportType('pin')}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${supportType === 'pin' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Pinned
                            </button>
                        </div>
                    ),
                    bottomControls: (
                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowClearConfirm(true)}
                                className="px-6 py-2 bg-gray-800 text-white hover:bg-gray-700 rounded-md shadow-sm border-transparent transition-colors flex items-center gap-2 font-medium text-sm"
                            >
                                <RotateCcw size={16} /> Clear
                            </button>
                            <button
                                onClick={() => {
                                    if (hasEditableJoints()) {
                                        setStep('joints');
                                    } else {
                                        setStep('loads');
                                    }
                                }}
                                className="px-6 py-2 bg-gray-800 text-white hover:bg-gray-700 rounded-md shadow-sm border-transparent font-medium text-sm flex items-center gap-2 transition-colors"
                            >
                                Next <ArrowRight size={16} />
                            </button>
                        </div>
                    )
                };
            case 'joints':
                return {
                    title: "Joints",
                    explanation: "Click on joints to toggle between Fixed and Pinned",
                    topControls: null,
                    bottomControls: (
                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowClearConfirm(true)}
                                className="px-6 py-2 bg-gray-800 text-white hover:bg-gray-700 rounded-md shadow-sm border-transparent transition-colors flex items-center gap-2 font-medium text-sm"
                            >
                                <RotateCcw size={16} /> Clear
                            </button>
                            <button
                                onClick={() => setStep('loads')}
                                className="px-6 py-2 bg-gray-800 text-white hover:bg-gray-700 rounded-md shadow-sm border-transparent font-medium text-sm flex items-center gap-2 transition-colors"
                            >
                                Next <ArrowRight size={16} />
                            </button>
                        </div>
                    )
                };
            case 'loads':
                return {
                    title: "Loads",
                    explanation: "Click on members to add point loads",
                    topControls: (
                        <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-md border border-gray-200 shadow-sm mt-4">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Magnitude</span>
                            <input
                                type="number"
                                value={Math.abs(loadMagnitude)}
                                onChange={(e) => setLoadMagnitude(-Math.abs(Number(e.target.value)))}
                                className="w-16 text-sm border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500 py-1 px-2"
                            />
                            <span className="text-xs text-gray-500">kN</span>
                        </div>
                    ),
                    bottomControls: (
                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowClearConfirm(true)}
                                className="px-6 py-2 bg-gray-800 text-white hover:bg-gray-700 rounded-md shadow-sm border-transparent transition-colors flex items-center gap-2 font-medium text-sm"
                            >
                                <RotateCcw size={16} /> Clear
                            </button>
                            <button
                                onClick={() => {
                                    handleRunAnalysis();
                                    setStep('analysis');
                                }}
                                className="px-6 py-2 bg-gray-800 text-white hover:bg-gray-700 rounded-md shadow-sm border-transparent font-medium text-sm flex items-center gap-2 transition-colors"
                            >
                                Next <ArrowRight size={16} />
                            </button>
                        </div>
                    )
                };
            case 'analysis':
                return {
                    title: "Analysis",
                    explanation: "View diagrams for deflection, shear, moment, and reactions.",
                    topControls: analysisResults ? (
                        <div className="flex bg-white/90 backdrop-blur-sm p-1 rounded-lg shadow-sm border border-gray-200 mt-4">
                            <button
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${viewMode === 'deflected' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                onClick={() => setViewMode(viewMode === 'deflected' ? 'none' : 'deflected')}
                            >
                                <Activity size={14} /> Deflection
                            </button>
                            <button
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${viewMode === 'sfd' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                onClick={() => setViewMode(viewMode === 'sfd' ? 'none' : 'sfd')}
                            >
                                <Waves size={14} /> SFD
                            </button>
                            <button
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${viewMode === 'bmd' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                onClick={() => setViewMode(viewMode === 'bmd' ? 'none' : 'bmd')}
                            >
                                <TrendingUp size={14} /> BMD
                            </button>
                            <button
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${viewMode === 'reactions' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                onClick={() => setViewMode(viewMode === 'reactions' ? 'none' : 'reactions')}
                            >
                                <ArrowUpFromLine size={14} /> Reactions
                            </button>
                        </div>
                    ) : null,
                    bottomControls: null
                };
        }
    };

    const stepContent = getStepContent();

    return (
        <div className="flex flex-col h-screen relative">
            {/* Top Overlay UI: Title, Explanation, Step Controls */}
            <div className="absolute top-8 left-0 right-0 flex flex-col items-center z-10 pointer-events-none">
                <div className="pointer-events-auto flex flex-col items-center max-w-lg text-center">
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">{stepContent.title}</h1>
                    <p className="text-gray-500 text-sm">{stepContent.explanation}</p>
                    {stepContent.topControls}
                </div>
            </div>

            {/* Bottom Overlay UI: Navigation */}
            <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center z-10 pointer-events-none">
                <div className="pointer-events-auto flex flex-col items-center max-w-lg text-center">
                    {stepContent.bottomControls}
                </div>
            </div>

            {/* Clear Confirmation Modal */}
            {
                showClearConfirm && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4 transform transition-all scale-100">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                {step === 'members' ? 'Clear Model?' : `Clear ${step.charAt(0).toUpperCase() + step.slice(1)}?`}
                            </h3>
                            <p className="text-gray-500 mb-6">
                                {step === 'members'
                                    ? "Are you sure you want to delete all nodes, members, supports, and loads?"
                                    : `Are you sure you want to clear all ${step}?`}
                            </p>
                            <div className="flex justify-end gap-3">
                                <button
                                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md font-medium transition-colors"
                                    onClick={() => setShowClearConfirm(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-md font-medium shadow-sm transition-colors"
                                    onClick={clearStep}
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            <div className="flex-grow overflow-hidden relative flex">
                <div className="flex-grow relative">
                    <CanvasP5
                        nodes={nodes}
                        members={members}
                        supports={supports}
                        loads={loads}
                        setNodes={setNodes}
                        setMembers={setMembers}
                        setSupports={setSupports}
                        setLoads={setLoads}
                        step={step}
                        selectedId={selectedId}
                        setSelectedId={setSelectedId}
                        supportType={supportType}
                        loadMagnitude={loadMagnitude}
                        analysisResults={analysisResults}
                        viewMode={viewMode}
                    />
                </div>
            </div>
        </div >
    );
}
