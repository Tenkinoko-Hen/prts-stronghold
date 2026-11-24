// 青逝痕 Tenkinoko 制作
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import {defineConfig, type Plugin} from 'vite';

interface ProductManifest {
  id: 'stronghold' | 'telemetry';
  mode: 'full' | 'telemetry';
  name: string;
  shortName: string;
  codename: string;
  windowTitle: string;
  startupHeading: string;
  description: string;
  faviconFile: string;
  reportBrand: {
    name: string;
    title: string;
    footer: string;
    exportPrefix: string;
    mobileAlbum: string;
    mobileHeaderTitle: string;
    diagnosticsTitle: string;
  };
  desktop: {
    appId: string;
    productName: string;
    artifactName: string;
    outputDirTemplate: string;
    useIsolatedUserData: boolean;
    useTray: boolean;
    defaultAlwaysOnTop: boolean;
    width: number;
    height: number;
    minWidth: number;
    minHeight: number;
    workerKind: 'full' | 'report-only';
    workerName: string;
    workerRuntimeDir: string;
    splashTitle: string;
    splashAccent: string;
  };
  publicAssetDirs: {
    desktop: string[];
    android: string[];
  };
}

const ROOT_DIR = import.meta.dirname;

function loadProduct(rawId: string | undefined): ProductManifest {
  const id = (rawId || 'stronghold').trim();
  if (id !== 'stronghold' && id !== 'telemetry') {
    throw new Error(`Unsupported PRTS_PRODUCT="${id}". Expected "stronghold" or "telemetry".`);
  }
  const file = path.resolve(ROOT_DIR, 'products', id, 'product.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as ProductManifest;
}

function productFlavorPlugin(product: ProductManifest, mode: string): Plugin {
  const iconSource = path.resolve(ROOT_DIR, 'products', product.id, 'public', product.faviconFile);
  let outDir = path.resolve(ROOT_DIR, 'dist');

  return {
    name: 'prts-product-flavor',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    transformIndexHtml(html) {
      return html
        .replaceAll('__PRODUCT_TITLE__', product.windowTitle)
        .replaceAll('__PRODUCT_DESCRIPTION__', product.description)
        .replaceAll('__PRODUCT_STARTUP_HEADING__', product.startupHeading)
        .replaceAll('__PRODUCT_FAVICON__', product.faviconFile);
    },
    configureServer(server) {
      const route = `/${product.faviconFile}`;
      server.middlewares.use((req, res, next) => {
        const cleanUrl = (req.url || '').split('?')[0];
        if (cleanUrl === route && fs.existsSync(iconSource)) {
          res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
          fs.createReadStream(iconSource).pipe(res);
          return;
        }
        next();
      });
    },
    writeBundle() {
      if (fs.existsSync(iconSource)) {
        fs.copyFileSync(iconSource, path.join(outDir, product.faviconFile));
      }
      // Write a slim runtime manifest for packaged Electron main process.
      fs.writeFileSync(
        path.join(outDir, 'product.json'),
        JSON.stringify(
          {
            id: product.id,
            mode: product.mode,
            name: product.name,
            shortName: product.shortName,
            codename: product.codename,
            windowTitle: product.windowTitle,
            reportBrand: product.reportBrand,
            desktop: product.desktop,
          },
          null,
          2,
        ),
        'utf8',
      );
      // Strip guide assets that are unused in pure telemetry builds.
      const target = mode === 'android' ? 'android' : 'desktop';
      const allowedAssets = new Set(product.publicAssetDirs[target]);
      const assetsDir = path.join(outDir, 'assets');
      if (fs.existsSync(assetsDir)) {
        for (const entry of fs.readdirSync(assetsDir, {withFileTypes: true})) {
          if (entry.isDirectory() && !allowedAssets.has(entry.name)) {
            fs.rmSync(path.join(assetsDir, entry.name), {recursive: true, force: true});
          }
        }
      }
    },
  };
}

export default defineConfig(({mode}) => {
  const product = loadProduct(process.env.PRTS_PRODUCT);
  const brand = {
    id: product.id,
    mode: product.mode,
    name: product.name,
    shortName: product.shortName,
    codename: product.codename,
    windowTitle: product.windowTitle,
    faviconFile: product.faviconFile,
    defaultAlwaysOnTop: product.desktop.defaultAlwaysOnTop,
    reportBrand: product.reportBrand,
  };
  return {
    base: './',
    plugins: [react(), tailwindcss(), productFlavorPlugin(product, mode)],
    define: {
      __PRODUCT_MODE__: JSON.stringify(product.mode),
      __PRODUCT_BRAND__: JSON.stringify(brand),
    },
    resolve: {
      alias: {
        '@': path.resolve(ROOT_DIR, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
