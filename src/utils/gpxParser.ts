import { XMLParser } from 'fast-xml-parser';
import { GPXData, GPXTrack, GPXPoint } from '@/types/gpx';

export class GPXParser {
  private parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
    });
  }

  parseGPX(gpxContent: string): GPXData {
    const result = this.parser.parse(gpxContent);
    const gpx = result.gpx;

    if (!gpx) {
      throw new Error('Invalid GPX file format');
    }

    const tracks: GPXTrack[] = [];
    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;

    // Handle single track or multiple tracks
    const trkArray = Array.isArray(gpx.trk) ? gpx.trk : [gpx.trk].filter(Boolean);

    for (const trk of trkArray) {
      const track = this.parseTrack(trk);
      if (track.points.length > 0) {
        tracks.push(track);

        // Update bounds
        for (const point of track.points) {
          minLat = Math.min(minLat, point.lat);
          maxLat = Math.max(maxLat, point.lat);
          minLon = Math.min(minLon, point.lon);
          maxLon = Math.max(maxLon, point.lon);
        }
      }
    }

    return {
      tracks,
      bounds: { minLat, maxLat, minLon, maxLon }
    };
  }

  private parseTrack(trk: any): GPXTrack {
    const points: GPXPoint[] = [];
    let totalDistance = 0;
    let elevationGain = 0;
    let elevationLoss = 0;

    if (!trk.trkseg) {
      return { points, totalDistance, elevationGain, elevationLoss };
    }

    const segments = Array.isArray(trk.trkseg) ? trk.trkseg : [trk.trkseg];

    let prevPoint: GPXPoint | null = null;
    let prevElevation: number | null = null;

    for (const segment of segments) {
      if (!segment.trkpt) continue;

      const trkpts = Array.isArray(segment.trkpt) ? segment.trkpt : [segment.trkpt];

      for (const trkpt of trkpts) {
        if (!trkpt["@_lat"] || !trkpt["@_lon"]) continue;

        const point: GPXPoint = {
          lat: parseFloat(trkpt["@_lat"]),
          lon: parseFloat(trkpt["@_lon"]),
        };

        if (trkpt.ele !== undefined) {
          point.ele = parseFloat(trkpt.ele);
        }

        if (trkpt.time) {
          point.time = trkpt.time;
        }

        points.push(point);

        // Calculate distance
        if (prevPoint) {
          totalDistance += this.calculateDistance(prevPoint, point);
        }

        // Calculate elevation changes
        if (point.ele !== undefined && prevElevation !== null) {
          const elevationDiff = point.ele - prevElevation;
          if (elevationDiff > 0) {
            elevationGain += elevationDiff;
          } else {
            elevationLoss += Math.abs(elevationDiff);
          }
        }

        prevPoint = point;
        if (point.ele !== undefined) {
          prevElevation = point.ele;
        }
      }
    }

    return {
      name: trk.name || 'Unnamed Track',
      points,
      totalDistance,
      elevationGain,
      elevationLoss,
    };
  }

  private calculateDistance(point1: GPXPoint, point2: GPXPoint): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRadians(point2.lat - point1.lat);
    const dLon = this.toRadians(point2.lon - point1.lon);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(point1.lat)) * Math.cos(this.toRadians(point2.lat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}