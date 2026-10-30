import React, { useEffect, useRef } from 'react';
import { LOGO_LARGE, LOGO_SMALL } from '../lib/logos';

const DASHES = '-'.repeat(400);
const PIPES = '|\n'.repeat(400);

export const Rule = ({ className = '' }) => (
  <div className={`rule ${className}`} aria-hidden="true">{DASHES}</div>
);

export function Pane({ title, children, className = '' }) {
  return (
    <section className={`pane ${className}`}>
      <div className="pane-edge">
        <span aria-hidden="true">+-- </span>
        <h2 className="pane-title">{title}</h2>
        <span aria-hidden="true">&nbsp;</span>
        <span className="rule" aria-hidden="true">{DASHES}</span>
        <span aria-hidden="true">+</span>
      </div>
      <div className="pane-body">
        <span className="pane-side left-0" aria-hidden="true">{PIPES}</span>
        {children}
        <span className="pane-side right-0" aria-hidden="true">{PIPES}</span>
      </div>
      <div className="pane-edge" aria-hidden="true">
        <span>+</span><span className="rule">{DASHES}</span><span>+</span>
      </div>
    </section>
  );
}

export const Logo = () => (
  <h1 aria-label="latintype" className="font-normal text-ink">
    <pre className="hidden lg:block" aria-hidden="true">{LOGO_LARGE}</pre>
    <pre className="lg:hidden" aria-hidden="true">{LOGO_SMALL}</pre>
  </h1>
);

// the data stores long and short as — and ∪; on screen they are plain - and u
export const toAsciiMark = (symbol) => (symbol === '—' ? '-' : symbol === '∪' ? 'u' : symbol);

export const linePattern = (scansion) =>
  scansion ? [...scansion.join('').replace(/ /g, '')].map(toAsciiMark).join(' ') : '';

export function Overlay({ title, onClose, children }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    panelRef.current?.querySelector('button, select, input')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div
        ref={panelRef}
        className="overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <Pane title={title}>
          <div className="py-2">{children}</div>
        </Pane>
      </div>
    </div>
  );
}
