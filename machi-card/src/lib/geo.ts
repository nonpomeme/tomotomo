// 距離計算・名前の正規化など（ネットワークに依存しない処理）

export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function routeLengthMeters(points: { lat: number; lon: number }[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    sum += distanceMeters(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
  }
  return sum;
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

// 向きを表す言葉（括弧の中にこれがあれば、その括弧ごと消す）
const DIRECTION_WORDS =
  /(→|⇒|⇔|↔|=>|->|<->|\s[-–—~〜]\s|上り|下り|内回り|外回り|方面|northbound|southbound|eastbound|westbound|inbound|outbound|clockwise|counterclockwise|anticlockwise)/i;

/**
 * 路線名から「(池袋→飯能)」のような向きの表記を取り除く。
 * 例：「西武池袋線 (池袋→飯能)」→「西武池袋線」
 *     「Line 1: Alpha => Omega」→「Line 1」
 */
export function normalizeLineName(raw: string): string {
  let s = raw.normalize('NFKC').trim();
  // 括弧（半角・全角どちらも NFKC で半角になる）の中に向きの表記があれば消す
  s = s.replace(/\s*[(\[]([^()\[\]]*)[)\]]/g, (whole, inner: string) =>
    DIRECTION_WORDS.test(inner) ? '' : whole,
  );
  // 「: A => B」「: A → B」形式（OSM の PTv2 でよく使われる）
  s = s.replace(/\s*[:：]\s*[^:：]*(→|⇒|=>|->|↔|⇔|<->)[^:：]*$/, '');
  // 「A→B」だけが末尾に残る形式（例：「山手線 品川→渋谷」）
  s = s.replace(/\s+\S+\s*(→|⇒|=>|->)\s*\S+$/, '');
  return s.replace(/\s+/g, ' ').trim();
}

/** 駅名の比較用キー（「池袋駅」と「池袋」を同じものとして扱う） */
export function stationKey(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/\s+(station|stn\.?|bahnhof)$/i, '')
    .replace(/\s+/g, '')
    .replace(/(駅|站|역)$/, '');
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatDateTime(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function formatDuration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min}分`;
  return `${Math.floor(min / 60)}時間${min % 60}分`;
}
