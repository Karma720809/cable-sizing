// One-shot script: USER_GUIDE.md -> styled HTML -> Chrome headless PDF.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;

const md = readFileSync(resolve(root, 'USER_GUIDE.md'), 'utf8');

marked.setOptions({ gfm: true, breaks: false, headerIds: true, mangle: false });
const body = marked.parse(md);

const css = `
@page { size: A4; margin: 18mm 16mm 20mm 16mm; }
* { box-sizing: border-box; }
html, body {
  font-family: "Malgun Gothic", "맑은 고딕", "Noto Sans KR", "Apple SD Gothic Neo",
               -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 10.5pt;
  line-height: 1.55;
  color: #1a1a1a;
  margin: 0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
h1, h2, h3, h4 { color: #0b3d91; line-height: 1.25; page-break-after: avoid; }
h1 {
  font-size: 22pt; margin: 0 0 6pt 0; padding-bottom: 6pt;
  border-bottom: 2pt solid #0b3d91;
}
h2 {
  font-size: 15pt; margin: 18pt 0 6pt 0; padding-bottom: 3pt;
  border-bottom: 1pt solid #c8d4e8;
}
h3 { font-size: 12.5pt; margin: 14pt 0 4pt 0; }
h4 { font-size: 11pt; margin: 10pt 0 4pt 0; color: #16518c; }
p { margin: 4pt 0 6pt 0; }
ul, ol { margin: 4pt 0 6pt 0; padding-left: 18pt; }
li { margin: 1pt 0; }
hr { border: none; border-top: 1pt solid #c8d4e8; margin: 12pt 0; }
a { color: #0b66c3; text-decoration: none; }
strong { color: #0b3d91; }
blockquote {
  border-left: 3pt solid #c8d4e8;
  padding: 4pt 10pt;
  margin: 6pt 0;
  background: #f4f7fb;
  color: #2c3e50;
}
code {
  font-family: "Cascadia Mono", Consolas, "D2Coding", "Courier New", monospace;
  font-size: 9.5pt;
  background: #f1f3f5;
  padding: 1pt 4pt;
  border-radius: 2pt;
}
pre {
  background: #0f172a;
  color: #e2e8f0;
  padding: 10pt 12pt;
  border-radius: 4pt;
  overflow-x: auto;
  font-size: 9pt;
  line-height: 1.45;
  page-break-inside: avoid;
}
pre code { background: transparent; color: inherit; padding: 0; font-size: 9pt; }
table {
  border-collapse: collapse;
  width: 100%;
  margin: 6pt 0 10pt 0;
  font-size: 9.8pt;
  page-break-inside: auto;
}
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
th, td {
  border: 0.6pt solid #b8c4d6;
  padding: 4pt 6pt;
  text-align: left;
  vertical-align: top;
}
th { background: #e8eff9; color: #0b3d91; font-weight: 600; }
tbody tr:nth-child(even) { background: #f7f9fc; }

/* Cover */
.cover {
  page-break-after: always;
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: center;
  padding: 40pt;
}
.cover .title { font-size: 32pt; color: #0b3d91; font-weight: 700; margin-bottom: 8pt; }
.cover .subtitle { font-size: 14pt; color: #16518c; margin-bottom: 24pt; }
.cover .meta { font-size: 11pt; color: #4a5b73; line-height: 1.8; margin-top: 30pt; }
.cover .badge {
  display: inline-block;
  background: #e8eff9;
  color: #0b3d91;
  border: 1pt solid #b8c4d6;
  padding: 4pt 10pt;
  border-radius: 4pt;
  margin: 4pt;
  font-size: 10pt;
}
`;

const cover = `
<section class="cover">
  <div class="title">Cable Sizing Calculator</div>
  <div class="subtitle">사용 설명서 (User Guide)</div>
  <div>
    <span class="badge">LV · IEC 60364-5-52</span>
    <span class="badge">MV · KEPCO ES 6145 (22.9 kV CNCV-W)</span>
  </div>
  <div class="meta">
    엔진 버전 · @cable-sizing/engine v0.11.0<br/>
    작성예제 10건 (LV 3 / MV TC-01 ~ TC-10) 포함<br/>
    발행일 · 2026-04-28
  </div>
</section>`;

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>Cable Sizing Calculator — 사용 설명서</title>
<style>${css}</style>
</head>
<body>
${cover}
<main>
${body}
</main>
</body>
</html>`;

const outDir = resolve(root, 'docs');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const htmlPath = resolve(outDir, 'user-guide.html');
writeFileSync(htmlPath, html, 'utf8');
console.log('wrote', htmlPath);

const pdfPath = resolve(outDir, 'Cable_Sizing_사용설명서.pdf');
const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const chrome = chromeCandidates.find(p => existsSync(p));
if (!chrome) throw new Error('Chrome/Edge not found');
console.log('using browser:', chrome);

execFileSync(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--no-pdf-header-footer',
  `--print-to-pdf=${pdfPath}`,
  `file:///${htmlPath.replace(/\\/g, '/')}`,
], { stdio: 'inherit' });

console.log('wrote', pdfPath);
