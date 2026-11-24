const fs = require('node:fs');
const path = require('node:path');

function windowsWorkerPath(app, product) {
  const workerName = product?.desktop?.workerName || 'PRTS-OCR';
  const runtimeDir = product?.desktop?.workerRuntimeDir || 'work/windows-ocr/runtime/PRTS-OCR';
  if (app.isPackaged) {
    const workerExe = path.join(process.resourcesPath, 'worker', `${workerName}.exe`);
    if (fs.existsSync(workerExe)) return workerExe;
    return path.join(process.resourcesPath, 'ocr', `${workerName}.exe`);
  }
  return path.join(app.getAppPath(), ...runtimeDir.split('/'), `${workerName}.exe`);
}

module.exports = { windowsWorkerPath };
