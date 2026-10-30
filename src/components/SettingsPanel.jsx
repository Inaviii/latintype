import React from 'react';
import { Overlay } from './ascii';
import { useSettings, palettes, fonts, cursorStyles, volumes, cycle } from '../contexts/SettingsContext';

function Row({ label, value, onPrev, onNext }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-[14ch] shrink-0">{label}</span>
      <button className="btn" onClick={onPrev} aria-label={`previous ${label}`}>&lt;</button>
      <span className="w-[18ch] text-center text-ink font-semibold" aria-live="polite">{value}</span>
      <button className="btn" onClick={onNext} aria-label={`next ${label}`}>&gt;</button>
    </div>
  );
}

export default function SettingsPanel({ onClose }) {
  const {
    palette, setPalette, fontFamily, setFontFamily, font,
    fontSize, setFontSize, cursorStyle, setCursorStyle,
    volume, setVolume, showScansion, setShowScansion,
    focusMode, setFocusMode,
  } = useSettings();

  const values = fonts.map(f => f.value);
  const setSize = (dir) => setFontSize(Math.max(16, Math.min(36, fontSize + dir * 2)));

  return (
    <Overlay title="settings" onClose={onClose}>
      <Row label="palette" value={palette} onPrev={() => setPalette(cycle(palettes, palette, -1))} onNext={() => setPalette(cycle(palettes, palette))} />
      <Row label="latin font" value={font.name} onPrev={() => setFontFamily(cycle(values, fontFamily, -1))} onNext={() => setFontFamily(cycle(values, fontFamily))} />
      <Row label="text size" value={`${fontSize}px`} onPrev={() => setSize(-1)} onNext={() => setSize(1)} />
      <Row label="cursor" value={cursorStyle} onPrev={() => setCursorStyle(cycle(cursorStyles, cursorStyle, -1))} onNext={() => setCursorStyle(cycle(cursorStyles, cursorStyle))} />
      <Row label="key sound" value={volume === 0 ? 'off' : `${Math.round(volume * 100)}%`} onPrev={() => setVolume(cycle(volumes, volume, -1))} onNext={() => setVolume(cycle(volumes, volume))} />
      <Row label="scansion" value={showScansion ? 'on' : 'off'} onPrev={() => setShowScansion(!showScansion)} onNext={() => setShowScansion(!showScansion)} />
      <Row label="hide menus" value={focusMode ? 'while typing' : 'never'} onPrev={() => setFocusMode(!focusMode)} onNext={() => setFocusMode(!focusMode)} />
      <p className="mt-3 text-ink" style={{ fontFamily, fontSize: 22 }}>Cui dōnō lepidum novum libellum</p>
      <div className="mt-3 flex justify-end">
        <button className="btn" onClick={onClose}>esc close</button>
      </div>
    </Overlay>
  );
}
