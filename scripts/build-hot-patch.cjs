const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { deflateRawSync } = require('node:zlib');
const { parseArgs } = require('node:util');
const { publicKeyPem, keyId } = require('../electron/hot-update-pubkey.cjs');
const {
  buildCanonicalSignPayload, compareVersions, crc32, isAllowedUpdateUrl, verifyEd25519Payload,
} = require('../electron/hot-update.cjs');

function createZipBuffer(files) {
  if (files.length >= 0xffff) throw new Error('Too many ZIP entries');
  const local = [];
  const central = [];
  let offset = 0;
  let centralSize = 0;
  for (const { name, data, compress = true } of files) {
    const nameBytes = Buffer.from(name, 'utf8');
    if (!nameBytes.length || nameBytes.length > 0xffff) throw new Error('Invalid ZIP filename length');
    const bytes = Buffer.from(data);
    const deflated = compress ? deflateRawSync(bytes) : bytes;
    const method = deflated.length < bytes.length ? 8 : 0;
    const body = method === 8 ? deflated : bytes;

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(33, 12); // 1980-01-01
    header.writeUInt32LE(crc32(bytes), 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    local.push(header, nameBytes, body);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    header.copy(entry, 6, 4, 30);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += header.length + nameBytes.length + body.length;
    centralSize += entry.length + nameBytes.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

const STATIC_OVERLAY_EXCLUDED_DIRS = new Set([
  'assets/aegir-guide',
  'assets/aistudio',
  'assets/avatars',
  'assets/boss-routes',
  'assets/community',
  'assets/fonts',
  'assets/strategies',
]);

function buildHotPatch({
  product, version, minNativeVersion, maxNativeVersion, notes = '', dist = 'dist',
  out = 'work/hot-patches', urlBase = `https://cdn.arknightsprts.ggff.net/releases/v${version}`,
  key = 'work/secrets/hot-update-ed25519.pem', includeStaticDirs = false, allowLocalhost = false,
}) {
  if (!['stronghold', 'telemetry'].includes(product)) throw new Error('Expected --product stronghold or telemetry');
  compareVersions(version, version);
  compareVersions(minNativeVersion, maxNativeVersion ?? minNativeVersion);
  if (maxNativeVersion && compareVersions(maxNativeVersion, minNativeVersion) < 0) throw new Error('Maximum native version precedes minimum');
  const productFile = path.join(dist, 'product.json');
  if (!fs.lstatSync(path.join(dist, 'index.html')).isFile() || !fs.lstatSync(productFile).isFile()
    || JSON.parse(fs.readFileSync(productFile, 'utf8'))?.id !== product) {
    throw new Error('Expected dist/index.html and matching dist/product.json');
  }

  const files = [];
  let totalSize = 0;
  const limit = 30 * 1024 * 1024;
  function addFiles(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      const name = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        if (!includeStaticDirs && STATIC_OVERLAY_EXCLUDED_DIRS.has(name)) continue;
        addFiles(file, `${name}/`);
        continue;
      }
      if (!entry.isFile()) throw new Error(`Unsupported dist entry: ${name}`);
      totalSize += fs.statSync(file).size;
      if (totalSize > limit || files.length >= 500) throw new Error('UI patch exceeds extraction limits');
      files.push({ name, data: fs.readFileSync(file) });
    }
  }
  addFiles(dist);
  const zip = createZipBuffer(files);
  if (zip.length > limit) throw new Error('UI patch exceeds download limit');
  const basename = `PRTS-HotUI-${product}-${version}`;
  const base = new URL(urlBase);
  if (base.search || base.hash || !isAllowedUpdateUrl(base.href, { allowLocalhost })) throw new Error('Invalid --url-base');
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/${basename}.zip`;
  const ui = {
    kind: 'ui', product, version, minNativeVersion,
    ...(maxNativeVersion ? { maxNativeVersion } : {}),
    notes, url: base.href, sha256: crypto.createHash('sha256').update(zip).digest('hex'), size: zip.length,
  };
  const payload = buildCanonicalSignPayload(ui);
  const privateKey = crypto.createPrivateKey(fs.readFileSync(key));
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('Expected an Ed25519 private key');
  ui.signature = crypto.sign(null, Buffer.from(payload, 'utf8'), privateKey).toString('base64');
  if (!verifyEd25519Payload(payload, ui.signature, publicKeyPem)) throw new Error('Signing key does not match packaged public key');
  ui.keyId = keyId;

  const manifest = {
    schemaVersion: 1, product, platform: 'win', channel: 'stable', updatedAt: new Date().toISOString(),
    native: null, ui, data: null,
  };
  const zipPath = path.join(out, `${basename}.zip`);
  const manifestPath = path.join(out, `${basename}.manifest.json`);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(zipPath, zip);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { zipPath, manifestPath, manifest };
}

if (require.main === module) {
  try {
    const { values } = parseArgs({
      options: Object.fromEntries(['product', 'version', 'min-native', 'max-native', 'notes', 'dist', 'out', 'url-base', 'key']
        .map((flag) => [flag, { type: 'string' }])),
    });
    const result = buildHotPatch({
      ...values, minNativeVersion: values['min-native'], maxNativeVersion: values['max-native'], urlBase: values['url-base'],
    });
    console.log(result.zipPath);
    console.log(result.manifestPath);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { createZipBuffer, buildHotPatch };
