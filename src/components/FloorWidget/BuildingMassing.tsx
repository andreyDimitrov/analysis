'use client';

import React, { useRef } from 'react';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import { FloorLevel, UseType, USE_TYPE_COLORS, USE_TYPE_INDICATOR_COLORS } from './types';
import { Plus, Minus } from 'lucide-react';

interface BuildingMassingProps {
    floors: FloorLevel[];
    hoveredFloorId: string | null;
    selectedFloorId: string | null;
    onFloorHover: (id: string | null) => void;
    onFloorClick: (id: string | null) => void;
    onAddFloor: (afterId: string) => void;
    onRemoveFloor: (id: string) => void;
    onUpdateFloor: (id: string, updates: Partial<FloorLevel>) => void;
}

const USE_TYPE_OPTIONS: UseType[] = ['Roof', 'Residential', 'Office', 'Retail', 'Foundation'];

export function BuildingMassing({
    floors,
    hoveredFloorId,
    selectedFloorId,
    onFloorHover,
    onFloorClick,
    onAddFloor,
    onRemoveFloor,
    onUpdateFloor
}: BuildingMassingProps) {
    const scale = 1;

    return (
        <group>
            {floors.map((floor) => (
                <FloorBox
                    key={floor.id}
                    floor={floor}
                    scale={scale}
                    isHovered={hoveredFloorId === floor.id}
                    isSelected={selectedFloorId === floor.id}
                    onHover={onFloorHover}
                    onClick={onFloorClick}
                    onAddFloor={onAddFloor}
                    onRemoveFloor={onRemoveFloor}
                    onUpdateFloor={onUpdateFloor}
                />
            ))}
        </group>
    );
}

interface FloorBoxProps {
    floor: FloorLevel;
    scale: number;
    isHovered: boolean;
    isSelected: boolean;
    onHover: (id: string | null) => void;
    onClick: (id: string | null) => void;
    onAddFloor: (afterId: string) => void;
    onRemoveFloor: (id: string) => void;
    onUpdateFloor: (id: string, updates: Partial<FloorLevel>) => void;
}

function FloorBox({ 
    floor, 
    scale, 
    isHovered, 
    isSelected, 
    onHover, 
    onClick,
    onAddFloor,
    onRemoveFloor,
    onUpdateFloor
}: FloorBoxProps) {
    const meshRef = useRef<THREE.Mesh>(null);
    
    const { width, depth, offsetX, offsetZ } = floor.footprint;
    const totalHeight = floor.height * scale;
    const slabThickness = 0.5;
    const wallsHeight = totalHeight - slabThickness;
    const baseColor = USE_TYPE_COLORS[floor.useType];
    
    // Group position: at the floor's XZ offset, Y at floor elevation
    const groupY = floor.elevation * scale;
    const x = offsetX * scale;
    const z = offsetZ * scale;
    
    // Adjust color based on hover/selection state
    const color = isHovered || isSelected 
        ? lightenColor(baseColor, 0.2)
        : baseColor;
    
    const slabOpacity = isHovered ? 0.9 : 0.75;
    const wallsOpacity = 0.2;
    
    const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onHover(floor.id);
    };
    
    const handlePointerOut = () => {
        onHover(null);
    };
    
    const handleClick = (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick(floor.id);
    };

    const lineColor = isHovered || isSelected ? '#000' : '#444';
    const lineWidth = isHovered || isSelected ? 2 : 1;

    // Slab edges (at floor level, going down 0.5)
    const slabBottom = -slabThickness;
    const slabTop = 0;
    
    const slabBottomEdge: [number, number, number][] = [
        [-width/2, slabBottom, -depth/2],
        [width/2, slabBottom, -depth/2],
        [width/2, slabBottom, depth/2],
        [-width/2, slabBottom, depth/2],
        [-width/2, slabBottom, -depth/2],
    ];

    const slabTopEdge: [number, number, number][] = [
        [-width/2, slabTop, -depth/2],
        [width/2, slabTop, -depth/2],
        [width/2, slabTop, depth/2],
        [-width/2, slabTop, depth/2],
        [-width/2, slabTop, -depth/2],
    ];

    // Walls edges (from floor level going up)
    const wallsTop = wallsHeight;
    
    const wallsTopEdge: [number, number, number][] = [
        [-width/2, wallsTop, -depth/2],
        [width/2, wallsTop, -depth/2],
        [width/2, wallsTop, depth/2],
        [-width/2, wallsTop, depth/2],
        [-width/2, wallsTop, -depth/2],
    ];

    // Vertical edges for slab
    const slabVerticalLines = [
        [[-width/2, slabBottom, -depth/2], [-width/2, slabTop, -depth/2]],
        [[width/2, slabBottom, -depth/2], [width/2, slabTop, -depth/2]],
        [[width/2, slabBottom, depth/2], [width/2, slabTop, depth/2]],
        [[-width/2, slabBottom, depth/2], [-width/2, slabTop, depth/2]],
    ] as [[number, number, number], [number, number, number]][];

    // Vertical edges for walls (from slab top to walls top)
    const wallsVerticalLines = [
        [[-width/2, slabTop, -depth/2], [-width/2, wallsTop, -depth/2]],
        [[width/2, slabTop, -depth/2], [width/2, wallsTop, -depth/2]],
        [[width/2, slabTop, depth/2], [width/2, wallsTop, depth/2]],
        [[-width/2, slabTop, depth/2], [-width/2, wallsTop, depth/2]],
    ] as [[number, number, number], [number, number, number]][];

    // Grid lines on slab top surface
    const gridLinesX: [number, number, number][][] = [];
    const gridLinesZ: [number, number, number][][] = [];
    const gridSpacing = 5;
    
    for (let i = -width/2 + gridSpacing; i < width/2; i += gridSpacing) {
        gridLinesX.push([
            [i, slabTop, -depth/2],
            [i, slabTop, depth/2]
        ]);
    }
    
    for (let i = -depth/2 + gridSpacing; i < depth/2; i += gridSpacing) {
        gridLinesZ.push([
            [-width/2, slabTop, i],
            [width/2, slabTop, i]
        ]);
    }

    // Position for the HTML label - at the corner (0,0), offset by -5,-5
    const labelX = -width / 2 - 5;
    const labelY = 0;
    const labelZ = -depth / 2 - 5;

    // Connector line from floor corner to label
    const connectorStart: [number, number, number] = [-width / 2 - 0.5, 0, -depth / 2 - 0.5];
    const connectorEnd: [number, number, number] = [labelX, labelY, labelZ];

    return (
        <group position={[x, groupY, z]}>
            {/* Floor slab - solid, 0.5 thick, going down from floor elevation */}
            <mesh
                ref={meshRef}
                position={[0, -slabThickness / 2, 0]}
                onPointerOver={handlePointerOver}
                onPointerOut={handlePointerOut}
                onClick={handleClick}
            >
                <boxGeometry args={[width * scale, slabThickness, depth * scale]} />
                <meshStandardMaterial 
                    color={color}
                    transparent
                    opacity={slabOpacity}
                    side={THREE.DoubleSide}
                />
            </mesh>

            {/* Walls - 4 planes, no top/bottom, 0.2 opacity */}
            {wallsHeight > 0 && (
                <group position={[0, wallsHeight / 2, 0]}>
                    {/* Front wall */}
                    <mesh 
                        position={[0, 0, -depth/2]}
                        onPointerOver={handlePointerOver}
                        onPointerOut={handlePointerOut}
                        onClick={handleClick}
                    >
                        <planeGeometry args={[width, wallsHeight]} />
                        <meshStandardMaterial 
                            color={color}
                            transparent
                            opacity={wallsOpacity}
                            side={THREE.DoubleSide}
                        />
                    </mesh>
                    {/* Back wall */}
                    <mesh 
                        position={[0, 0, depth/2]}
                        onPointerOver={handlePointerOver}
                        onPointerOut={handlePointerOut}
                        onClick={handleClick}
                    >
                        <planeGeometry args={[width, wallsHeight]} />
                        <meshStandardMaterial 
                            color={color}
                            transparent
                            opacity={wallsOpacity}
                            side={THREE.DoubleSide}
                        />
                    </mesh>
                    {/* Left wall */}
                    <mesh 
                        position={[-width/2, 0, 0]}
                        rotation={[0, Math.PI / 2, 0]}
                        onPointerOver={handlePointerOver}
                        onPointerOut={handlePointerOut}
                        onClick={handleClick}
                    >
                        <planeGeometry args={[depth, wallsHeight]} />
                        <meshStandardMaterial 
                            color={color}
                            transparent
                            opacity={wallsOpacity}
                            side={THREE.DoubleSide}
                        />
                    </mesh>
                    {/* Right wall */}
                    <mesh 
                        position={[width/2, 0, 0]}
                        rotation={[0, Math.PI / 2, 0]}
                        onPointerOver={handlePointerOver}
                        onPointerOut={handlePointerOut}
                        onClick={handleClick}
                    >
                        <planeGeometry args={[depth, wallsHeight]} />
                        <meshStandardMaterial 
                            color={color}
                            transparent
                            opacity={wallsOpacity}
                            side={THREE.DoubleSide}
                        />
                    </mesh>
                </group>
            )}

            {/* Slab edges - Bottom */}
            <Line points={slabBottomEdge} color={lineColor} lineWidth={lineWidth} />
            
            {/* Slab edges - Top (floor level) */}
            <Line points={slabTopEdge} color={lineColor} lineWidth={lineWidth} />
            
            {/* Slab vertical edges */}
            {slabVerticalLines.map((points, i) => (
                <Line key={`slab-vert-${i}`} points={points} color={lineColor} lineWidth={lineWidth} />
            ))}

            {/* Walls top edge */}
            {wallsHeight > 0 && (
                <Line points={wallsTopEdge} color={lineColor} lineWidth={lineWidth} />
            )}
            
            {/* Walls vertical edges */}
            {wallsHeight > 0 && wallsVerticalLines.map((points, i) => (
                <Line key={`walls-vert-${i}`} points={points} color={lineColor} lineWidth={lineWidth} />
            ))}

            {/* Grid lines on slab top */}
            {gridLinesX.map((points, i) => (
                <Line key={`gridX-${i}`} points={points} color={lineColor} lineWidth={0.5} opacity={0.5} transparent />
            ))}
            {gridLinesZ.map((points, i) => (
                <Line key={`gridZ-${i}`} points={points} color={lineColor} lineWidth={0.5} opacity={0.5} transparent />
            ))}

            {/* Connector line from floor corner to label */}
            <Line 
                points={[connectorStart, connectorEnd]} 
                color="#999" 
                lineWidth={1} 
            />

            {/* HTML Label */}
            <Html
                position={[labelX, labelY, labelZ]}
                style={{ pointerEvents: 'none' }}
                center={false}
                transform={false}
                occlude={false}
            >
                <FloorLabel
                    floor={floor}
                    isHovered={isHovered}
                    isSelected={isSelected}
                    onHover={onHover}
                    onAddFloor={onAddFloor}
                    onRemoveFloor={onRemoveFloor}
                    onUpdateFloor={onUpdateFloor}
                />
            </Html>
        </group>
    );
}

interface FloorLabelProps {
    floor: FloorLevel;
    isHovered: boolean;
    isSelected: boolean;
    onHover: (id: string | null) => void;
    onAddFloor: (afterId: string) => void;
    onRemoveFloor: (id: string) => void;
    onUpdateFloor: (id: string, updates: Partial<FloorLevel>) => void;
}

function FloorLabel({
    floor,
    isHovered,
    isSelected,
    onHover,
    onAddFloor,
    onRemoveFloor,
    onUpdateFloor
}: FloorLabelProps) {
    const indicatorColor = USE_TYPE_INDICATOR_COLORS[floor.useType];
    const isGroundLevel = floor.isGroundLevel;
    
    return (
        <div 
            className="pointer-events-none"
            style={{ position: 'absolute', transform: 'none' }}
        >
            <div className="flex flex-col items-end -translate-x-[100%] -translate-y-[50%]">
                {/* Main label row */}
                <div 
                    className={`
                        pointer-events-auto flex w-fit
                        items-center text-nowrap rounded bg-white p-1 text-sm text-gray-700 shadow
                        transition-all duration-150
                        ${isHovered ? 'ring-2 ring-blue-400' : ''}
                        ${isSelected ? 'ring-2 ring-blue-600' : ''}
                    `}
                    onMouseEnter={() => onHover(floor.id)}
                    onMouseLeave={() => onHover(null)}
                >
                    {/* Add button */}
                    <button 
                        className="mr-1 rounded-full p-0.5 hover:text-blue-600 hover:bg-blue-50"
                        onClick={(e) => {
                            e.stopPropagation();
                            onAddFloor(floor.id);
                        }}
                        title="Add floor below"
                    >
                        <Plus className="h-3 w-3" />
                    </button>

                    {/* Remove button */}
                    {floor.useType !== 'Foundation' && (
                        <button 
                            className="mr-2 rounded-full p-0.5 hover:text-red-600 hover:bg-red-50"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemoveFloor(floor.id);
                            }}
                            title="Remove floor"
                        >
                            <Minus className="h-3 w-3" />
                        </button>
                    )}

                    {/* Color indicator */}
                    <div 
                        className="w-1.5 h-4 rounded-full mr-2"
                        style={{ backgroundColor: indicatorColor }}
                    />

                    {/* Elevation */}
                    <span className="mr-2 font-mono text-xs text-gray-500">
                        {floor.elevation >= 0 ? '+' : ''}{floor.elevation.toFixed(1)}
                    </span>

                    {/* Level name */}
                    <input
                        type="text"
                        value={floor.name}
                        onChange={(e) => onUpdateFloor(floor.id, { name: e.target.value })}
                        className="mr-1 w-16 bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none text-xs px-0"
                        onClick={(e) => e.stopPropagation()}
                    />

                    <span className="mr-1 text-gray-400">-</span>

                    {/* Use Type */}
                    <select
                        value={floor.useType}
                        onChange={(e) => onUpdateFloor(floor.id, { useType: e.target.value as UseType })}
                        className="mr-2 bg-transparent border border-gray-200 rounded px-1 py-0 text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {USE_TYPE_OPTIONS.map(type => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>

                    {/* Height */}
                    <input
                        type="number"
                        value={floor.height}
                        onChange={(e) => onUpdateFloor(floor.id, { height: parseFloat(e.target.value) || 0.1 })}
                        step={0.1}
                        min={0.1}
                        className="w-10 bg-transparent border border-gray-200 rounded px-1 py-0 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <span className="ml-0.5 text-xs text-gray-400">m</span>
                </div>

                {/* Ground level separator - shown below Level 1 */}
                {isGroundLevel && (
                    <div className="w-full mt-2 flex items-center justify-end">
                        <div className="w-80 h-0.5 bg-gray-400" />
                    </div>
                )}
            </div>
        </div>
    );
}

function lightenColor(hex: string, amount: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * amount));
    const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * amount));
    const b = Math.min(255, (num & 0xff) + Math.round(255 * amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
