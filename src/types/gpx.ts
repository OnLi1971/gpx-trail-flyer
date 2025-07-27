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

export interface GPXData {
  tracks: GPXTrack[];
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
}