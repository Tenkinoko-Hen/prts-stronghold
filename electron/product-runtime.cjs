const fs = require('node:fs');
const path = require('node:path');

function loadRuntimeProduct(app) {
  const appPath = app.getAppPath();
  if (app.isPackaged) {
    const packagedManifest = path.join(appPath, 'dist', 'product.json');
    if (fs.existsSync(packagedManifest)) {
      return JSON.parse(fs.readFileSync(packagedManifest, 'utf8'));
    }
  }
  const requested = (process.env.PRTS_PRODUCT || '').trim();
  const distManifest = path.join(appPath, 'dist', 'product.json');
  if (!requested && fs.existsSync(distManifest)) {
    return JSON.parse(fs.readFileSync(distManifest, 'utf8'));
  }
  const id = requested || 'stronghold';
  if (id !== 'stronghold' && id !== 'telemetry') {
    throw new Error(`Unsupported PRTS_PRODUCT="${id}". Expected "stronghold" or "telemetry".`);
  }
  return JSON.parse(fs.readFileSync(path.join(appPath, 'products', id, 'product.json'), 'utf8'));
}

function brandingAssetPath(app, product, filename) {
  if (app.isPackaged) {
    return path.join(__dirname, 'branding', filename);
  }
  return path.join(app.getAppPath(), 'products', product.id, 'electron', filename);
}

module.exports = { loadRuntimeProduct, brandingAssetPath };
