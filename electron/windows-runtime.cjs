const path = require('node:path');

function windowsWorkerPath(app) {
  const directory = app.isPackaged
    ? path.join(process.resourcesPath, 'ocr')
    : path.join(app.getAppPath(), 'work', 'windows-ocr', 'runtime', 'PRTS-OCR');
  return path.join(directory, 'PRTS-OCR.exe');
}

module.exports = { windowsWorkerPath };
