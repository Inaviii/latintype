import React, { createContext, useContext, useState, useEffect } from 'react';

export const palettes = ['slate', 'graphite', 'bark', 'fjord', 'moss', 'proof'];

// adv is the widest advance per em, used to fit long lines on screen
// scale evens out faces whose letters are small for their size, like VT323
export const fonts = [
  // Doto has no ō or ȳ, so every macron is drawn to match
  { name: "Doto", value: '"Doto", monospace', adv: 0.6, scale: 1.1, drawMacrons: true },
  { name: "VT323", value: '"VT323", monospace', adv: 0.4, scale: 1.35 },
  { name: "JetBrains Mono", value: '"JetBrains Mono", monospace', adv: 0.6 },
  { name: "Fira Mono", value: '"Fira Mono", monospace', adv: 0.6 },
  { name: "IBM Plex Mono", value: '"IBM Plex Mono", monospace', adv: 0.6 },
  { name: "Source Code Pro", value: '"Source Code Pro", monospace', adv: 0.6 },
  { name: "Inconsolata", value: '"Inconsolata", monospace', adv: 0.5 },
  { name: "Courier Prime", value: '"Courier Prime", monospace', adv: 0.6 },
  { name: "Cutive Mono", value: '"Cutive Mono", monospace', adv: 0.6 },
  { name: "Consolas", value: 'Consolas, monospace', adv: 0.55 },
  { name: "OpenDyslexic", value: '"OpenDyslexic", sans-serif', adv: 0.72 },
];

export const cursorStyles = ['block', 'underline', 'line'];
export const volumes = [0, 0.2, 0.5, 1];

export const cycle = (list, current, dir = 1) => {
  const i = list.indexOf(current);
  return list[(i + dir + list.length) % list.length];
};

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [palette, setPalette] = useState(() => {
    const saved = localStorage.getItem('palette');
    return palettes.includes(saved) ? saved : palettes[0];
  });
  const [volume, setVolume] = useState(() => { const v = localStorage.getItem('volume'); return v !== null ? parseFloat(v) : 0.2; });
  const [fontFamily, setFontFamily] = useState(() => {
    const saved = localStorage.getItem('latinFont');
    return fonts.some(f => f.value === saved) ? saved : fonts[0].value;
  });
  const [fontSize, setFontSize] = useState(() => { const v = localStorage.getItem('fontSize'); return v !== null ? parseInt(v) : 32; });
  const [showScansion, setShowScansion] = useState(() => { const v = localStorage.getItem('showScansion'); return v !== null ? v === 'true' : true; });
  const [focusMode, setFocusMode] = useState(() => localStorage.getItem('focusMode') === 'true');
  const [cursorStyle, setCursorStyle] = useState(() => {
    const saved = localStorage.getItem('cursorStyle');
    return cursorStyles.includes(saved) ? saved : cursorStyles[0];
  });

  // Sync to local storage
  useEffect(() => {
    document.documentElement.dataset.palette = palette;
    localStorage.setItem('palette', palette);
    localStorage.setItem('volume', volume);
    localStorage.setItem('latinFont', fontFamily);
    localStorage.setItem('fontSize', fontSize);
    localStorage.setItem('showScansion', showScansion);
    localStorage.setItem('cursorStyle', cursorStyle);
    localStorage.setItem('focusMode', focusMode);
  }, [palette, volume, fontFamily, fontSize, showScansion, cursorStyle, focusMode]);

  const font = fonts.find(f => f.value === fontFamily);

  return (
    <SettingsContext.Provider value={{
      palette, setPalette,
      volume, setVolume,
      fontFamily, setFontFamily, font,
      fontSize, setFontSize,
      showScansion, setShowScansion,
      cursorStyle, setCursorStyle,
      focusMode, setFocusMode,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
