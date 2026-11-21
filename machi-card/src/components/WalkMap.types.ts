import type { GeoPoint, Pin } from '../lib/types';

export type WalkMapProps = {
  route: GeoPoint[];
  pins: Pin[];
  station?: { name: string; lat?: number; lon?: number };
  height?: number;
  /** 散歩中：現在地に追従する */
  follow?: boolean;
};
