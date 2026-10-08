import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { BookRecord, Note } from '../../electron/shared-types';

interface Props {
  book: BookRecord;
  location: number;
  locationLabel: string;
  chapterHref?: string;
  quote?: string;
}

interface Position {
  left: number;
  top: number;
}

type DragKind = 'fab' | 'panel';

interface DragState {
  kind: DragKind;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
}

const EDGE_GAP = 12;

export function ReaderNotes({ book, location, locationLabel, chapterHref, quote = '' }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [fabPosition, setFabPosition] = useState<Position | null>(null);
  const [panelPosition, setPanelPosition] = useState<Position | null>(null);
  const notesRootRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressFabClickRef = useRef(false);
  const fabWasDraggedRef = useRef(false);

  const loadNotes = () => {
    void window.bookApi.listNotes(book.id).then((response) => {
      if (response.ok) setNotes(response.data);
      else setError(response.error);
    });
  };

  useEffect(() => {
    setOpen(false);
    setDraft('');
    setError('');
    setFabPosition(null);
    setPanelPosition(null);
    fabWasDraggedRef.current = false;
    loadNotes();
  }, [book.id]);

  useEffect(() => {
    const host = notesRootRef.current?.parentElement;
    if (!host) return;

    const updateFabPosition = () => {
      const fab = fabRef.current;
      if (!fab) return;

      const bounds = getFabBounds(host, fab);
      setFabPosition((current) => {
        const next = fabWasDraggedRef.current && current
          ? {
            left: clamp(current.left, bounds.minLeft, bounds.maxLeft),
            top: clamp(current.top, bounds.minTop, bounds.maxTop),
          }
          : {
            left: bounds.maxLeft,
            top: clamp((window.innerHeight - fab.offsetHeight) / 2, bounds.minTop, bounds.maxTop),
          };
        return current?.left === next.left && current.top === next.top ? current : next;
      });
    };

    const frame = requestAnimationFrame(updateFabPosition);
    const observer = new ResizeObserver(updateFabPosition);
    observer.observe(host);
    window.addEventListener('resize', updateFabPosition);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', updateFabPosition);
    };
  }, [book.id]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      const root = notesRootRef.current;
      if (!drag || !root) return;
      const host = root.parentElement;
      const element = drag.kind === 'fab' ? fabRef.current : panelRef.current;
      if (!host || !element) return;

      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) {
        suppressFabClickRef.current = drag.kind === 'fab';
        if (drag.kind === 'fab') fabWasDraggedRef.current = true;
      }

      const hostRect = host.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const isFixedFab = drag.kind === 'fab';
      const { minLeft, minTop, maxLeft, maxTop } = isFixedFab
        ? getFabBounds(host, element)
        : {
          minLeft: EDGE_GAP,
          minTop: EDGE_GAP,
          maxLeft: Math.max(EDGE_GAP, hostRect.width - elementRect.width - EDGE_GAP),
          maxTop: Math.max(EDGE_GAP, hostRect.height - elementRect.height - EDGE_GAP),
        };
      const nextPosition = isFixedFab
        ? {
          left: clamp(event.clientX - drag.offsetX, minLeft, maxLeft),
          top: clamp(event.clientY - drag.offsetY, minTop, maxTop),
        }
        : {
          left: clamp(event.clientX - hostRect.left - drag.offsetX, minLeft, maxLeft),
          top: clamp(event.clientY - hostRect.top - drag.offsetY, minTop, maxTop),
        };

      if (drag.kind === 'fab') setFabPosition(nextPosition);
      else setPanelPosition(nextPosition);
    };
    const end = () => { dragRef.current = null; };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, []);

  const beginDrag = (kind: DragKind, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const root = notesRootRef.current;
    const element = kind === 'fab' ? fabRef.current : panelRef.current;
    const host = root?.parentElement;
    if (!root || !element || !host) return;

    const hostRect = host.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const position = {
      left: elementRect.left - hostRect.left,
      top: elementRect.top - hostRect.top,
    };
    if (kind === 'fab' && !fabPosition) {
      setFabPosition({ left: elementRect.left, top: elementRect.top });
    }
    if (kind === 'panel' && !panelPosition) setPanelPosition(position);

    dragRef.current = {
      kind,
      offsetX: event.clientX - elementRect.left,
      offsetY: event.clientY - elementRect.top,
      startX: event.clientX,
      startY: event.clientY,
    };
    if (kind === 'fab') suppressFabClickRef.current = false;
  };

  const handleFabClick = () => {
    if (suppressFabClickRef.current) {
      suppressFabClickRef.current = false;
      return;
    }
    setOpen((current) => !current);
  };

  const addNote = async () => {
    const content = draft.trim();
    if (!content) {
      setError('请先输入批注内容');
      return;
    }
    setSaving(true);
    setError('');
    const response = await window.bookApi.saveNote({
      bookId: book.id,
      location,
      chapterHref,
      locationLabel,
      quote: quote.trim().slice(0, 1000),
      content,
    });
    setSaving(false);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setNotes((current) => [response.data, ...current]);
    setDraft('');
    setOpen(false);
  };

  const deleteNote = async (noteId: string) => {
    const response = await window.bookApi.removeNote(noteId);
    if (response.ok) setNotes((current) => current.filter((note) => note.id !== noteId));
    else setError(response.error);
  };

  return (
    <div className="reader-notes" ref={notesRootRef}>
      <button
        ref={fabRef}
        type="button"
        className={`${notes.length ? 'notes-fab notes-fab-has-items' : 'notes-fab'}${fabPosition ? ' notes-fab-positioned' : ''}`}
        style={fabPosition ? {
          left: fabPosition.left,
          top: fabPosition.top,
          right: 'auto',
          bottom: 'auto',
        } : undefined}
        onPointerDown={(event) => beginDrag('fab', event)}
        onClick={handleFabClick}
        aria-label="添加批注"
        title="添加批注"
      >
        <span aria-hidden="true">✎</span>
        {notes.length > 0 && <span className="notes-fab-count">{notes.length}</span>}
      </button>
      {open && (
        <div
          ref={panelRef}
          className="notes-panel"
          style={panelPosition ? { left: panelPosition.left, top: panelPosition.top, right: 'auto', bottom: 'auto' } : undefined}
        >
          <div className="notes-panel-header" onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest('button')) return;
            beginDrag('panel', event);
          }}>
            <strong>读书笔记</strong>
            <button type="button" className="notes-close" onClick={() => setOpen(false)} aria-label="关闭批注面板">×</button>
          </div>
          <div className="note-composer">
            {quote && <blockquote className="note-quote">“{quote}”</blockquote>}
            <div className="note-location">当前位置：{locationLabel}</div>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="写下你的想法..."
              rows={3}
              autoFocus
            />
            <div className="note-composer-actions">
              <button type="button" className="secondary-button note-cancel" onClick={() => setOpen(false)}>取消</button>
              <button type="button" className="primary-button note-save" onClick={() => void addNote()} disabled={saving}>{saving ? '保存中...' : '保存批注'}</button>
            </div>
          </div>
          {error && <div className="notes-error">{error}</div>}
          <div className="notes-list">
            {notes.length === 0 ? <div className="notes-empty">还没有批注</div> : notes.map((note) => (
              <article className="note-item" key={note.id}>
                <div className="note-item-meta">{note.locationLabel}</div>
                {note.quote && <blockquote className="note-quote">“{note.quote}”</blockquote>}
                <p>{note.content}</p>
                <button type="button" className="note-delete" onClick={() => void deleteNote(note.id)}>删除</button>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getFabBounds(host: HTMLElement, fab: HTMLElement) {
  const rect = host.getBoundingClientRect();
  const viewportMaxLeft = Math.max(0, window.innerWidth - fab.offsetWidth - EDGE_GAP);
  const viewportMaxTop = Math.max(0, window.innerHeight - fab.offsetHeight - EDGE_GAP);
  const minLeft = clamp(rect.left + EDGE_GAP, EDGE_GAP, Math.max(EDGE_GAP, viewportMaxLeft));
  const minTop = clamp(rect.top + EDGE_GAP, EDGE_GAP, Math.max(EDGE_GAP, viewportMaxTop));
  return {
    minLeft,
    minTop,
    maxLeft: Math.max(minLeft, Math.min(rect.right - fab.offsetWidth - EDGE_GAP, viewportMaxLeft)),
    maxTop: Math.max(minTop, Math.min(rect.bottom - fab.offsetHeight - EDGE_GAP, viewportMaxTop)),
  };
}
