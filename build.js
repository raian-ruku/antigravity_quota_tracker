const esbuild = require('esbuild');
const isWatch = process.argv.includes('--watch');

const ctx = esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: !isWatch,
});

ctx.then(c => {
  if (isWatch) {
    console.log('[esbuild] watching...');
    return c.watch();
  }
  return c.rebuild().then(() => {
    console.log('[esbuild] build complete');
    c.dispose();
  });
}).catch(() => process.exit(1));
