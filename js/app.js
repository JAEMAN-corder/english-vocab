/* ─────────────────────────────────────────────────────────────
   나만의 영어회화 필수단어 학습 사이트
   기획안(2026-08-30) 기반 · 진도는 브라우저 localStorage에 저장
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  /* ── 1. 데이터 조립 ─────────────────────────────────── */
  const META = window.VOCAB_META;
  const CHAPTERS = window.VOCAB_CHAPTERS || {};

  const ALL = [];                       // 커리큘럼 순서대로 이어붙인 전체 단어
  META.chapters.forEach(function (c) {
    const src = CHAPTERS[c.id];
    if (!src) return;
    src.words.forEach(function (w, i) {
      ALL.push(Object.assign({}, w, {
        chapter: c.id,
        chapterTitle: c.title,
        sub: (src.dayTitles && src.dayTitles[Math.floor(i / 15)]) || '',
        gi: ALL.length                  // 전역 인덱스 (0-base)
      }));
    });
  });

  /* ── 2. 상태 저장 ───────────────────────────────────── */
  const KEY = 'evocab.v1';
  const DEFAULTS = {
    learned: 0,                 // 순서대로 학습을 끝낸 단어 수
    log: [],                    // [{d:'2026-08-30', n:15}]
    wrong: {},                  // 퀴즈 오답 횟수 {word: n}
    pos: null,                  // 학습 중이던 위치 {d: Day, i: 카드 번호}
    startedAt: null,
    settings: { perDay: 15, voiceURI: '', rate: 0.92 }
  };

  // 브라우저 저장소는 사생활 보호 모드·사이트 데이터 차단 등으로 조용히 실패할 수 있다.
  // 쓴 값을 곧바로 되읽어 검증하고, 실패하면 사용자에게 계속 보이도록 상태를 남긴다.
  const Store = (function () {
    let ok = false, err = '';
    try {
      localStorage.setItem('__evocab_probe', '1');
      ok = localStorage.getItem('__evocab_probe') === '1';
      localStorage.removeItem('__evocab_probe');
      if (!ok) err = '값을 썼지만 다시 읽히지 않음';
    } catch (e) { ok = false; err = (e && e.name) || '접근 거부'; }
    return {
      ok: function () { return ok; },
      error: function () { return err; },
      read: function () { try { return localStorage.getItem(KEY); } catch (e) { err = e.name; return null; } },
      write: function (v) {
        try {
          localStorage.setItem(KEY, v);
          if (localStorage.getItem(KEY) !== v) { ok = false; err = '저장 후 검증 실패'; return false; }
          ok = true; err = ''; return true;
        } catch (e) { ok = false; err = (e && e.name) || '쓰기 거부'; return false; }
      }
    };
  })();
  let lastSaveAt = null;

  let S = load();

  function load() {
    try {
      const raw = JSON.parse(Store.read() || '{}');
      const s = Object.assign({}, DEFAULTS, raw);
      s.settings = Object.assign({}, DEFAULTS.settings, raw.settings || {});
      s.log = Array.isArray(s.log) ? s.log : [];
      s.wrong = s.wrong || {};
      return s;
    } catch (e) { return JSON.parse(JSON.stringify(DEFAULTS)); }
  }
  function save() {
    const okNow = Store.write(JSON.stringify(S));
    if (okNow) lastSaveAt = new Date();
    renderBanner();
    return okNow;
  }

  // 저장이 안 되는 상태는 잠깐 뜨는 토스트가 아니라 계속 보이는 띠로 알린다
  let syncLoading = false;
  function renderBanner() {
    const el = document.getElementById('banner');
    if (!el) return;
    let html = '';
    if (syncLoading) {
      html = '<div class="info-strip">저장된 진도를 불러오는 중…</div>';
    } else if (Sync.state() === '읽기 전용') {
      html = '<div class="warn-strip">이 화면은 읽기 전용이라 진도가 저장되지 않습니다. ' +
             '본인 계정으로 열었는지 확인해 주세요.</div>';
    } else if (Sync.possible() && !Sync.available()) {
      html = '<div class="warn-strip">⚠️ <b>이 화면에서는 학습 진도가 남지 않습니다.</b> ' +
             '계정 저장이 연결되지 않아(' + esc(Sync.state()) + '), 창을 닫으면 진도가 사라집니다. ' +
             '학습을 마친 뒤 <button class="linkbtn" id="banner-copy">진도 코드 복사</button>를 눌러 두면 ' +
             '<a href="#/settings">설정 → 데이터 백업</a>에서 되살릴 수 있습니다.</div>';
    } else if (!Store.ok() && !Sync.available()) {
      html = '<div class="warn-strip">⚠️ <b>이 브라우저에서는 학습 진도가 저장되지 않습니다.</b> ' +
             '사생활 보호(시크릿) 모드이거나 사이트 데이터가 차단된 상태일 수 있어요. ' +
             '<a href="#/settings">설정 → 저장소 진단</a>에서 확인하세요.</div>';
    }
    el.innerHTML = html;
    const cp = document.getElementById('banner-copy');
    if (cp) cp.onclick = function () { copyText(JSON.stringify(S), '진도 코드를 복사했습니다'); };
  }

  function copyText(text, okMsg) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    const done = function () { toast(okMsg); document.body.removeChild(ta); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        try { document.execCommand('copy'); } catch (e) {}
        done();
      });
    } else {
      try { document.execCommand('copy'); } catch (e) {}
      done();
    }
  }

  // 진도가 어디에 저장되는지 항상 눈에 보이게 한다
  function saveModeLabel() {
    if (Sync.available()) return '진도 저장: 계정에 저장됨 · 기기 간 공유';
    if (syncLoading) return '진도 저장: 확인 중…';
    if (Sync.possible()) return '진도 저장: ⚠️ 이 화면에서는 저장되지 않음';
    if (Store.ok()) return '진도 저장: 이 브라우저에 저장됨';
    return '진도 저장: ⚠️ 저장되지 않음';
  }


  /* ── 계정 동기화 ──────────────────────────────────────
     Artifact 뷰어에서는 브라우저 저장소가 방문 사이에 유지되지 않는다.
     그래서 진도를 페이지에 딸린 data/progress.json 으로 저장한다.
     파일 단위 publish 라 페이지(index.html)는 그대로 있고 이 화면도 리로드되지 않는다.
     휴대폰과 Mac이 같은 진도를 공유하는 효과도 함께 얻는다. */
  const FILE = 'data/progress.json';
  const Sync = (function () {
    const possible = !!(window.claude && typeof window.claude.use === 'function');
    let ns = null, state = possible ? '확인 중' : '연결 안 됨', busy = false, queued = null;

    function code(e) { return (e && e.code) || 'upstream_error'; }

    async function init() {
      try {
        ns = (window.claude && typeof window.claude.use === 'function')
          ? await window.claude.use('artifact') : null;
      } catch (e) { ns = null; }
      if (!ns) { state = '연결 안 됨'; renderBanner(); return null; }
      state = '연결됨';
      try {
        const res = await fetch(FILE + '?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return null;              // 아직 저장된 진도가 없음
        return await res.json();
      } catch (e) { return null; }
    }

    async function push(snapshot) {
      if (!ns) return false;
      if (busy) { queued = snapshot; return false; }   // 진행 중이면 마지막 것만 남긴다
      busy = true;
      try {
        const files = {}; files[FILE] = JSON.stringify(snapshot);
        await ns.publish(files);
        state = '저장됨';
        return true;
      } catch (e) {
        const c = code(e);
        if (c === 'conflict') state = '다른 기기가 먼저 저장함';
        else if (c === 'not_writer' || c === 'not_granted' || c === 'consent_required') { ns = null; state = '읽기 전용'; }
        else if (c === 'capability_disabled' || c === 'capability_removed' || c === 'not_declared') { ns = null; state = '사용 불가'; }
        else state = '저장 실패 (' + c + ')';
        return false;
      } finally {
        busy = false;
        renderBanner();
        if (queued) { const q = queued; queued = null; push(q); }
      }
    }

    return {
      init: init,
      push: push,
      available: function () { return !!ns; },
      state: function () { return state; },
      possible: function () { return possible; }
    };
  })();

  // 같은 사용자의 두 기기 상태를 합친다 — 더 많이 진행한 쪽을 채택
  function mergeState(a, b) {
    if (!b) return a;
    if (!a) return b;
    const base = (b.learned || 0) > (a.learned || 0) ? b : a;
    const out = Object.assign({}, DEFAULTS, base);
    out.settings = Object.assign({}, DEFAULTS.settings, base.settings || {});
    const byDate = {};
    (a.log || []).concat(b.log || []).forEach(function (e) {
      if (e && e.d) byDate[e.d] = Math.max(byDate[e.d] || 0, e.n || 0);
    });
    out.log = Object.keys(byDate).sort().map(function (d) { return { d: d, n: byDate[d] }; });
    out.wrong = Object.assign({}, a.wrong || {}, b.wrong || {});
    return out;
  }

  // 진도가 바뀌는 시점에만 호출한다 (카드 넘김 같은 잦은 변화는 제외)
  function persist() {
    save();
    Sync.push(S);
  }

  /* ── 3. 파생 계산 ───────────────────────────────────── */
  const perDay = () => S.settings.perDay || 15;
  const dataDays = () => Math.ceil(ALL.length / perDay());              // 데이터가 있는 Day 수
  const plannedDays = () => Math.ceil(META.totalTarget / perDay());     // 기획상 총 Day 수 (200)
  const doneDays = () => Math.floor(S.learned / perDay());
  const currentDay = () => Math.min(doneDays() + 1, plannedDays());
  const newWordsOf = (d) => ALL.slice((d - 1) * perDay(), d * perDay());

  function todayKey(dt) {
    const t = dt || new Date();
    return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
  }
  const pad = (n) => String(n).padStart(2, '0');

  /* 주 6일차(6, 12, 18…)에는 그 주에 배운 단어 중 5개를 복습 카드로 섞는다 (기획안 3-2) */
  function reviewOf(d) {
    if (d % 6 !== 0) return [];
    const weekStart = d - 5;
    const pool = ALL.slice((weekStart - 1) * perDay(), (d - 1) * perDay());
    return pickRandom(pool, Math.min(5, pool.length)).map(function (w) {
      return Object.assign({}, w, { _review: true });
    });
  }
  function cardsOf(d) { return newWordsOf(d).concat(reviewOf(d)); }

  function pickRandom(arr, n) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, n);
  }

  function streak() {
    if (!S.log.length) return 0;
    const days = Array.from(new Set(S.log.map(e => e.d))).sort().reverse();
    const t = new Date(); const y = new Date(Date.now() - 864e5);
    if (days[0] !== todayKey(t) && days[0] !== todayKey(y)) return 0;
    let n = 1, prev = new Date(days[0] + 'T00:00:00');
    for (let i = 1; i < days.length; i++) {
      const cur = new Date(days[i] + 'T00:00:00');
      if (Math.round((prev - cur) / 864e5) === 1) { n++; prev = cur; } else break;
    }
    return n;
  }

  function completeDay(d) {
    const target = Math.min(ALL.length, d * perDay());
    if (target <= S.learned) return false;
    const gained = target - S.learned;
    S.learned = target;
    if (!S.startedAt) S.startedAt = todayKey();
    const k = todayKey(), last = S.log[S.log.length - 1];
    if (last && last.d === k) last.n += gained; else S.log.push({ d: k, n: gained });
    S.pos = null;
    persist();
    return true;
  }

  /* ── 4. 발음(TTS) ───────────────────────────────────── */
  const TTS = (function () {
    const synth = window.speechSynthesis;
    let voices = [], subs = [];
    // macOS/Windows에는 장난용 음성이 많이 섞여 있어 회화 학습에 적합한 순서로 정렬한다
    const GOOD = /^(Samantha|Ava|Allison|Susan|Alex|Tom|Evan|Nathan|Joelle|Zoe|Serena|Daniel|Karen|Moira|Google US English|Google UK English|Microsoft (Aria|Guy|Jenny|Michelle|Ryan|Sonia))/i;
    function rank(v) {
      let r = 0;
      if (GOOD.test(v.name)) r -= 100;
      if (/en[-_]US/i.test(v.lang)) r -= 20;
      else if (/en[-_](GB|AU|CA)/i.test(v.lang)) r -= 10;
      if (v.default) r -= 5;
      return r;
    }
    function refresh() {
      voices = synth ? synth.getVoices().filter(v => /^en/i.test(v.lang)) : [];
      voices.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
      if (voices.length) { subs.forEach(fn => fn(voices)); subs = []; }
    }
    if (synth) { refresh(); synth.onvoiceschanged = refresh; }
    function pick() {
      if (!voices.length) refresh();
      return voices.find(v => v.voiceURI === S.settings.voiceURI)
          || voices.find(v => /en-US/i.test(v.lang) && /Samantha|Ava|Google US/i.test(v.name))
          || voices.find(v => /en-US/i.test(v.lang))
          || voices[0] || null;
    }
    return {
      supported: !!synth,
      list: function () { if (!voices.length) refresh(); return voices; },
      whenReady: function (fn) { if (voices.length) fn(voices); else subs.push(fn); },
      stop: function () { if (synth) synth.cancel(); },
      speak: function (text, opts) {
        if (!synth) { toast('이 브라우저는 음성 재생을 지원하지 않습니다'); return; }
        opts = opts || {};
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const v = pick();
        if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'en-US'; }
        u.rate = opts.rate || S.settings.rate || 0.92;
        if (opts.onstart) u.onstart = opts.onstart;
        if (opts.onend) { u.onend = opts.onend; u.onerror = opts.onend; }
        synth.speak(u);
      }
    };
  })();

  /* ── 5. 유틸 ────────────────────────────────────────── */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const nf = (n) => n.toLocaleString('ko-KR');

  let toastTimer;
  function toast(msg) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }
  function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
  function fmtDate(d) { return d.getFullYear() + '. ' + (d.getMonth() + 1) + '. ' + d.getDate() + '.'; }

  /* ── 6. 라우터 ──────────────────────────────────────── */
  const routes = {
    '': viewHome, 'home': viewHome, 'study': viewStudy, 'review': viewReview,
    'words': viewWords, 'progress': viewProgress, 'settings': viewSettings
  };
  let cleanup = null;

  function router() {
    TTS.stop();
    if (cleanup) { cleanup(); cleanup = null; }
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const fn = routes[parts[0]] || viewHome;
    $$('nav.tabs a').forEach(a => a.classList.toggle('active', a.dataset.route === (parts[0] || 'home')));
    renderBanner();
    const main = $('#app');
    main.innerHTML = '';
    fn(main, parts.slice(1));
    window.scrollTo(0, 0);
  }

  /* ── 7. 대시보드 ────────────────────────────────────── */
  function viewHome(root) {
    const d = currentDay(), pd = perDay();
    const hasData = (d - 1) * pd < ALL.length;
    const w = newWordsOf(d)[0];
    const pct = (S.learned / META.totalTarget) * 100;
    const remainDays = plannedDays() - doneDays();
    const finish6 = addDays(new Date(), Math.ceil(remainDays / 6) * 7);

    let paceLine = '아직 페이스를 계산할 데이터가 부족해요';
    const dates = Array.from(new Set(S.log.map(e => e.d))).sort();
    if (dates.length >= 3) {
      const span = Math.max(1, Math.round((new Date(dates[dates.length - 1]) - new Date(dates[0])) / 864e5) + 1);
      const perWeek = (dates.length / span) * 7;
      const wk = Math.ceil(remainDays / Math.max(0.5, perWeek));
      paceLine = '현재 페이스 주 ' + perWeek.toFixed(1) + '일 → 약 ' + wk + '주 남음';
    }

    root.innerHTML =
      '<div class="card hero">' +
        '<div><div class="small muted" style="font-weight:700">오늘의 학습</div>' +
        '<div class="day-num">Day ' + d + '</div></div>' +
        '<div class="day-meta">' +
          '<div style="font-weight:700;font-size:16px">' + (w ? esc(w.sub || w.chapterTitle) : '학습 데이터 없음') + '</div>' +
          '<div class="small muted">' + (w ? '챕터 ' + w.chapter + '. ' + esc(w.chapterTitle) : '이 Day의 단어 데이터가 아직 준비되지 않았습니다') + '</div>' +
          '<div class="small muted" style="margin-top:6px">신규 ' + pd + '개' + (d % 6 === 0 ? ' + 복습 카드 5개' : '') + '</div>' +
        '</div>' +
        '<div>' + (hasData
          ? '<a class="btn primary lg" href="#/study/' + d + '">' +
              (S.pos && S.pos.d === d && S.pos.i > 0
                ? '이어서 학습 (' + (S.pos.i + 1) + '/' + pd + ') →'
                : '학습 시작 →') + '</a>'
          : '<button class="btn lg" disabled>데이터 준비 중</button>') + '</div>' +
      '</div>' +

      '<div class="card pad" style="margin-top:14px">' +
        '<div class="row"><b>전체 진도</b><div class="spacer"></div>' +
        '<span class="small muted">' + nf(S.learned) + ' / ' + nf(META.totalTarget) + '단어 · ' + pct.toFixed(1) + '%</span></div>' +
        '<div class="progress" style="margin-top:10px"><span style="width:' + Math.min(100, pct) + '%"></span></div>' +
        '<div class="small muted" style="margin-top:8px">데이터 보유: ' + nf(ALL.length) + '단어 (Day 1~' + dataDays() + ') · ' +
          esc(saveModeLabel()) + '</div>' +
      '</div>' +

      '<div class="section-title">현황</div>' +
      '<div class="stat-grid">' +
        stat('완료한 Day', doneDays() + '일', '남은 ' + remainDays + '일') +
        stat('연속 학습', streak() + '일', streak() >= 6 ? '이번 주 목표 달성! 🔥' : '주 6일이 목표') +
        stat('학습한 단어', nf(S.learned) + '개', '챕터 ' + Math.min(META.chapters.length, Math.floor(S.learned / META.perChapter) + 1) + ' 진행 중') +
        stat('목표 완주일', fmtDate(finish6), paceLine) +
      '</div>' +

      '<div class="section-title">학습 히트맵 (최근 26주)</div>' +
      '<div class="card pad">' + heatmap() + 
        '<div class="row small muted" style="margin-top:10px;gap:6px;justify-content:flex-end">적음' +
        '<span class="heat-cell l1"></span><span class="heat-cell l2"></span><span class="heat-cell l3"></span>많음</div>' +
      '</div>' +

      '<div class="section-title">챕터 진행률</div><div class="card">' +
        META.chapters.map(function (c) {
          const have = (CHAPTERS[c.id] ? CHAPTERS[c.id].words.length : 0);
          const start = (c.id - 1) * META.perChapter;
          const done = Math.max(0, Math.min(META.perChapter, S.learned - start));
          const p = (done / META.perChapter) * 100;
          return '<div class="chapter-row"' + (c.id > 1 ? ' style="border-top:1px solid var(--border)"' : '') + '>' +
            '<div class="n">' + c.id + '</div><div class="t">' + esc(c.title) +
            (have ? '' : ' <span class="badge">데이터 준비 중</span>') + '</div>' +
            '<div class="bar progress"><span style="width:' + p + '%"></span></div>' +
            '<div class="small muted" style="width:64px;text-align:right">' + done + '/300</div></div>';
        }).join('') +
      '</div>';
  }

  function diagRow(k, v) {
    return '<div class="chapter-row" style="border-top:1px solid var(--border)">' +
      '<div class="t">' + esc(k) + '</div><div class="small">' + v + '</div></div>';
  }

  function stat(k, v, s) {
    return '<div class="card stat"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div><div class="s">' + esc(s) + '</div></div>';
  }

  function heatmap() {
    const byDate = {};
    S.log.forEach(e => { byDate[e.d] = (byDate[e.d] || 0) + e.n; });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = addDays(today, 6 - today.getDay());          // 이번 주 토요일
    const start = addDays(end, -7 * 26 + 1);
    let html = '<div class="heat">';
    for (let c = 0; c < 26; c++) {
      html += '<div class="heat-col">';
      for (let r = 0; r < 7; r++) {
        const dt = addDays(start, c * 7 + r);
        const k = todayKey(dt), n = byDate[k] || 0;
        const lvl = n === 0 ? '' : n < 10 ? ' l1' : n < 20 ? ' l2' : ' l3';
        const isToday = k === todayKey(today) ? ' today' : '';
        const future = dt > today ? ' style="opacity:.35"' : '';
        html += '<div class="heat-cell' + lvl + isToday + '"' + future + ' title="' + k + ' · ' + n + '단어"></div>';
      }
      html += '</div>';
    }
    return html + '</div>';
  }

  /* ── 8. 오늘의 학습 ─────────────────────────────────── */
  function viewStudy(root, args) {
    const d = Math.max(1, parseInt(args[0], 10) || currentDay());
    const cards = cardsOf(d);
    if (!cards.length) {
      root.innerHTML = '<div class="card empty"><b>Day ' + d + '의 단어 데이터가 아직 없습니다.</b><br>' +
        '<span class="small">현재 Day 1~' + dataDays() + '까지 준비되어 있어요.</span><br><br>' +
        '<a class="btn" href="#/home">대시보드로</a></div>';
      return;
    }
    const isCurrent = d === currentDay();
    const isDone = d <= doneDays();
    // 중간에 나갔다 돌아와도 보던 카드에서 이어지도록
    let i = (S.pos && S.pos.d === d && S.pos.i > 0 && S.pos.i < cards.length) ? S.pos.i : 0;
    let hideKr = false;

    root.innerHTML =
      '<div class="study-head">' +
        '<h1>Day ' + d + '</h1>' +
        '<span class="badge">챕터 ' + cards[0].chapter + '</span>' +
        '<span class="muted small">' + esc(cards[0].sub) + '</span>' +
        '<div class="spacer"></div>' +
        (isDone ? '<span class="badge" style="background:var(--good-soft);color:var(--good)">완료한 Day · 복습</span>'
                : isCurrent ? '' : '<span class="badge">미리보기</span>') +
      '</div>' +
      (isCurrent && !isDone
        ? '<div class="hint-strip" id="hint">마지막 카드에서 <b>‘Day ' + d + ' 학습 완료’</b> 버튼을 눌러야 진도가 저장됩니다.</div>'
        : '') +
      '<div class="card flash" id="flash"></div>' +
      '<div class="dots" id="dots"></div>' +
      '<div class="study-nav">' +
        '<button class="btn" id="prev">← 이전</button>' +
        '<button class="btn ghost" id="toggleKr">뜻 가리기</button>' +
        '<button class="btn primary" id="next">다음 →</button>' +
      '</div>' +
      '<div class="kbd-hint"><kbd>←</kbd> <kbd>→</kbd> 카드 이동 · <kbd>space</kbd> 단어 발음 · ' +
        '<kbd>S</kbd> 예문 발음 · <kbd>H</kbd> 뜻 가리기</div>';

    function render() {
      const w = cards[i];
      $('#flash').innerHTML =
        (w._review ? '<div class="rev-tag">복습</div>' : '') +
        '<div class="idx">' + (i + 1) + ' / ' + cards.length + '</div>' +
        '<div><span class="word" id="word">' + esc(w.w) + '<span class="spk">🔊</span></span></div>' +
        '<div class="ipa">' + esc(w.ipa) + '</div>' +
        '<div style="margin-top:8px"><span class="badge ' + w.pos + '">' + w.pos + '</span></div>' +
        '<div class="meaning' + (hideKr ? ' hidden-kr' : '') + '" id="meaning">' + esc(w.kr) + '</div>' +
        '<div class="ex" id="ex"><div class="en"><span>' + esc(w.en) + '</span><span class="spk">🔊</span></div>' +
          '<div class="kr">' + esc(w.enkr) + '</div></div>' +
        (i === cards.length - 1
          ? '<div style="margin-top:22px">' + (isCurrent
              ? '<button class="btn primary lg" id="done">✅ Day ' + d + ' 학습 완료</button>'
              : isDone ? '<a class="btn lg" href="#/home">복습 끝 · 대시보드로</a>'
                       : '<button class="btn lg" disabled>Day ' + currentDay() + '부터 순서대로 완료할 수 있어요</button>') + '</div>'
          : '');

      $('#dots').innerHTML = cards.map((c, n) =>
        '<i class="' + (n === i ? 'cur' : n < i ? 'done' : '') + '" data-n="' + n + '"></i>').join('');
      $('#prev').disabled = i === 0;
      $('#next').disabled = i === cards.length - 1;
      $('#toggleKr').textContent = hideKr ? '뜻 보이기' : '뜻 가리기';

      const wordEl = $('#word'), exEl = $('#ex');
      wordEl.onclick = () => say(w.w, wordEl);
      exEl.onclick = () => say(w.en, exEl);
      $('#meaning').onclick = () => { if (hideKr) { hideKr = false; render(); } };
      const hint = $('#hint');
      if (hint) hint.style.display = (i === cards.length - 1) ? 'none' : '';

      // 카드를 넘길 때마다 위치를 저장해 둔다 (중간에 나가도 이어서 볼 수 있게)
      if (!S.pos || S.pos.d !== d || S.pos.i !== i) { S.pos = { d: d, i: i }; save(); }

      const doneBtn = $('#done');
      if (doneBtn) doneBtn.onclick = function () {
        if (!completeDay(d)) return;
        if (!Store.ok() && !Sync.available()) {
          alert('Day ' + d + ' 학습은 끝났지만 이 브라우저에 진도를 저장하지 못했습니다.\n\n' +
                '사생활 보호(시크릿) 모드를 끄거나 다른 브라우저에서 다시 시도해 주세요. ' +
                '자세한 내용은 설정 → 저장소 진단에서 확인할 수 있습니다.');
          location.hash = '#/settings';
          return;
        }
        toast('Day ' + d + ' 완료! 누적 ' + nf(S.learned) + '단어 🎉');
        location.hash = '#/home';
      };
    }

    function say(text, el) {
      el.classList.add('speaking');
      TTS.speak(text, { onend: () => el.classList.remove('speaking') });
    }

    $('#prev').onclick = () => { if (i > 0) { i--; render(); } };
    $('#next').onclick = () => { if (i < cards.length - 1) { i++; render(); } };
    $('#toggleKr').onclick = () => { hideKr = !hideKr; render(); };
    $('#dots').onclick = (e) => { const n = e.target.dataset.n; if (n != null) { i = +n; render(); } };

    function onKey(e) {
      if (/input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight') { if (i < cards.length - 1) { i++; render(); } }
      else if (e.key === 'ArrowLeft') { if (i > 0) { i--; render(); } }
      else if (e.code === 'Space') { e.preventDefault(); const el = $('#word'); if (el) say(cards[i].w, el); }
      else if (e.key === 's' || e.key === 'S') { const el = $('#ex'); if (el) say(cards[i].en, el); }
      else if (e.key === 'h' || e.key === 'H') { hideKr = !hideKr; render(); }
    }
    document.addEventListener('keydown', onKey);
    cleanup = () => document.removeEventListener('keydown', onKey);
    render();
  }

  /* ── 9. 복습 퀴즈 ───────────────────────────────────── */
  function viewReview(root) {
    const learnedWords = ALL.slice(0, S.learned || Math.min(perDay(), ALL.length));
    if (learnedWords.length < 4) {
      root.innerHTML = '<div class="card empty"><b>먼저 Day 1을 학습해 주세요.</b><br>' +
        '<span class="small">학습을 마친 단어들이 퀴즈로 출제됩니다.</span><br><br><a class="btn primary" href="#/study/1">Day 1 시작</a></div>';
      return;
    }
    const wrongWords = learnedWords.filter(w => S.wrong[w.w]);

    root.innerHTML =
      '<h1>복습 퀴즈</h1>' +
      '<p class="muted small">학습을 마친 ' + nf(learnedWords.length) + '개 단어 중에서 무작위로 출제합니다.</p>' +
      '<div class="card pad" style="margin-top:14px">' +
        '<div class="set-row" style="padding:0 0 12px">' +
          '<span class="lbl">출제 방향</span>' +
          '<select id="dir"><option value="en">영어 → 뜻 맞히기</option><option value="kr">뜻 → 영어 맞히기</option></select>' +
          '<select id="pool"><option value="all">전체 단어</option>' +
            '<option value="recent">최근 90개</option>' +
            '<option value="wrong"' + (wrongWords.length ? '' : ' disabled') + '>틀린 단어만 (' + wrongWords.length + '개)</option></select>' +
          '<select id="cnt"><option>10</option><option>20</option><option>30</option></select>' +
          '<button class="btn primary" id="start">시작</button>' +
        '</div>' +
        '<div id="quiz"></div>' +
      '</div>';

    $('#start').onclick = start;

    function start() {
      const dir = $('#dir').value, cnt = +$('#cnt').value;
      let pool = learnedWords;
      if ($('#pool').value === 'recent') pool = learnedWords.slice(-90);
      if ($('#pool').value === 'wrong') pool = wrongWords;
      if (pool.length < 4) { toast('출제할 단어가 부족합니다'); return; }
      const qs = pickRandom(pool, Math.min(cnt, pool.length));
      let qi = 0, right = 0;
      const missed = [];

      function q() {
        if (qi >= qs.length) return finish();
        const w = qs[qi];
        const others = pickRandom(learnedWords.filter(x => x.w !== w.w && x.kr !== w.kr), 3);
        const opts = pickRandom([w].concat(others), 4);
        const ask = dir === 'en' ? w.w : w.kr;
        $('#quiz').innerHTML =
          '<div class="row small muted"><span>' + (qi + 1) + ' / ' + qs.length + '</span>' +
            '<div class="spacer"></div><span>정답 ' + right + '개</span></div>' +
          '<div class="progress" style="margin:8px 0 16px"><span style="width:' + (qi / qs.length * 100) + '%"></span></div>' +
          '<div class="quiz-q" id="q">' + esc(ask) + (dir === 'en' ? ' <span class="spk">🔊</span>' : '') + '</div>' +
          (dir === 'en' ? '<div class="small muted" style="text-align:center">' + esc(w.ipa) + '</div>' : '') +
          '<div class="opts">' + opts.map((o, n) =>
            '<button class="opt" data-n="' + n + '">' + esc(dir === 'en' ? o.kr : o.w) + '</button>').join('') + '</div>' +
          '<div id="fb"></div>';

        if (dir === 'en') $('#q').onclick = () => TTS.speak(w.w);
        $$('#quiz .opt').forEach(function (btn) {
          btn.onclick = function () {
            const chosen = opts[+btn.dataset.n];
            const ok = chosen.w === w.w;
            $$('#quiz .opt').forEach((b, n) => {
              b.disabled = true;
              if (opts[n].w === w.w) b.classList.add('right');
              else if (b === btn) b.classList.add('wrong');
            });
            if (ok) { right++; if (S.wrong[w.w]) { delete S.wrong[w.w]; } }
            else { S.wrong[w.w] = (S.wrong[w.w] || 0) + 1; missed.push(w); }
            save();
            TTS.speak(w.w);
            $('#fb').innerHTML = '<div class="card pad" style="margin-top:14px;background:var(--surface-2)">' +
              '<b>' + esc(w.w) + '</b> <span class="ipa small muted">' + esc(w.ipa) + '</span> — ' + esc(w.kr) +
              '<div class="small" style="margin-top:6px">' + esc(w.en) + '<br><span class="muted">' + esc(w.enkr) + '</span></div>' +
              '<button class="btn primary" id="nx" style="margin-top:12px">' + (qi === qs.length - 1 ? '결과 보기' : '다음 문제') + '</button></div>';
            $('#nx').onclick = () => { qi++; q(); };
            $('#nx').focus();
          };
        });
      }

      function finish() {
        const rate = Math.round(right / qs.length * 100);
        $('#quiz').innerHTML =
          '<div style="text-align:center;padding:20px 0">' +
            '<div style="font-size:44px;font-weight:800">' + rate + '%</div>' +
            '<div class="muted">' + qs.length + '문제 중 ' + right + '개 정답</div>' +
            '<button class="btn primary lg" id="again" style="margin-top:16px">다시 풀기</button>' +
          '</div>' +
          (missed.length ? '<div class="section-title">틀린 단어 ' + missed.length + '개</div><div class="wlist">' +
            missed.map(w => wordItem(w, true)).join('') + '</div>' : '');
        $('#again').onclick = start;
        bindWordItems();
      }
      q();
    }
  }

  /* ── 10. 전체 단어장 ────────────────────────────────── */
  function viewWords(root) {
    root.innerHTML =
      '<h1>전체 단어장</h1>' +
      '<p class="muted small">' + nf(ALL.length) + '개 단어 · 단어나 예문을 클릭하면 발음이 재생됩니다.</p>' +
      '<div class="filters" style="margin-top:14px">' +
        '<input type="search" id="q" placeholder="단어 · 뜻 · 예문 검색">' +
        '<select id="ch"><option value="">전체 챕터</option>' +
          META.chapters.filter(c => CHAPTERS[c.id]).map(c => '<option value="' + c.id + '">' + c.id + '. ' + esc(c.title) + '</option>').join('') +
        '</select>' +
        '<select id="pos"><option value="">전체 품사</option><option>명사</option><option>동사</option><option>형용사</option><option>부사</option></select>' +
        '<select id="st"><option value="">전체</option><option value="done">학습 완료만</option><option value="todo">아직 안 배운 것만</option></select>' +
      '</div>' +
      '<div id="cnt" class="small muted" style="margin-bottom:10px"></div>' +
      '<div class="wlist" id="list"></div>';

    function apply() {
      const q = $('#q').value.trim().toLowerCase();
      const ch = $('#ch').value, pos = $('#pos').value, st = $('#st').value;
      const res = ALL.filter(function (w) {
        if (ch && String(w.chapter) !== ch) return false;
        if (pos && w.pos !== pos) return false;
        if (st === 'done' && w.gi >= S.learned) return false;
        if (st === 'todo' && w.gi < S.learned) return false;
        if (q && !(w.w.toLowerCase().includes(q) || w.kr.includes(q) ||
                   w.en.toLowerCase().includes(q) || w.enkr.includes(q))) return false;
        return true;
      });
      $('#cnt').textContent = res.length + '개';
      $('#list').innerHTML = res.length
        ? res.slice(0, 400).map(w => wordItem(w)).join('') + (res.length > 400 ? '<div class="small muted" style="padding:10px">…상위 400개만 표시했습니다. 검색어를 좁혀보세요.</div>' : '')
        : '<div class="card empty">검색 결과가 없습니다.</div>';
      bindWordItems();
    }
    ['q', 'ch', 'pos', 'st'].forEach(id => { const el = $('#' + id); el.oninput = apply; el.onchange = apply; });
    apply();
  }

  function wordItem(w, plain) {
    const learned = w.gi < S.learned;
    const day = Math.floor(w.gi / perDay()) + 1;
    return '<div class="card witem' + (learned && !plain ? ' learned' : '') + '" data-w="' + esc(w.w) + '" data-en="' + esc(w.en) + '">' +
      '<span class="w js-w">' + esc(w.w) + '</span>' +
      '<span class="ipa">' + esc(w.ipa) + '</span>' +
      '<span class="badge ' + w.pos + '">' + w.pos + '</span>' +
      '<span class="kr">' + esc(w.kr) + '</span>' +
      '<span class="spacer"></span>' +
      '<span class="badge">Day ' + day + '</span>' +
      '<div class="ex js-ex">' + esc(w.en) + ' <span class="muted">/ ' + esc(w.enkr) + '</span></div>' +
    '</div>';
  }
  function bindWordItems() {
    $$('.witem').forEach(function (el) {
      const wq = $('.js-w', el), ex = $('.js-ex', el);
      if (wq) wq.onclick = () => TTS.speak(el.dataset.w);
      if (ex) ex.onclick = () => TTS.speak(el.dataset.en);
    });
  }

  /* ── 11. 진도 관리 ──────────────────────────────────── */
  function viewProgress(root) {
    const cur = currentDay(), have = dataDays(), total = plannedDays();
    let cells = '';
    for (let d = 1; d <= total; d++) {
      const done = d <= doneDays(), isCur = d === cur, nodata = d > have;
      const cls = 'day-cell' + (done ? ' done' : '') + (isCur ? ' cur' : '') + (nodata ? ' nodata locked' : '');
      cells += nodata
        ? '<span class="' + cls + '" title="데이터 준비 중">' + d + '</span>'
        : '<a class="' + cls + '" href="#/study/' + d + '">' + d + '</a>';
    }
    const dates = Array.from(new Set(S.log.map(e => e.d))).sort();
    root.innerHTML =
      '<h1>진도 관리</h1>' +
      '<p class="muted small">완료 ' + doneDays() + '일 / 전체 ' + total + '일 · 데이터 보유 Day 1~' + have + '</p>' +
      '<div class="card pad" style="margin-top:14px"><div class="day-grid">' + cells + '</div>' +
        '<div class="row small muted" style="margin-top:14px;gap:14px;flex-wrap:wrap">' +
          '<span class="row" style="gap:6px"><span class="day-cell done" style="width:16px;height:16px;font-size:0"></span>완료</span>' +
          '<span class="row" style="gap:6px"><span class="day-cell cur" style="width:16px;height:16px;font-size:0"></span>오늘</span>' +
          '<span class="row" style="gap:6px"><span class="day-cell nodata" style="width:16px;height:16px;font-size:0"></span>데이터 준비 중</span>' +
        '</div></div>' +
      '<div class="section-title">학습 기록</div>' +
      (dates.length
        ? '<div class="card">' + S.log.slice().reverse().slice(0, 40).map((e, n) =>
            '<div class="chapter-row"' + (n ? ' style="border-top:1px solid var(--border)"' : '') + '>' +
            '<div class="t">' + e.d + '</div><div class="small muted">+' + e.n + '단어</div></div>').join('') + '</div>'
        : '<div class="card empty">아직 학습 기록이 없습니다.</div>') +
      (doneDays() > 0
        ? '<div class="section-title">되돌리기</div><div class="card pad">' +
          '<div class="row"><div><b>마지막 Day 완료 취소</b><div class="small muted">실수로 완료를 눌렀을 때 사용하세요. Day ' + doneDays() + '이 미완료로 돌아갑니다.</div></div>' +
          '<div class="spacer"></div><button class="btn" id="undo">취소</button></div></div>'
        : '');

    const u = $('#undo');
    if (u) u.onclick = function () {
      const back = Math.max(0, S.learned - perDay());
      const removed = S.learned - back;
      S.learned = back;
      for (let i = S.log.length - 1; i >= 0 && removed > 0; i--) {
        if (S.log[i].n > removed) { S.log[i].n -= removed; break; }
        S.log.splice(i, 1); break;
      }
      persist(); toast('완료를 취소했습니다'); router();
    };
  }

  /* ── 12. 설정 ───────────────────────────────────────── */
  function viewSettings(root) {
    const voices = TTS.list();
    root.innerHTML =
      '<h1>설정</h1>' +
      '<div class="section-title">학습</div>' +
      '<div class="card">' +
        '<div class="set-row"><span class="lbl">하루 목표 단어 수</span>' +
          '<select id="perDay">' + [10, 15, 20, 25, 30].map(n =>
            '<option value="' + n + '"' + (n === perDay() ? ' selected' : '') + '>' + n + '개</option>').join('') + '</select>' +
          '<span class="small muted">전체 ' + Math.ceil(META.totalTarget / perDay()) + '일 예상</span>' +
          '<div class="desc">Day 구분 기준이 바뀝니다. 이미 학습한 단어 수(' + nf(S.learned) + '개)는 그대로 유지됩니다.</div></div>' +
      '</div>' +
      '<div class="section-title">발음</div>' +
      '<div class="card">' +
        (TTS.supported
          ? '<div class="set-row"><span class="lbl">음성</span>' +
              '<select id="voice" style="flex:1;min-width:200px"><option value="">자동 선택' +
              (voices.length ? ' (' + esc(voices[0].name) + ')' : '') + '</option>' +
              voices.map(v => '<option value="' + esc(v.voiceURI) + '"' + (v.voiceURI === S.settings.voiceURI ? ' selected' : '') + '>' +
                esc(v.name) + ' (' + esc(v.lang) + ')</option>').join('') + '</select>' +
              (voices.length ? '' : '<span class="small muted">영어 음성을 찾는 중… 페이지를 새로고침 해보세요.</span>') +
            '</div>' +
            '<div class="set-row" style="border-top:1px solid var(--border)"><span class="lbl">말하기 속도</span>' +
              '<input type="range" id="rate" min="0.5" max="1.3" step="0.02" value="' + S.settings.rate + '">' +
              '<span id="rateV" class="small muted" style="width:44px">' + Number(S.settings.rate).toFixed(2) + '</span>' +
              '<button class="btn" id="test">테스트</button>' +
              '<div class="desc">0.8~0.95 정도가 회화 연습에 듣기 좋습니다.</div></div>'
          : '<div class="pad muted">이 브라우저는 Web Speech API를 지원하지 않아 발음 재생을 사용할 수 없습니다.</div>') +
      '</div>' +
      '<div class="section-title">저장소 진단</div>' +
      '<div class="card">' +
        diagRow('계정 동기화', Sync.available()
            ? '<span style="color:var(--good);font-weight:700">연결됨</span> ' +
              '<span class="small muted">— 진도가 페이지에 저장되어 기기 간에 공유됩니다 (' + esc(Sync.state()) + ')</span>'
            : '<span style="color:var(--text-2);font-weight:700">' + esc(Sync.state()) + '</span>' +
              '<span class="small muted"> — 이 브라우저에만 저장됩니다</span>') +
        diagRow('기기 저장소', Store.ok()
            ? '<span style="color:var(--good);font-weight:700">정상 저장됨</span>'
            : '<span style="color:var(--bad);font-weight:700">저장 불가</span>' +
              (Store.error() ? ' <span class="small muted">(' + esc(Store.error()) + ')</span>' : '')) +
        diagRow('저장된 진도', S.learned + '단어 · 완료 ' + doneDays() + 'Day · 기록 ' + S.log.length + '건') +
        diagRow('마지막 저장', lastSaveAt ? lastSaveAt.toLocaleString('ko-KR') : '이번 접속에서 아직 없음') +
        diagRow('저장 위치', esc(location.protocol + '//' + (location.host || '(로컬 파일)'))) +
        diagRow('발음 지원', TTS.supported ? '지원됨 · 영어 음성 ' + TTS.list().length + '개' : '지원 안 됨') +
        (Store.ok() || Sync.available() ? '' :
          '<div class="pad small" style="border-top:1px solid var(--border);color:var(--text-2)">' +
          '진도가 저장되지 않는 흔한 원인입니다 — ' +
          '① 사생활 보호(시크릿) 모드로 열었을 때 ② 브라우저가 사이트 데이터를 차단했을 때 ' +
          '③ iPhone에서 Safari와 홈 화면 아이콘을 번갈아 쓸 때(둘은 저장 공간이 다릅니다).</div>') +
      '</div>' +
      '<div class="section-title">데이터 백업</div>' +
      '<div class="card pad">' +
        '<div class="small muted">진도는 이 브라우저에만 저장됩니다. 아래 내용을 복사해 두면 다른 기기·브라우저에서 그대로 복원할 수 있습니다.</div>' +
        '<textarea id="backup" style="width:100%;height:110px;margin-top:10px;font-family:var(--mono);font-size:12px;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--surface-2);color:var(--text)"></textarea>' +
        '<div class="row" style="margin-top:10px">' +
          '<button class="btn" id="copy">복사</button>' +
          '<button class="btn" id="restore">붙여넣은 내용으로 복원</button>' +
          '<div class="spacer"></div>' +
          '<button class="btn" id="reset" style="color:var(--bad)">진도 초기화</button>' +
        '</div>' +
      '</div>';

    $('#perDay').onchange = function () { S.settings.perDay = +this.value; persist(); toast('하루 ' + this.value + '개로 변경했습니다'); router(); };
    const rate = $('#rate');
    if (rate) {
      rate.oninput = function () { S.settings.rate = +this.value; $('#rateV').textContent = (+this.value).toFixed(2); save(); };
      $('#voice').onchange = function () { S.settings.voiceURI = this.value; save(); TTS.speak('This is how it sounds.'); };
      $('#test').onclick = () => TTS.speak('Can you suggest a good restaurant nearby?');
    }
    if (TTS.supported && !voices.length) {
      TTS.whenReady(function () { if (location.hash.indexOf('settings') > -1) router(); });
    }
    const ta = $('#backup');
    ta.value = JSON.stringify(S);
    $('#copy').onclick = function () { copyText(ta.value, '진도 코드를 복사했습니다'); };
    $('#restore').onclick = function () {
      try {
        const o = JSON.parse(ta.value);
        if (typeof o.learned !== 'number') throw 0;
        S = Object.assign({}, DEFAULTS, o);
        S.settings = Object.assign({}, DEFAULTS.settings, o.settings || {});
        persist(); toast('복원했습니다'); router();
      } catch (e) { toast('형식이 올바르지 않습니다'); }
    };
    $('#reset').onclick = function () {
      if (!confirm('모든 학습 진도를 지웁니다. 계속할까요?')) return;
      S = JSON.parse(JSON.stringify(DEFAULTS)); persist(); toast('초기화했습니다'); router();
    };
  }

  /* ── 13. 시작 ───────────────────────────────────────── */
  function startSync() {
    if (!Sync.possible()) { renderBanner(); return; }
    syncLoading = true;
    renderBanner();
    Sync.init().then(function (remote) {
      syncLoading = false;
      const before = S.learned;
      if (remote) { S = mergeState(S, remote); save(); }
      else if (S.learned > 0 && Sync.available()) { Sync.push(S); }  // 이 기기에만 있던 진도를 올려 둔다
      // 학습 카드를 보고 있는 중이면 화면을 갈아엎지 않는다
      if (/^#\/(study)/.test(location.hash)) renderBanner(); else router();
      if (remote && S.learned !== before) toast('저장된 진도를 불러왔습니다 · 누적 ' + nf(S.learned) + '단어');
    }).catch(function () { syncLoading = false; renderBanner(); });
  }

  window.addEventListener('hashchange', router);
  document.addEventListener('DOMContentLoaded', function () {
    if (!ALL.length) {
      $('#app').innerHTML = '<div class="card empty">단어 데이터를 불러오지 못했습니다.</div>';
      return;
    }
    router();
    startSync();
  });
  if (document.readyState !== 'loading') {   // 이미 로드된 경우
    setTimeout(function () { router(); startSync(); }, 0);
  }
})();
