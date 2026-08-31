/* Bundles the game into single self-contained HTML files.
   dist/neon-pong.html  — standalone page (open straight from the filesystem)
   dist/artifact.html   — same page as a body fragment, for hosts that supply
                          their own <!doctype>/<head>/<body> shell.
   Run: npm run build */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(resolve(root, f), 'utf8');

const html = read('index.html');
const css = read('css/style.css');
const js = ['js/audio.js', 'js/game.js', 'js/main.js'].map(read).join('\n');

// Body markup, minus the tags a host shell provides.
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script src="[^"]*"><\/script>\s*/g, '')
  .trim();

// The bundle has no separate files to fetch, so drop the offline plumbing.
const bundledJs = js.replace(
  /if \('serviceWorker' in navigator[\s\S]*?\n  \}\n/,
  '// (service worker omitted: the bundle is already a single file)\n'
);

const fragment = `<title>Neon Pong</title>
<style>
${css}
</style>

${body}

<script>
${bundledJs}
</script>
`;

const standalone = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#070b16">
${fragment.slice(0, fragment.indexOf('</style>') + 8)}
</head>
<body>
${fragment.slice(fragment.indexOf('</style>') + 8).trim()}
</body>
</html>
`;

mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist/neon-pong.html'), standalone);
writeFileSync(resolve(root, 'dist/artifact.html'), fragment);
console.log('dist/neon-pong.html', (standalone.length / 1024).toFixed(1) + ' KB');
console.log('dist/artifact.html ', (fragment.length / 1024).toFixed(1) + ' KB');
