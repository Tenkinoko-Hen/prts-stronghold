const fs = require('node:fs');
const path = require('node:path');
const { Arch, Platform, build } = require('electron-builder');
const nsis = require('app-builder-lib/out/targets/nsis/nsisUtil.js');

async function packageWindows(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('需要指定打包版本，例如 1.4.11。');
  const root = path.resolve(__dirname, '..');
  const work = path.join(root, 'work');
  const oldTemplates = nsis.nsisTemplatesDir;
  const template = fs.readFileSync(path.join(oldTemplates, 'portable.nsi'), 'utf8').replace(/\r\n/g, '\n');
  const launch = [
    '  !ifdef SPLASH_IMAGE',
    '    BgImage::Destroy',
    '  !endif',
    '',
    '\tExecWait "$INSTDIR\\${APP_EXECUTABLE_FILENAME} $R0" $0',
    '  SetErrorLevel $0',
  ].join('\n');
  if (template.split(launch).length !== 2) throw new Error('Electron Builder 的便携模板已变更，请核对启动画面交接。');

  fs.mkdirSync(work, { recursive: true });
  // 便携目标不读取自定义 NSIS 脚本。只复制、修改本次构建使用的模板。
  const templates = fs.mkdtempSync(path.join(work, 'nsis-startup-'));
  fs.cpSync(oldTemplates, templates, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'windows-startup.nsh'), path.join(templates, 'prts-startup.nsh'));
  fs.writeFileSync(path.join(templates, 'portable.nsi'), template.replace(launch, () => [
    '  !ifdef SPLASH_IMAGE',
    '    !include "prts-startup.nsh"',
    '  !else',
    launch.split('\n').slice(-2).join('\n'),
    '  !endif',
  ].join('\n')));
  nsis.nsisTemplatesDir = templates;
  try {
    await build({
      projectDir: root,
      targets: Platform.WINDOWS.createTarget(['portable'], Arch.x64),
      publish: 'never',
      config: {
        extraMetadata: { version },
        directories: { output: `work/windows-${version}` },
        win: { icon: 'electron/branding/app.ico', signAndEditExecutable: true, signExecutable: false },
        portable: { splashImage: 'electron/branding/startup.bmp' },
      },
    });
  } finally {
    nsis.nsisTemplatesDir = oldTemplates;
  }
}

packageWindows(process.argv[2]).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
