// Electron preload — expose a narrow, typed bridge to the renderer.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,

  // Documents (formador-documentos, formando-pra → local FS)
  docs: {
    write: (relPath, arrayBuffer) => ipcRenderer.invoke("docs:write", relPath, arrayBuffer),
    read: (relPath) => ipcRenderer.invoke("docs:read", relPath),
    remove: (relPath) => ipcRenderer.invoke("docs:remove", relPath),
    list: (relDir) => ipcRenderer.invoke("docs:list", relDir),
    openFolder: () => ipcRenderer.invoke("docs:openFolder"),
  },

  // App-level helpers
  app: {
    userDataDir: () => ipcRenderer.invoke("app:userDataDir"),
    backupDb: (arrayBuffer) => ipcRenderer.invoke("app:backupDb", arrayBuffer),
    restoreDb: () => ipcRenderer.invoke("app:restoreDb"),
  },

  files: {
    save: (defaultName, arrayBuffer, filters) => ipcRenderer.invoke("file:save", defaultName, arrayBuffer, filters),
  },

  print: {
    html: (payload) => ipcRenderer.invoke("print:html", payload),
  },

  // Local PostgreSQL engine runs in Electron's main process, not in the UI.
  // This avoids renderer/IndexedDB worker crashes on portable Windows builds.
  localDb: {
    query: (sql, params) => ipcRenderer.invoke("local-db:query", sql, params),
    exec: (sql) => ipcRenderer.invoke("local-db:exec", sql),
    close: () => ipcRenderer.invoke("local-db:close"),
    reset: () => ipcRenderer.invoke("local-db:reset"),
  },

  // Database file (silent)
  db: {
    read: () => ipcRenderer.invoke("db:read"),
    write: (arrayBuffer) => ipcRenderer.invoke("db:write", arrayBuffer),
    wasm: () => ipcRenderer.invoke("db:wasm"),
  },
});
