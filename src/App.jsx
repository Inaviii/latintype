import { useState } from 'react';
import TypingTest from './components/typingtest'
import ReadMode from './components/ReadMode'
import Leaderboard from './components/Leaderboard'
import SettingsPanel from './components/SettingsPanel'
import { Logo, Rule } from './components/ascii'
import { SettingsProvider, useSettings, palettes, fonts, cycle } from './contexts/SettingsContext'

const TABS = [['test', 'type'], ['read', 'read'], ['leaderboard', 'scores']];

function Shell() {
  const [currentPage, setCurrentPage] = useState('test');
  const [focused, setFocused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { palette, setPalette, fontFamily, setFontFamily, font } = useSettings();

  return (
    <div className="shell">
      {/* visibility, not removal: the verse must not jump when typing starts */}
      <header className={focused ? 'invisible' : ''}>
        <Logo />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <nav className="flex flex-wrap gap-1" aria-label="main">
            {TABS.map(([page, label], i) => (
              <button
                key={page}
                className={`tab ${currentPage === page ? 'on' : ''}`}
                aria-current={currentPage === page ? 'page' : undefined}
                onClick={() => setCurrentPage(page)}
              >
                {i}:{label}
              </button>
            ))}
          </nav>
          <div className="flex flex-wrap gap-x-3">
            <button className="btn" onClick={() => setPalette(cycle(palettes, palette))} title="next palette">palette: {palette}</button>
            <button className="btn" onClick={() => setFontFamily(cycle(fonts.map(f => f.value), fontFamily))} title="next latin font">font: {font.name}</button>
            <button className="btn" onClick={() => setShowSettings(true)}>settings</button>
          </div>
        </div>
        <Rule className="mt-1" />
      </header>

      {currentPage === 'test' ? (
        <TypingTest onFocusChange={setFocused} />
      ) : currentPage === 'read' ? (
        <ReadMode />
      ) : (
        <Leaderboard />
      )}

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function App() {
  return (
    <SettingsProvider>
      <Shell />
    </SettingsProvider>
  )
}

export default App
