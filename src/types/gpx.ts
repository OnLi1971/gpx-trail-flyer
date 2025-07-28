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
}

export interface GPXData {
  tracks: GPXTrack[];
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  photos?: PhotoPoint[];
}