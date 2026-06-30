// Electron main process — Formação ER (offline desktop)
const { app, BrowserWindow, ipcMain, shell, dialog, protocol, net, globalShortcut, Menu } = require("electron");
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
    const portableDir = process.env.LOVABLE_PORTABLE_DIR
      ? path.resolve(process.env.LOVABLE_PORTABLE_DIR)
      : path.join(path.dirname(process.execPath), "FormacaoER-data");
    if (!fs.existsSync(portableDir)) fs.mkdirSync(portableDir, { recursive: true });
    return portableDir;
  }
  return app.getPath("userData");
}

let userDataDir;
let mainWindow;
let localDbPromise = null;
let localDbQueue = Promise.resolve();
let localDbDirty = false;
let localDbPersistTimer = null;
let localDbPersistPromise = null;
let localDbTransactionDepth = 0;
let quittingAfterPersist = false;

function writeDiagnosticLog(message, detail) {
  try {
    const dir = userDataDir || resolveUserDataDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const line = `[${new Date().toISOString()}] ${message}${detail ? `\n${detail}` : ""}\n`;
    fs.appendFileSync(path.join(dir, "diagnostico.log"), line, "utf8");
  } catch {
    // best effort only
  }
}

function serialiseError(err) {
  if (err instanceof Error) return `${err.message}${err.stack ? `\n${err.stack}` : ""}`;
  try {
    return typeof err === "string" ? err : JSON.stringify(err, null, 2);
  } catch {
    return String(err);
  }
}

// IMPORTANT: in portable mode, redirect Electron's userData dir BEFORE app
// is ready. That way the renderer's IndexedDB (which PGlite uses to persist
// the database) lives on the pen drive instead of %APPDATA%.
if (isPortableMode()) {
  const portableDir = process.env.LOVABLE_PORTABLE_DIR
    ? path.resolve(process.env.LOVABLE_PORTABLE_DIR)
    : path.join(path.dirname(process.execPath), "FormacaoER-data");
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
  mainWindow = win;

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

  win.webContents.once("did-finish-load", () => {
    // Keep DevTools open in the portable build. If the renderer freezes, the
    // user still has the console available; F12 alone depends on the renderer
    // being responsive enough to deliver input events.
    win.webContents.openDevTools({ mode: "detach" });
  });

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
    writeDiagnosticLog("Renderer terminou", `Motivo: ${details.reason}\nCódigo: ${details.exitCode}`);
    dialog.showErrorBox(
      "A aplicação bloqueou",
      `O processo do interface terminou inesperadamente.\nMotivo: ${details.reason}\nCódigo: ${details.exitCode}\n\nPressiona F12 antes de repetir a ação para veres o erro na consola.`
    );
  });
  win.webContents.on("unresponsive", () => {
    writeDiagnosticLog("Renderer sem resposta", "A interface deixou de responder a eventos.");
    console.warn("[FormacaoER] renderer unresponsive");
    dialog.showMessageBox(win, {
      type: "warning",
      title: "A aplicação deixou de responder",
      message: "A interface ficou sem resposta.",
      detail: `Guardei um registo em:\n${path.join(userDataDir, "diagnostico.log")}\n\nVou tentar abrir as ferramentas de diagnóstico. Se continuar bloqueada, fecha a janela e volta a abrir pelo AbrirFormacaoER.bat.`,
      buttons: ["OK"],
    }).catch(() => {});
    try { win.webContents.openDevTools({ mode: "detach" }); } catch {}
  });

  // Allow about:blank / same-origin popups (used for printing). Open external
  // http(s) links in the system browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === "about:blank" || url.startsWith("formacao-er://")) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 1024,
          height: 800,
          autoHideMenuBar: true,
          webPreferences: { contextIsolation: true, nodeIntegration: false },
        },
      };
    }
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
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, Buffer.from(buffer));
  return { ok: true };
});

ipcMain.handle("docs:read", async (_evt, relPath) => {
  const full = safeDocPath(relPath);
  if (!fs.existsSync(full)) return null;
  return await fs.promises.readFile(full);
});

ipcMain.handle("docs:remove", async (_evt, relPath) => {
  const full = safeDocPath(relPath);
  if (fs.existsSync(full)) await fs.promises.unlink(full);
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
  return await fs.promises.readFile(p);
});
ipcMain.handle("db:write", async (_evt, buffer) => {
  await fs.promises.writeFile(dbPath(), Buffer.from(buffer));
  return { ok: true };
});
ipcMain.handle("db:wasm", async () => {
  for (const dir of rendererDirs()) {
    const assetsDir = path.join(dir, "assets");
    try {
      if (!fs.existsSync(assetsDir)) continue;
      const file = fs.readdirSync(assetsDir).find((f) => f.startsWith("sql-wasm") && f.endsWith(".wasm"));
      if (file) return await fs.promises.readFile(path.join(assetsDir, file));
    } catch {
      // Try the next packaged/dev location.
    }
  }
  return null;
});

// ─── IPC: local PGlite database in the main process ─────────────────────────
// Critical stability rule: do NOT open PGlite directly on the pen-drive folder.
// Some Windows/Electron builds fall back to Emscripten's virtual FS for plain
// paths and crash with opaque `ErrnoError { errno: 28 }` (ENOSPC) during schema
// creation/import. The database now runs in memory and is persisted as one
// compressed snapshot (`pglite-data.tgz`) next to the executable. That avoids the
// fragile NodeFS/IndexedDB paths while still keeping the app fully offline.
function legacyLocalDbDir() {
  return path.join(userDataDir, "pglite-db");
}

function localDbSnapshotPath() {
  return path.join(userDataDir, "pglite-data.tgz");
}

async function fileExists(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readLocalDbSnapshot() {
  const snapshot = localDbSnapshotPath();
  if (!(await fileExists(snapshot))) return null;
  return await fs.promises.readFile(snapshot);
}

async function openFreshMemoryDb(PGlite) {
  return await PGlite.create({ dataDir: "memory://", relaxedDurability: true });
}

async function getMainLocalDb() {
  if (!localDbPromise) {
    localDbPromise = (async () => {
      const { PGlite } = require("@electric-sql/pglite");
      const snapshot = await readLocalDbSnapshot();
      if (!snapshot || snapshot.length === 0) {
        const db = await openFreshMemoryDb(PGlite);
        writeDiagnosticLog("Base local aberta em memória", `Sem snapshot: ${localDbSnapshotPath()}`);
        return db;
      }

      try {
        const blob = new Blob([snapshot], { type: "application/x-gzip" });
        const db = await PGlite.create({ dataDir: "memory://", loadDataDir: blob, relaxedDurability: true });
        writeDiagnosticLog("Base local carregada em memória", `${localDbSnapshotPath()} (${snapshot.length} bytes)`);
        return db;
      } catch (err) {
        const brokenPath = `${localDbSnapshotPath()}.corrompido-${Date.now()}`;
        try { await fs.promises.rename(localDbSnapshotPath(), brokenPath); } catch {}
        writeDiagnosticLog("Snapshot local corrompido; criada base vazia", `${serialiseError(err)}
Snapshot movido para: ${brokenPath}`);
        return await openFreshMemoryDb(PGlite);
      }
    })().catch((err) => {
      localDbPromise = null;
      writeDiagnosticLog("Erro ao abrir base local", serialiseError(err));
      throw err;
    });
  }
  return localDbPromise;
}

function isBeginSql(sql) {
  return /^\s*(begin|start\s+transaction)/i.test(String(sql));
}
function isCommitSql(sql) {
  return /^\s*(commit|end)/i.test(String(sql));
}
function isRollbackSql(sql) {
  return /^\s*rollback/i.test(String(sql));
}
function isMutatingSql(sql) {
  const s = String(sql).replace(/^\s*(?:--[^
]*
\s*)*/g, "").trim().toLowerCase();
  if (!s) return false;
  if (/^(select|show|explain)/.test(s)) return false;
  return /^(insert|update|delete|create|alter|drop|truncate|reindex|vacuum|analyze|comment|grant|revoke|set)/.test(s);
}

async function persistLocalDbNow(reason = "manual") {
  if (!localDbPromise || !localDbDirty) return;
  if (localDbPersistTimer) {
    clearTimeout(localDbPersistTimer);
    localDbPersistTimer = null;
  }
  if (localDbPersistPromise) return localDbPersistPromise;

  localDbPersistPromise = (async () => {
    const start = Date.now();
    const db = await localDbPromise;
    const blob = await db.dumpDataDir("gzip");
    const buffer = Buffer.from(await blob.arrayBuffer());
    const target = localDbSnapshotPath();
    const tmp = `${target}.tmp`;
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(tmp, buffer);
    await fs.promises.rename(tmp, target);
    localDbDirty = false;
    writeDiagnosticLog("Base local gravada", `${reason}: ${buffer.length} bytes em ${Date.now() - start}ms`);
  })().catch((err) => {
    writeDiagnosticLog("Erro ao gravar base local", serialiseError(err));
  }).finally(() => {
    localDbPersistPromise = null;
  });

  return localDbPersistPromise;
}

function markLocalDbDirty(reason) {
  localDbDirty = true;
  if (localDbTransactionDepth > 0) return;
  if (localDbPersistTimer) clearTimeout(localDbPersistTimer);
  localDbPersistTimer = setTimeout(() => {
    localDbPersistTimer = null;
    void persistLocalDbNow(reason);
  }, 900);
}

function queueLocalDb(label, fn) {
  const run = localDbQueue.catch(() => undefined).then(async () => {
    const start = Date.now();
    try {
      return await fn();
    } catch (err) {
      const detail = serialiseError(err);
      writeDiagnosticLog(`Erro na base local: ${label}`, detail);
      throw new Error(detail || `Erro na base local: ${label}`);
    } finally {
      const elapsed = Date.now() - start;
      if (elapsed > 4000) writeDiagnosticLog(`Operação lenta na base local: ${label}`, `${elapsed}ms`);
    }
  });
  localDbQueue = run.then(() => undefined, () => undefined);
  return run;
}

ipcMain.handle("local-db:query", async (_evt, sql, params) => {
  return queueLocalDb("query", async () => {
    const sqlText = String(sql);
    const db = await getMainLocalDb();
    const result = await db.query(sqlText, Array.isArray(params) ? params : []);
    if (isMutatingSql(sqlText)) markLocalDbDirty("query");
    return result;
  });
});

ipcMain.handle("local-db:exec", async (_evt, sql) => {
  return queueLocalDb("exec", async () => {
    const sqlText = String(sql);
    const db = await getMainLocalDb();
    await db.exec(sqlText);

    if (isBeginSql(sqlText)) localDbTransactionDepth++;
    if (isMutatingSql(sqlText)) markLocalDbDirty("exec");
    if (isCommitSql(sqlText) || isRollbackSql(sqlText)) {
      localDbTransactionDepth = Math.max(0, localDbTransactionDepth - 1);
      if (isCommitSql(sqlText)) markLocalDbDirty("commit");
    }
    return { ok: true };
  });
});

ipcMain.handle("local-db:close", async () => {
  return queueLocalDb("close", async () => {
    await persistLocalDbNow("close");
    if (localDbPromise) {
      const db = await localDbPromise;
      await db.close();
    }
    localDbPromise = null;
    return { ok: true };
  });
});

ipcMain.handle("local-db:reset", async () => {
  return queueLocalDb("reset", async () => {
    if (localDbPersistTimer) {
      clearTimeout(localDbPersistTimer);
      localDbPersistTimer = null;
    }
    if (localDbPromise) {
      try { await (await localDbPromise).close(); } catch {}
      localDbPromise = null;
    }
    localDbDirty = false;
    localDbTransactionDepth = 0;
    await fs.promises.rm(localDbSnapshotPath(), { force: true });
    await fs.promises.rm(legacyLocalDbDir(), { recursive: true, force: true });
    writeDiagnosticLog("Base local reiniciada", localDbSnapshotPath());
    return { ok: true };
  });
});

ipcMain.handle("app:userDataDir", async () => userDataDir);

ipcMain.handle("app:backupDb", async (_evt, buffer) => {
  const result = await dialog.showSaveDialog({
    title: "Guardar backup da base de dados",
    defaultPath: `formacao-er-${new Date().toISOString().slice(0, 10)}.pgdata`,
    filters: [{ name: "Backup", extensions: ["pgdata"] }],
  });
  if (result.canceled || !result.filePath) return { ok: false };
  await fs.promises.writeFile(result.filePath, Buffer.from(buffer));
  return { ok: true, path: result.filePath };
});

ipcMain.handle("app:restoreDb", async () => {
  const result = await dialog.showOpenDialog({
    title: "Restaurar backup da base de dados",
    filters: [{ name: "Backup", extensions: ["pgdata"] }],
    properties: ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return await fs.promises.readFile(result.filePaths[0]);
});

ipcMain.handle("file:save", async (_evt, defaultName, buffer, filters) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Guardar ficheiro",
    defaultPath: defaultName || "ficheiro",
    filters: Array.isArray(filters) && filters.length ? filters : [{ name: "Todos os ficheiros", extensions: ["*"] }],
  });
  if (result.canceled || !result.filePath) return { ok: false };
  await fs.promises.writeFile(result.filePath, Buffer.from(buffer));
  return { ok: true, path: result.filePath };
});

ipcMain.handle("print:html", async (_evt, payload) => {
  const title = String(payload?.title || "Impressão");
  const html = String(payload?.html || "");
  const landscape = Boolean(payload?.landscape);
  if (!html.trim()) return { ok: false, error: "Sem conteúdo para imprimir" };

  return await new Promise((resolve) => {
    const printWindow = new BrowserWindow({
      width: landscape ? 1200 : 900,
      height: landscape ? 820 : 1100,
      show: false,
      title,
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      try { printWindow.close(); } catch {}
      resolve(result);
    };
    printWindow.webContents.on("did-fail-load", (_event, _code, desc) => finish({ ok: false, error: desc }));
    printWindow.webContents.once("did-finish-load", () => {
      setTimeout(() => {
        printWindow.webContents.print({ silent: false, printBackground: true, landscape }, (success, failureReason) => {
          finish(success ? { ok: true } : { ok: false, error: failureReason || "Impressão cancelada" });
        });
      }, 250);
    });
    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch((err) => finish({ ok: false, error: err.message }));
  });
});

app.whenReady().then(() => {
  userDataDir = resolveUserDataDir();
  console.log("[FormacaoER] userData:", userDataDir);
  Menu.setApplicationMenu(null);
  globalShortcut.register("F12", () => mainWindow?.webContents.openDevTools({ mode: "detach" }));
  globalShortcut.register("CommandOrControl+Shift+I", () => mainWindow?.webContents.openDevTools({ mode: "detach" }));
  globalShortcut.register("CommandOrControl+Shift+J", () => mainWindow?.webContents.openDevTools({ mode: "detach" }));
  globalShortcut.register("CommandOrControl+R", () => mainWindow?.webContents.reloadIgnoringCache());
  registerRendererProtocol();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async (event) => {
  if (quittingAfterPersist) return;
  if (!localDbPromise || !localDbDirty) return;
  event.preventDefault();
  try { await persistLocalDbNow("before-quit"); } catch {}
  quittingAfterPersist = true;
  app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
