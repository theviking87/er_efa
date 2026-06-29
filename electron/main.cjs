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

  const indexHtml = path.join(__dirname, "..", "offline", "dist", "index.html");
  win.loadFile(indexHtml).catch((err) => {
    dialog.showErrorBox(
      "Erro a carregar a aplicação",
      `Não consegui carregar ${indexHtml}\n\n${err.message}`
    );
  });

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
