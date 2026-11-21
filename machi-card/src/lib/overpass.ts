// OpenStreetMap の Overpass API で駅・路線を調べる

import { distanceMeters, normalizeLineName, stationKey } from './geo';
import type { LineRef, LineStation, Station } from './types';

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const RAIL_ROUTES = '^(train|subway|light_rail|tram|monorail|railway|funicular)$';

type OsmMember = { type: 'node' | 'way' | 'relation'; ref: number; role: string };
export type OsmElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
  members?: OsmMember[];
};
export type OverpassResponse = { elements: OsmElement[] };

async function runOverpass(query: string, signal?: AbortSignal): Promise<OverpassResponse> {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  });
  if (res.status === 429 || res.status === 504) {
    throw new Error('Overpass API が混み合っています。少し待ってからもう一度お試しください。');
  }
  if (!res.ok) throw new Error(`Overpass API でエラーが起きました（${res.status}）`);
  return (await res.json()) as OverpassResponse;
}

const key = (e: { type: string; id: number }) => `${e.type}/${e.id}`;
const coordOf = (e: OsmElement) =>
  e.lat != null && e.lon != null ? { lat: e.lat, lon: e.lon } : e.center ?? null;

/** 表示に使う名前（ローカルの name を優先。無ければ英語名など） */
function nameOf(tags: Record<string, string> | undefined): string | undefined {
  if (!tags) return undefined;
  return tags.name || tags['name:en'] || tags['name:ja'] || undefined;
}

// ---------- 1. 近くの駅（と各駅を通る路線） ----------

export function buildNearbyStationsQuery(lat: number, lon: number, radius = 1000): string {
  const around = `around:${radius},${lat},${lon}`;
  const aroundStops = `around:${radius + 300},${lat},${lon}`;
  return `[out:json][timeout:25];
nwr(${around})[railway~"^(station|halt|tram_stop)$"]->.st1;
nwr(${around})[public_transport=station][~"^(train|subway|light_rail|monorail|tram)$"~"^yes$"]->.st2;
(.st1;.st2;)->.stations;
nwr(${aroundStops})[public_transport~"^(stop_position|platform)$"][highway!=bus_stop][bus!=yes]->.stops;
(.stations;.stops;)->.all;
(rel(bn.all);rel(bw.all);)->.parents;
rel.parents[type=route][route~"${RAIL_ROUTES}"]->.routes;
rel.parents[public_transport=stop_area]->.areas;
rel(br.routes)[type=route_master]->.masters;
.stations out tags center;
.stops out tags center;
.routes out body;
.areas out body;
.masters out body;`;
}

export type NearbyStation = Station & { distance: number };

/** Overpass の結果から「駅候補（近い順）」を作る */
export function parseNearbyStations(data: OverpassResponse, lat: number, lon: number): NearbyStation[] {
  const byKey = new Map<string, OsmElement>();
  for (const e of data.elements) byKey.set(key(e), e);

  const routes = data.elements.filter((e) => e.type === 'relation' && e.tags?.type === 'route');
  const masters = data.elements.filter((e) => e.type === 'relation' && e.tags?.type === 'route_master');
  const areas = data.elements.filter((e) => e.type === 'relation' && e.tags?.public_transport === 'stop_area');

  // route → route_master の名前
  const masterName = new Map<number, string>();
  for (const m of masters) {
    const n = nameOf(m.tags);
    if (!n) continue;
    for (const mem of m.members ?? []) if (mem.type === 'relation') masterName.set(mem.ref, n);
  }

  const isStation = (e: OsmElement) => {
    const t = e.tags ?? {};
    if (/^(station|halt|tram_stop)$/.test(t.railway ?? '')) return true;
    return t.public_transport === 'station' && ['train', 'subway', 'light_rail', 'monorail', 'tram'].some((k) => t[k] === 'yes');
  };
  const stationEls = data.elements.filter((e) => e.type !== 'relation' && isStation(e) && nameOf(e.tags) && coordOf(e));

  // 駅 → 同じ stop_area に入っている要素
  const areaMembers = new Map<string, Set<string>>();
  for (const a of areas) {
    const ms = (a.members ?? []).map((m) => `${m.type}/${m.ref}`);
    for (const m of ms) {
      const set = areaMembers.get(m) ?? new Set<string>();
      ms.forEach((x) => set.add(x));
      areaMembers.set(m, set);
    }
  }

  const lineName = (r: OsmElement) => {
    const raw = masterName.get(r.id) ?? nameOf(r.tags) ?? r.tags?.ref ?? '';
    return normalizeLineName(raw);
  };

  const result = new Map<string, NearbyStation>();
  for (const st of stationEls) {
    const name = nameOf(st.tags)!;
    const c = coordOf(st)!;
    const sKey = stationKey(name);
    const related = areaMembers.get(key(st)) ?? new Set<string>([key(st)]);
    related.add(key(st));

    const lines = new Map<string, Set<number>>();
    for (const r of routes) {
      const hit = (r.members ?? []).some((m) => {
        const mk = `${m.type}/${m.ref}`;
        if (related.has(mk)) return true;
        const el = byKey.get(mk);
        if (!el) return false;
        const n = nameOf(el.tags);
        const ec = coordOf(el);
        return !!n && !!ec && stationKey(n) === sKey && distanceMeters(c.lat, c.lon, ec.lat, ec.lon) < 700;
      });
      if (!hit) continue;
      const ln = lineName(r);
      if (!ln) continue;
      const set = lines.get(ln) ?? new Set<number>();
      set.add(r.id);
      lines.set(ln, set);
    }

    const distance = distanceMeters(lat, lon, c.lat, c.lon);
    // 同じ名前の駅（JR と地下鉄で別の点になっている等）はまとめる
    const prev = result.get(sKey);
    const merged = new Map<string, Set<number>>();
    for (const l of prev?.lines ?? []) merged.set(l.name, new Set(l.relationIds));
    for (const [n, ids] of lines) {
      const set = merged.get(n) ?? new Set<number>();
      ids.forEach((i) => set.add(i));
      merged.set(n, set);
    }
    const nearer = !prev || distance < prev.distance;
    result.set(sKey, {
      name: nearer ? name : prev!.name,
      lat: nearer ? c.lat : prev!.lat,
      lon: nearer ? c.lon : prev!.lon,
      distance: nearer ? distance : prev!.distance,
      lines: [...merged]
        .map(([n, ids]) => ({ name: n, relationIds: [...ids].sort((a, b) => a - b) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    });
  }

  return [...result.values()].sort((a, b) => a.distance - b.distance);
}

export async function fetchNearbyStations(lat: number, lon: number, signal?: AbortSignal): Promise<NearbyStation[]> {
  const data = await runOverpass(buildNearbyStationsQuery(lat, lon), signal);
  return parseNearbyStations(data, lat, lon);
}

// ---------- 2. 路線の駅一覧 ----------

export function buildLineStationsQuery(relationIds: number[]): string {
  return `[out:json][timeout:60];
rel(id:${relationIds.join(',')})->.r;
rel(br.r)[type=route_master]->.m;
rel(r.m)[type=route]->.siblings;
(.r;.siblings;)->.routes;
.routes out body;
node(r.routes)->.n;
way(r.routes)[~"^(railway|public_transport)$"~"^(platform|station|halt)$"]->.w;
.n out tags center;
.w out tags center;`;
}

/** 路線の駅一覧を作る（いちばん駅の多い運行パターンの順番を基準にする） */
export function parseLineStations(data: OverpassResponse, lineName: string): LineStation[] {
  const byKey = new Map<string, OsmElement>();
  for (const e of data.elements) byKey.set(key(e), e);

  const routes = data.elements.filter(
    (e) => e.type === 'relation' && e.tags?.type === 'route',
  );
  // 同じ route_master の中に別の路線が混ざることがあるので、名前が合うものを優先
  const target = stationKey(lineName);
  const sameName = routes.filter((r) => stationKey(normalizeLineName(nameOf(r.tags) ?? '')) === target);
  const useRoutes = sameName.length > 0 ? sameName : routes;

  const isStop = (m: OsmMember, el: OsmElement | undefined) => {
    if (/^(stop|stop_entry_only|stop_exit_only|platform|platform_entry_only|platform_exit_only|forward_stop|backward_stop)$/.test(m.role)) return true;
    const t = el?.tags ?? {};
    return /^(station|halt|stop|tram_stop)$/.test(t.railway ?? '') || t.public_transport === 'stop_position';
  };

  const stopLists = useRoutes.map((r) => {
    const list: LineStation[] = [];
    for (const m of r.members ?? []) {
      if (m.type === 'relation') continue;
      const el = byKey.get(`${m.type}/${m.ref}`);
      if (!isStop(m, el)) continue;
      const n = nameOf(el?.tags);
      if (!n) continue;
      const c = el ? coordOf(el) : null;
      if (list.length && stationKey(list[list.length - 1].name) === stationKey(n)) continue;
      list.push({ name: n, lat: c?.lat, lon: c?.lon });
    }
    return list;
  });
  stopLists.sort((a, b) => b.length - a.length);

  const seen = new Set<string>();
  const out: LineStation[] = [];
  for (const list of stopLists) {
    for (const s of list) {
      const k = stationKey(s.name);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}

export async function fetchLineStations(line: LineRef, signal?: AbortSignal): Promise<LineStation[]> {
  if (line.relationIds.length === 0) return [];
  const data = await runOverpass(buildLineStationsQuery(line.relationIds), signal);
  return parseLineStations(data, line.name);
}
