export interface GPXPoint {
  lat: number;
  lon: number;
  ele?: number;
  time?: string;
}

export interface GPXTrack {
  name?: string;
  points: GPXPoint[];
  totalDistance: number;
  elevationGain: number;
  elevationLoss: number;
  duration?: number;
}

export interface PhotoPoint {
  id: string;
  lat: number;
  lon: number;
  photo: string; // base64 nebo URL
  description: string;
  timestamp: number;
  /** Sekunda od startu průletu, kdy se má fotka zobrazit. */
  triggerSec?: number;
}

export interface GPXData {
  tracks: GPXTrack[];
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
}

export interface AnimationSettings {
  zoomFactor: number;
  flyToDuration: number;
  modalDelay: number;
  zoomBackDuration: number;
  autoCloseDelay: number; // jak dlouho zůstane modal otevřený (ms), 0 = nezavírat automaticky
}

export const defaultAnimationSettings: AnimationSettings = {
  zoomFactor: 1.5,
  flyToDuration: 1500,
  modalDelay: 2000,
  zoomBackDuration: 1000,
  autoCloseDelay: 4000,
};
