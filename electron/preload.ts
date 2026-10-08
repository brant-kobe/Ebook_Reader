import { contextBridge, ipcRenderer } from 'electron';
import type { ApiResponse, BookApi, BookRecord } from './shared-types';

const api: BookApi = {
  onImportResult: (callback: (response: ApiResponse<BookRecord>) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, response: ApiResponse<BookRecord>) => callback(response);
    ipcRenderer.on('library:imported', listener);
    return () => ipcRenderer.removeListener('library:imported', listener);
  },
  chooseFile: () => ipcRenderer.invoke('library:choose-file'),
  listBooks: () => ipcRenderer.invoke('library:list'),
  removeBook: (bookId) => ipcRenderer.invoke('library:remove', bookId),
  readText: (bookId) => ipcRenderer.invoke('book:read-text', bookId),
  readEpub: (bookId) => ipcRenderer.invoke('book:read-epub', bookId),
  readBinary: (bookId) => ipcRenderer.invoke('book:read-binary', bookId),
  saveProgress: (bookId, progress) => ipcRenderer.invoke('progress:save', { bookId, progress }),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),
  listBookmarks: (bookId) => ipcRenderer.invoke('bookmark:list', bookId),
  saveBookmark: (bookmark) => ipcRenderer.invoke('bookmark:save', bookmark),
  removeBookmark: (bookmarkId) => ipcRenderer.invoke('bookmark:remove', bookmarkId),
  listNotes: (bookId) => ipcRenderer.invoke('note:list', bookId),
  saveNote: (note) => ipcRenderer.invoke('note:save', note),
  removeNote: (noteId) => ipcRenderer.invoke('note:remove', noteId),
};

contextBridge.exposeInMainWorld('bookApi', api);
