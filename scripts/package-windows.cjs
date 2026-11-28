// 青逝痕 Tenkinoko 制作
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Arch, Platform, build } = require('electron-builder');
const nsis = require('app-builder-lib/out/targets/nsis/nsisUtil.js');

function replaceTemplateBlock(template, original, replacement) {
  if (template.split(original).length !== 2) throw new Error('便携模板已变更，请重新核对启动画面和解包流程。');
  return template.replace(original, () => replacement);
}

function patchPortableNsiTemplate(rawTemplate) {
  let template = rawTemplate.replace(/\r\n/g, '\n');
  const stockInit = String.raw`Function .onInit
  !ifndef SPLASH_IMAGE
    SetSilent silent
  !endif

  !insertmacro check64BitAndSetRegView
FunctionEnd

Function .onGUIInit
  InitPluginsDir

  !ifdef SPLASH_IMAGE
    File /oname=$PLUGINSDIR\splash.bmp "SPLASH_IMAGE_VALUE"
    BgImage::SetBg $PLUGINSDIR\splash.bmp
    BgImage::Redraw
  !endif
FunctionEnd`.replace('SPLASH_IMAGE_VALUE', '${SPLASH_IMAGE}');
  template = replaceTemplateBlock(template, stockInit, `!include "prts-startup.nsh"

Function .onInit
  !insertmacro check64BitAndSetRegView
  InitPluginsDir
  StrCpy $prtsSplashProcess 0
  StrCpy $prtsSplashUnpacked 0
  StrCpy $prtsSplashDone 0
  StrCpy $prtsCacheRoot ""
  StrCpy $prtsStageDir ""
  StrCpy $prtsCleanupInstDir "0"
  StrCpy $prtsSawWindow "0"
  StrCpy $prtsRetriedSafe "0"
  IfSilent prts_silent
    Call PrtsShowSplash
  prts_silent:
    SetSilent silent
FunctionEnd`);
  template = replaceTemplateBlock(template, '  !ifdef SPLASH_IMAGE\n    HideWindow\n  !endif\n\n', '');

  const stockUnpack = [
    '  StrCpy $INSTDIR "$PLUGINSDIR\\app"',
    '  !ifdef UNPACK_DIR_NAME',
    '    StrCpy $INSTDIR "$TEMP\\${UNPACK_DIR_NAME}"',
    '  !endif',
    '',
    '  RMDir /r $INSTDIR',
    '  SetOutPath $INSTDIR',
    '',
    '  !ifdef APP_DIR_64',
    '    !ifdef APP_DIR_ARM64',
    '      !ifdef APP_DIR_32',
    '        ${if} ${IsNativeARM64}',
    '          File /r "${APP_DIR_ARM64}\\*.*"',
    '        ${elseif} ${RunningX64}',
    '          File /r "${APP_DIR_64}\\*.*"',
    '        ${else}',
    '          File /r "${APP_DIR_32}\\*.*"',
    '        ${endIf}',
    '      !else',
    '        ${if} ${IsNativeARM64}',
    '          File /r "${APP_DIR_ARM64}\\*.*"',
    '        ${else}',
    '          File /r "${APP_DIR_64}\\*.*"',
    '        {endIf}',
    '      !endif',
    '    !else',
    '      !ifdef APP_DIR_32',
    '        ${if} ${RunningX64}',
    '          File /r "${APP_DIR_64}\\*.*"',
    '        ${else}',
    '          File /r "${APP_DIR_32}\\*.*"',
    '        ${endIf}',
    '      !else',
    '        File /r "${APP_DIR_64}\\*.*"',
    '      !endif',
    '    !endif',
    '  !else',
    '    !ifdef APP_DIR_32',
    '      File /r "${APP_DIR_32}\\*.*"',
    '    !else',
    '      !insertmacro extractEmbeddedAppPackage',
    '    !endif',
    '  !endif',
  ].join('\n');
  template = replaceTemplateBlock(template, stockUnpack, '  !insertmacro PrtsPrepareApp');

  const stockLaunch = [
    '  !ifdef SPLASH_IMAGE',
    '    BgImage::Destroy',
    '  !endif',
    '',
    '\tExecWait "$INSTDIR\\${APP_EXECUTABLE_FILENAME} $R0" $0',
    '  SetErrorLevel $0',
    '',
    '  SetOutPath $EXEDIR',
    '\tRMDir /r $INSTDIR',
  ].join('\n');
  template = replaceTemplateBlock(template, stockLaunch, [
    '  Call PrtsRunApp',
    '',
    '  SetOutPath $EXEDIR',
    '  ${If} $prtsCleanupInstDir == "1"',
    '    RMDir /r $INSTDIR',
    '  ${EndIf}',
  ].join('\n'));
  return template;
}

function compileSplash(root, templates, product) {
  const framework = path.join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319');
  const compiler = path.join(framework, 'csc.exe');
  if (!fs.existsSync(compiler)) throw new Error('缺少 Windows .NET Framework C# 编译器。');
  const metaPath = path.join(templates, 'splash-meta.txt');
  fs.writeFileSync(metaPath, `${product.desktop.splashTitle}\n${product.desktop.splashAccent}\n`, 'utf8');
  execFileSync(compiler, [
    '/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/codepage:65001',
    `/out:${path.join(templates, 'prts-splash.exe')}`,
    '/reference:System.Drawing.dll', '/reference:System.Windows.Forms.dll',
    `/resource:${path.join(root, 'products', product.id, 'electron', 'startup.bmp')},PRTS.Startup`,
    `/resource:${metaPath},PRTS.SplashMeta`,
    path.join(__dirname, 'windows-splash.cs'),
  ], { windowsHide: true, stdio: 'inherit' });
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function packageWindows(arg1, arg2) {
  const isProductFirst = arg1 === 'stronghold' || arg1 === 'telemetry';
  const productId = isProductFirst ? arg1 : 'stronghold';
  const version = isProductFirst ? arg2 : arg1;
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('需要指定打包版本，例如 stronghold 1.4.17 或 telemetry 1.0.0。');

  const root = path.resolve(__dirname, '..');
  const product = JSON.parse(fs.readFileSync(path.join(root, 'products', productId, 'product.json'), 'utf8'));
  const desktop = product.desktop;
  const work = path.join(root, 'work');
  const oldTemplates = nsis.nsisTemplatesDir;
  const template = patchPortableNsiTemplate(fs.readFileSync(path.join(oldTemplates, 'portable.nsi'), 'utf8'));

  fs.mkdirSync(work, { recursive: true });
  // The portable target ignores the custom installer script option. Patch a private copy of its template.
  const templates = fs.mkdtempSync(path.join(work, 'nsis-startup-'));
  try {
    fs.cpSync(oldTemplates, templates, { recursive: true });
    const productKey = product.id === 'telemetry' ? 'telemetry' : 'stronghold';
    const pointerIniName = productKey === 'telemetry' ? 'storage-root-telemetry.ini' : 'storage-root.ini';
    const startupNshHeader = `!define PRTS_PRODUCT_KEY "${productKey}"\r\n!define PRTS_POINTER_INI_NAME "${pointerIniName}"\r\n`;
    const startupNshBody = fs.readFileSync(path.join(__dirname, 'windows-startup.nsh'), 'utf8');
    fs.writeFileSync(path.join(templates, 'prts-startup.nsh'), `${startupNshHeader}${startupNshBody}`, 'utf8');
    fs.writeFileSync(path.join(templates, 'portable.nsi'), template);
    compileSplash(root, templates, product);

    const pkg = require('../package.json');
    const outputDirectory = process.env.PRTS_WINDOWS_OUTPUT || desktop.outputDirTemplate.replace('${version}', version);
    const artifactName = desktop.artifactName.replace('${version}', version).replace('${ext}', 'exe');
    const effectiveConfig = path.join(templates, 'electron-builder.json');
    fs.writeFileSync(effectiveConfig, JSON.stringify({
      appId: desktop.appId,
      productName: desktop.productName,
      asar: true,
      electronDist: 'node_modules/electron/dist',
      directories: { output: outputDirectory },
      extraMetadata: {
        version,
        productName: desktop.productName,
        description: product.windowTitle,
      },
      files: [
        'dist/**/*',
        'electron/*.cjs',
        'package.json',
        '!node_modules/**/*',
        { from: `products/${productId}/electron`, to: 'electron/branding', filter: ['*.ico', '*.bmp'] },
      ],
      extraResources: [
        { from: desktop.workerRuntimeDir, to: 'worker' },
      ],
      win: {
        target: ['portable'],
        icon: `products/${productId}/electron/app.ico`,
        requestedExecutionLevel: 'requireAdministrator',
        signAndEditExecutable: true,
        signExecutable: false,
      },
      portable: {
        artifactName: desktop.artifactName,
        requestExecutionLevel: 'admin',
      },
    }, null, 2));

    const keepLocales = new Set(['zh-CN.pak', 'en-US.pak']);
    nsis.nsisTemplatesDir = templates;
    await build({
      projectDir: root,
      targets: Platform.WINDOWS.createTarget(['portable'], Arch.x64),
      publish: 'never',
      config: {
        ...JSON.parse(fs.readFileSync(effectiveConfig, 'utf8')),
        afterPack: async (context) => {
          // 裁剪 Electron 无用 50+ 语言包，每个版本立省 ~46 MB 运行缓存与安装包体积
          const localesDir = path.join(context.appOutDir, 'locales');
          if (!fs.existsSync(localesDir)) return;
          for (const entry of fs.readdirSync(localesDir)) {
            if (!keepLocales.has(entry)) {
              fs.rmSync(path.join(localesDir, entry), { force: true });
            }
          }
        },
      },
    });

    const outputPath = path.resolve(root, outputDirectory);
    const artifactPath = path.join(outputPath, artifactName);
    if (!fs.existsSync(artifactPath)) throw new Error(`Windows 便携包未生成：${artifactPath}`);
    for (const entry of ['win-unpacked', 'builder-debug.yml', `${pkg.name}-${version}-x64.nsis.7z`]) {
      fs.rmSync(path.join(outputPath, entry), { recursive: true, force: true });
    }
    const hash = sha256File(artifactPath);
    fs.writeFileSync(`${artifactPath}.sha256`, `${hash}  ${artifactName}\n`, 'utf8');
    console.log(`EXE：${artifactPath}`);
    console.log(`大小：${fs.statSync(artifactPath).size} 字节`);
    console.log(`SHA-256：${hash}`);
  } finally {
    nsis.nsisTemplatesDir = oldTemplates;
    fs.rmSync(templates, { recursive: true, force: true });
  }
}

module.exports = { patchPortableNsiTemplate, compileSplash };

if (require.main === module) {
  packageWindows(...process.argv.slice(2)).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
