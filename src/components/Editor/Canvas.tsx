'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Point, Node, Member, Support, Load } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';
import { Tool } from './Editor';

interface CanvasProps {
    nodes: Node[];
    members: Member[];
    supports: Support[];
    loads: Load[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setMembers: React.Dispatch<React.SetStateAction<Member[]>>;
    setSupports: React.Dispatch<React.SetStateAction<Support[]>>;
    setLoads: React.Dispatch<React.SetStateAction<Load[]>>;
    activeTool: Tool;
    selectedId: string | null;
    setSelectedId: (id: string | null) => void;
    supportType: Support['type'];
    loadMagnitude: number;
    analysisResults: any;
    viewMode: 'structure' | 'deflected' | 'sfd' | 'bmd';
}

export default function Canvas({
    nodes,
    members,
    supports,
    loads,
    setNodes,
    setMembers,
    setSupports,
    setLoads,
    activeTool,
    selectedId,
    setSelectedId,
    supportType,
    loadMagnitude,
    analysisResults,
    viewMode,
}: CanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [lastMousePos, setLastMousePos] = useState<Point>({ x: 0, y: 0 });
    const [mousePos, setMousePos] = useState<Point | null>(null); // World coordinates

    // Drawing state
    const [drawingStartNode, setDrawingStartNode] = useState<Node | null>(null);

    // Grid settings
    const gridSize = 40;

    // Helper: Screen to World
    const screenToWorld = useCallback((x: number, y: number) => {
        return {
            x: (x - offset.x) / scale,
            y: (y - offset.y) / scale,
        };
    }, [offset, scale]);

    // Helper: World to Screen
    const worldToScreen = useCallback((x: number, y: number) => {
        return {
            x: x * scale + offset.x,
            y: y * scale + offset.y,
        };
    }, [offset, scale]);

    // Helper: Snap to Grid/Node
    const getSnappedPoint = useCallback((worldPos: Point): { point: Point, node?: Node } => {
        // 1. Snap to existing nodes
        const snapDistance = 10 / scale; // 10 pixels screen distance
        for (const node of nodes) {
            const dx = node.x - worldPos.x;
            const dy = node.y - worldPos.y;
            if (Math.sqrt(dx * dx + dy * dy) < snapDistance) {
                return { point: { x: node.x, y: node.y }, node };
            }
        }

        // 2. Snap to grid
        const snappedX = Math.round(worldPos.x / gridSize) * gridSize;
        const snappedY = Math.round(worldPos.y / gridSize) * gridSize;

        // Check if snapped grid point is close enough (optional, usually we always snap to grid if not near node)
        // But let's just always return grid snap if no node found
        return { point: { x: snappedX, y: snappedY } };
    }, [nodes, scale, gridSize]);

    // Helper: Hit Test
    const hitTest = useCallback((worldPos: Point): string | null => {
        const hitDistance = 10 / scale;

        // Check nodes
        for (const node of nodes) {
            const dx = node.x - worldPos.x;
            const dy = node.y - worldPos.y;
            if (Math.sqrt(dx * dx + dy * dy) < hitDistance) {
                return node.id;
            }
        }

        // Check members (distance to line segment)
        for (const member of members) {
            const start = nodes.find(n => n.id === member.startNodeId);
            const end = nodes.find(n => n.id === member.endNodeId);
            if (start && end) {
                const A = worldPos.x - start.x;
                const B = worldPos.y - start.y;
                const C = end.x - start.x;
                const D = end.y - start.y;

                const dot = A * C + B * D;
                const lenSq = C * C + D * D;
                let param = -1;
                if (lenSq !== 0) param = dot / lenSq;

                let xx, yy;

                if (param < 0) {
                    xx = start.x;
                    yy = start.y;
                } else if (param > 1) {
                    xx = end.x;
                    yy = end.y;
                } else {
                    xx = start.x + param * C;
                    yy = start.y + param * D;
                }

                const dx = worldPos.x - xx;
                const dy = worldPos.y - yy;
                if (Math.sqrt(dx * dx + dy * dy) < hitDistance) {
                    return member.id;
                }
            }
        }

        return null;
    }, [nodes, members, scale]);


    const drawGrid = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
        ctx.save();
        ctx.strokeStyle = '#f0f0f0';
        ctx.lineWidth = 1 / scale;

        const startX = Math.floor(-offset.x / scale / gridSize) * gridSize;
        const endX = Math.floor((-offset.x + width) / scale / gridSize) * gridSize;
        const startY = Math.floor(-offset.y / scale / gridSize) * gridSize;
        const endY = Math.floor((-offset.y + height) / scale / gridSize) * gridSize;

        ctx.beginPath();
        for (let x = startX; x <= endX; x += gridSize) {
            ctx.moveTo(x, startY);
            ctx.lineTo(x, endY);
        }
        for (let y = startY; y <= endY; y += gridSize) {
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
        }
        ctx.stroke();

        // Draw axes
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 2 / scale;
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(endX, 0);
        ctx.moveTo(0, startY);
        ctx.lineTo(0, endY);
        ctx.stroke();

        ctx.restore();
    }, [scale, offset]);

    const render = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Handle resize
        if (containerRef.current) {
            canvas.width = containerRef.current.clientWidth;
            canvas.height = containerRef.current.clientHeight;
        }

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Apply transformations
        ctx.save();
        ctx.translate(offset.x, offset.y);
        ctx.scale(scale, scale);

        // Draw Grid
        drawGrid(ctx, canvas.width, canvas.height);

        // Draw Members
        ctx.lineCap = 'round';
        members.forEach(member => {
            const start = nodes.find(n => n.id === member.startNodeId);
            const end = nodes.find(n => n.id === member.endNodeId);
            if (start && end) {
                ctx.beginPath();
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);

                if (member.id === selectedId) {
                    ctx.strokeStyle = '#2563eb'; // Blue for selected
                    ctx.lineWidth = 5 / scale;
                } else {
                    ctx.strokeStyle = '#333';
                    ctx.lineWidth = 3 / scale;
                }

                // If viewing results, maybe dim the structure?
                if (viewMode !== 'structure') {
                    ctx.strokeStyle = '#e5e7eb'; // Very light gray
                }

                ctx.stroke();

                // Draw releases (hinges)
                if (viewMode === 'structure') {
                    if (member.startRelease === 'pinned') {
                        ctx.fillStyle = '#fff';
                        ctx.strokeStyle = '#333';
                        ctx.lineWidth = 1 / scale;
                        ctx.beginPath();
                        ctx.arc(start.x, start.y, 6 / scale, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                    if (member.endRelease === 'pinned') {
                        ctx.fillStyle = '#fff';
                        ctx.strokeStyle = '#333';
                        ctx.lineWidth = 1 / scale;
                        ctx.beginPath();
                        ctx.arc(end.x, end.y, 6 / scale, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                }

                // Draw Results
                if (analysisResults && analysisResults.diagrams && analysisResults.diagrams[member.id]) {
                    const diag = analysisResults.diagrams[member.id];
                    const dx = end.x - start.x;
                    const dy = end.y - start.y;
                    const L = Math.sqrt(dx * dx + dy * dy);
                    const angle = Math.atan2(dy, dx);

                    ctx.save();
                    ctx.translate(start.x, start.y);
                    ctx.rotate(angle);

                    if (viewMode === 'deflected') {
                        // Draw deflected shape
                        // Scale factor for deflection
                        const defScale = 1000; // Arbitrary scale, maybe make adjustable

                        ctx.beginPath();
                        ctx.moveTo(0, 0); // Start at 0,0 (local) + displacement?
                        // Actually, we should include nodal displacements too.
                        // The diagram.displacement is the transverse displacement v(x) relative to the chord?
                        // Or total?
                        // In solver, we used standard beam convention where v is up?
                        // If v is up, and Y is down, then -v is correct for screen.

                        ctx.strokeStyle = '#ef4444'; // Red
                        ctx.lineWidth = 2 / scale;

                        for (let i = 0; i < diag.x.length; i++) {
                            const x = diag.x[i];
                            const v = diag.displacement[i];
                            ctx.lineTo(x, -v * defScale); // -v because Y is down in canvas but v might be up?
                        }
                        ctx.stroke();

                    } else if (viewMode === 'sfd') {
                        // Draw Shear Force Diagram
                        const sfdScale = 0.5; // Scale factor

                        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
                        ctx.strokeStyle = '#ef4444';
                        ctx.lineWidth = 1 / scale;

                        ctx.beginPath();
                        ctx.moveTo(0, 0);
                        for (let i = 0; i < diag.x.length; i++) {
                            const x = diag.x[i];
                            const v = diag.shear[i];
                            ctx.lineTo(x, -v * sfdScale);
                        }
                        ctx.lineTo(L, 0);
                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();

                    } else if (viewMode === 'bmd') {
                        // Draw Bending Moment Diagram
                        const bmdScale = 0.5; // Scale factor

                        ctx.fillStyle = 'rgba(0, 0, 255, 0.2)';
                        ctx.strokeStyle = '#3b82f6';
                        ctx.lineWidth = 1 / scale;

                        ctx.beginPath();
                        ctx.moveTo(0, 0);
                        for (let i = 0; i < diag.x.length; i++) {
                            const x = diag.x[i];
                            const m = diag.moment[i];
                            // Moment diagram usually drawn on tension side.
                            // If positive moment is sagging (tension bottom), draw down?
                            // Standard: Positive M drawn on compression side (top) in Europe? Or Tension side (bottom) in US?
                            // Let's draw on tension side (bottom).
                            // If M is positive (sagging), tension is at bottom.
                            // So draw downwards (positive Y in canvas).
                            ctx.lineTo(x, m * bmdScale);
                        }
                        ctx.lineTo(L, 0);
                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();
                    }

                    ctx.restore();
                }
            }
        });

        // Draw Nodes
        if (viewMode === 'structure') {
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2 / scale;
            nodes.forEach(node => {
                ctx.beginPath();
                ctx.arc(node.x, node.y, 4 / scale, 0, Math.PI * 2);
                if (node.id === selectedId) {
                    ctx.fillStyle = '#2563eb';
                } else {
                    ctx.fillStyle = '#fff';
                }
                ctx.fill();
                ctx.stroke();
            });
        }

        // Draw Supports
        if (viewMode === 'structure') {
            supports.forEach(support => {
                const node = nodes.find(n => n.id === support.nodeId);
                if (node) {
                    ctx.save();
                    ctx.translate(node.x, node.y);
                    // Rotate based on support angle (not implemented yet, assuming 0)

                    ctx.fillStyle = '#22c55e'; // Green
                    ctx.strokeStyle = '#15803d';
                    ctx.lineWidth = 2 / scale;

                    if (support.type === 'pin') {
                        // Triangle
                        ctx.beginPath();
                        ctx.moveTo(0, 0);
                        ctx.lineTo(-8 / scale, 12 / scale);
                        ctx.lineTo(8 / scale, 12 / scale);
                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();
                    } else if (support.type === 'roller') {
                        // Circle
                        ctx.beginPath();
                        ctx.arc(0, 8 / scale, 6 / scale, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.stroke();
                    } else if (support.type === 'fixed') {
                        // Rectangle/Hatch
                        ctx.beginPath();
                        ctx.moveTo(-10 / scale, 0);
                        ctx.lineTo(10 / scale, 0);
                        ctx.lineTo(10 / scale, 5 / scale);
                        ctx.lineTo(-10 / scale, 5 / scale);
                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();
                    }
                    ctx.restore();
                }
            });
        }

        // Draw Loads
        if (viewMode === 'structure') {
            loads.forEach(load => {
                const member = members.find(m => m.id === load.memberId);
                if (member) {
                    const start = nodes.find(n => n.id === member.startNodeId);
                    const end = nodes.find(n => n.id === member.endNodeId);
                    if (start && end) {
                        // Calculate position
                        const dx = end.x - start.x;
                        const dy = end.y - start.y;
                        const len = Math.sqrt(dx * dx + dy * dy);
                        const unitX = dx / len;
                        const unitY = dy / len;

                        const loadX = start.x + unitX * load.position;
                        const loadY = start.y + unitY * load.position;

                        // Draw arrow
                        ctx.save();
                        ctx.translate(loadX, loadY);
                        ctx.strokeStyle = '#ef4444'; // Red
                        ctx.fillStyle = '#ef4444';
                        ctx.lineWidth = 2 / scale;

                        // Vertical load (downward)
                        const arrowLen = 30 / scale;
                        ctx.beginPath();
                        ctx.moveTo(0, -arrowLen);
                        ctx.lineTo(0, 0);
                        ctx.stroke();

                        // Arrowhead
                        ctx.beginPath();
                        ctx.moveTo(0, 0);
                        ctx.lineTo(-5 / scale, -8 / scale);
                        ctx.lineTo(5 / scale, -8 / scale);
                        ctx.closePath();
                        ctx.fill();

                        // Label
                        ctx.font = `${12 / scale}px sans-serif`;
                        ctx.fillText(`${load.magnitude}kN`, 8 / scale, -arrowLen / 2);

                        ctx.restore();
                    }
                }
            });
        }

        // Draw Preview (if drawing member)
        if (activeTool === 'member' && drawingStartNode && mousePos) {
            const snapped = getSnappedPoint(mousePos);
            ctx.strokeStyle = '#999';
            ctx.setLineDash([5 / scale, 5 / scale]);
            ctx.beginPath();
            ctx.moveTo(drawingStartNode.x, drawingStartNode.y);
            ctx.lineTo(snapped.point.x, snapped.point.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw Snapped Cursor
        if (mousePos && viewMode === 'structure') {
            const snapped = getSnappedPoint(mousePos);
            ctx.fillStyle = 'rgba(0, 150, 255, 0.5)';
            ctx.beginPath();
            ctx.arc(snapped.point.x, snapped.point.y, 6 / scale, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }, [scale, offset, drawGrid, nodes, members, activeTool, drawingStartNode, mousePos, getSnappedPoint, selectedId, supports, loads, analysisResults, viewMode]);

    useEffect(() => {
        render();
    }, [render]);

    const handleMouseDown = (e: React.MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const worldPos = screenToWorld(x, y);

        if (e.button === 1 || (e.button === 0 && e.altKey)) { // Pan
            setIsDragging(true);
            setLastMousePos({ x: e.clientX, y: e.clientY });
            return;
        }

        if (viewMode !== 'structure') return; // Disable editing in result view

        if (activeTool === 'select' && e.button === 0) {
            const hitId = hitTest(worldPos);
            setSelectedId(hitId);
        }

        if (activeTool === 'support' && e.button === 0) {
            const snapped = getSnappedPoint(worldPos);
            if (snapped.node) {
                // Add support to node
                // Check if support already exists
                const existingSupport = supports.find(s => s.nodeId === snapped.node!.id);
                if (existingSupport) {
                    // Update existing
                    setSupports(prev => prev.map(s => s.id === existingSupport.id ? { ...s, type: supportType } : s));
                } else {
                    // Create new
                    setSupports(prev => [...prev, {
                        id: uuidv4(),
                        nodeId: snapped.node!.id,
                        type: supportType,
                        angle: 0
                    }]);
                }
            }
        }

        if (activeTool === 'load' && e.button === 0) {
            // Check if clicked on member
            const hitId = hitTest(worldPos);
            const member = members.find(m => m.id === hitId);
            if (member) {
                // Calculate position along member
                const start = nodes.find(n => n.id === member.startNodeId);
                const end = nodes.find(n => n.id === member.endNodeId);
                if (start && end) {
                    // Project point onto line segment
                    const A = worldPos.x - start.x;
                    const B = worldPos.y - start.y;
                    const C = end.x - start.x;
                    const D = end.y - start.y;
                    const lenSq = C * C + D * D;
                    const dot = A * C + B * D;
                    const param = Math.max(0, Math.min(1, dot / lenSq));
                    const len = Math.sqrt(lenSq);
                    const position = param * len;

                    setLoads(prev => [...prev, {
                        id: uuidv4(),
                        memberId: member.id,
                        type: 'point',
                        magnitude: loadMagnitude,
                        position: position
                    }]);
                }
            }
        }

        if (activeTool === 'member' && e.button === 0) {
            const snapped = getSnappedPoint(worldPos);

            if (!drawingStartNode) {
                // Start drawing
                let startNode = snapped.node;
                if (!startNode) {
                    // Create new node at start
                    startNode = { id: uuidv4(), x: snapped.point.x, y: snapped.point.y };
                    setNodes(prev => [...prev, startNode!]);
                }
                setDrawingStartNode(startNode);
            } else {
                // Finish drawing
                let endNode = snapped.node;
                if (!endNode) {
                    // Create new node at end
                    endNode = { id: uuidv4(), x: snapped.point.x, y: snapped.point.y };
                    setNodes(prev => [...prev, endNode!]);
                }

                if (endNode.id !== drawingStartNode.id) {
                    const newMember: Member = {
                        id: uuidv4(),
                        startNodeId: drawingStartNode.id,
                        endNodeId: endNode.id,
                        startRelease: 'fixed', // Default to fixed (rigid)
                        endRelease: 'fixed',
                        properties: { E: 200e9, I: 1e-5, A: 1e-3 } // Default steel properties
                    };
                    setMembers(prev => [...prev, newMember]);
                }

                // Stop drawing or continue? Usually continue in CAD. 
                // Let's continue drawing from the new node for chain drawing.
                setDrawingStartNode(endNode);
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const worldPos = screenToWorld(x, y);
        setMousePos(worldPos);

        if (isDragging) {
            const dx = e.clientX - lastMousePos.x;
            const dy = e.clientY - lastMousePos.y;
            setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            setLastMousePos({ x: e.clientX, y: e.clientY });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const zoomSensitivity = 0.001;
        const delta = -e.deltaY * zoomSensitivity;
        const newScale = Math.min(Math.max(0.1, scale + delta), 5);

        // Zoom towards mouse pointer logic could be added here
        setScale(newScale);
    };

    // Cancel drawing on Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setDrawingStartNode(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <div ref={containerRef} className="w-full h-full bg-gray-50">
            <canvas
                ref={canvasRef}
                className="block cursor-crosshair touch-none"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
                onContextMenu={(e) => e.preventDefault()}
            />
        </div>
    );
}
