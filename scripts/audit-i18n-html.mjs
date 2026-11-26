#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const files = fs.readdirSync(root).filter((f) => f.endsWith('.html'));

const missing = [];
for (const f of files) {
  const html = fs.readFileSync(path.join(root, f), 'utf8');
  if (!html.includes('</body>')) {
    missing.push({ file: f, reason: 'no </body>' });
    continue;
  }
  const noUi = !html.includes('havkar-ui-i18n21.js');
  const noCore = !html.includes('havkar-i18n.js');
  if (noUi || noCore) {
    missing.push({
      file: f,
      missing_ui21: noUi,
      missing_core: noCore,
    });
  }
}

if (!missing.length) {
  console.log('All HTML files with </body> include havkar-ui-i18n21.js and havkar-i18n.js.');
} else {
  console.log('Still unwired:');
  for (const m of missing) console.log(JSON.stringify(m));
  process.exitCode = 1;
}