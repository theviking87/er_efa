// Electron main process — Formação ER (offline desktop)
const { app, BrowserWindow, ipcMain, shell, dialog, protocol, net } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "formacao-er",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

// User data folder. In the packaged app this must live next to the executable
// even if the user opens FormacaoER.exe directly instead of the .bat; otherwise
// Windows stores an empty database in %APPDATA% and the pen-drive version looks
// like it "lost" the import.
function isPortableMode() {
  return process.env.LOVABLE_PORTABLE === "1" || (app.isPackaged && process.env.LOVABLE_PORTABLE !== "0");
}

function resolveUserDataDir() {
  if (isPortableMode()) {
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
if (isPortableMode()) {
  const portableDir = path.join(path.dirname(process.execPath), "FormacaoER-data");
  if (!fs.existsSync(portableDir)) fs.mkdirSync(portableDir, { recursive: true });
  app.setPath("userData", portableDir);
}

function rendererDirs() {
  return [
    // Packaged as an external Electron resource. This avoids Windows/asar
    // local-resource edge cases and is the preferred packaged path.
    path.join(process.resourcesPath, "dist-electron"),
    // Dev / fallback path when running `electron .` from the project root.
    path.join(__dirname, "..", "dist-electron"),
  ];
}

function resolveRendererFile(requestPath = "/index.electron.html") {
  const cleanPath = decodeURIComponent(requestPath.split("?")[0]).replace(/^\/+/, "") || "index.electron.html";
  const relativePath = cleanPath === "index.html" ? "index.electron.html" : cleanPath;

  for (const dir of rendererDirs()) {
    const full = path.resolve(dir, relativePath);
    if (full.startsWith(path.resolve(dir)) && fs.existsSync(full) && fs.statSync(full).isFile()) {
      return full;
    }
  }
  return null;
}

function registerRendererProtocol() {
  protocol.handle("formacao-er", (request) => {
    const url = new URL(request.url);
    const file = resolveRendererFile(url.pathname);
    if (!file) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
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

  const target = resolveRendererFile("/index.electron.html");
  if (!target) {
    dialog.showErrorBox(
      "Erro a carregar a aplicação",
      `Não encontrei o ficheiro inicial da aplicação.\n\nProcurei em:\n${rendererDirs().join("\n")}`
    );
    return;
  }
  win.loadURL("formacao-er://app/index.electron.html").catch((err) => {
    dialog.showErrorBox(
      "Erro a carregar a aplicação",
      `Não consegui carregar a aplicação offline.\n\nFicheiro: ${target}\n\n${err.message}`
    );
  });

  if (process.env.LOVABLE_DEVTOOLS === "1") {
    win.webContents.openDevTools({ mode: "detach" });
  }

  // Allow F12 / Ctrl+Shift+I to open DevTools so users can diagnose issues.
  win.webContents.on("before-input-event", (event, input) => {
    const isF12 = input.key === "F12";
    const isCtrlShiftI = (input.control || input.meta) && input.shift && input.key.toLowerCase() === "i";
    const isCtrlShiftJ = (input.control || input.meta) && input.shift && input.key.toLowerCase() === "j";
    const isCtrlR = (input.control || input.meta) && !input.shift && input.key.toLowerCase() === "r";
    if (isF12 || isCtrlShiftI || isCtrlShiftJ) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    } else if (isCtrlR) {
      win.webContents.reload();
      event.preventDefault();
    }
  });

  // Surface unhandled renderer crashes instead of showing a silent white window.
  win.webContents.on("render-process-gone", (_e, details) => {
    dialog.showErrorBox(
      "A aplicação bloqueou",
      `O processo do interface terminou inesperadamente.\nMotivo: ${details.reason}\nCódigo: ${details.exitCode}\n\nPressiona F12 antes de repetir a ação para veres o erro na consola.`
    );
  });
  win.webContents.on("unresponsive", () => {
    console.warn("[FormacaoER] renderer unresponsive");
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
  registerRendererProtocol();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
