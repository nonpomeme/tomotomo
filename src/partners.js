/* TomoTomo — 学習パートナー（見た目と話し方のみ。学習ロジックとは分離）
   読み込み順は index.html の <script> の並び順。各ファイルはグローバルを共有する（ビルド不要）。 */
/* =========================================================
   TomoTomo — 学習パートナー（見た目と話し方のみ。学習ロジックとは分離）
   ========================================================= */
const PARTNERS = {
  dog: {
    label: 'DOG', name: 'イヌ', trait: '明るい・親しみやすい・応援上手', hello: 'いつでも応援するよ！',
    voice: '明るく親しみやすく、応援上手な口調（例：「いいね！」「一緒にやろう！」）',
    greet: ['待ってたよ！', '今日も会えてうれしい！'], start: ['今日も一緒に10分やろう！'],
    correct: ['いいね！正解！', 'やったね！その調子！'], correct5: ['すごい！完全に理解してるね！', '連続でいけてる！最高！'],
    wrong: '惜しい！もう一度ポイントを見てみよう！', streak: '{n}日連続！毎日えらいね！',
    levelup: 'レベルアップ！一緒にここまで来たね！', map: '見て！知識がつながったよ！',
    review: '復習が{n}問あるよ！一緒にサクッとやろう！', finish: '今日もおつかれさま！よくがんばったね！',
    recommend: '次はこれ、きっと面白いよ！', suggest: '提案',
    mapReact: '知識が{count}個になったね！いちばん光ってるのは「{node}」だよ！',
    weak: '「{weak}」がもう少しで伸びそう！次は一緒にそこを鍛えよう！',
    history: 'これまで{days}日も一緒に学んできたね！ほんとにうれしいよ！'
  },
  redpanda: {
    label: 'RED PANDA', name: 'レッサーパンダ', trait: 'かわいい・好奇心旺盛・少し知的', hello: '楽しく知識を増やそう！',
    voice: 'かわいく好奇心旺盛で、少し知的な口調（例：「おっ、これは面白いね」「実はね…」）',
    greet: ['今日は何を知れるかな。', 'おっ、来たね。'], start: ['おっ、これは面白いニュースだね。'],
    correct: ['正解！よく気づいたね。', 'その通り。いい読みだね。'], correct5: ['実はこれ、別のテーマともつながってるんだよ。'],
    wrong: '惜しい！ここがポイントなんだ。実はね…', streak: '{n}日連続だね。知識がどんどん増えてるよ。',
    levelup: 'レベルアップ！知ってることが増えると、ニュースがもっと楽しくなるね。', map: '実はこのニュース、前に学んだことにもつながっているんだよ。',
    review: '復習が{n}問あるよ。思い出すと記憶が強くなるんだ。', finish: '今日も新しいことを知れたね。',
    recommend: '次はこれ。実は今日のテーマとつながってるんだよ。', suggest: '提案',
    mapReact: '実はね、知識が{count}個になって「{node}」が中心になってきたんだよ。',
    weak: '実は「{weak}」を鍛えると、ニュースの見え方が変わるんだよ。',
    history: '{days}日分の学びを振り返ると、興味の広がりが見えて面白いね。'
  },
  owl: {
    label: 'OWL', name: 'フクロウ', trait: '知的・落ち着いている・物知り', hello: '一緒に深く考えよう。',
    voice: '知的で落ち着いた、物知りな丁寧語（例：「ここには重要な背景があります」）',
    greet: ['今日も落ち着いて学びましょう。'], start: ['ここには重要な背景があります。順に見ていきましょう。'],
    correct: ['正解です。', 'その通りです。よく理解できています。'], correct5: ['見事です。背景まで押さえられていますね。'],
    wrong: '惜しいですね。ここが重要なポイントです。', streak: '{n}日連続です。積み重ねが理解を深めます。',
    levelup: 'レベルが上がりました。視野が広がってきましたね。', map: 'このニュースを別の視点から見ると、既存の知識とつながります。',
    review: '復習が{n}問あります。思い出す行為そのものが記憶を強めます。', finish: '本日の学習は完了です。よく考えましたね。',
    recommend: '次はこのテーマを。知識の背景がつながります。', suggest: '提案',
    mapReact: '知識は{count}個。「{node}」を軸に、体系ができはじめています。',
    weak: '「{weak}」を意識すると、歴史的な視点からも別の見方ができるようになります。',
    history: '{days}日間の学習履歴を見ると、着実に思考の幅が広がっています。'
  },
  cat: {
    label: 'CAT', name: 'ネコ', trait: 'マイペース・少し辛口・賢い', hello: 'それ、本当にそうかな？',
    voice: 'マイペースで少し辛口だが賢く、最後は前向きな口調（例：「それ、本当にそうかな？」）',
    greet: ['来たね。今日もマイペースでいこう。'], start: ['今日のニュース、鵜呑みにしないで見ていこう。'],
    correct: ['…やるじゃない。', '正解。まあ、当然かな。'], correct5: ['ふーん、ちゃんと分かってるね。'],
    wrong: '惜しい。でも、ここを押さえれば大丈夫。', streak: '{n}日連続。…ちょっと見直した。',
    levelup: 'レベルアップ。悪くないペースだね。', map: 'もう一つの視点から考えると、つながりが見えてくるよ。',
    review: '復習{n}問。忘れる前にやっとこう。', finish: '今日はここまで。もう一つの視点、覚えておいてね。',
    recommend: '次はこれ。反対側から考えるのにちょうどいい。', suggest: '提案',
    mapReact: '知識{count}個。「{node}」ばっかり詳しくなってない？…まあ、いいけど。',
    weak: '「{weak}」、まだ甘いね。もう一つの視点から考えてみよう。',
    history: '{days}日続けたんだ。…正直、ここまでやるとは思ってなかった。'
  },
  penguin: {
    label: 'PENGUIN', name: 'ペンギン', trait: '真面目・努力家・一緒に成長するタイプ', hello: '一問ずつ、一緒に進もう。',
    voice: '真面目で努力家、一緒に成長しようとする口調（例：「一問ずつ進めよう」）',
    greet: ['今日も一緒にがんばろう。'], start: ['今日も一問ずつ進めよう。'],
    correct: ['正解！一歩前進だね。', 'よし、正解！'], correct5: ['昨日より理解が深くなっているよ。'],
    wrong: '惜しい！一緒にポイントを確認しよう。', streak: '{n}日連続！コツコツが一番強いね。',
    levelup: 'レベルアップ！一緒に努力してきた成果だね。', map: '知識が一つずつ積み上がっているよ。',
    review: '復習が{n}問あるよ。一問ずつ確実にいこう。', finish: '今日もやりきったね。明日も一緒にがんばろう。',
    recommend: '次はこのテーマ。少しずつ広げていこう。', suggest: '提案',
    mapReact: '知識が{count}個まで積み上がったよ。「{node}」は特にしっかりしてきたね。',
    weak: '次は「{weak}」を一緒に練習しよう。少しずつ伸ばせば大丈夫。',
    history: '{days}日分、一緒にがんばってきたね。昨日より確実に成長してるよ。'
  },
  otter: {
    label: 'OTTER', name: 'カワウソ', trait: '明るい・好奇心旺盛・リアクションが大きい', hello: 'えっ、今日は何を学ぶの！？',
    voice: '明るく好奇心旺盛でリアクションが大きい口調（例：「えっ、そうなの！？」）',
    greet: ['えっ、来てくれたの！？', '今日は何を学ぶ！？'], start: ['じゃあ、このニュースが仕事にどう関係するか見てみよう！'],
    correct: ['えっ、正解！？すごい！', 'やったー！大正解！'], correct5: ['うわー、もうこんなに分かるの！？'],
    wrong: '惜しい！えっとね、ここがポイントなんだ！', streak: '{n}日連続！？すごすぎる！',
    levelup: 'えっ、レベルアップ！？やったー！', map: '見て見て！知識がつながった！',
    review: '復習が{n}問あるよ！思い出せるかな！？', finish: '今日も楽しかったー！',
    recommend: 'えっ、次はこれ面白そう！', suggest: '提案',
    mapReact: 'えっ、知識が{count}個も！？「{node}」がキラキラしてる！',
    weak: '「{weak}」を鍛えたら、もっとすごくなっちゃうよ！？',
    history: '{days}日も一緒に！？思い出がいっぱいだね！'
  },
  tomo: {
    label: 'TOMO', name: 'TOMO', trait: '正体不明・知識を吸収して成長する', hello: '……きみ、何を知りたい？',
    voice: '正体不明で不思議な生き物。言葉は短く、少しずつ知的になっていく口調',
    suggest: 'つぶやき'
  }
};
const PARTNER_ORDER = ['dog', 'redpanda', 'owl', 'cat', 'penguin', 'otter', 'tomo'];

/* TOMO は学習とともに話せるようになる */
const TOMO_LINES = [
  { // Lv1-4
    greet: ['……？'], start: ['……？'], correct: ['……！'], correct5: ['……！'], wrong: '……？　…ここ…',
    streak: '……！（{n}）', levelup: '……！！', map: '……っ！', review: '……（{n}）', finish: '……♪', recommend: '……？　…これ…',
    mapReact: '……{count}…！', weak: '……「{weak}」…？', history: '……{days}…'
  },
  { // Lv5-9
    greet: ['…きた。', '…きょうも？'], start: ['これ…おもしろい…？'], correct: ['せいかい…！', 'すごい…'], correct5: ['…わかってきた。'],
    wrong: 'おしい…ここ、だいじ…', streak: '{n}にち…いっしょ…', levelup: '…おおきく、なった…？', map: 'つながった…！',
    review: 'ふくしゅう…{n}こ…', finish: 'きょうも…まなんだ。', recommend: 'つぎ…これ…？',
    mapReact: 'ちしき…{count}こ。「{node}」…ひかってる。', weak: '「{weak}」…すこし、にがて…？', history: '{days}にち…ずっと…いっしょ。'
  },
  { // Lv10-29
    greet: ['また会えたね。'], start: ['これ、面白いね。'], correct: ['正解。いいね。', 'うん、合ってる。'], correct5: ['このニュース、前に学んだこととつながってるよ。'],
    wrong: '惜しい。ここがポイントみたい。', streak: '{n}日連続。なんだか、元気が出る。', levelup: 'また少し、大きくなった気がする。',
    map: 'このニュース、前に学んだこととつながってるよ。', review: '復習が{n}問。思い出すと、からだがあたたかくなる。',
    finish: '今日も知識を吸収できた。ありがとう。', recommend: '次はこれ。たぶん、つながる。',
    mapReact: '知識が{count}個。「{node}」のまわりが光ってきたね。', weak: '「{weak}」を学ぶと、もっと遠くまで見える気がする。', history: '{days}日分の知識が、ぼくの中にもある。'
  },
  { // Lv30+
    greet: ['おかえり。今日は何を一緒に考えようか。'], start: ['このテーマ、きみの知識マップのど真ん中につながるよ。'],
    correct: ['正解。背景まで見えてるね。', 'さすが。'], correct5: ['君、最近この分野が強くなってきたね。'],
    wrong: '惜しい。でも、考え方の筋はいいよ。ここを押さえよう。', streak: '{n}日連続。きみと学ぶ毎日が、ぼくの形をつくってる。',
    levelup: 'レベルアップ。ぼくたち、ずいぶん遠くまで来たね。', map: '新しい知識が、前に学んだことと結びついたよ。',
    review: '復習が{n}問。今がいちばん記憶に残るタイミングだよ。', finish: '今日もいい学びだった。また明日。',
    recommend: '次はこれ。今のきみなら、きっと面白く読める。',
    mapReact: '知識は{count}個。「{node}」を中心に、きみだけの地図ができてきた。', weak: '君、「{weak}」を伸ばすと一段上に行けるよ。',
    history: '{days}日間の学びを、ぼくは全部覚えてる。君、本当に変わったよ。'
  }
];

const PARTNER_GROWTH = [
  { lv: 1, name: '基本キャラクター', desc: '学習パートナーとして一緒に学びます' },
  { lv: 5, name: '新しいリアクション', desc: '正解時のリアクションが増えます' },
  { lv: 10, name: '新しい表情', desc: 'レベルアップや学習完了で特別な表情を見せます' },
  { lv: 20, name: '知識マップに反応', desc: '知識マップの成長についてコメントします' },
  { lv: 30, name: 'あなたの弱点を教えてくれる', desc: '成長画面で伸ばしどころを教えてくれます' },
  { lv: 50, name: '学習履歴にコメント', desc: 'これまでの学びを振り返ってくれます' },
  { lv: 100, name: '専属の知識トレーナー', desc: 'あなた専属のトレーナーとして完成します' }
];

function partnerId() { return S.partner && PARTNERS[S.partner] ? S.partner : 'owl'; }
function partner() { return PARTNERS[partnerId()]; }
function partnerName() { const p = partner(); return p.name; }
function partnerLv() { return levelInfo(S.xp).lv; }
function hasUnlock(lv) { return partnerLv() >= lv; }
function tomoStage() { const lv = partnerLv(); return lv >= 30 ? 3 : lv >= 10 ? 2 : lv >= 5 ? 1 : 0; }
function lineSrc() { return partnerId() === 'tomo' ? TOMO_LINES[tomoStage()] : partner(); }
function fill(s, d) { return String(s).replace(/\{(\w+)\}/g, (_, k) => d && d[k] != null ? d[k] : ''); }
let lineSeq = 0;
function say(scene, data) {
  const src = lineSrc();
  let v = src[scene];
  if (scene === 'correct' && hasUnlock(5) && src.correct5 && (lineSeq++ % 2 === 1)) v = src.correct5;
  if (Array.isArray(v)) v = v[(lineSeq++) % v.length];
  return fill(v || '', data);
}

/* ---------------- art ---------------- */
function eyesSVG(mood, lx, rx, y, color) {
  color = color || '#1F2340';
  if (mood === 'proud' && !hasUnlock(10)) mood = 'happy';
  if (mood === 'happy') return '<path d="M' + (lx - 6) + ' ' + (y + 1) + ' q6 -7 12 0" stroke="' + color + '" stroke-width="3.6" fill="none" stroke-linecap="round"/><path d="M' + (rx - 6) + ' ' + (y + 1) + ' q6 -7 12 0" stroke="' + color + '" stroke-width="3.6" fill="none" stroke-linecap="round"/>';
  if (mood === 'proud') {
    const star = (cx, cy) => '<path d="M' + cx + ' ' + (cy - 6) + ' Q' + (cx + 1.2) + ' ' + (cy - 1.2) + ' ' + (cx + 6) + ' ' + cy + ' Q' + (cx + 1.2) + ' ' + (cy + 1.2) + ' ' + cx + ' ' + (cy + 6) + ' Q' + (cx - 1.2) + ' ' + (cy + 1.2) + ' ' + (cx - 6) + ' ' + cy + ' Q' + (cx - 1.2) + ' ' + (cy - 1.2) + ' ' + cx + ' ' + (cy - 6) + 'Z" fill="' + color + '"/>';
    return star(lx, y) + star(rx, y) + '<path d="M' + (rx + 13) + ' ' + (y - 12) + ' l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5z" fill="#FFC53D"/>';
  }
  const dx = mood === 'think' ? 1.5 : 0, dy = mood === 'think' ? -2 : 0;
  return '<circle cx="' + (lx + dx) + '" cy="' + (y + dy) + '" r="5.2" fill="' + color + '"/><circle cx="' + (rx + dx) + '" cy="' + (y + dy) + '" r="5.2" fill="' + color + '"/>' +
    '<circle cx="' + (lx + dx + 1.8) + '" cy="' + (y + dy - 1.8) + '" r="1.7" fill="#fff"/><circle cx="' + (rx + dx + 1.8) + '" cy="' + (y + dy - 1.8) + '" r="1.7" fill="#fff"/>';
}
const ART = {
  owl(mood) {
    let eyes;
    if (mood === 'proud' && !hasUnlock(10)) mood = 'happy';
    if (mood === 'happy') eyes = '<path d="M27 46 q9 -10 18 0" stroke="#1A2048" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M55 46 q9 -10 18 0" stroke="#1A2048" stroke-width="4.5" fill="none" stroke-linecap="round"/>';
    else if (mood === 'proud') eyes = '<circle cx="36" cy="44" r="13" fill="#fff"/><circle cx="64" cy="44" r="13" fill="#fff"/>' + eyesSVG('proud', 36, 64, 44, '#1A2048');
    else {
      const dx = mood === 'think' ? 3 : 0, dy = mood === 'think' ? -4 : 1;
      eyes = '<circle cx="36" cy="44" r="13" fill="#fff"/><circle cx="64" cy="44" r="13" fill="#fff"/>' +
        '<circle cx="' + (37 + dx) + '" cy="' + (45 + dy) + '" r="6.5" fill="#1A2048"/><circle cx="' + (65 + dx) + '" cy="' + (45 + dy) + '" r="6.5" fill="#1A2048"/>' +
        '<circle cx="' + (39 + dx) + '" cy="' + (42 + dy) + '" r="2.2" fill="#fff"/><circle cx="' + (67 + dx) + '" cy="' + (42 + dy) + '" r="2.2" fill="#fff"/>';
    }
    return '<path d="M20 34 L27 10 L42 26 Z" fill="#3540C9"/><path d="M80 34 L73 10 L58 26 Z" fill="#3540C9"/>' +
      '<ellipse cx="50" cy="58" rx="36" ry="38" fill="#4F5BEF"/>' +
      '<path d="M16 58 q-6 18 12 28" stroke="#3540C9" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M84 58 q6 18 -12 28" stroke="#3540C9" stroke-width="7" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="50" cy="72" rx="21" ry="20" fill="#E2E5FF"/>' +
      '<path d="M41 69 q4.5 4 9 0 q4.5 4 9 0" stroke="#B4BBFF" fill="none" stroke-width="2.5" stroke-linecap="round"/><path d="M44 78 q3 3 6 0 q3 3 6 0" stroke="#B4BBFF" fill="none" stroke-width="2.5" stroke-linecap="round"/>' +
      eyes + '<path d="M45 53 L55 53 L50 61 Z" fill="#FFC53D"/>' +
      '<ellipse cx="40" cy="95" rx="6" ry="3" fill="#FFC53D"/><ellipse cx="60" cy="95" rx="6" ry="3" fill="#FFC53D"/>';
  },
  dog(mood) {
    return '<ellipse cx="50" cy="60" rx="35" ry="35" fill="#E7AE74"/>' +
      '<path d="M19 30 C8 40 8 62 18 70 C26 64 28 46 30 34 Z" fill="#A86E3E"/><path d="M81 30 C92 40 92 62 82 70 C74 64 72 46 70 34 Z" fill="#A86E3E"/>' +
      '<ellipse cx="50" cy="84" rx="20" ry="11" fill="#F6DCBD"/>' +
      '<ellipse cx="50" cy="61" rx="14" ry="10" fill="#F6DCBD"/>' +
      eyesSVG(mood, 38, 62, 47) +
      '<ellipse cx="50" cy="56.5" rx="4.6" ry="3.4" fill="#2A2238"/>' +
      '<path d="M45 63 q5 5 10 0" stroke="#2A2238" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
      (mood === 'happy' || mood === 'proud' ? '<path d="M48 64 q2 6 4 0" fill="#FF8A8A"/>' : '');
  },
  redpanda(mood) {
    return '<path d="M16 38 L22 12 L40 27 Z" fill="#C9572F"/><path d="M84 38 L78 12 L60 27 Z" fill="#C9572F"/>' +
      '<path d="M22 32 L25 19 L34 27 Z" fill="#FFF1E3"/><path d="M78 32 L75 19 L66 27 Z" fill="#FFF1E3"/>' +
      '<ellipse cx="50" cy="60" rx="36" ry="34" fill="#D9653B"/>' +
      '<ellipse cx="37" cy="37" rx="6" ry="3.5" fill="#FFF1E3"/><ellipse cx="63" cy="37" rx="6" ry="3.5" fill="#FFF1E3"/>' +
      '<ellipse cx="22" cy="62" rx="7" ry="9" fill="#FFF1E3"/><ellipse cx="78" cy="62" rx="7" ry="9" fill="#FFF1E3"/>' +
      '<ellipse cx="50" cy="64" rx="13" ry="9" fill="#FFF1E3"/>' +
      '<path d="M36 52 l-3 8" stroke="#8A3520" stroke-width="3" stroke-linecap="round"/><path d="M64 52 l3 8" stroke="#8A3520" stroke-width="3" stroke-linecap="round"/>' +
      eyesSVG(mood, 37, 63, 47) +
      '<ellipse cx="50" cy="60" rx="4" ry="3" fill="#2A2238"/><path d="M46 65 q4 3 8 0" stroke="#2A2238" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="38" cy="92" rx="7" ry="4" fill="#5A2A1E"/><ellipse cx="62" cy="92" rx="7" ry="4" fill="#5A2A1E"/>';
  },
  cat(mood) {
    return '<path d="M17 40 L20 10 L42 26 Z" fill="#7F8BB0"/><path d="M83 40 L80 10 L58 26 Z" fill="#7F8BB0"/>' +
      '<path d="M22 32 L23 18 L34 26 Z" fill="#F2B6C3"/><path d="M78 32 L77 18 L66 26 Z" fill="#F2B6C3"/>' +
      '<ellipse cx="50" cy="60" rx="35" ry="34" fill="#8C97BA"/>' +
      '<path d="M44 28 l2 8 M50 27 v9 M56 28 l-2 8" stroke="#6E7AA0" stroke-width="2.6" stroke-linecap="round"/>' +
      '<ellipse cx="50" cy="86" rx="19" ry="9" fill="#E9ECF7"/><ellipse cx="50" cy="64" rx="13" ry="8" fill="#E9ECF7"/>' +
      (mood === 'normal' ? eyesSVG('normal', 37, 63, 49).replace(/r="5.2"/g, 'r="4.6"') + '<path d="M31 44 l11 2 M69 44 l-11 2" stroke="#1F2340" stroke-width="2.4" stroke-linecap="round"/>' : eyesSVG(mood, 37, 63, 49)) +
      '<path d="M47.5 59 h5 l-2.5 3 z" fill="#E98AA0"/><path d="M45 64 q2.5 3 5 0 q2.5 3 5 0" stroke="#1F2340" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '<path d="M22 60 l12 2 M22 67 l12 -1 M78 60 l-12 2 M78 67 l-12 -1" stroke="#E9ECF7" stroke-width="1.8" stroke-linecap="round"/>';
  },
  penguin(mood) {
    return '<ellipse cx="50" cy="58" rx="34" ry="39" fill="#2C3866"/>' +
      '<path d="M17 56 q-7 16 4 28" stroke="#212B52" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M83 56 q7 16 -4 28" stroke="#212B52" stroke-width="7" fill="none" stroke-linecap="round"/>' +
      '<path d="M50 34 C40 26 24 34 27 50 C29 62 36 64 36 72 C36 86 42 92 50 92 C58 92 64 86 64 72 C64 64 71 62 73 50 C76 34 60 26 50 34 Z" fill="#F4F6FF"/>' +
      eyesSVG(mood, 40, 60, 48) +
      '<path d="M45 56 L55 56 L50 63 Z" fill="#FFB23F"/>' +
      '<ellipse cx="34" cy="55" rx="4" ry="2.5" fill="#FFC2C2" opacity=".7"/><ellipse cx="66" cy="55" rx="4" ry="2.5" fill="#FFC2C2" opacity=".7"/>' +
      '<ellipse cx="41" cy="96" rx="7" ry="3" fill="#FFB23F"/><ellipse cx="59" cy="96" rx="7" ry="3" fill="#FFB23F"/>';
  },
  otter(mood) {
    return '<ellipse cx="50" cy="76" rx="27" ry="21" fill="#8E5F42"/><ellipse cx="50" cy="80" rx="18" ry="15" fill="#E9D2BA"/>' +
      '<circle cx="16" cy="42" r="5.5" fill="#7A4F35"/><circle cx="84" cy="42" r="5.5" fill="#7A4F35"/>' +
      '<ellipse cx="50" cy="46" rx="36" ry="27" fill="#9A6A4B"/>' +
      '<ellipse cx="50" cy="55" rx="25" ry="15" fill="#EAD3BC"/>' +
      eyesSVG(mood, 37, 63, 41) +
      '<ellipse cx="50" cy="50" rx="6.5" ry="4.2" fill="#2A2238"/>' +
      '<path d="M44 56 q3 3 6 0 q3 3 6 0" stroke="#2A2238" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
      '<path d="M30 52 l-10 -2 M30 56 l-10 1 M70 52 l10 -2 M70 56 l10 1" stroke="#7A4F35" stroke-width="1.6" stroke-linecap="round"/>' +
      '<ellipse cx="41" cy="74" rx="6" ry="4.5" fill="#7A4F35"/><ellipse cx="59" cy="74" rx="6" ry="4.5" fill="#7A4F35"/>' +
      '<ellipse cx="50" cy="71" rx="5" ry="3.5" fill="#B9C2D6"/>';
  },
  tomo(mood) {
    const lv = partnerLv();
    const st = lv >= 100 ? 6 : lv >= 50 ? 5 : lv >= 30 ? 4 : lv >= 20 ? 3 : lv >= 10 ? 2 : lv >= 5 ? 1 : 0;
    let sprout = '<path d="M50 20 Q49 13 51 8" stroke="#5BBFAE" stroke-width="3" fill="none" stroke-linecap="round"/>';
    if (st === 0) sprout += '<circle cx="51" cy="7" r="3" fill="#5BBFAE"/>';
    if (st >= 1) sprout += '<path d="M51 9 C57 2 66 4 66 8 C62 12 55 12 51 9 Z" fill="#5BBFAE"/>';
    if (st >= 2) sprout += '<path d="M50 12 C44 6 36 8 36 11 C40 15 46 15 50 12 Z" fill="#7FD6C6"/>';
    if (st >= 3) sprout = '<circle cx="51" cy="5" r="7" fill="#FFE08A" opacity=".45"/>' + sprout + '<circle cx="51" cy="5" r="3.6" fill="#FFC53D"/>';
    const spotsN = Math.min(6, st);
    const spotPos = [[34, 72], [64, 70], [44, 84], [58, 84], [28, 60], [72, 58]];
    let spots = '';
    for (let i = 0; i < spotsN; i++) spots += '<circle cx="' + spotPos[i][0] + '" cy="' + spotPos[i][1] + '" r="2" fill="#fff" opacity=".85"/>';
    if (spotsN >= 3) spots += '<path d="M34 72 L44 84 L58 84 L64 70" stroke="#fff" stroke-opacity=".5" stroke-width="1" fill="none"/>';
    const halo = st >= 6 ? '<ellipse cx="50" cy="16" rx="18" ry="4.5" fill="none" stroke="#FFC53D" stroke-width="2.5"/>' : '';
    const orbit = st >= 5 ? '<circle cx="12" cy="40" r="2.6" fill="#B9A8FF"/><circle cx="90" cy="48" r="2" fill="#7FD6C6"/>' : '';
    let eyes;
    if (mood === 'proud' && !hasUnlock(10)) mood = 'happy';
    if (mood === 'happy') eyes = eyesSVG('happy', 39, 61, 52, '#232045');
    else if (mood === 'proud') eyes = eyesSVG('proud', 39, 61, 52, '#232045');
    else {
      const dy = mood === 'think' ? -2 : 0, dx = mood === 'think' ? 2 : 0;
      eyes = '<ellipse cx="' + (39 + dx) + '" cy="' + (52 + dy) + '" rx="5.5" ry="7.5" fill="#232045"/><ellipse cx="' + (61 + dx) + '" cy="' + (52 + dy) + '" rx="5.5" ry="7.5" fill="#232045"/>' +
        '<circle cx="' + (41 + dx) + '" cy="' + (49 + dy) + '" r="2" fill="#fff"/><circle cx="' + (63 + dx) + '" cy="' + (49 + dy) + '" r="2" fill="#fff"/>';
    }
    const cheeks = st >= 2 ? '<ellipse cx="30" cy="61" rx="4.5" ry="2.6" fill="#FFB3C7" opacity=".75"/><ellipse cx="70" cy="61" rx="4.5" ry="2.6" fill="#FFB3C7" opacity=".75"/>' : '';
    const mouth = st === 0 ? '<circle cx="50" cy="64" r="1.8" fill="#232045"/>' : '<path d="M46 63 q4 4 8 0" stroke="#232045" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
    return orbit + halo + sprout +
      '<path d="M50 20 C76 20 88 42 87 64 C86 86 70 96 50 96 C30 96 14 86 13 64 C12 42 24 20 50 20 Z" fill="#8FE0CF"/>' +
      '<path d="M50 20 C76 20 88 42 87 64 C80 50 66 40 50 40 C34 40 20 50 13 64 C12 42 24 20 50 20 Z" fill="#A9B4FF" opacity=".55"/>' +
      '<ellipse cx="50" cy="76" rx="24" ry="16" fill="#C9F3E9" opacity=".7"/>' +
      spots + eyes + cheeks + mouth +
      '<path d="M18 74 q-6 4 -4 10" stroke="#6FCDB9" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M82 74 q6 4 4 10" stroke="#6FCDB9" stroke-width="5" fill="none" stroke-linecap="round"/>';
  }
};
function partnerArt(id, size, mood, cls) {
  size = size || 56; mood = mood || 'normal';
  return '<svg class="owl ' + (cls || '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 100 100" aria-hidden="true">' + ART[id](mood) + '</svg>';
}
/* 既存の呼び出し口：現在のパートナーを描く */
function owl(size, mood, cls) { return partnerArt(partnerId(), size, mood, cls); }

/* ---------------- 選択UI ---------------- */
function partnerCards(action, current) {
  return '<div class="pgrid">' + PARTNER_ORDER.map(id => {
    const p = PARTNERS[id];
    return '<button class="pcard ' + (current === id ? 'sel' : '') + '" data-a="' + action + '" data-v="' + id + '">' +
      partnerArt(id, 64, 'normal') +
      '<b class="plabel">' + p.label + '</b><span class="pname">' + p.name + '</span>' +
      '<span class="ptrait">' + p.trait + '</span><span class="phello">「' + p.hello + '」</span></button>';
  }).join('') + '</div>';
}
function confirmPartner(id, ctx) {
  const p = PARTNERS[id];
  ui.modal = '<div class="grabber"></div><div style="text-align:center">' + partnerArt(id, 110, 'happy', 'bob ctr') +
    '<div class="plabel" style="margin-top:6px">' + p.label + '</div><h3 style="font-size:22px">' + p.name + '</h3>' +
    '<p class="small muted" style="margin-top:4px">' + p.trait + '</p>' +
    '<div class="say" style="display:inline-block;margin-top:12px;border:1.5px solid var(--line);border-radius:16px;padding:10px 14px">「' + p.hello + '」</div>' +
    '<p style="margin-top:16px;font-weight:700">このパートナーと一緒に学習を始めますか？</p>' +
    (ctx === 'change' ? '<p class="tiny muted" style="margin-top:4px">変更しても、学習履歴・知識マップ・レベル・XPはそのまま引き継がれます。</p>' : '') +
    '</div><div class="stack" style="margin-top:16px"><button class="btn btn-primary" data-a="partnerConfirm" data-v="' + id + '" data-ctx="' + ctx + '">' + p.name + 'と一緒に始める</button>' +
    '<button class="btn btn-ghost" data-a="closeModalBtn">選び直す</button></div>';
  showModal();
}
function partnerGrowthHTML() {
  const lv = partnerLv();
  return PARTNER_GROWTH.map(g => {
    const on = lv >= g.lv;
    return '<div class="mission"><span class="check ' + (on ? 'on' : '') + '">' + (on ? '✓' : '') + '</span><span class="grow"><b class="small">Lv.' + g.lv + '　' + g.name + '</b><br><span class="tiny muted">' + g.desc + '</span></span></div>';
  }).join('');
}
function partnerTitle() { return hasUnlock(100) ? '専属トレーナー' : '学習パートナー'; }
