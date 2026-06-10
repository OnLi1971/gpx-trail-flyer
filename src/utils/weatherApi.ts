export interface TrailWeather {
  date: string; // YYYY-MM-DD (start)
  tempMin: number | null;
  tempMax: number | null;
  tempMean: number | null;
  windMax: number | null; // km/h
  windDir: number | null; // degrees
  precipitation: number | null; // mm
  weatherCode: number | null;
}

const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function avg(arr: (number | null | undefined)[]): number | null {
  const v = arr.filter((x): x is number => typeof x === 'number' && isFinite(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function max(arr: (number | null | undefined)[]): number | null {
  const v = arr.filter((x): x is number => typeof x === 'number' && isFinite(x));
  return v.length ? Math.max(...v) : null;
}

function min(arr: (number | null | undefined)[]): number | null {
  const v = arr.filter((x): x is number => typeof x === 'number' && isFinite(x));
  return v.length ? Math.min(...v) : null;
}

function sum(arr: (number | null | undefined)[]): number | null {
  const v = arr.filter((x): x is number => typeof x === 'number' && isFinite(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0);
}

export async function fetchTrailWeather(
  lat: number,
  lon: number,
  startISO: string,
  endISO?: string
): Promise<TrailWeather | null> {
  const start = new Date(startISO);
  const end = endISO ? new Date(endISO) : start;
  if (isNaN(start.getTime())) return null;

  const startDate = toDateStr(start);
  const endDate = toDateStr(end);

  // Archive API has ~2-day delay; for very recent dates use forecast w/ past_days.
  const daysAgo = Math.floor((Date.now() - start.getTime()) / 86400000);
  const useForecast = daysAgo < 5;

  const daily = 'temperature_2m_max,temperature_2m_min,temperature_2m_mean,windspeed_10m_max,winddirection_10m_dominant,precipitation_sum,weathercode';

  let url: string;
  if (useForecast) {
    const pastDays = Math.min(92, Math.max(1, daysAgo + 2));
    url = `${FORECAST}?latitude=${lat}&longitude=${lon}&daily=${daily}&past_days=${pastDays}&forecast_days=1&timezone=auto&windspeed_unit=kmh`;
  } else {
    url = `${ARCHIVE}?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&daily=${daily}&timezone=auto&windspeed_unit=kmh`;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const d = json.daily;
    if (!d || !Array.isArray(d.time)) return null;

    // Filter to the requested date range
    const idxs: number[] = d.time
      .map((t: string, i: number) => ({ t, i }))
      .filter((x: { t: string }) => x.t >= startDate && x.t <= endDate)
      .map((x: { i: number }) => x.i);

    if (!idxs.length) return null;
    const pick = (arr: any[]) => idxs.map((i) => arr?.[i]);

    return {
      date: startDate,
      tempMin: min(pick(d.temperature_2m_min)),
      tempMax: max(pick(d.temperature_2m_max)),
      tempMean: avg(pick(d.temperature_2m_mean)),
      windMax: max(pick(d.windspeed_10m_max)),
      windDir: avg(pick(d.winddirection_10m_dominant)),
      precipitation: sum(pick(d.precipitation_sum)),
      weatherCode: pick(d.weathercode).find((x: number) => x != null) ?? null,
    };
  } catch {
    return null;
  }
}

export function windDirLabel(deg: number | null): string {
  if (deg == null) return '';
  const dirs = ['S', 'SV', 'V', 'JV', 'J', 'JZ', 'Z', 'SZ'];
  return dirs[Math.round(((deg % 360) / 45)) % 8];
}

// WMO weather codes → label + emoji-ish description
export function weatherCodeInfo(code: number | null): { label: string; kind: 'sun' | 'cloud' | 'rain' | 'snow' | 'storm' | 'fog' | 'unknown' } {
  if (code == null) return { label: '—', kind: 'unknown' };
  if (code === 0) return { label: 'Jasno', kind: 'sun' };
  if (code <= 2) return { label: 'Skoro jasno', kind: 'sun' };
  if (code === 3) return { label: 'Zataženo', kind: 'cloud' };
  if (code >= 45 && code <= 48) return { label: 'Mlha', kind: 'fog' };
  if (code >= 51 && code <= 57) return { label: 'Mrholení', kind: 'rain' };
  if (code >= 61 && code <= 67) return { label: 'Déšť', kind: 'rain' };
  if (code >= 71 && code <= 77) return { label: 'Sníh', kind: 'snow' };
  if (code >= 80 && code <= 82) return { label: 'Přeháňky', kind: 'rain' };
  if (code >= 85 && code <= 86) return { label: 'Sněhové přeháňky', kind: 'snow' };
  if (code >= 95) return { label: 'Bouřka', kind: 'storm' };
  return { label: 'Proměnlivo', kind: 'cloud' };
}
