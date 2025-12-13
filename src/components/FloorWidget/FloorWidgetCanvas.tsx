'use client';

import React, { useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { FloorLevel } from './types';
import { BuildingMassing } from './BuildingMassing';
import { v4 as uuidv4 } from 'uuid';

// Initial building data - elevations will be calculated from heights
// Level 1 is the ground floor (elevation 0), all others calculated relative to it
// All floors align at corner (0,0) - offsetX = width/2, offsetZ = depth/2
const initialFloors: FloorLevel[] = [
    {
        id: uuidv4(),
        elevation: 0,
        name: 'Level 9',
        useType: 'Residential',
        height: 3.3,
        footprint: { width: 20, depth: 30, offsetX: 10, offsetZ: 15 }
    },
    {
        id: uuidv4(),
        elevation: 0,
        name: 'Level 8',
        useType: 'Residential',
        height: 3.3,
        footprint: { width: 20, depth: 30, offsetX: 10, offsetZ: 15 }
    },
    {
        id: uuidv4(),
        elevation: 0,
        name: 'Level 7',
        useType: 'Residential',
        height: 3.3,
        footprint: { width: 20, depth: 30, offsetX: 10, offsetZ: 15 }
    },
    {
        id: uuidv4(),
        elevation: 0,
        name: 'Level 6',
        useType: 'Residential',
        height: 3.3,
        footprint: { width: 20, depth: 30, offsetX: 10, offsetZ: 15 }
    },
    {
        id: uuidv4(),
        elevation: 0,
        name: 'Level 5',
        useType: 'Residential',
        height: 3.3,
        footprint: { width: 20, depth: 30, offsetX: 10, offsetZ: 15 }
    },
    {
        id: uuidv4(),
        elevation: 0,
        name: 'Level 4',
        useType: 'Office',
        height: 3.5,
        footprint: { width: 20, depth: 30, offsetX: 10, offsetZ: 15 }
    },
    {
        id: uuidv4(),
        elevation: 0,
        name: 'Level 3',
        useType: 'Office',
        height: 3.5,
        footprint: { width: 20, depth: 30, offsetX: 10, offsetZ: 15 }
    },
    {
        id: uuidv4(),
        elevation: 0,
        name: 'Level 2',
        useType: 'Retail',
        height: 4.0,
        footprint: { width: 30, depth: 35, offsetX: 15, offsetZ: 17.5 }
    },
    {
        id: uuidv4(),
        elevation: 0,
        name: 'Level 1',
        useType: 'Retail',
        height: 4.0,
        isGroundLevel: true, // This is the reference floor at elevation 0
        footprint: { width: 30, depth: 35, offsetX: 15, offsetZ: 17.5 }
    },
    {
        id: uuidv4(),
        elevation: 0,
        name: 'Level B1',
        useType: 'Office',
        height: 4.0,
        footprint: { width: 30, depth: 35, offsetX: 15, offsetZ: 17.5 }
    },
    {
        id: uuidv4(),
        elevation: 0,
        name: 'Level B2',
        useType: 'Office',
        height: 4.0,
        footprint: { width: 30, depth: 35, offsetX: 15, offsetZ: 17.5 }
    },
];

export default function FloorWidgetCanvas() {
    // Initialize with calculated elevations
    const [floors, setFloors] = useState<FloorLevel[]>(() => recalculateElevations(initialFloors));
    const [hoveredFloorId, setHoveredFloorId] = useState<string | null>(null);
    const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);

    const handleAddFloor = useCallback((afterId: string) => {
        setFloors(prev => {
            const index = prev.findIndex(f => f.id === afterId);
            if (index === -1) return prev;
            
            const currentFloor = prev[index];
            const newFloor: FloorLevel = {
                id: uuidv4(),
                elevation: 0, // Will be recalculated
                name: `New Level`,
                useType: 'Office',
                height: 3.5,
                isGroundLevel: false,
                footprint: { ...currentFloor.footprint }
            };
            
            const newFloors = [...prev];
            newFloors.splice(index + 1, 0, newFloor);
            return recalculateElevations(newFloors);
        });
    }, []);

    const handleRemoveFloor = useCallback((id: string) => {
        setFloors(prev => {
            const filtered = prev.filter(f => f.id !== id);
            return recalculateElevations(filtered);
        });
    }, []);

    const handleUpdateFloor = useCallback((id: string, updates: Partial<FloorLevel>) => {
        setFloors(prev => {
            const newFloors = prev.map(f => 
                f.id === id ? { ...f, ...updates } : f
            );
            return recalculateElevations(newFloors);
        });
    }, []);

    return (
        <div className="relative w-full h-full bg-gray-200">
            {/* Three.js Canvas */}
            <Canvas className="w-full h-full">
                <color attach="background" args={['#e5e5e5']} />
                <ambientLight intensity={0.6} />
                <directionalLight position={[50, 50, 25]} intensity={0.8} />
                <directionalLight position={[-30, 30, -25]} intensity={0.3} />
                
                <PerspectiveCamera 
                    makeDefault 
                    position={[60, 40, 60]} 
                    fov={45}
                />
                
                <BuildingMassing 
                    floors={floors}
                    hoveredFloorId={hoveredFloorId}
                    selectedFloorId={selectedFloorId}
                    onFloorHover={setHoveredFloorId}
                    onFloorClick={setSelectedFloorId}
                    onAddFloor={handleAddFloor}
                    onRemoveFloor={handleRemoveFloor}
                    onUpdateFloor={handleUpdateFloor}
                />
                
                <OrbitControls 
                    enablePan={true}
                    enableZoom={true}
                    enableRotate={true}
                    target={[15, 15, 17]}
                />
            </Canvas>
        </div>
    );
}

/**
 * Recalculate elevations based on heights, with Level 1 (ground) at elevation 0.
 * 
 * - Ground floor (isGroundLevel: true) is fixed at elevation 0
 * - Floors above ground: elevation = sum of heights of all floors below it
 * - Floors below ground: elevation = negative sum of heights from ground down to it
 * 
 * The floors array maintains its order (top to bottom in the building).
 */
function recalculateElevations(floors: FloorLevel[]): FloorLevel[] {
    if (floors.length === 0) return floors;
    
    // Find the ground level floor index
    const groundIndex = floors.findIndex(f => f.isGroundLevel);
    
    // If no ground level is marked, find "Level 1" or use the first floor with a positive name pattern
    const effectiveGroundIndex = groundIndex >= 0 
        ? groundIndex 
        : floors.findIndex(f => f.name === 'Level 1');
    
    // If still not found, just use the middle-ish floor or first non-basement
    const finalGroundIndex = effectiveGroundIndex >= 0 
        ? effectiveGroundIndex 
        : Math.floor(floors.length / 2);
    
    // Create a new array with calculated elevations
    const result: FloorLevel[] = floors.map((floor, index) => {
        if (index === finalGroundIndex) {
            // Ground floor is at elevation 0
            return { ...floor, elevation: 0 };
        }
        return { ...floor };
    });
    
    // Calculate elevations for floors ABOVE ground (going up from ground)
    // These are floors with index < finalGroundIndex (earlier in array = higher in building)
    let elevation = 0;
    for (let i = finalGroundIndex - 1; i >= 0; i--) {
        // The elevation of this floor = elevation of floor below + height of floor below
        const floorBelow = result[i + 1];
        elevation = floorBelow.elevation + floorBelow.height;
        result[i] = { ...result[i], elevation };
    }
    
    // Calculate elevations for floors BELOW ground (going down from ground)
    // These are floors with index > finalGroundIndex (later in array = lower in building)
    elevation = 0;
    for (let i = finalGroundIndex + 1; i < result.length; i++) {
        // The elevation of this floor = elevation of floor above - height of THIS floor
        const floorAbove = result[i - 1];
        elevation = floorAbove.elevation - result[i].height;
        result[i] = { ...result[i], elevation };
    }
    
    return result;
}
