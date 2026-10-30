import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Pane } from './ascii';

// native option lists can't be styled, so this rebuilds the listbox pattern by hand
export default function Select({ label, value, options, onChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [alignRight, setAlignRight] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const menuRef = useRef(null);
  const typed = useRef({ text: '', at: 0 });
  const baseId = useId();

  const current = options.find(o => o.value === value);

  const openList = () => {
    setActive(Math.max(0, options.findIndex(o => o.value === value)));
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const choose = (i) => {
    if (options[i].value !== value) onChange(options[i].value);
    close();
  };

  useLayoutEffect(() => {
    if (!open) return;
    setAlignRight(false);
    listRef.current?.focus();
    const rect = menuRef.current?.getBoundingClientRect();
    if (rect && rect.right > window.innerWidth - 8) setAlignRight(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onTriggerKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openList();
    }
  };

  const typeAhead = (key) => {
    const now = Date.now();
    const text = (now - typed.current.at > 700 ? '' : typed.current.text) + key.toLowerCase();
    typed.current = { text, at: now };
    const match = options.findIndex(o => o.label.toLowerCase().startsWith(text));
    if (match !== -1) setActive(match);
  };

  const onListKeyDown = (e) => {
    const typing = Date.now() - typed.current.at <= 700 && typed.current.text;
    if (e.key === 'ArrowDown') setActive(a => Math.min(options.length - 1, a + 1));
    else if (e.key === 'ArrowUp') setActive(a => Math.max(0, a - 1));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(options.length - 1);
    else if (e.key === 'Enter' || (e.key === ' ' && !typing)) choose(active);
    else if (e.key === 'Escape') close();
    else if (e.key === 'Tab') { setOpen(false); return; }
    else if (e.key.length === 1) typeAhead(e.key);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        className={`field select-trigger ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current?.label ?? ''}`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="truncate">{current?.label}</span>
        <span className="text-dim" aria-hidden="true">{open ? '^' : 'v'}</span>
      </button>

      {open && (
        <div ref={menuRef} className={`menu ${alignRight ? 'right-0' : 'left-0'}`}>
          <Pane title={label}>
            <ul
              ref={listRef}
              role="listbox"
              tabIndex={-1}
              aria-label={label}
              aria-activedescendant={`${baseId}-${active}`}
              className="menu-list"
              onKeyDown={onListKeyDown}
            >
              {options.map((option, i) => (
                <li
                  key={option.value}
                  id={`${baseId}-${i}`}
                  role="option"
                  aria-selected={option.value === value}
                  className={`menu-item ${i === active ? 'active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                >
                  <span aria-hidden="true">{option.value === value ? '> ' : '  '}</span>{option.label}
                </li>
              ))}
            </ul>
          </Pane>
        </div>
      )}
    </div>
  );
}
