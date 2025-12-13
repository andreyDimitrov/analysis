'use client';

import React, { useRef, useEffect, useState } from 'react';
import p5 from 'p5';
import { RotateCcw } from 'lucide-react';

interface ControlPoint {
    x: number;
    y: number;
}

// B-spline basis function (Cox-de Boor recursion)
function basisFunction(i: number, degree: number, t: number, knots: number[]): number {
    if (degree === 0) {
        return (t >= knots[i] && t < knots[i + 1]) ? 1 : 0;
    }

    let left = 0;
    let right = 0;

    const leftDenom = knots[i + degree] - knots[i];
    if (leftDenom !== 0) {
        left = ((t - knots[i]) / leftDenom) * basisFunction(i, degree - 1, t, knots);
    }

    const rightDenom = knots[i + degree + 1] - knots[i + 1];
    if (rightDenom !== 0) {
        right = ((knots[i + degree + 1] - t) / rightDenom) * basisFunction(i + 1, degree - 1, t, knots);
    }

    return left + right;
}

// Generate uniform knot vector
function generateKnots(numControlPoints: number, degree: number): number[] {
    const n = numControlPoints - 1;
    const m = n + degree + 1;
    const knots: number[] = [];

    for (let i = 0; i <= m; i++) {
        if (i <= degree) {
            knots.push(0);
        } else if (i >= m - degree) {
            knots.push(1);
        } else {
            knots.push((i - degree) / (m - 2 * degree));
        }
    }

    return knots;
}

// Evaluate B-spline curve at parameter t
function evaluateBSpline(controlPoints: ControlPoint[], degree: number, t: number): ControlPoint {
    const knots = generateKnots(controlPoints.length, degree);
    let x = 0;
    let y = 0;

    // Clamp t to avoid edge cases
    const tClamped = Math.min(Math.max(t, 0), 0.9999);

    for (let i = 0; i < controlPoints.length; i++) {
        const basis = basisFunction(i, degree, tClamped, knots);
        x += basis * controlPoints[i].x;
        y += basis * controlPoints[i].y;
    }

    return { x, y };
}

export default function NurbsCanvas() {
    const containerRef = useRef<HTMLDivElement>(null);
    const p5Instance = useRef<p5 | null>(null);
    const [controlPoints, setControlPoints] = useState<ControlPoint[]>([]);
    const [degree, setDegree] = useState<number>(3);

    // State ref for p5 access
    const stateRef = useRef({
        controlPoints: [] as ControlPoint[],
        degree: 3,
        scale: 1,
        offset: { x: 0, y: 0 },
        hoveredPointIndex: -1,
        draggingPointIndex: -1,
    });

    // Update refs when state changes
    useEffect(() => {
        stateRef.current.controlPoints = controlPoints;
        stateRef.current.degree = degree;
    }, [controlPoints, degree]);

    const clearPoints = () => {
        setControlPoints([]);
    };

    // Effective degree (can't be higher than n-1 where n is number of control points)
    const effectiveDegree = Math.min(degree, Math.max(0, controlPoints.length - 1));
    const canDrawCurve = controlPoints.length > effectiveDegree && effectiveDegree >= 1;

    useEffect(() => {
        if (!containerRef.current) return;

        const sketch = (p: p5) => {
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

            p.setup = () => {
                p.createCanvas(containerRef.current!.clientWidth, containerRef.current!.clientHeight);
                p.frameRate(60);

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

            const originalRemove = p.remove;
            p.remove = () => {
                resizeObserver.disconnect();
                originalRemove.call(p);
            };

            p.draw = () => {
                p.background(250);

                const { scale, offset, controlPoints, degree, hoveredPointIndex, draggingPointIndex } = stateRef.current;
                const worldMouse = screenToWorld(p.mouseX, p.mouseY);

                // Check for hovered point
                let newHoveredIndex = -1;
                const hitDist = 10 / scale;
                for (let i = 0; i < controlPoints.length; i++) {
                    if (p.dist(worldMouse.x, worldMouse.y, controlPoints[i].x, controlPoints[i].y) < hitDist) {
                        newHoveredIndex = i;
                        break;
                    }
                }
                stateRef.current.hoveredPointIndex = newHoveredIndex;

                p.push();
                p.translate(offset.x, offset.y);
                p.scale(scale);

                // Draw grid axes
                p.stroke(200);
                p.strokeWeight(2 / scale);
                const startX = Math.floor(-offset.x / scale);
                const endX = Math.ceil((-offset.x + p.width) / scale);
                const startY = Math.floor(-offset.y / scale);
                const endY = Math.ceil((-offset.y + p.height) / scale);
                p.line(startX, 0, endX, 0);
                p.line(0, startY, 0, endY);

                // Draw control polygon (dashed-like with segments)
                if (controlPoints.length > 1) {
                    p.stroke(180);
                    p.strokeWeight(1 / scale);
                    for (let i = 0; i < controlPoints.length - 1; i++) {
                        p.line(
                            controlPoints[i].x, controlPoints[i].y,
                            controlPoints[i + 1].x, controlPoints[i + 1].y
                        );
                    }
                }

                // Draw B-spline curve (same style as deflection curve)
                const effectiveDeg = Math.min(degree, Math.max(0, controlPoints.length - 1));
                if (controlPoints.length > effectiveDeg && effectiveDeg >= 1) {
                    p.noFill();
                    p.stroke('#f97316'); // Orange - same as deflection curve
                    p.strokeWeight(2 / scale);
                    p.beginShape();

                    const numSamples = 100;
                    for (let i = 0; i <= numSamples; i++) {
                        const t = i / numSamples;
                        const pt = evaluateBSpline(controlPoints, effectiveDeg, t);
                        p.vertex(pt.x, pt.y);
                    }

                    p.endShape();
                }

                // Draw control points
                for (let i = 0; i < controlPoints.length; i++) {
                    const pt = controlPoints[i];
                    const isHovered = i === hoveredPointIndex;
                    const isDragging = i === draggingPointIndex;

                    // Point style
                    p.strokeWeight(2 / scale);
                    if (isDragging) {
                        p.stroke('#f97316');
                        p.fill('#f97316');
                    } else if (isHovered) {
                        p.stroke('#f97316');
                        p.fill('#fff');
                    } else {
                        p.stroke('#000');
                        p.fill('#fff');
                    }

                    p.circle(pt.x, pt.y, 8 / scale);

                    // Point index label
                    p.noStroke();
                    p.fill(100);
                    p.textSize(10 / scale);
                    p.textAlign(p.CENTER, p.BOTTOM);
                    p.text(`P${i}`, pt.x, pt.y - 8 / scale);
                }

                // Cursor preview when not hovering a point
                if (hoveredPointIndex === -1 && draggingPointIndex === -1) {
                    p.fill(253, 186, 116, 150); // Pale orange
                    p.noStroke();
                    p.circle(worldMouse.x, worldMouse.y, 10 / scale);
                }

                p.pop();
            };

            p.mousePressed = (event: MouseEvent) => {
                if (event.target !== (p as any).canvas) return;

                const world = screenToWorld(p.mouseX, p.mouseY);
                const { controlPoints, hoveredPointIndex } = stateRef.current;

                if (hoveredPointIndex >= 0) {
                    // Start dragging existing point
                    stateRef.current.draggingPointIndex = hoveredPointIndex;
                } else {
                    // Add new control point
                    const newPoint: ControlPoint = { x: world.x, y: world.y };
                    setControlPoints(prev => [...prev, newPoint]);
                }
            };

            p.mouseDragged = (event: MouseEvent) => {
                if (event.target !== (p as any).canvas) return;

                const { draggingPointIndex } = stateRef.current;
                if (draggingPointIndex >= 0) {
                    const world = screenToWorld(p.mouseX, p.mouseY);
                    setControlPoints(prev => {
                        const newPoints = [...prev];
                        newPoints[draggingPointIndex] = { x: world.x, y: world.y };
                        return newPoints;
                    });
                }
            };

            p.mouseReleased = () => {
                stateRef.current.draggingPointIndex = -1;
            };
        };

        const p5Obj = new p5(sketch, containerRef.current);
        p5Instance.current = p5Obj;

        return () => {
            p5Obj.remove();
        };
    }, []);

    return (
        <div className="flex flex-col h-screen relative">
            {/* Top Overlay UI */}
            <div className="absolute top-8 left-0 right-0 flex flex-col items-center z-10 pointer-events-none">
                <div className="pointer-events-auto flex flex-col items-center max-w-lg text-center">
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">NURBS Curve</h1>
                    <p className="text-gray-500 text-sm">Click to add control points. Drag points to adjust the curve.</p>

                    {/* Degree Control */}
                    <div className="flex items-center gap-3 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg border border-gray-200 shadow-sm mt-4">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Degree</span>
                        <div className="flex bg-gray-100 rounded-md">
                            {[1, 2, 3, 4, 5].map(d => (
                                <button
                                    key={d}
                                    onClick={() => setDegree(d)}
                                    className={`px-3 py-1.5 text-sm font-medium transition-all rounded-md ${degree === d
                                        ? 'bg-white text-orange-600 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    {d}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Info */}
                    <div className="mt-3 text-xs text-gray-400">
                        {controlPoints.length} control point{controlPoints.length !== 1 ? 's' : ''}
                        {controlPoints.length > 0 && ` · Effective degree: ${effectiveDegree}`}
                        {!canDrawCurve && controlPoints.length > 0 && (
                            <span className="text-orange-500 ml-1">
                                (need {effectiveDegree + 1 - controlPoints.length} more point{effectiveDegree + 1 - controlPoints.length !== 1 ? 's' : ''})
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom Overlay UI */}
            {controlPoints.length > 0 && (
                <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center z-10 pointer-events-none">
                    <div className="pointer-events-auto">
                        <button
                            onClick={clearPoints}
                            className="px-6 py-2 bg-gray-800 text-white hover:bg-gray-700 rounded-md shadow-sm border-transparent transition-colors flex items-center gap-2 font-medium text-sm"
                        >
                            <RotateCcw size={16} /> Clear
                        </button>
                    </div>
                </div>
            )}

            {/* Canvas Container */}
            <div className="flex-grow overflow-hidden relative">
                <div ref={containerRef} className="w-full h-full" />
            </div>
        </div>
    );
}


