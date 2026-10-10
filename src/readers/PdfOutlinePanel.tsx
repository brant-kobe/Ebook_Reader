import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { getPdfOutlineAncestors, type PdfOutlineNode } from './pdf-outline';

interface Props {
  id: string;
  nodes: PdfOutlineNode[];
  loading: boolean;
  error: string;
  activeId: string | null;
  onSelect: (node: PdfOutlineNode) => void;
  onClose: () => void;
}

export function PdfOutlinePanel({ id, nodes, loading, error, activeId, onSelect, onClose }: Props) {
  const [expanded, setExpanded] = useState(() => new Set(nodes.map((node) => node.id)));
  const listRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    setExpanded(new Set(nodes.map((node) => node.id)));
  }, [nodes]);
  useEffect(() => {
    if (!activeId) return;
    setExpanded((current) => new Set([...current, ...getPdfOutlineAncestors(nodes, activeId)]));
  }, [activeId, nodes]);
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!list || !active) return;
    const listBounds = list.getBoundingClientRect();
    const bounds = active.getBoundingClientRect();
    if (bounds.top < listBounds.top) list.scrollTop += bounds.top - listBounds.top;
    else if (bounds.bottom > listBounds.bottom) list.scrollTop += bounds.bottom - listBounds.bottom;
  }, [activeId, expanded]);

  const toggle = (nodeId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // Keep reader shortcuts from turning pages while navigating either pane's outline.
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const index = buttons.indexOf(event.target as HTMLButtonElement);
      if (index < 0) return;
      event.preventDefault();
      buttons[Math.min(buttons.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    }
  };
  const renderNodes = (items: PdfOutlineNode[]) => (
    <ul className="pdf-outline-list">
      {items.map((node) => (
        <li key={node.id}>
          <div className={`pdf-outline-row${node.id === activeId ? ' pdf-outline-row-active' : ''}`}>
            {node.children.length > 0 ? (
              <button type="button" className="pdf-outline-expand" aria-label={`${expanded.has(node.id) ? '折叠' : '展开'} ${node.title}`} aria-expanded={expanded.has(node.id)} onClick={() => toggle(node.id)}>
                {expanded.has(node.id) ? '▾' : '▸'}
              </button>
            ) : <span className="pdf-outline-expand-placeholder" />}
            <button
              type="button"
              className="pdf-outline-target"
              disabled={node.page === null}
              aria-current={node.id === activeId ? 'location' : undefined}
              title={node.unavailableReason ? `${node.title}：${node.unavailableReason}` : `${node.title} · 第 ${node.page} 页`}
              onClick={() => onSelect(node)}
            >
              <span>{node.title}</span>
              <small>{node.page === null ? node.unavailableReason : `第 ${node.page} 页`}</small>
            </button>
          </div>
          {node.children.length > 0 && expanded.has(node.id) && renderNodes(node.children)}
        </li>
      ))}
    </ul>
  );

  return (
    <nav id={id} className="pdf-outline-panel" aria-label="PDF 目录" onKeyDown={handleKeyDown}>
      <div className="pdf-outline-header">
        <strong>目录</strong>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭 PDF 目录">×</button>
      </div>
      <div ref={listRef} className="pdf-outline-content" aria-busy={loading}>
        {loading ? <p className="pdf-outline-message" role="status">正在解析目录…</p>
          : error ? <p className="pdf-outline-message" role="status">{error}</p>
          : nodes.length === 0 ? <p className="pdf-outline-message" role="status">此 PDF 没有内置目录</p>
          : renderNodes(nodes)}
      </div>
    </nav>
  );
}
