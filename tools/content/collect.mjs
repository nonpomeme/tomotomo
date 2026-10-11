// 情報源の収集：RSS / Atom から新着を集め、選ばれた記事の本文（またはPDF）を取ってくる。
// 本文は教材づくりの材料としてAIに渡すだけで、保存も表示もしない（著作権のルール）。
import { XMLParser } from 'fast-xml-parser';

const UA = 'TomoTomo-content-bot/1.0 (+https://github.com/nonpomeme/tomotomo)';
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', textNodeName: '#text', processEntities: true, htmlEntities: true });

/* 日本時間の YYYY-MM-DD */
export const jstDate = (t = Date.now()) => new Date(new Date(t).getTime() + 9 * 3600000).toISOString().slice(0, 10);

const text = v => {
  if (v == null) return '';
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') return text(v['#text'] != null ? v['#text'] : '');
  return String(v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
};
const linkOf = v => {
  if (!v) return '';
  if (Array.isArray(v)) { const alt = v.find(l => l && typeof l === 'object' && (!l['@rel'] || l['@rel'] === 'alternate')); return linkOf(alt || v[0]); }
  if (typeof v === 'object') return String(v['@href'] || v['#text'] || '').trim();
  return String(v).trim();
};

/* フィードの XML から記事の一覧を取り出す（RSS 2.0 / RSS 1.0(RDF) / Atom） */
export function parseFeed(xml, feed) {
  const doc = parser.parse(xml);
  const raw = doc.rss ? [].concat(doc.rss.channel && doc.rss.channel.item || [])
    : doc['rdf:RDF'] ? [].concat(doc['rdf:RDF'].item || [])
      : doc.feed ? [].concat(doc.feed.entry || []) : [];
  return raw.map(it => {
    const date = new Date(text(it.pubDate || it['dc:date'] || it.published || it.updated));
    return {
      title: text(it.title),
      link: linkOf(it.link) || text(it['@rdf:about']),
      date: isNaN(date) ? null : date.toISOString(),
      summary: text(it.description || it.summary || it.content).slice(0, 300),
      publisher: text(it['dc:creator'] || it.author && (it.author.name || it.author)) || feed.name,
      feed: feed.name, type: feed.type
    };
  }).filter(it => it.title && /^https:\/\//.test(it.link) && it.date).slice(0, feed.max || 30);
}

async function get(url, timeoutMs = 20000) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res;
}
/* 文字コード（Shift_JIS など）を判定して文字列にする */
async function decode(res) {
  const buf = new Uint8Array(await res.arrayBuffer());
  const head = new TextDecoder('latin1').decode(buf.slice(0, 2048));
  const m = /charset=["']?([\w-]+)/i.exec(res.headers.get('content-type') || '') || /<meta[^>]+charset=["']?([\w-]+)/i.exec(head) || /encoding=["']([\w-]+)/i.exec(head);
  let enc = (m ? m[1] : 'utf-8').toLowerCase();
  if (enc === 'x-sjis' || enc === 'sjis') enc = 'shift_jis';
  try { return new TextDecoder(enc).decode(buf); } catch (e) { return new TextDecoder('utf-8').decode(buf); }
}

/* すべての情報源から、直近 days 日以内の新着を集める。失敗した情報源は記録して飛ばす */
export async function collect(feeds, { days = 3, exclude = new Set(), now = Date.now() } = {}) {
  const items = [], log = [];
  for (const f of feeds) {
    try {
      const xml = await decode(await get(f.url));
      const got = parseFeed(xml, f).filter(it => now - new Date(it.date).getTime() <= days * 86400000 && !exclude.has(it.link));
      items.push(...got);
      log.push(f.name + '：' + got.length + '件');
    } catch (e) {
      log.push(f.name + '：取得失敗（' + e.message + '）');
    }
  }
  items.sort((a, b) => b.date.localeCompare(a.date));
  return { items, log };
}

/* 記事の中身を取ってくる。HTML は本文テキストに、PDF はそのまま（AIが読める形）で返す */
export async function fetchArticle(url, { maxChars = 12000, maxPdfBytes = 4 * 1024 * 1024 } = {}) {
  const res = await get(url, 30000);
  const type = (res.headers.get('content-type') || '').toLowerCase();
  if (type.includes('pdf') || /\.pdf($|\?)/i.test(url)) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxPdfBytes) throw new Error('PDF が大きすぎます');
    return { kind: 'pdf', data: buf.toString('base64') };
  }
  const html = await decode(res);
  const body = (/<main[\s\S]*?<\/main>/i.exec(html) || /<article[\s\S]*?<\/article>/i.exec(html) || /<body[\s\S]*?<\/body>/i.exec(html) || [html])[0];
  const plain = body
    .replace(/<(script|style|noscript|nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t　]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  if (plain.length < 400) throw new Error('本文が短すぎます（' + plain.length + '字）');
  return { kind: 'text', text: plain.slice(0, maxChars) };
}
