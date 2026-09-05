const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  printReceipt: (data, printerName) => ipcRenderer.send('print-receipt', data, printerName),
  listPrinters: () => ipcRenderer.invoke('list-printers'),
  onPrintResult: (callback) => ipcRenderer.on('print-receipt-result', (event, result) => callback(result)),
  getAppVersion: () => ipcRenderer.invoke('get-app-version')
});
window.__preloadLoaded = true;
console.log('Preload script loaded');
