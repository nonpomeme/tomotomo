// 街カードのデータ型

export type GeoPoint = {
  lat: number;
  lon: number;
  /** 記録した時刻（ミリ秒） */
  t: number;
};

export type Pin = GeoPoint & {
  id: string;
  memo: string;
};

/** 路線（向きの表記を除いた名前と、OSM の route リレーション ID） */
export type LineRef = {
  name: string;
  relationIds: number[];
};

export type Station = {
  name: string;
  lat?: number;
  lon?: number;
  lines: LineRef[];
};

export type Walk = {
  startedAt: number;
  endedAt?: number;
  route: GeoPoint[];
  pins: Pin[];
};

export type Card = {
  id: string;
  createdAt: number;
  startedAt: number;
  endedAt: number;
  station: Station;
  catchphrase: string;
  route: GeoPoint[];
  pins: Pin[];
  /** Claude に聞いた答え合わせ（貼り付け） */
  answer: string;
};

export type LineStation = {
  name: string;
  lat?: number;
  lon?: number;
};

export type LineStationsCache = {
  fetchedAt: number;
  stations: LineStation[];
};
