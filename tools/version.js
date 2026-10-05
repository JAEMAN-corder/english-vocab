#!/usr/bin/env node
/* 배포 버전 올리기
   index.html 의 ?v=N 과 window.APP_BUILD 를 함께 올리고 version.json 을 쓴다.
   앱은 실행 중에 version.json 을 no-store 로 읽어 자기 빌드와 다르면 한 번 새로고침한다.
   (홈 화면 앱은 주소창·새로고침 버튼이 없어 오래된 HTML을 계속 들고 있을 수 있다)
   사용법: node tools/version.js && node tools/build.js */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'index.html');

let html = fs.readFileSync(htmlPath, 'utf8');
const cur = (html.match(/\?v=(\d+)/) || [, '0'])[1];
const next = String(parseInt(cur, 10) + 1);

html = html.replace(/\?v=\d+/g, '?v=' + next);
if (/window\.APP_BUILD\s*=\s*"[^"]*"/.test(html)) {
  html = html.replace(/window\.APP_BUILD\s*=\s*"[^"]*"/, 'window.APP_BUILD = "' + next + '"');
} else {
  html = html.replace('</head>', '<script>window.APP_BUILD = "' + next + '";</script>\n</head>');
}
fs.writeFileSync(htmlPath, html);
fs.writeFileSync(path.join(root, 'version.json'), JSON.stringify({ build: next }) + '\n');
console.log('빌드 ' + cur + ' → ' + next);
