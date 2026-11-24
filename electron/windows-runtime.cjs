// 青逝痕 Tenkinoko 制作
const fs = require('node:fs');
const path = require('node:path');

function windowsWorkerPath(app, product) {
  const workerName = product?.desktop?.workerName || 'PRTS-Worker';
  const runtimeDir = product?.desktop?.workerRuntimeDir || 'work/windows-worker/runtime/PRTS-Worker';
  if (app.isPackaged) {
    const workerExe = path.join(process.resourcesPath, 'worker', `${workerName}.exe`);
    if (fs.existsSync(workerExe)) return workerExe;
    return path.join(process.resourcesPath, 'ocr', `${workerName}.exe`);
  }
  return path.join(app.getAppPath(), ...runtimeDir.split('/'), `${workerName}.exe`);
}

function windowsWorkerLaunch(app, product) {
  const executable = windowsWorkerPath(app, product);
  if (app.isPackaged || fs.existsSync(executable)) {
    return { command: executable, args: [], cwd: path.dirname(executable) };
  }
  const script = path.join(app.getAppPath(), 'electron', 'battle-report-worker.py');
  return { command: 'python', args: [script], cwd: path.dirname(script) };
}

module.exports = { windowsWorkerPath, windowsWorkerLaunch };
