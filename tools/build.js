#!/usr/bin/env node
/* 단일 파일 빌드
   dist/index.html    — 더블클릭만으로 열리는 완전 단독 실행 파일
   dist/artifact.html — Claude Artifact 배포용 (doctype/head/body 래퍼 없음)
   사용법: node tools/build.js
*/
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const r = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const css = r('css/style.css');
const html = r('index.html');

// data/*.js 는 파일명 순서대로 모두 포함 (챕터가 늘어나면 자동 반영)
const dataFiles = fs.readdirSync(path.join(root, 'data'))
  .filter(f => f.endsWith('.js'))
  .sort((a, b) => (a === 'index.js' ? -1 : b === 'index.js' ? 1 : a.localeCompare(b)));
const js = dataFiles.map(f => r('data/' + f)).join('\n') + '\n' + r('js/app.js');

// index.html 의 <body> 안쪽 마크업만 추출 (script 태그 제외)
const body = html
  .slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .trim();

const title = '나만의 영어회화 단어장';
const fonts =
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Noto+Sans+Mono:wght@400;500&display=swap">\n';
const head = `<title>${title}</title>\n` + fonts + `<style>\n${css}\n</style>\n`;
const bodyPart = body + '\n' + `<script>\n${js}\n</script>\n`;
const inner = head + bodyPart;   // Artifact 는 head/body 래퍼를 알아서 붙여준다

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/artifact.html'), inner);

const standalone =
  `<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n` +
  `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n` +
  `<meta name="color-scheme" content="light dark">\n` +
  `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📖</text></svg>">\n` +
  head + '</head>\n<body>\n' + bodyPart + '</body>\n</html>\n';
fs.writeFileSync(path.join(root, 'dist/index.html'), standalone);

const kb = (f) => (fs.statSync(path.join(root, f)).size / 1024).toFixed(0) + 'KB';
console.log('✅ dist/index.html    ' + kb('dist/index.html') + '  (단독 실행)');
console.log('✅ dist/artifact.html ' + kb('dist/artifact.html') + '  (Artifact 배포용)');
console.log('   포함 데이터: ' + dataFiles.join(', '));
