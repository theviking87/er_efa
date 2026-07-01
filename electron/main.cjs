// Electron main process — Formação ER (offline desktop)
const { app, BrowserWindow, ipcMain, shell, dialog, protocol, net, globalShortcut, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const APP_BUILD_VERSION = "FormacaoER-portatil-v9-freeze-fixes-2026-07-01";

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
      detail: `Guardei um registo em:\n${path.join(userDataDir, "diagnostico.log")}\n\nSe continuar bloqueada, fecha a janela e volta a abrir pelo AbrirFormacaoER.bat.`,
      buttons: ["OK"],
    }).catch(() => {});
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
  return /^\s*(begin|start\s+transaction)\b/i.test(String(sql));
}
function isCommitSql(sql) {
  return /^\s*(commit|end)\b/i.test(String(sql));
}
function isRollbackSql(sql) {
  return /^\s*rollback\b/i.test(String(sql));
}
function isMutatingSql(sql) {
  const s = String(sql).replace(/^\s*(?:--[^\n]*\n\s*)*/g, "").trim().toLowerCase();
  if (!s) return false;
  if (/^(select|show|explain)\b/.test(s)) return false;
  return /^(insert|update|delete|create|alter|drop|truncate|reindex|vacuum|analyze|comment|grant|revoke|set)\b/.test(s);
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
    const persistRun = localDbQueue.catch(() => undefined).then(() => persistLocalDbNow(reason));
    localDbQueue = persistRun.then(() => undefined, () => undefined);
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

function reportSanitize(s) {
  return String(s || "").replace(/[\\/:*?"<>|]/g, "_").trim();
}

function reportDate(s) {
  if (!s) return "";
  const [y, m, d] = String(s).slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : String(s);
}

function time5(v) {
  return v ? String(v).slice(0, 5) : "";
}

const TIPOLOGIA_LABEL_NATIVE = {
  efa: "EFA",
  modular: "Formação Modular",
  aprendizagem: "Aprendizagem",
  outra: "Outra",
};
const ESTADO_CURSO_LABEL_NATIVE = {
  planeado: "Planeado",
  em_curso: "Em curso",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

async function nativeReportQuery(sql, params = []) {
  const db = await getMainLocalDb();
  const res = await db.query(sql, params);
  return res.rows || [];
}

async function saveNativeReportBuffer(defaultName, buffer, filters) {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Guardar relatório",
    defaultPath: defaultName,
    filters,
  });
  if (result.canceled || !result.filePath) return { ok: false };
  await fs.promises.writeFile(result.filePath, Buffer.from(buffer));
  return { ok: true, path: result.filePath };
}

async function buildExcelWorkbook(name, params) {
  const XLSX = require("xlsx");
  const wb = XLSX.utils.book_new();
  let filename = "Relatorio.xlsx";

  if (name === "relatorio-formadores") {
    const { inicio, fim } = params || {};
    const rowsDb = await nativeReportQuery(`
      SELECT s.data, s.horas, f.nome AS formador_nome, f.nif AS formador_nif,
             c.codigo AS curso_codigo, c.nome AS curso_nome, u.codigo AS ufcd_codigo, u.designacao AS ufcd_designacao
        FROM sessoes s
        LEFT JOIN formadores f ON f.id = s.formador_id
        LEFT JOIN cursos c ON c.id = s.curso_id
        LEFT JOIN curso_ufcds cu ON cu.id = s.curso_ufcd_id
        LEFT JOIN ufcds u ON u.id = cu.ufcd_id
       WHERE s.data >= $1 AND s.data <= $2
       ORDER BY s.data ASC
    `, [inicio, fim]);
    const detalhe = rowsDb.map((s) => ({
      Data: s.data,
      Horas: Number(s.horas || 0),
      Formador: s.formador_nome || "",
      NIF: s.formador_nif || "",
      Curso: s.curso_codigo || "",
      "Nome Curso": s.curso_nome || "",
      UFCD: s.ufcd_codigo || "",
      "Designação UFCD": s.ufcd_designacao || "",
    }));
    const agg = new Map();
    detalhe.forEach((r) => {
      const k = `${r.Formador}|${r.NIF}`;
      const cur = agg.get(k) || { Formador: r.Formador, NIF: r.NIF, "Total Sessões": 0, "Total Horas": 0 };
      cur["Total Sessões"] += 1;
      cur["Total Horas"] += Number(r.Horas || 0);
      agg.set(k, cur);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Array.from(agg.values())), "Resumo por formador");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalhe), "Sessões");
    filename = `Relatorio_Formadores_${inicio}_${fim}.xlsx`;
  } else if (name === "relatorio-cursos") {
    const rowsDb = await nativeReportQuery(`
      SELECT c.id, c.codigo, c.nome, c.tipologia, c.estado, c.data_inicio, c.data_fim,
             COUNT(cu.id) AS n_ufcds,
             SUM(CASE WHEN cu.concluida THEN 1 ELSE 0 END) AS concluidas,
             SUM(COALESCE(cu.horas_totais, 0)) AS previstas,
             COALESCE(h.realizadas, 0) AS realizadas
        FROM cursos c
        LEFT JOIN curso_ufcds cu ON cu.curso_id = c.id
        LEFT JOIN (SELECT curso_id, SUM(COALESCE(horas, 0)) AS realizadas FROM sessoes GROUP BY curso_id) h ON h.curso_id = c.id
       GROUP BY c.id, c.codigo, c.nome, c.tipologia, c.estado, c.data_inicio, c.data_fim, h.realizadas
       ORDER BY c.codigo ASC
    `);
    const rows = rowsDb.map((c) => {
      const total = Number(c.previstas || 0);
      const realizadas = Number(c.realizadas || 0);
      return {
        Código: c.codigo || "",
        Curso: c.nome || "",
        Tipologia: TIPOLOGIA_LABEL_NATIVE[c.tipologia] || c.tipologia || "",
        Estado: ESTADO_CURSO_LABEL_NATIVE[c.estado] || c.estado || "",
        "Data Início": c.data_inicio || "",
        "Data Fim": c.data_fim || "",
        "UFCD Atribuídas": Number(c.n_ufcds || 0),
        "UFCD Concluídas": Number(c.concluidas || 0),
        "Horas Previstas": total,
        "Horas Realizadas": realizadas,
        "Horas em Falta": Math.max(0, total - realizadas),
        "Execução %": total > 0 ? Math.round((realizadas / total) * 1000) / 10 : 0,
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Execução de cursos");
    filename = `Relatorio_Cursos_${new Date().toISOString().slice(0, 10)}.xlsx`;
  } else if (name === "relatorio-faltas") {
    const { inicio, fim } = params || {};
    const rowsDb = await nativeReportQuery(`
      SELECT ff.data, ff.horas, ff.tipo, ff.observacoes,
             c.codigo AS curso_codigo, c.nome AS curso_nome, fo.nome AS formando_nome, fo.nif AS formando_nif,
             u.codigo AS ufcd_codigo, s.hora_inicio, s.hora_fim, cf.id AS cf_id, cf.curso_id
        FROM formando_faltas ff
        LEFT JOIN curso_formandos cf ON cf.id = ff.curso_formando_id
        LEFT JOIN cursos c ON c.id = cf.curso_id
        LEFT JOIN formandos fo ON fo.id = cf.formando_id
        LEFT JOIN sessoes s ON s.id = ff.sessao_id
        LEFT JOIN curso_ufcds cu ON cu.id = s.curso_ufcd_id
        LEFT JOIN ufcds u ON u.id = cu.ufcd_id
       WHERE ff.data >= $1 AND ff.data <= $2
       ORDER BY ff.data ASC
    `, [inicio, fim]);
    const detalhe = rowsDb.map((f) => ({
      Data: f.data,
      Curso: `${f.curso_codigo || ""} — ${f.curso_nome || ""}`,
      Formando: f.formando_nome || "",
      NIF: f.formando_nif || "",
      UFCD: f.ufcd_codigo || "",
      "Hora Início": time5(f.hora_inicio),
      "Hora Fim": time5(f.hora_fim),
      Horas: Number(f.horas || 0),
      Tipo: f.tipo || "",
      Observações: f.observacoes || "",
    }));
    const m = new Map();
    rowsDb.forEach((f) => {
      const k = `${f.cf_id || ""}|${f.curso_id || ""}`;
      const cur = m.get(k) || { Curso: `${f.curso_codigo || ""} — ${f.curso_nome || ""}`, Formando: f.formando_nome || "", NIF: f.formando_nif || "", "Faltas just.": 0, "Faltas injust.": 0, "Total horas": 0 };
      if (f.tipo === "justificada") cur["Faltas just."] += Number(f.horas || 0);
      else cur["Faltas injust."] += Number(f.horas || 0);
      cur["Total horas"] = cur["Faltas just."] + cur["Faltas injust."];
      m.set(k, cur);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Array.from(m.values())), "Resumo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalhe), "Detalhe");
    filename = `Relatorio_Faltas_${inicio}_${fim}.xlsx`;
  } else if (name === "faltas-curso") {
    const { cursoId } = params || {};
    const rowsDb = await nativeReportQuery(`
      SELECT ff.data, ff.horas, ff.tipo, ff.observacoes, ff.curso_formando_id, ff.sessao_id,
             cf.id AS cf_id, cf.estado AS cf_estado, fo.nome AS formando_nome, fo.nif AS formando_nif, fo.email AS formando_email,
             s.hora_inicio, s.hora_fim, u.codigo AS ufcd_codigo, c.codigo AS curso_codigo, c.nome AS curso_nome,
             totals.total_horas AS total_horas
        FROM curso_formandos cf
        JOIN cursos c ON c.id = cf.curso_id
        LEFT JOIN formandos fo ON fo.id = cf.formando_id
        LEFT JOIN formando_faltas ff ON ff.curso_formando_id = cf.id
        LEFT JOIN sessoes s ON s.id = ff.sessao_id
        LEFT JOIN curso_ufcds cu ON cu.id = s.curso_ufcd_id
        LEFT JOIN ufcds u ON u.id = cu.ufcd_id
        LEFT JOIN (SELECT curso_id, SUM(COALESCE(horas, 0)) AS total_horas FROM sessoes GROUP BY curso_id) totals ON totals.curso_id = cf.curso_id
       WHERE cf.curso_id = $1
       ORDER BY fo.nome ASC, ff.data ASC
    `, [cursoId]);
    const first = rowsDb[0] || {};
    const totalHoras = Number(first.total_horas || 0);
    const inscritos = new Map();
    const faltas = rowsDb.filter((r) => r.sessao_id);
    rowsDb.forEach((r) => inscritos.set(r.cf_id, r));
    const tot = new Map();
    faltas.forEach((f) => {
      const cur = tot.get(f.curso_formando_id) || { just: 0, injust: 0 };
      if (f.tipo === "justificada") cur.just += Number(f.horas || 0);
      else cur.injust += Number(f.horas || 0);
      tot.set(f.curso_formando_id, cur);
    });
    const resumo = Array.from(inscritos.values()).map((i) => {
      const t = tot.get(i.cf_id) || { just: 0, injust: 0 };
      const total = t.just + t.injust;
      return { Formando: i.formando_nome || "", NIF: i.formando_nif || "", Email: i.formando_email || "", Estado: i.cf_estado || "", "Horas curso": totalHoras, "Faltas just.": t.just, "Faltas injust.": t.injust, "Total faltas": total, "Assiduidade %": totalHoras > 0 ? Math.round(((totalHoras - total) / totalHoras) * 1000) / 10 : 100 };
    });
    const detalhe = faltas.map((f) => ({ Data: f.data, Formando: f.formando_nome || "", UFCD: f.ufcd_codigo || "", "Hora Início": time5(f.hora_inicio), "Hora Fim": time5(f.hora_fim), Horas: Number(f.horas || 0), Tipo: f.tipo || "", Observações: f.observacoes || "" }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Assiduidade");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalhe), "Faltas (detalhe)");
    filename = `Faltas_${reportSanitize(first.curso_codigo)}_${reportSanitize(first.curso_nome).slice(0, 40)}.xlsx`;
  } else if (name === "sigo-curso") {
    const { cursoId } = params || {};
    const rowsDb = await nativeReportQuery(`
      SELECT 'curso' AS kind, c.id, c.codigo, c.nome, c.tipologia, c.estado, c.data_inicio, c.data_fim,
             NULL::uuid AS ufcd_id, NULL::text AS ufcd_codigo, NULL::text AS ufcd_designacao, NULL::numeric AS horas_referencia,
             NULL::numeric AS horas_totais, NULL::boolean AS concluida, NULL::integer AS ordem,
             NULL::date AS data, NULL::time AS hora_inicio, NULL::time AS hora_fim, NULL::numeric AS horas, NULL::text AS observacoes,
             NULL::uuid AS formador_id, NULL::text AS formador_nome, NULL::text AS formador_nif, NULL::uuid AS curso_ufcd_id, NULL::uuid AS assigned_formador_id
        FROM cursos c WHERE c.id = $1
      UNION ALL
      SELECT 'ufcd' AS kind, cu.id, NULL, NULL, NULL, NULL, NULL, NULL,
             cu.ufcd_id, u.codigo, u.designacao, u.horas_referencia, cu.horas_totais, cu.concluida, cu.ordem,
             NULL, NULL, NULL, NULL, NULL, NULL, NULL, cu.id, cuf.formador_id
        FROM curso_ufcds cu
        LEFT JOIN ufcds u ON u.id = cu.ufcd_id
        LEFT JOIN curso_ufcd_formadores cuf ON cuf.curso_ufcd_id = cu.id
       WHERE cu.curso_id = $1
      UNION ALL
      SELECT 'sessao' AS kind, s.id, NULL, NULL, NULL, NULL, NULL, NULL,
             cu.ufcd_id, u.codigo, u.designacao, u.horas_referencia, NULL, NULL, NULL,
             s.data, s.hora_inicio, s.hora_fim, s.horas, s.observacoes, s.formador_id, f.nome, f.nif, s.curso_ufcd_id, NULL
        FROM sessoes s
        LEFT JOIN curso_ufcds cu ON cu.id = s.curso_ufcd_id
        LEFT JOIN ufcds u ON u.id = cu.ufcd_id
        LEFT JOIN formadores f ON f.id = s.formador_id
       WHERE s.curso_id = $1
    `, [cursoId]);
    const c = rowsDb.find((r) => r.kind === "curso");
    if (!c) throw new Error("Curso não encontrado");
    const ufcdBase = new Map();
    rowsDb.filter((r) => r.kind === "ufcd").forEach((r) => {
      if (!ufcdBase.has(r.id)) ufcdBase.set(r.id, r);
    });
    const sessoes = rowsDb.filter((r) => r.kind === "sessao");
    const horasPorCuf = new Map();
    sessoes.forEach((s) => horasPorCuf.set(s.curso_ufcd_id, (horasPorCuf.get(s.curso_ufcd_id) || 0) + Number(s.horas || 0)));
    const resumo = [["Curso", c.nome || ""], ["Código", c.codigo || ""], ["Tipologia", TIPOLOGIA_LABEL_NATIVE[c.tipologia] || c.tipologia || ""], ["Estado", ESTADO_CURSO_LABEL_NATIVE[c.estado] || c.estado || ""], ["Data Início", c.data_inicio || ""], ["Data Fim", c.data_fim || ""], [], ["Total sessões", sessoes.length], ["Total horas realizadas", sessoes.reduce((a, s) => a + Number(s.horas || 0), 0)], ["UFCD atribuídas", ufcdBase.size]];
    const sessRows = sessoes.map((s) => ({ Data: s.data, "Hora Início": time5(s.hora_inicio), "Hora Fim": time5(s.hora_fim), Horas: Number(s.horas || 0), "UFCD Código": s.ufcd_codigo || "", "UFCD Designação": s.ufcd_designacao || "", Formador: s.formador_nome || "", "NIF Formador": s.formador_nif || "", Observações: s.observacoes || "" }));
    const ufcdRows = Array.from(ufcdBase.values()).map((u) => ({ Código: u.ufcd_codigo || "", Designação: u.ufcd_designacao || "", "Horas Totais": Number(u.horas_totais || 0), "Horas Realizadas": horasPorCuf.get(u.id) || 0, "Horas em Falta": Math.max(0, Number(u.horas_totais || 0) - (horasPorCuf.get(u.id) || 0)), Concluída: u.concluida ? "Sim" : "Não" }));
    const formadores = new Map();
    sessoes.forEach((s) => {
      const k = s.formador_id || "—";
      const cur = formadores.get(k) || { Formador: s.formador_nome || "—", NIF: s.formador_nif || "", "Horas Realizadas": 0 };
      cur["Horas Realizadas"] += Number(s.horas || 0);
      formadores.set(k, cur);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), "Resumo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sessRows), "Sessões");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ufcdRows), "UFCD");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Array.from(formadores.values())), "Formadores");
    filename = `SIGO_${reportSanitize(c.codigo)}_${reportSanitize(c.nome).slice(0, 40)}.xlsx`;
  } else {
    throw new Error(`Relatório desconhecido: ${name}`);
  }

  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
  return { buffer, filename };
}

async function buildPdfBuffer(name, params) {
  const { jsPDF } = require("jspdf");
  const autoTableModule = require("jspdf-autotable");
  const autoTableFn = autoTableModule.default || autoTableModule.autoTable;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const title = name === "relatorio-formadores" ? "Horas por formador"
    : name === "relatorio-cursos" ? "Execução de cursos"
    : name === "relatorio-faltas" ? "Faltas dos formandos"
    : name === "faltas-curso" ? "Faltas do curso"
    : "Relatório SIGO";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, 14, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-PT")}`, 14, 20);

  let head = [];
  let body = [];
  let filename = `${reportSanitize(title)}.pdf`;
  if (name === "relatorio-formadores") {
    const wb = await buildExcelWorkbook("relatorio-formadores", params);
    const XLSX = require("xlsx");
    const book = XLSX.read(wb.buffer, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(book.Sheets["Resumo por formador"]);
    head = [["Formador", "NIF", "Sessões", "Horas"]];
    body = rows.map((r) => [r.Formador || "", r.NIF || "", String(r["Total Sessões"] || 0), `${r["Total Horas"] || 0}h`]);
    filename = `Relatorio_Formadores_${params.inicio}_${params.fim}.pdf`;
  } else if (name === "relatorio-cursos") {
    const wb = await buildExcelWorkbook("relatorio-cursos", params);
    const XLSX = require("xlsx");
    const book = XLSX.read(wb.buffer, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(book.Sheets["Execução de cursos"]);
    head = [["Código", "Curso", "Estado", "UFCD", "Previstas", "Dadas", "Faltam", "%"]];
    body = rows.map((r) => [r.Código || "", r.Curso || "", r.Estado || "", String(r["UFCD Atribuídas"] || 0), `${r["Horas Previstas"] || 0}h`, `${r["Horas Realizadas"] || 0}h`, `${r["Horas em Falta"] || 0}h`, `${r["Execução %"] || 0}%`]);
    filename = `Execucao_Cursos_${new Date().toISOString().slice(0, 10)}.pdf`;
  } else if (name === "relatorio-faltas") {
    const wb = await buildExcelWorkbook("relatorio-faltas", params);
    const XLSX = require("xlsx");
    const book = XLSX.read(wb.buffer, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(book.Sheets["Resumo"]);
    head = [["Curso", "Formando", "NIF", "Just.", "Injust.", "Total"]];
    body = rows.map((r) => [r.Curso || "", r.Formando || "", r.NIF || "", `${r["Faltas just."] || 0}h`, `${r["Faltas injust."] || 0}h`, `${r["Total horas"] || 0}h`]);
    filename = `Relatorio_Faltas_${params.inicio}_${params.fim}.pdf`;
  } else {
    const excelName = name === "faltas-curso" ? "faltas-curso" : "sigo-curso";
    const wb = await buildExcelWorkbook(excelName, params);
    const XLSX = require("xlsx");
    const book = XLSX.read(wb.buffer, { type: "buffer" });
    const firstSheet = book.SheetNames.includes("Assiduidade") ? "Assiduidade" : (book.SheetNames.includes("Sessões") ? "Sessões" : book.SheetNames[0]);
    const rows = XLSX.utils.sheet_to_json(book.Sheets[firstSheet]);
    const keys = Object.keys(rows[0] || { Mensagem: "Sem dados" });
    head = [keys];
    body = rows.length ? rows.map((r) => keys.map((k) => String(r[k] ?? ""))) : [["Sem dados"]];
    filename = wb.filename.replace(/\.xlsx$/i, ".pdf");
  }
  autoTableFn(doc, { startY: 26, head, body, styles: { fontSize: 8, cellPadding: 1.8, overflow: "linebreak" }, headStyles: { fillColor: [37, 99, 235] } });
  return { buffer: Buffer.from(doc.output("arraybuffer")), filename };
}

ipcMain.handle("report:excel", async (_evt, name, params) => {
  return queueLocalDb(`report:excel:${name}`, async () => {
    const { buffer, filename } = await buildExcelWorkbook(String(name), params || {});
    return await saveNativeReportBuffer(filename, buffer, [{ name: "Excel", extensions: ["xlsx"] }]);
  });
});

ipcMain.handle("report:pdf", async (_evt, name, params) => {
  return queueLocalDb(`report:pdf:${name}`, async () => {
    const { buffer, filename } = await buildPdfBuffer(String(name), params || {});
    return await saveNativeReportBuffer(filename, buffer, [{ name: "PDF", extensions: ["pdf"] }]);
  });
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
  writeDiagnosticLog("Versão da aplicação", APP_BUILD_VERSION);
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
