// Electron main process — Formação ER (offline desktop)
const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

// User data folder. When LOVABLE_PORTABLE=1 (set by the .bat/.command launcher),
// data lives next to the executable so the whole thing runs from a pen drive.
function resolveUserDataDir() {
  if (process.env.LOVABLE_PORTABLE === "1") {
    const portableDir = path.join(path.dirname(process.execPath), "FormacaoER-data");
    if (!fs.existsSync(portableDir)) fs.mkdirSync(portableDir, { recursive: true });
    return portableDir;
  }
  return app.getPath("userData");
}

let userDataDir;

// IMPORTANT: in portable mode, redirect Electron's userData dir BEFORE app
// is ready. That way the renderer's IndexedDB (which PGlite uses to persist
// the database) lives on the pen drive instead of %APPDATA%.
if (process.env.LOVABLE_PORTABLE === "1") {
  const portableDir = path.join(path.dirname(process.execPath), "FormacaoER-data");
  if (!fs.existsSync(portableDir)) fs.mkdirSync(portableDir, { recursive: true });
  app.setPath("userData", portableDir);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Formação ER",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const candidateFiles = [
    // Packaged as normal app files, inside app.asar.
    path.join(__dirname, "..", "dist-electron", "index.electron.html"),
    path.join(__dirname, "..", "dist-electron", "index.html"),
    // Packaged as an external Electron resource. This is the most reliable
    // path on Windows because it avoids asar path edge-cases entirely.
    path.join(process.resourcesPath, "dist-electron", "index.electron.html"),
    path.join(process.resourcesPath, "dist-electron", "index.html"),
  ];
  const target = candidateFiles.find((file) => fs.existsSync(file));
  if (!target) {
    dialog.showErrorBox(
      "Erro a carregar a aplicação",
      `Não encontrei o ficheiro inicial da aplicação.\n\nProcurei em:\n${candidateFiles.join("\n")}`
    );
    return;
  }
  win.loadFile(target).catch((err) => {
    dialog.showErrorBox(
      "Erro a carregar a aplicação",
      `Não consegui carregar ${target}\n\n${err.message}`
    );
  });

  // Always open DevTools so we can see the real error if the UI fails to load.
  // Press F12 to toggle, Ctrl+Shift+I as well.
  if (process.env.LOVABLE_DEVTOOLS !== "0") {
    win.webContents.openDevTools({ mode: "detach" });
  }

  // Open external links in the system browser instead of a new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// ─── IPC: file system for documents ──────────────────────────────────────────
// All paths are resolved RELATIVE to userDataDir/docs to avoid path traversal.
function safeDocPath(relPath) {
  const baseDir = path.join(userDataDir, "docs");
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
  const resolved = path.resolve(baseDir, relPath);
  if (!resolved.startsWith(baseDir)) throw new Error("Caminho inválido");
  return resolved;
}

ipcMain.handle("docs:write", async (_evt, relPath, buffer) => {
  const full = safeDocPath(relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Buffer.from(buffer));
  return { ok: true };
});

ipcMain.handle("docs:read", async (_evt, relPath) => {
  const full = safeDocPath(relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full);
});

ipcMain.handle("docs:remove", async (_evt, relPath) => {
  const full = safeDocPath(relPath);
  if (fs.existsSync(full)) fs.unlinkSync(full);
  return { ok: true };
});

ipcMain.handle("docs:list", async (_evt, relDir) => {
  const full = safeDocPath(relDir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).map((name) => ({
    name,
    size: fs.statSync(path.join(full, name)).size,
  }));
});

ipcMain.handle("docs:openFolder", async () => {
  const baseDir = path.join(userDataDir, "docs");
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
  shell.openPath(baseDir);
});

// ─── IPC: database file (silent read/write of database.db on disk) ─────────
function dbPath() {
  return path.join(userDataDir, "database.db");
}
ipcMain.handle("db:read", async () => {
  const p = dbPath();
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p);
});
ipcMain.handle("db:write", async (_evt, buffer) => {
  fs.writeFileSync(dbPath(), Buffer.from(buffer));
  return { ok: true };
});
ipcMain.handle("db:wasm", async () => {
  const assetsDir = path.join(__dirname, "..", "offline", "dist", "assets");
  try {
    const file = fs.readdirSync(assetsDir).find((f) => f.startsWith("sql-wasm") && f.endsWith(".wasm"));
    if (!file) return null;
    return fs.readFileSync(path.join(assetsDir, file));
  } catch {
    return null;
  }
});

ipcMain.handle("app:userDataDir", async () => userDataDir);

ipcMain.handle("app:backupDb", async (_evt, buffer) => {
  const result = await dialog.showSaveDialog({
    title: "Guardar backup da base de dados",
    defaultPath: `formacao-er-${new Date().toISOString().slice(0, 10)}.pgdata`,
    filters: [{ name: "Backup", extensions: ["pgdata"] }],
  });
  if (result.canceled || !result.filePath) return { ok: false };
  fs.writeFileSync(result.filePath, Buffer.from(buffer));
  return { ok: true, path: result.filePath };
});

ipcMain.handle("app:restoreDb", async () => {
  const result = await dialog.showOpenDialog({
    title: "Restaurar backup da base de dados",
    filters: [{ name: "Backup", extensions: ["pgdata"] }],
    properties: ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return fs.readFileSync(result.filePaths[0]);
});

app.whenReady().then(() => {
  userDataDir = resolveUserDataDir();
  console.log("[FormacaoER] userData:", userDataDir);
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
