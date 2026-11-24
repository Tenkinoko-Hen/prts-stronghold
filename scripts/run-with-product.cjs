// 青逝痕 Tenkinoko 制作
const { spawnSync } = require('node:child_process');

const [product, command, ...args] = process.argv.slice(2);
if ((product !== 'stronghold' && product !== 'telemetry') || !command) {
  console.error('Usage: node scripts/run-with-product.cjs <stronghold|telemetry> <command> [...args]');
  process.exit(1);
}

const result = spawnSync(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, PRTS_PRODUCT: product },
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
