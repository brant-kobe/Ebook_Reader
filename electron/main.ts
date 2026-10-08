import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { join } from 'node:path';
import {
  getBook,
  getSettings,
  listBooks,
  listBookmarks,
  listNotes,
  removeBook,
  removeBookmark,
  removeNote,
  saveBookmark,
  saveNote,
  setSettings,
  updateProgress,
} from './services/store-service';
import {
  importBook,
  readEpubBook,
  readPdfBook,
  readTextBook,
  refreshBookAvailability,
} from './services/file-service';
import type { BookProgress, ReaderSettings } from './shared-types';

let mainWindow: BrowserWindow | null = null;

// Some Windows environments cannot start Chromium's GPU process because of
// cache or driver permissions. The reader does not depend on hardware
// acceleration, so use software rendering to keep the window usable there.
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('in-process-gpu');
app.disableHardwareAcceleration();

function result<T>(data: T) {
  return { ok: true as const, data };
}

function failure(error: unknown) {
  return { ok: false as const, error: error instanceof Error ? error.message : '操作失败' };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f4f1ea',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      // Keep the renderer isolated from Node while allowing the bundled
      // preload module to load consistently in Electron's Windows runtime.
      sandbox: false,
    },
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[renderer] load failed (${errorCode}): ${errorDescription} - ${validatedURL}`);
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[renderer] ${sourceId}:${line} ${message}`);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[renderer] process exited: ${details.reason}`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    if (process.env.ELECTRON_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

async function chooseBook() {
  try {
    const selection = await dialog.showOpenDialog(mainWindow!, {
      title: '导入电子书',
      properties: ['openFile'],
      filters: [{ name: '电子书', extensions: ['pdf', 'txt', 'docx', 'epub'] }],
    });
    if (selection.canceled || selection.filePaths.length === 0) return failure('已取消导入');
    return result(importBook(selection.filePaths[0]));
  } catch (error) {
    return failure(error);
  }
}

function createApplicationMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: '导入书籍...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const response = await chooseBook();
            mainWindow?.webContents.send('library:imported', response);
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc() {
  ipcMain.handle('library:choose-file', async () => {
    return chooseBook();
  });

  ipcMain.handle('library:list', () => {
    try {
      return result(listBooks().map(refreshBookAvailability));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('library:remove', (_event, bookId: unknown) => {
    try {
      if (typeof bookId !== 'string') throw new Error('无效的书籍 ID');
      removeBook(bookId);
      return result(undefined);
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('book:read-text', async (_event, bookId: unknown) => {
    try {
      if (typeof bookId !== 'string') throw new Error('无效的书籍 ID');
      return result(await readTextBook(bookId));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('book:read-binary', (_event, bookId: unknown) => {
    try {
      if (typeof bookId !== 'string') throw new Error('无效的书籍 ID');
      return result(readPdfBook(bookId));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('book:read-epub', async (_event, bookId: unknown) => {
    try {
      if (typeof bookId !== 'string') throw new Error('无效的书籍 ID');
      return result(await readEpubBook(bookId));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('progress:save', (_event, payload: { bookId: unknown; progress: unknown }) => {
    try {
      if (typeof payload?.bookId !== 'string') throw new Error('无效的书籍 ID');
      if (!payload.progress || typeof payload.progress !== 'object') throw new Error('无效的阅读进度');
      return result(updateProgress(payload.bookId, payload.progress as BookProgress));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('settings:get', () => result(getSettings()));
  ipcMain.handle('settings:set', (_event, settings: ReaderSettings) => {
    try {
      if (!settings || typeof settings.fontSize !== 'number') throw new Error('无效的阅读设置');
      return result(setSettings(settings));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('bookmark:list', (_event, bookId: unknown) => {
    try {
      if (typeof bookId !== 'string') throw new Error('无效的书籍 ID');
      return result(listBookmarks(bookId));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('bookmark:save', (_event, bookmark: Parameters<typeof saveBookmark>[0]) => {
    try {
      if (!bookmark || typeof bookmark.bookId !== 'string' || typeof bookmark.location !== 'number') {
        throw new Error('无效的书签');
      }
      if (!getBook(bookmark.bookId)) throw new Error('找不到这本书');
      return result(saveBookmark(bookmark));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('bookmark:remove', (_event, bookmarkId: unknown) => {
    try {
      if (typeof bookmarkId !== 'string') throw new Error('无效的书签 ID');
      removeBookmark(bookmarkId);
      return result(undefined);
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('note:list', (_event, bookId: unknown) => {
    try {
      if (typeof bookId !== 'string') throw new Error('无效的书籍 ID');
      return result(listNotes(bookId));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('note:save', (_event, note: Parameters<typeof saveNote>[0]) => {
    try {
      if (!note || typeof note.bookId !== 'string' || typeof note.location !== 'number'
        || typeof note.locationLabel !== 'string' || typeof note.content !== 'string') {
        throw new Error('无效的批注');
      }
      if (!getBook(note.bookId)) throw new Error('找不到这本书');
      const content = note.content.trim();
      if (!content) throw new Error('批注内容不能为空');
      return result(saveNote({ ...note, content, quote: typeof note.quote === 'string' ? note.quote.slice(0, 1000) : '' }));
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle('note:remove', (_event, noteId: unknown) => {
    try {
      if (typeof noteId !== 'string') throw new Error('无效的批注 ID');
      removeNote(noteId);
      return result(undefined);
    } catch (error) {
      return failure(error);
    }
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  createApplicationMenu();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
