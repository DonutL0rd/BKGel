
export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type InteractionMode = 'select' | 'crop';

export interface GelSettings {
  autoDetectLanes: boolean;
  numLanes: number;
  laneMargin: number;
  laneDetectionSensitivity: number;
  // ROI in Percent (0-100)
  roiTop: number;
  roiBottom: number;
  roiLeft: number;
  roiRight: number;
  invertImage: boolean;
  backgroundRollingBallRadius: number;
  backgroundSmoothing: number; // New: Smooth background profile
  minPeakProminence: number;
  smoothing: number; // Signal smoothing
  // New parameters
  minPeakDistance: number; 
  noiseTolerance: number; 
  bandBoundarySigma: number; // New: Width multiplier for Gaussian band fitting
  showBackgroundProfile: boolean; 
}

export interface Band {
  id: string;
  laneIndex: number;
  yPeak: number;
  yStart: number;
  yEnd: number;
  volume: number;
  relativeMobility: number;
  isMainBand: boolean;
  isExcluded: boolean;
  isManual: boolean; 
}

export interface SmearRegion {
  id: string;
  yStart: number;
  yEnd: number;
  volume: number;
}

export interface LaneData {
  index: number;
  rect: Rect;
  rawProfile: number[];
  backgroundProfile: number[];
  netProfile: number[];
  bands: Band[];
  smears: SmearRegion[];
  totalLaneVolume: number;
  mainBandVolume: number;
  degradationVolume: number;
  integrityScore: number;
}

export interface ProcessingResult {
  width: number;
  height: number;
  laneData: LaneData[];
}
