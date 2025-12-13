export type UseType = 'Roof' | 'Residential' | 'Office' | 'Retail' | 'Foundation';

export interface FloorLevel {
    id: string;
    elevation: number;      // in meters (calculated, relative to ground level)
    name: string;           // e.g., "Level 8", "Level B1"
    useType: UseType;
    height: number;         // floor height in meters
    isGroundLevel?: boolean; // if true, this floor is at elevation 0
    footprint: {            // relative footprint size
        width: number;
        depth: number;
        offsetX: number;    // offset from center
        offsetZ: number;
    };
}

export const USE_TYPE_COLORS: Record<UseType, string> = {
    'Roof': '#F4C794',       // Peach/orange
    'Residential': '#90C695', // Green
    'Office': '#E8E4C9',      // Cream/beige
    'Retail': '#A8A0D0',      // Purple/blue
    'Foundation': '#7A8B99',  // Dark gray-blue
};

export const USE_TYPE_INDICATOR_COLORS: Record<UseType, string> = {
    'Roof': '#F4A460',       // Sandy brown
    'Residential': '#7CB342', // Light green
    'Office': '#FFD54F',      // Amber
    'Retail': '#5C6BC0',      // Indigo
    'Foundation': '#37474F',  // Blue gray
};
