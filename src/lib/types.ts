export type Point = {
  x: number;
  y: number;
};

export type Node = {
  id: string;
  x: number;
  y: number;
};

export type SupportType = 'pin' | 'fixed' | 'roller';

export type Support = {
  id: string;
  nodeId: string;
  type: SupportType;
  angle: number; // in degrees, 0 is horizontal (normal support), 90 is vertical
};

export type MemberRelease = 'fixed' | 'pinned';

export type Member = {
  id: string;
  startNodeId: string;
  endNodeId: string;
  startRelease: MemberRelease;
  endRelease: MemberRelease;
  properties: {
    E: number; // Modulus of Elasticity
    I: number; // Moment of Inertia
    A: number; // Cross-sectional Area
  };
};

export type LoadType = 'point';

export type Load = {
  id: string;
  memberId: string;
  type: LoadType;
  magnitude: number; // Positive is downward (gravity) usually, but we'll define convention. Let's say positive Y is UP in math, but screen is DOWN.
  // Standard structural analysis: Y up is positive. Gravity load is negative.
  position: number; // Distance from start node
};

export type AnalysisResult = {
  nodeDisplacements: Record<string, { dx: number; dy: number; rotation: number }>;
  memberForces: Record<string, {
    axial: number;
    shearStart: number;
    shearEnd: number;
    momentStart: number;
    momentEnd: number;
  }>;
  // For plotting diagrams, we might need values at intervals
  diagrams: Record<string, {
    x: number[]; // positions along member
    shear: number[];
    moment: number[];
    displacement: number[];
  }>;
  reactions: Record<string, { Fx: number; Fy: number; Mz: number }>;
};
