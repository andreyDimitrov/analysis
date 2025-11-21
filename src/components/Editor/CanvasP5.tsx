'use client';

import React, { useRef, useEffect, useState } from 'react';
import p5 from 'p5';
import { Node, Member, Support, Load } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';
import { Step } from './Editor';

interface CanvasP5Props {
    nodes: Node[];
    members: Member[];
    supports: Support[];
    loads: Load[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setMembers: React.Dispatch<React.SetStateAction<Member[]>>;
    setSupports: React.Dispatch<React.SetStateAction<Support[]>>;
    setLoads: React.Dispatch<React.SetStateAction<Load[]>>;
    step: Step;
    selectedId: string | null;
    setSelectedId: (id: string | null) => void;
    supportType: Support['type'];
    loadMagnitude: number;
    analysisResults: any;
    viewMode: 'none' | 'deflected' | 'sfd' | 'bmd' | 'reactions';
}

export default function CanvasP5({
    nodes,
    members,
    supports,
    loads,
    setNodes,
    setMembers,
    setSupports,
    setLoads,
    step,
    selectedId,
    setSelectedId,
    supportType,
    loadMagnitude,
    analysisResults,
    viewMode,
}: CanvasP5Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const p5Instance = useRef<p5 | null>(null);

    // State for p5 to access (using refs to avoid closure staleness in p5 loop)
    const stateRef = useRef({
        nodes,
        members,
        supports,
        loads,
        step,
        selectedId,
        supportType,
        loadMagnitude,
        analysisResults,
        viewMode,
        scale: 1,
        offset: { x: 0, y: 0 },
        isDragging: false,
        lastMousePos: { x: 0, y: 0 },
        drawingStartNode: null as Node | null,
        mouseWorldPos: { x: 0, y: 0 }
    });

    // Update refs when props change
    useEffect(() => {
        stateRef.current.nodes = nodes;
        stateRef.current.members = members;
        stateRef.current.supports = supports;
        stateRef.current.loads = loads;
        stateRef.current.step = step;
        stateRef.current.selectedId = selectedId;
        stateRef.current.supportType = supportType;
        stateRef.current.loadMagnitude = loadMagnitude;
        stateRef.current.analysisResults = analysisResults;
        stateRef.current.viewMode = viewMode;
    }, [nodes, members, supports, loads, step, selectedId, supportType, loadMagnitude, analysisResults, viewMode]);

    useEffect(() => {
        if (!containerRef.current) return;

        const sketch = (p: p5) => {
            const gridSize = 1;

            // Helper: Screen to World
            const screenToWorld = (x: number, y: number) => {
                const s = stateRef.current.scale;
                const o = stateRef.current.offset;
                return {
                    x: (x - o.x) / s,
                    y: (y - o.y) / s
                };
            };

            // Helper: World to Screen
            const worldToScreen = (x: number, y: number) => {
                const s = stateRef.current.scale;
                const o = stateRef.current.offset;
                return {
                    x: x * s + o.x,
                    y: y * s + o.y
                };
            };

            // Helper: Snap
            const getSnappedPoint = (worldX: number, worldY: number) => {
                const s = stateRef.current.scale;
                const snapDist = 15 / s;

                // Snap to nodes
                for (const node of stateRef.current.nodes) {
                    const d = p.dist(worldX, worldY, node.x, node.y);
                    if (d < snapDist) return { x: node.x, y: node.y, node };
                }

                // Snap to grid
                const gx = Math.round(worldX / gridSize) * gridSize;
                const gy = Math.round(worldY / gridSize) * gridSize;
                return { x: gx, y: gy };
            };

            // Helper: Hit Test
            const hitTest = (worldX: number, worldY: number) => {
                const s = stateRef.current.scale;
                const hitDist = 10 / s;

                // Nodes
                for (const node of stateRef.current.nodes) {
                    if (p.dist(worldX, worldY, node.x, node.y) < hitDist) return { type: 'node', id: node.id };
                }

                // Members
                for (const member of stateRef.current.members) {
                    const start = stateRef.current.nodes.find(n => n.id === member.startNodeId);
                    const end = stateRef.current.nodes.find(n => n.id === member.endNodeId);
                    if (start && end) {
                        // Distance point to line segment
                        const l2 = p.dist(start.x, start.y, end.x, end.y) ** 2;
                        if (l2 === 0) continue;
                        let t = ((worldX - start.x) * (end.x - start.x) + (worldY - start.y) * (end.y - start.y)) / l2;
                        t = Math.max(0, Math.min(1, t));
                        const px = start.x + t * (end.x - start.x);
                        const py = start.y + t * (end.y - start.y);
                        if (p.dist(worldX, worldY, px, py) < hitDist) return { type: 'member', id: member.id };
                    }
                }
                return null;
            };

            // Helper: Auto-Scaling for Diagrams
            const getDiagramScale = (type: 'deflection' | 'shear' | 'moment') => {
                const results = stateRef.current.analysisResults;
                if (!results || !results.diagrams) return 1;

                let maxVal = 0;
                Object.values(results.diagrams).forEach((diag: any) => {
                    if (type === 'deflection') {
                        diag.displacement.forEach((v: number) => maxVal = Math.max(maxVal, Math.abs(v)));
                    } else if (type === 'shear') {
                        diag.shear.forEach((v: number) => maxVal = Math.max(maxVal, Math.abs(v)));
                    } else if (type === 'moment') {
                        diag.moment.forEach((v: number) => maxVal = Math.max(maxVal, Math.abs(v)));
                    }
                });

                if (maxVal === 0) return 1;

                // Target visual height in world units (e.g., 5/3 units)
                const targetHeight = 5 / 3;
                return targetHeight / maxVal;
            };

            // Helper: Check if node is editable (inner joint, not fixed support)
            const isNodeEditable = (nodeId: string) => {
                const { members, supports } = stateRef.current;
                const connectedMembers = members.filter(m => m.startNodeId === nodeId || m.endNodeId === nodeId);

                if (connectedMembers.length <= 1) return false; // End of cantilever or single member end

                const support = supports.find(s => s.nodeId === nodeId);
                if (support && support.type === 'fixed') return false; // Fixed support

                return true;
            };

            p.setup = () => {
                p.createCanvas(containerRef.current!.clientWidth, containerRef.current!.clientHeight);
                p.frameRate(60);

                // Absolute positioning to decouple from flow
                if ((p as any).canvas) {
                    (p as any).canvas.style.position = 'absolute';
                    (p as any).canvas.style.top = '0';
                    (p as any).canvas.style.left = '0';
                    (p as any).canvas.style.width = '100%';
                    (p as any).canvas.style.height = '100%';
                }

                stateRef.current.scale = p.width / 30;
            };

            // Resize Observer
            const resizeObserver = new ResizeObserver(entries => {
                for (let entry of entries) {
                    if (containerRef.current) {
                        const { width, height } = entry.contentRect;

                        if (width > 0 && height > 0) {
                            p.resizeCanvas(width, height);
                            stateRef.current.scale = width / 30;
                            p.redraw();
                        }
                    }
                }
            });
            resizeObserver.observe(containerRef.current!);

            // Cleanup observer on remove
            const originalRemove = p.remove;
            p.remove = () => {
                resizeObserver.disconnect();
                originalRemove.call(p);
            };

            p.draw = () => {
                p.background(250); // Gray-50 equivalent

                // Update mouse position every frame
                const worldMouse = screenToWorld(p.mouseX, p.mouseY);
                stateRef.current.mouseWorldPos = worldMouse;

                const { scale, offset, nodes, members, supports, loads, step, selectedId, viewMode, analysisResults, drawingStartNode, mouseWorldPos } = stateRef.current;

                // Reset drawingStartNode if nodes are cleared
                if (nodes.length === 0 && drawingStartNode) {
                    stateRef.current.drawingStartNode = null;
                }

                p.push();
                p.translate(offset.x, offset.y);
                p.scale(scale);

                // Grid
                p.stroke(240);
                p.strokeWeight(1 / scale);
                const startX = Math.floor(-offset.x / scale / gridSize) * gridSize;
                const endX = Math.floor((-offset.x + p.width) / scale / gridSize) * gridSize;
                const startY = Math.floor(-offset.y / scale / gridSize) * gridSize;
                const endY = Math.floor((-offset.y + p.height) / scale / gridSize) * gridSize;

                // Axes
                p.stroke(200);
                p.strokeWeight(2 / scale);
                p.line(startX, 0, endX, 0);
                p.line(0, startY, 0, endY);

                // --- DRAWING LOGIC BASED ON STEP ---

                // Colors
                const inactiveColor = '#000000'; // Black
                const activeColor = '#f97316'; // Orange
                const paleOrange = '#fdba74'; // Pale Orange

                // Members
                members.forEach(member => {
                    const start = nodes.find(n => n.id === member.startNodeId);
                    const end = nodes.find(n => n.id === member.endNodeId);
                    if (!start || !end) return;

                    // Determine color based on step
                    let strokeColor = inactiveColor;
                    if (step === 'members') strokeColor = activeColor;

                    // Draw Member Line
                    p.stroke(strokeColor);
                    p.strokeWeight(6 / scale);
                    p.line(start.x, start.y, end.x, end.y);

                    // Member Length Label
                    const dx = end.x - start.x;
                    const dy = end.y - start.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    const angle = Math.atan2(dy, dx);

                    p.push();
                    p.translate((start.x + end.x) / 2, (start.y + end.y) / 2);
                    p.rotate(angle);
                    p.fill(100);
                    p.noStroke();
                    p.textSize(12 / scale);
                    p.textAlign(p.CENTER, p.TOP);
                    if (Math.abs(angle) > Math.PI / 2) {
                        p.rotate(Math.PI);
                    }
                    p.text(`${Math.round(len)}m`, 0, 4 / scale);
                    p.pop();
                });

                // Nodes (Joints)
                nodes.forEach(node => {
                    // Determine joint type based on connected members
                    const connectedMembers = members.filter(m => m.startNodeId === node.id || m.endNodeId === node.id);

                    let isMoment = false;
                    let isHinge = false;

                    if (connectedMembers.length > 0) {
                        const allFixed = connectedMembers.every(m =>
                            (m.startNodeId === node.id && m.startRelease === 'fixed') ||
                            (m.endNodeId === node.id && m.endRelease === 'fixed')
                        );
                        if (allFixed) isMoment = true;
                        else isHinge = true;
                    } else {
                        isHinge = true;
                    }

                    // Color
                    let nodeColor = inactiveColor;
                    let strokeColor = inactiveColor;
                    let fillColor = '#fff'; // Default open

                    if (step === 'members') {
                        strokeColor = activeColor;
                        fillColor = '#fff'; // Open
                    } else if (step === 'supports') {
                        strokeColor = inactiveColor;
                        fillColor = isMoment ? '#000' : '#fff';
                    } else if (step === 'joints') {
                        const editable = isNodeEditable(node.id);
                        if (editable) {
                            strokeColor = activeColor;
                            fillColor = isMoment ? activeColor : '#fff';
                        } else {
                            strokeColor = inactiveColor;
                            fillColor = '#000'; // Solid black for non-editable
                        }
                    } else {
                        // loads, analysis
                        strokeColor = inactiveColor;
                        fillColor = isMoment ? '#000' : '#fff';
                    }

                    p.stroke(strokeColor);
                    p.strokeWeight(2 / scale);
                    p.fill(fillColor);
                    p.circle(node.x, node.y, 8 / scale);

                    // Joints Mode Text
                    if (step === 'joints' && isNodeEditable(node.id)) {
                        p.push();
                        p.translate(node.x, node.y);
                        p.noStroke();
                        p.fill(activeColor);
                        p.textSize(12 / scale);
                        p.textAlign(p.CENTER, p.BOTTOM);
                        p.text(isMoment ? "Fixed" : "Pinned", 0, -10 / scale);
                        p.pop();
                    }
                });

                // Supports
                supports.forEach(support => {
                    const node = nodes.find(n => n.id === support.nodeId);
                    if (!node) return;

                    p.push();
                    p.translate(node.x, node.y);

                    // Calculate rotation for fixed support
                    let rotation = support.angle;
                    if (support.type === 'fixed') {
                        const connected = members.filter(m => m.startNodeId === node.id || m.endNodeId === node.id);
                        if (connected.length > 0) {
                            let sumX = 0;
                            let sumY = 0;
                            connected.forEach(m => {
                                const start = nodes.find(n => n.id === m.startNodeId);
                                const end = nodes.find(n => n.id === m.endNodeId);
                                if (start && end) {
                                    let dx = end.x - start.x;
                                    let dy = end.y - start.y;
                                    if (m.endNodeId === node.id) {
                                        dx = -dx;
                                        dy = -dy;
                                    }
                                    const len = Math.sqrt(dx * dx + dy * dy);
                                    sumX += dx / len;
                                    sumY += dy / len;
                                }
                            });
                            const avgAngle = Math.atan2(sumY, sumX);
                            rotation = avgAngle + Math.PI / 2;
                        }
                    }

                    p.rotate(rotation);

                    // Color
                    let supportColor = inactiveColor;
                    if (step === 'supports') supportColor = activeColor;

                    p.fill(supportColor);
                    p.stroke(supportColor);
                    p.strokeWeight(2 / scale);

                    if (support.type === 'pin') {
                        p.triangle(0, 0, -8 / scale, 12 / scale, 8 / scale, 12 / scale);
                        p.line(-12 / scale, 12 / scale, 12 / scale, 12 / scale);
                    } else if (support.type === 'fixed') {
                        p.line(-10 / scale, 0, 10 / scale, 0);
                        p.line(-10 / scale, 0, -10 / scale, 5 / scale);
                        p.line(10 / scale, 0, 10 / scale, 5 / scale);
                        p.strokeWeight(1 / scale);
                        for (let i = -10; i < 10; i += 4) {
                            p.line(i / scale, 5 / scale, (i - 3) / scale, 8 / scale);
                        }
                    }
                    p.pop();
                });

                // Loads
                loads.forEach(load => {
                    const member = members.find(m => m.id === load.memberId);
                    if (!member) return;
                    const start = nodes.find(n => n.id === member.startNodeId);
                    const end = nodes.find(n => n.id === member.endNodeId);
                    if (!start || !end) return;

                    const dx = end.x - start.x;
                    const dy = end.y - start.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    const ux = dx / len;
                    const uy = dy / len;

                    const lx = start.x + ux * load.position;
                    const ly = start.y + uy * load.position;

                    // Offset higher (perpendicular)
                    const offsetDist = 10 / scale;
                    const nx = uy;
                    const ny = -ux;

                    const drawX = lx + nx * offsetDist;
                    const drawY = ly + ny * offsetDist;

                    p.push();
                    p.translate(drawX, drawY);

                    // Color
                    let loadColor = inactiveColor;
                    if (step === 'loads') loadColor = activeColor;

                    p.stroke(loadColor);
                    p.fill(loadColor);
                    p.strokeWeight(2 / scale);

                    // Arrow
                    const arrowLen = 30 / scale;
                    const isPositive = load.magnitude >= 0;

                    p.push();
                    if (isPositive) {
                        p.rotate(Math.PI);
                    }

                    p.line(0, -arrowLen, 0, 0);
                    p.triangle(0, 0, -4 / scale, -8 / scale, 4 / scale, -8 / scale);
                    p.pop();

                    // Text
                    p.noStroke();
                    p.fill(loadColor);
                    p.textSize(12 / scale);
                    p.textAlign(p.CENTER, p.BOTTOM);

                    const textY = isPositive ? -5 / scale : -arrowLen - 5 / scale;
                    p.text(`${Math.abs(load.magnitude)}kN`, 0, textY);

                    p.pop();
                });

                // --- PREVIEWS & INTERACTION ---

                // Member Preview (Members Step)
                if (step === 'members' && drawingStartNode) {
                    const snapped = getSnappedPoint(mouseWorldPos.x, mouseWorldPos.y);

                    // Solid orange line, 30% opacity
                    p.stroke(249, 115, 22, 76); // Orange 30%
                    p.strokeWeight(6 / scale); // Match member thickness
                    p.line(drawingStartNode.x, drawingStartNode.y, snapped.x, snapped.y);

                    // Length Label
                    const dx = snapped.x - drawingStartNode.x;
                    const dy = snapped.y - drawingStartNode.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    const angle = Math.atan2(dy, dx);

                    p.push();
                    p.translate((drawingStartNode.x + snapped.x) / 2, (drawingStartNode.y + snapped.y) / 2);
                    p.rotate(angle);
                    p.fill(activeColor);
                    p.noStroke();
                    p.textSize(12 / scale);
                    p.textAlign(p.CENTER, p.TOP);
                    if (Math.abs(angle) > Math.PI / 2) p.rotate(Math.PI);
                    p.text(`${Math.round(len)}m`, 0, 4 / scale);
                    p.pop();
                }

                // Support Preview (Supports Step)
                if (step === 'supports') {
                    const snapped = getSnappedPoint(mouseWorldPos.x, mouseWorldPos.y);
                    if (snapped.node) {
                        p.push();
                        p.translate(snapped.node.x, snapped.node.y);

                        // Calculate rotation for preview (same as placement)
                        let rotation = 0;
                        if (stateRef.current.supportType === 'fixed') {
                            const connected = members.filter(m => m.startNodeId === snapped.node!.id || m.endNodeId === snapped.node!.id);
                            if (connected.length > 0) {
                                let sumX = 0;
                                let sumY = 0;
                                connected.forEach(m => {
                                    const start = nodes.find(n => n.id === m.startNodeId);
                                    const end = nodes.find(n => n.id === m.endNodeId);
                                    if (start && end) {
                                        let dx = end.x - start.x;
                                        let dy = end.y - start.y;
                                        if (m.endNodeId === snapped.node!.id) {
                                            dx = -dx;
                                            dy = -dy;
                                        }
                                        const len = Math.sqrt(dx * dx + dy * dy);
                                        sumX += dx / len;
                                        sumY += dy / len;
                                    }
                                });
                                const avgAngle = Math.atan2(sumY, sumX);
                                rotation = avgAngle + Math.PI / 2;
                            }
                        }
                        p.rotate(rotation);

                        // Orange 30% opacity
                        p.stroke(249, 115, 22, 76);
                        p.fill(249, 115, 22, 76);
                        p.strokeWeight(2 / scale);

                        if (stateRef.current.supportType === 'pin') {
                            p.triangle(0, 0, -8 / scale, 12 / scale, 8 / scale, 12 / scale);
                            p.line(-12 / scale, 12 / scale, 12 / scale, 12 / scale);
                        } else if (stateRef.current.supportType === 'fixed') {
                            p.line(-10 / scale, 0, 10 / scale, 0);
                            p.line(-10 / scale, 0, -10 / scale, 5 / scale);
                            p.line(10 / scale, 0, 10 / scale, 5 / scale);
                            p.strokeWeight(1 / scale);
                            for (let i = -10; i < 10; i += 4) {
                                p.line(i / scale, 5 / scale, (i - 3) / scale, 8 / scale);
                            }
                        }
                        p.pop();
                    }
                }

                // Load Preview (Loads Step)
                if (step === 'loads') {
                    const hit = hitTest(mouseWorldPos.x, mouseWorldPos.y);
                    // We need to hit a member, but hitTest returns closest.
                    // Let's use custom logic for proximity to member

                    // Check proximity to any member
                    let closestMember: Member | null = null;
                    let minDist = 20 / scale; // Ghost threshold
                    let projPos: { x: number, y: number } | null = null;
                    let memberPos = 0;

                    for (const member of members) {
                        const start = nodes.find(n => n.id === member.startNodeId);
                        const end = nodes.find(n => n.id === member.endNodeId);
                        if (start && end) {
                            const l2 = p.dist(start.x, start.y, end.x, end.y) ** 2;
                            if (l2 === 0) continue;
                            let t = ((mouseWorldPos.x - start.x) * (end.x - start.x) + (mouseWorldPos.y - start.y) * (end.y - start.y)) / l2;
                            t = Math.max(0, Math.min(1, t));
                            const px = start.x + t * (end.x - start.x);
                            const py = start.y + t * (end.y - start.y);
                            const d = p.dist(mouseWorldPos.x, mouseWorldPos.y, px, py);

                            if (d < minDist) {
                                minDist = d;
                                closestMember = member;
                                projPos = { x: px, y: py };
                                // Calculate position along member
                                memberPos = t * Math.sqrt(l2);
                            }
                        }
                    }

                    if (closestMember && projPos) {
                        // Draw Ghost Arrow
                        const start = nodes.find(n => n.id === closestMember!.startNodeId)!;
                        const end = nodes.find(n => n.id === closestMember!.endNodeId)!;
                        const dx = end.x - start.x;
                        const dy = end.y - start.y;
                        const len = Math.sqrt(dx * dx + dy * dy);
                        const ux = dx / len;
                        const uy = dy / len;

                        const offsetDist = 10 / scale;
                        const nx = uy;
                        const ny = -ux;

                        const drawX = projPos.x + nx * offsetDist;
                        const drawY = projPos.y + ny * offsetDist;

                        p.push();
                        p.translate(drawX, drawY);
                        p.stroke(249, 115, 22, 76); // Orange 30%
                        p.fill(249, 115, 22, 76); // Orange 30%
                        p.strokeWeight(2 / scale);

                        const arrowLen = 30 / scale;

                        p.line(0, -arrowLen, 0, 0);
                        p.triangle(0, 0, -4 / scale, -8 / scale, 4 / scale, -8 / scale);
                        p.pop();
                        p.pop();
                    }
                }

                // Cursor
                if (step === 'members') {
                    const snapped = getSnappedPoint(mouseWorldPos.x, mouseWorldPos.y);
                    p.fill(paleOrange);
                    p.noStroke();
                    p.circle(snapped.x, snapped.y, 10 / scale);
                }

                // Analysis Visualization
                if (step === 'analysis' && viewMode !== 'none' && analysisResults) {
                    // Diagrams
                    if (viewMode === 'deflected' || viewMode === 'sfd' || viewMode === 'bmd') {
                        members.forEach(member => {
                            const diag = analysisResults.diagrams?.[member.id];
                            if (!diag) return;
                            const start = nodes.find(n => n.id === member.startNodeId);
                            const end = nodes.find(n => n.id === member.endNodeId);
                            if (!start || !end) return;

                            const dx = end.x - start.x;
                            const dy = end.y - start.y;
                            const angle = Math.atan2(dy, dx);
                            const len = Math.sqrt(dx * dx + dy * dy);

                            p.push();
                            p.translate(start.x, start.y);
                            p.rotate(angle);

                            if (viewMode === 'deflected') {
                                const s = getDiagramScale('deflection');
                                p.noFill();
                                p.stroke('#f97316'); // Orange
                                p.strokeWeight(2 / scale);
                                p.beginShape();
                                for (let i = 0; i < diag.x.length; i++) {
                                    p.vertex(diag.x[i], -diag.displacement[i] * s);
                                }
                                p.endShape();
                            } else if (viewMode === 'sfd') {
                                const s = getDiagramScale('shear');
                                p.fill(249, 115, 22, 50);
                                p.noStroke();
                                p.beginShape();
                                p.vertex(0, 0);
                                for (let i = 0; i < diag.x.length; i++) {
                                    p.vertex(diag.x[i], -diag.shear[i] * s);
                                }
                                p.vertex(len, 0);
                                p.endShape(p.CLOSE);

                                p.noFill();
                                p.stroke('#f97316');
                                p.strokeWeight(2 / scale);
                                p.beginShape();
                                for (let i = 0; i < diag.x.length; i++) {
                                    p.vertex(diag.x[i], -diag.shear[i] * s);
                                }
                                p.endShape();

                            } else if (viewMode === 'bmd') {
                                const s = getDiagramScale('moment');
                                p.fill(249, 115, 22, 50);
                                p.noStroke();
                                p.beginShape();
                                p.vertex(0, 0);
                                for (let i = 0; i < diag.x.length; i++) {
                                    p.vertex(diag.x[i], diag.moment[i] * s);
                                }
                                p.vertex(len, 0);
                                p.endShape(p.CLOSE);

                                p.noFill();
                                p.stroke('#f97316');
                                p.strokeWeight(2 / scale);
                                p.beginShape();
                                for (let i = 0; i < diag.x.length; i++) {
                                    p.vertex(diag.x[i], diag.moment[i] * s);
                                }
                                p.endShape();
                            }
                            p.pop();
                        });
                    }

                    // Reactions
                    if (viewMode === 'reactions' && analysisResults.reactions) {
                        Object.entries(analysisResults.reactions).forEach(([nodeId, reaction]: [string, any]) => {
                            const node = nodes.find(n => n.id === nodeId);
                            if (!node) return;

                            const Fx = reaction.Fx;
                            const Fy = reaction.Fy;
                            const Mz = reaction.Mz;

                            p.push();
                            p.translate(node.x, node.y);
                            p.stroke('#f97316');
                            p.fill('#f97316');
                            p.strokeWeight(2 / scale);
                            p.textSize(12 / scale);

                            // Fy Arrow
                            if (Math.abs(Fy) > 0.01) {
                                p.push();
                                const arrowLen = 30 / scale;
                                if (Fy > 0) {
                                    // Up
                                    p.line(0, 0, 0, -arrowLen);
                                    p.triangle(0, -arrowLen, -4 / scale, -arrowLen + 8 / scale, 4 / scale, -arrowLen + 8 / scale);
                                    p.textAlign(p.CENTER, p.BOTTOM);
                                    p.noStroke();
                                    p.text(`${Math.abs(Fy).toFixed(2)}kN`, 0, -arrowLen - 5 / scale);
                                } else {
                                    // Down
                                    p.line(0, 0, 0, arrowLen);
                                    p.triangle(0, arrowLen, -4 / scale, arrowLen - 8 / scale, 4 / scale, arrowLen - 8 / scale);
                                    p.textAlign(p.CENTER, p.TOP);
                                    p.noStroke();
                                    p.text(`${Math.abs(Fy).toFixed(2)}kN`, 0, arrowLen + 5 / scale);
                                }
                                p.pop();
                            }

                            // Fx Arrow
                            if (Math.abs(Fx) > 0.01) {
                                p.push();
                                const arrowLen = 30 / scale;
                                if (Fx > 0) {
                                    // Right
                                    p.line(0, 0, arrowLen, 0);
                                    p.triangle(arrowLen, 0, arrowLen - 8 / scale, -4 / scale, arrowLen - 8 / scale, 4 / scale);
                                    p.textAlign(p.LEFT, p.CENTER);
                                    p.noStroke();
                                    p.text(`${Math.abs(Fx).toFixed(2)}kN`, arrowLen + 5 / scale, 0);
                                } else {
                                    // Left
                                    p.line(0, 0, -arrowLen, 0);
                                    p.triangle(-arrowLen, 0, -arrowLen + 8 / scale, -4 / scale, -arrowLen + 8 / scale, 4 / scale);
                                    p.textAlign(p.RIGHT, p.CENTER);
                                    p.noStroke();
                                    p.text(`${Math.abs(Fx).toFixed(2)}kN`, -arrowLen - 5 / scale, 0);
                                }
                                p.pop();
                            }

                            // Moment Reaction
                            if (Math.abs(Mz) > 1e-3) {
                                p.push(); // Push for moment drawing
                                const arcSize = 20 / scale;
                                const startAngle = Mz > 0 ? p.PI : 0;
                                const endAngle = Mz > 0 ? 0 : p.PI;

                                p.noFill();
                                p.stroke('#f97316');
                                p.strokeWeight(2 / scale);
                                p.arc(0, 0, arcSize, arcSize, startAngle, endAngle);

                                // Arrowhead for moment
                                const arrowSize = 6 / scale;
                                const arrowX = (arcSize / 2) * Math.cos(endAngle);
                                const arrowY = (arcSize / 2) * Math.sin(endAngle);

                                p.push(); // Push for arrowhead
                                p.translate(arrowX, arrowY);
                                p.rotate(endAngle + (Mz > 0 ? p.PI / 2 : -p.PI / 2));
                                p.fill('#f97316');
                                p.noStroke();
                                p.triangle(0, -arrowSize / 2, arrowSize, 0, 0, arrowSize / 2);
                                p.pop(); // Pop for arrowhead

                                p.noStroke();
                                p.fill('#f97316');
                                p.textSize(12 / scale);
                                p.textAlign(p.CENTER, p.TOP);
                                p.text(`${Math.abs(Mz).toFixed(2)} kNm`, 0, 15 / scale);
                                p.pop(); // Pop for moment drawing
                            }

                            p.pop();
                        });
                    }
                }

                p.pop();
            };

            p.mousePressed = (event: MouseEvent) => {
                if (event.target !== (p as any).canvas) return;

                const world = screenToWorld(p.mouseX, p.mouseY);
                const { step, nodes, members } = stateRef.current;

                if (step === 'members') {
                    const snapped = getSnappedPoint(world.x, world.y);
                    let node = snapped.node;

                    if (!node) {
                        node = { id: uuidv4(), x: snapped.x, y: snapped.y };
                        setNodes(prev => [...prev, node!]);
                    }

                    if (!stateRef.current.drawingStartNode) {
                        stateRef.current.drawingStartNode = node;
                    } else {
                        const startNode = stateRef.current.drawingStartNode;
                        if (startNode.id !== node.id) {
                            const newMember: Member = {
                                id: uuidv4(),
                                startNodeId: startNode.id,
                                endNodeId: node.id,
                                startRelease: 'pinned',
                                endRelease: 'pinned',
                                properties: { E: 200e9, I: 1e-5, A: 1e-3 }
                            };
                            setMembers(prev => [...prev, newMember]);
                        }
                        stateRef.current.drawingStartNode = node;
                    }
                } else if (step === 'supports') {
                    const snapped = getSnappedPoint(world.x, world.y);
                    if (snapped.node) {
                        const nodeId = snapped.node.id;

                        // Auto-fix member releases if adding a Fixed support
                        if (stateRef.current.supportType === 'fixed') {
                            setMembers(prev => prev.map(m => {
                                if (m.startNodeId === nodeId) return { ...m, startRelease: 'fixed' };
                                if (m.endNodeId === nodeId) return { ...m, endRelease: 'fixed' };
                                return m;
                            }));
                        }

                        setSupports(prev => {
                            const existing = prev.find(s => s.nodeId === nodeId);
                            if (existing) {
                                return prev.map(s => s.id === existing.id ? { ...s, type: stateRef.current.supportType } : s);
                            } else {
                                return [...prev, { id: uuidv4(), nodeId, type: stateRef.current.supportType, angle: 0 }];
                            }
                        });
                    }
                } else if (step === 'joints') {
                    const hit = hitTest(world.x, world.y);
                    if (hit && hit.type === 'node') {
                        const nodeId = hit.id;

                        if (isNodeEditable(nodeId)) {
                            // Toggle state: Fixed <-> Pinned
                            const connected = members.filter(m => m.startNodeId === nodeId || m.endNodeId === nodeId);
                            const allFixed = connected.every(m =>
                                (m.startNodeId === nodeId && m.startRelease === 'fixed') ||
                                (m.endNodeId === nodeId && m.endRelease === 'fixed')
                            );

                            const newRelease = allFixed ? 'pinned' : 'fixed';

                            setMembers(prev => prev.map(m => {
                                if (m.startNodeId === nodeId) return { ...m, startRelease: newRelease };
                                if (m.endNodeId === nodeId) return { ...m, endRelease: newRelease };
                                return m;
                            }));
                        }
                    }
                } else if (step === 'loads') {
                    // Hit test member
                    let closestMember: Member | null = null;
                    let minDist = 20 / stateRef.current.scale;
                    let pos = 0;

                    for (const member of members) {
                        const start = nodes.find(n => n.id === member.startNodeId);
                        const end = nodes.find(n => n.id === member.endNodeId);
                        if (start && end) {
                            const l2 = p.dist(start.x, start.y, end.x, end.y) ** 2;
                            if (l2 === 0) continue;
                            let t = ((world.x - start.x) * (end.x - start.x) + (world.y - start.y) * (end.y - start.y)) / l2;
                            t = Math.max(0, Math.min(1, t));
                            const px = start.x + t * (end.x - start.x);
                            const py = start.y + t * (end.y - start.y);
                            const d = p.dist(world.x, world.y, px, py);

                            if (d < minDist) {
                                minDist = d;
                                closestMember = member;
                                pos = t * Math.sqrt(l2);
                            }
                        }
                    }

                    if (closestMember) {
                        setLoads(prev => [...prev, {
                            id: uuidv4(),
                            memberId: closestMember!.id,
                            type: 'point',
                            magnitude: stateRef.current.loadMagnitude,
                            position: pos
                        }]);
                    }
                }
            };
        };

        const p5Obj = new p5(sketch, containerRef.current);
        p5Instance.current = p5Obj;

        return () => {
            p5Obj.remove();
        };
    }, []);

    return <div ref={containerRef} className="w-full h-full" />;
}
