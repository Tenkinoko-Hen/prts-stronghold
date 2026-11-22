const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Arch, Platform, build } = require('electron-builder');
const nsis = require('app-builder-lib/out/targets/nsis/nsisUtil.js');

function replaceTemplateBlock(template, original, replacement) {
  if (template.split(original).length !== 2) throw new Error('便携模板已变更，请重新核对启动画面和解包流程。');
  return template.replace(original, () => replacement);
}

function compileSplash(root, templates) {
  const framework = path.join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319');
  const compiler = path.join(framework, 'csc.exe');
  if (!fs.existsSync(compiler)) throw new Error('缺少 Windows .NET Framework C# 编译器。');
  execFileSync(compiler, [
    '/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/codepage:65001',
    `/out:${path.join(templates, 'prts-splash.exe')}`,
    '/reference:System.Drawing.dll', '/reference:System.Windows.Forms.dll',
    `/resource:${path.join(root, 'electron', 'branding', 'startup.bmp')},PRTS.Startup`,
    path.join(__dirname, 'windows-splash.cs'),
  ], { windowsHide: true, stdio: 'inherit' });
}

async function packageWindows(version, label, runtime) {
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('需要指定打包版本，例如 1.4.17。');
  if (label) throw new Error('单一最新包输出不接受打包标签。');
  const root = path.resolve(__dirname, '..');
  const work = path.join(root, 'work');
  const oldTemplates = nsis.nsisTemplatesDir;
  let template = fs.readFileSync(path.join(oldTemplates, 'portable.nsi'), 'utf8').replace(/\r\n/g, '\n');
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
  IfSilent prts_silent
    Call PrtsShowSplash
  prts_silent:
    SetSilent silent
FunctionEnd`);
  template = replaceTemplateBlock(template, '  !ifdef SPLASH_IMAGE\n    HideWindow\n  !endif\n\n', '');
  const stockLaunch = [
    '  !ifdef SPLASH_IMAGE',
    '    BgImage::Destroy',
    '  !endif',
    '',
    '\tExecWait "$INSTDIR\\${APP_EXECUTABLE_FILENAME} $R0" $0',
    '  SetErrorLevel $0',
  ].join('\n');
  template = replaceTemplateBlock(template, stockLaunch, '  Call PrtsRunApp');

  fs.mkdirSync(work, { recursive: true });
  // The portable target ignores the custom installer script option. Patch a private copy of its template.
  const templates = fs.mkdtempSync(path.join(work, 'nsis-startup-'));
  try {
  fs.cpSync(oldTemplates, templates, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'windows-startup.nsh'), path.join(templates, 'prts-startup.nsh'));
  fs.writeFileSync(path.join(templates, 'portable.nsi'), template);
  compileSplash(root, templates);
  const baseConfig = require('../package.json').build;
  // Keep one stable output path and artifact name so each package replaces the previous one.
  const outputDirectory = process.env.PRTS_WINDOWS_OUTPUT || 'work/windows-latest';
  const effectiveConfig = path.join(templates, 'electron-builder.json');
  fs.writeFileSync(effectiveConfig, JSON.stringify({
    ...baseConfig,
    extraMetadata: { version },
    directories: { ...baseConfig.directories, output: outputDirectory },
    ...(runtime && { extraResources: [{ from: path.resolve(runtime), to: 'ocr' }] }),
    win: { ...baseConfig.win, icon: 'electron/branding/app.ico', signAndEditExecutable: true, signExecutable: false },
    portable: { ...baseConfig.portable, artifactName: 'PRTS-Stronghold-Windows-x64.exe' },
  }, null, 2));
  nsis.nsisTemplatesDir = templates;
    await build({
      projectDir: root,
      targets: Platform.WINDOWS.createTarget(['portable'], Arch.x64),
      publish: 'never',
      config: effectiveConfig,
    });
    const outputPath = path.resolve(root, outputDirectory);
    const artifactPath = path.join(outputPath, 'PRTS-Stronghold-Windows-x64.exe');
    if (!fs.existsSync(artifactPath)) throw new Error('Windows 便携包未生成。');
    for (const entry of ['win-unpacked', 'builder-debug.yml', `prts-stronghold-${version}-x64.nsis.7z`]) {
      fs.rmSync(path.join(outputPath, entry), { recursive: true, force: true });
    }
  } finally {
    nsis.nsisTemplatesDir = oldTemplates;
    fs.rmSync(templates, { recursive: true, force: true });
  }
}

packageWindows(...process.argv.slice(2)).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
