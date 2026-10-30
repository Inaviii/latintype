import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import DictionaryPopup from './DictionaryPopup';
import { Pane, linePattern, toAsciiMark } from './ascii';
import Select from './Select';
import { useSettings } from '../contexts/SettingsContext';
import { useTypingEngine } from '../hooks/useTypingEngine';

const normalizeChar = (char) => char.normalize("NFD").replace(/[̀-ͯ]/g, "");

const getVowelIndices = (word, wordScansion = "") => {
  const normalized = word.toLowerCase();
  const vowels = ['a', 'e', 'i', 'o', 'u', 'y', 'ā', 'ē', 'ī', 'ō', 'ū', 'ȳ'];

  const rawIndices = [];
  for (let i = 0; i < normalized.length; i++) {
    if (vowels.includes(normalized[i])) {
      if ((normalized[i] === 'u' || normalized[i] === 'ū') && i > 0 && normalized[i - 1] === 'q') continue;
      rawIndices.push(i);
    }
  }

  const marksCount = wordScansion.replace(/ /g, '').length;
  if (marksCount > 0 && rawIndices.length === marksCount) {
    return rawIndices;
  }

  const groupedIndices = [];
  for (let i = 0; i < normalized.length; i++) {
    if (vowels.includes(normalized[i])) {
      if ((normalized[i] === 'u' || normalized[i] === 'ū') && i > 0 && normalized[i - 1] === 'q') continue;
      if (i > 0 && groupedIndices.includes(i - 1)) {
        const pair = normalized[i - 1] + normalized[i];
        if (['ae', 'au', 'oe'].includes(pair)) continue;
      }
      groupedIndices.push(i);
    }
  }
  return groupedIndices;
};

const isDiphthongStart = (word, cIdx, vowelIndices) => {
  const normalized = word.toLowerCase();
  if (cIdx >= normalized.length - 1) return false;
  const pair = normalized[cIdx] + normalized[cIdx + 1];
  const diphthongs = ['ae', 'au', 'oe', 'ei', 'eu', 'ui'];
  const vowels = ['a', 'e', 'i', 'o', 'u', 'y', 'ā', 'ē', 'ī', 'ō', 'ū', 'ȳ'];

  return vowels.includes(normalized[cIdx]) &&
         vowels.includes(normalized[cIdx + 1]) &&
         diphthongs.includes(pair) &&
         vowelIndices.includes(cIdx) &&
         !vowelIndices.includes(cIdx + 1);
};

const seededRandom = (seedStr) => {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = Math.imul(31, hash) + seedStr.charCodeAt(i) | 0;
  }
  return function() {
    hash = Math.imul(hash ^ (hash >>> 15), 1597334677);
    hash = Math.imul(hash ^ (hash >>> 15), 3812015801);
    return ((hash ^ (hash >>> 15)) >>> 0) / 4294967296;
  };
};

const laDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

const MODES = [['zen', 'zen'], ['passage', 'passage'], ['time', 'time attack'], ['daily', 'daily']];

export default function TypingTest({ onFocusChange }) {
  // lazy loading architecture state
  const [libraryIndex, setLibraryIndex] = useState(null);
  const [activeAuthorData, setActiveAuthorData] = useState([]);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [isFetchingAuthor, setIsFetchingAuthor] = useState(false);
  const [selectedWord, setSelectedWord] = useState(null);

  // time attack mode state
  const [testMode, setTestMode] = useState('passage'); // 'passage', 'time', 'zen', 'daily'
  const [timeLimit, setTimeLimit] = useState(60);
  const [timeRemaining, setTimeRemaining] = useState(null);

  // cascading selection state
  const [selectedAuthor, setSelectedAuthor] = useState('');
  const [selectedWork, setSelectedWork] = useState('');
  const [selectedPieceId, setSelectedPieceId] = useState('');
  const [loadedPieceId, setLoadedPieceId] = useState(null);
  const [lineRange, setLineRange] = useState({ start: 1, end: 1, max: 1 });
  const [lineOffset, setLineOffset] = useState(0);

  // engine state via custom hook
  const { state: engineState, dispatch: engineDispatch, resetEngine, handleKeyDown: rawHandleKeyDown } = useTypingEngine([]);
  const { lines, wordIndex, currentInput, typedHistory, startTime, isFinished, stats } = engineState;

  // settings via context
  const { volume, fontFamily, font, fontSize, showScansion, setShowScansion, cursorStyle, focusMode } = useSettings();

  // saving a score
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('latintype_name') || localStorage.getItem('latintype_ranked_name') || '');
  const [scoreSaved, setScoreSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // optional focus mode: menus go while typing, Esc brings them back
  const [showMenus, setShowMenus] = useState(false);
  const focused = focusMode && Boolean(startTime) && !isFinished && !showMenus;

  useEffect(() => {
    onFocusChange?.(focused);
    return () => onFocusChange?.(false);
  }, [focused, onFocusChange]);

  const inputRef = useRef(null);
  const tabArmed = useRef(false);
  const stageRef = useRef(null);
  const [stageWidth, setStageWidth] = useState(800);

  // fetch index on mount
  useEffect(() => {
    // cache buster
    fetch(`/library/index.json?nocache=${new Date().getTime()}`)
      .then(res => res.json())
      .then(indexData => {
        setLibraryIndex(indexData);

        const savedAuthor = localStorage.getItem('selectedAuthor');
        const savedWork = localStorage.getItem('selectedWork');
        const savedPieceId = localStorage.getItem('selectedPieceId');

        const hasSavedPiece = savedAuthor && indexData[savedAuthor] &&
                              savedWork && indexData[savedAuthor][savedWork] &&
                              savedPieceId && indexData[savedAuthor][savedWork].some(p => p.id === savedPieceId);

        const initialAuthor = hasSavedPiece ? savedAuthor : (indexData['Catullus'] ? 'Catullus' : Object.keys(indexData)[0]);
        const initialWork = hasSavedPiece ? savedWork : (indexData[initialAuthor]['Carmina'] ? 'Carmina' : Object.keys(indexData[initialAuthor])[0]);
        const initialPieceId = hasSavedPiece ? savedPieceId : (indexData[initialAuthor][initialWork].some(p => p.id === 'catullus-1') ? 'catullus-1' : indexData[initialAuthor][initialWork][0].id);

        setSelectedAuthor(initialAuthor);
        setSelectedWork(initialWork);
        setSelectedPieceId(initialPieceId);

        fetchAuthorData(initialAuthor);
      });
  }, []);

  useEffect(() => {
    if (selectedAuthor) localStorage.setItem('selectedAuthor', selectedAuthor);
    if (selectedWork) localStorage.setItem('selectedWork', selectedWork);
    if (selectedPieceId) localStorage.setItem('selectedPieceId', selectedPieceId);
  }, [selectedAuthor, selectedWork, selectedPieceId]);

  // in-memory author cache
  const authorCache = useRef({});

  // helper to fetch heavy author data lazily
  const fetchAuthorData = (authorName) => {
    if (authorCache.current[authorName]) {
      setActiveAuthorData(authorCache.current[authorName]);
      setIsFetchingAuthor(false);
      setIsAppLoading(false);
      return;
    }

    setIsFetchingAuthor(true);
    const safeFilename = authorName.toLowerCase().replace(/ /g, "_") + ".json";

    fetch(`/library/${safeFilename}`)
      .then(res => res.json())
      .then(data => {
        authorCache.current[authorName] = data;
        setActiveAuthorData(data);
        setIsFetchingAuthor(false);
        setIsAppLoading(false);
      });
  };

  // handle author change
  const handleAuthorChange = (newAuthor) => {
    setSelectedAuthor(newAuthor);

    const firstWork = Object.keys(libraryIndex[newAuthor])[0];
    setSelectedWork(firstWork);
    setSelectedPieceId(libraryIndex[newAuthor][firstWork][0].id);

    fetchAuthorData(newAuthor);
  };

  // handle work change
  const handleWorkChange = (newWork) => {
    setSelectedWork(newWork);
    setSelectedPieceId(libraryIndex[selectedAuthor][newWork][0].id);
  };

  const pickPiece = (rand) => {
    const authors = Object.keys(libraryIndex);
    const author = authors[Math.floor(rand() * authors.length)];
    const works = Object.keys(libraryIndex[author]);
    const work = works[Math.floor(rand() * works.length)];
    const pieces = libraryIndex[author][work];
    const piece = pieces[Math.floor(rand() * pieces.length)];
    setSelectedAuthor(author);
    setSelectedWork(work);
    setSelectedPieceId(piece.id);
    fetchAuthorData(author);
  };

  const loadRandomTimeAttack = () => {
    if (libraryIndex) pickPiece(Math.random);
  };

  const loadDailyChallenge = () => {
    if (libraryIndex) pickPiece(seededRandom(laDate()));
  };

  const canSaveScore = testMode === 'passage' || testMode === 'time' || testMode === 'daily';

  const saveScore = async () => {
    const name = playerName.trim();
    if (!name || isSaving || scoreSaved || stats.wpm === 0) return;
    setIsSaving(true);
    setSaveError('');
    localStorage.setItem('latintype_name', name);
    try {
      if (testMode === 'daily') {
        const dailyScore = Math.round(stats.wpm * Math.pow(stats.acc / 100, 1.5) * 10);
        const scoreRef = doc(db, 'daily_leaderboards', laDate(), 'scores', name.toLowerCase());
        const scoreSnap = await getDoc(scoreRef);
        if (!scoreSnap.exists() || scoreSnap.data().score < dailyScore) {
          await setDoc(scoreRef, { name, score: dailyScore, wpm: stats.wpm, acc: stats.acc, timestamp: serverTimestamp() });
        }
      } else {
        await addDoc(collection(db, "scores"), {
          name,
          wpm: stats.wpm,
          acc: stats.acc,
          mode: testMode,
          duration: testMode === 'time' ? timeLimit : null,
          passage: testMode === 'passage' ? `${selectedAuthor} - ${selectedWork}` : null,
          date: new Date().toISOString(),
          timestamp: new Date()
        });
      }
      setScoreSaved(true);
    } catch (err) {
      console.error(err);
      setSaveError('could not save. check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // reset engine helper
  const resetTest = (newLines = lines) => {
    resetEngine(newLines);
    setTimeRemaining(testMode === 'time' ? timeLimit : null);
    setScoreSaved(false);
    setIsSaving(false);
    setSaveError('');
    setShowMenus(false);
    if (inputRef.current) inputRef.current.focus();
  };

  // parse text when piece changes
  useEffect(() => {
    if (isFetchingAuthor || !activeAuthorData.length) return;

    const selectedPassage = activeAuthorData.find(p => p.id === selectedPieceId);
    if (!selectedPassage) return;

    let rawLines = selectedPassage.text.split('\n');
    let rawScansion = selectedPassage.scansion;
    const totalLines = rawLines.length;
    let offset = 0;

    // detect piece change
    if (loadedPieceId !== selectedPieceId) {
      setLoadedPieceId(selectedPieceId);
      setLineRange({ start: 1, end: totalLines, max: totalLines });
      return;
    }

    if (testMode === 'time') {
      const minLinesNeeded = 20;
      if (rawLines.length > minLinesNeeded) {
        const maxStartIndex = rawLines.length - minLinesNeeded;
        offset = Math.floor(Math.random() * (maxStartIndex + 1));
        rawLines = rawLines.slice(offset);
        if (rawScansion) rawScansion = rawScansion.slice(offset);
      }
    } else if (testMode === 'passage') {
      const sIndex = Math.max(0, lineRange.start - 1);
      const eIndex = Math.min(totalLines, lineRange.end);
      if (eIndex > sIndex) {
        offset = sIndex;
        rawLines = rawLines.slice(sIndex, eIndex);
        if (rawScansion) rawScansion = rawScansion.slice(sIndex, eIndex);
      }
    } else if (testMode === 'daily') {
      const rand = seededRandom(laDate());
      const maxStartIndex = Math.max(0, rawLines.length - 20);
      offset = Math.floor(rand() * (maxStartIndex + 1));
      rawLines = rawLines.slice(offset, offset + 20);
      if (rawScansion) rawScansion = rawScansion.slice(offset, offset + 20);
    }

    let globalIdx = 0;
    const parsedLines = rawLines.map((lineStr, lIdx) => {
      const words = lineStr.trim().split(' ').filter(w => w.length > 0).map(word => {
        const wordObj = { word, globalIdx };
        globalIdx++;
        return wordObj;
      });
      return { words, scansion: rawScansion ? rawScansion[lIdx] : null };
    });

    setLineOffset(offset);
    resetTest(parsedLines);
  }, [selectedPieceId, activeAuthorData, isFetchingAuthor, testMode, loadedPieceId, lineRange.start, lineRange.end]);

  // live timer
  useEffect(() => {
    if (!startTime || isFinished) return;
    const interval = setInterval(() => {
      const timeElapsedMs = Date.now() - startTime;
      engineDispatch({ type: 'COMPUTE_STATS', payload: { timeElapsedMs } });

      if (testMode === 'time' || testMode === 'daily') {
        const remaining = Math.max(0, timeLimit - Math.floor(timeElapsedMs / 1000));
        setTimeRemaining(remaining);
        if (remaining <= 0) {
          engineDispatch({ type: 'FINISH' });
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, isFinished, testMode, timeLimit]);

  const ready = !isAppLoading && Boolean(libraryIndex);

  // fit the longest line to the screen rather than clipping it
  useEffect(() => {
    if (!stageRef.current) return;
    const observer = new ResizeObserver(([entry]) => setStageWidth(entry.contentRect.width));
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, [ready]);

  const playClickSound = () => {
    if (volume === 0) return;
    const click = new Audio('/click.mp3');
    click.volume = volume;
    click.playbackRate = 0.95 + Math.random() * 0.1;
    click.preservesPitch = false;
    click.play().catch(() => { });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setShowMenus(true);
      // also releases the keyboard, so Tab can reach the menus
      inputRef.current?.blur();
      return;
    }

    if (e.key === 'Tab' && startTime) {
      e.preventDefault();
      tabArmed.current = true;
      return;
    }
    if (e.key === 'Enter' && tabArmed.current) {
      e.preventDefault();
      tabArmed.current = false;
      resetTest();
      return;
    }
    tabArmed.current = false;

    if (isFinished && testMode === 'zen' && e.key === ' ') {
      e.preventDefault();
      const pieces = libraryIndex[selectedAuthor][selectedWork];
      const currentIndex = pieces.findIndex(p => p.id === selectedPieceId);
      if (currentIndex !== -1 && currentIndex + 1 < pieces.length) {
        setSelectedPieceId(pieces[currentIndex + 1].id);
      } else {
        pickPiece(Math.random);
      }
      return;
    }

    rawHandleKeyDown(e, {
      isBlocked: isFinished || isFetchingAuthor || isAppLoading,
      onChar: () => { setShowMenus(false); playClickSound(); },
      onSpace: () => playClickSound(),
      onBackspace: () => playClickSound()
    });
  };

  const focusInput = (e) => {
    if (e.target.closest('button, [role=listbox], input, a') || isFinished) return;
    if (inputRef.current) inputRef.current.focus();
  };

  if (!ready) {
    return <p className="py-8">loading library...</p>;
  }

  // virtualization math RAHHHHHHHHH
  const activeLineIndex = lines.findIndex(line => line.words.some(w => w.globalIdx === wordIndex));
  const safeActiveLineIndex = activeLineIndex !== -1 ? activeLineIndex : (lines.length > 0 ? lines.length - 1 : 0);
  const scrollOffset = safeActiveLineIndex > 0 ? safeActiveLineIndex - 1 : 0;

  const longestLine = lines.reduce((max, line) => Math.max(max, line.words.map(w => w.word).join(' ').length), 1);
  const verseSize = Math.max(11, Math.min(fontSize, (stageWidth - 8) / ((longestLine + 2) * font.adv)));
  const lineHeightPx = verseSize * 2.4;
  const viewportHeightPx = lineHeightPx * 4;
  const translateY = `-${scrollOffset * lineHeightPx}px`;

  const renderStart = Math.max(0, safeActiveLineIndex - 2);
  const renderEnd = Math.min(lines.length, safeActiveLineIndex + 4);
  const visibleLines = lines.slice(renderStart, renderEnd);

  // menu arrays
  const uniqueAuthors = Object.keys(libraryIndex);
  const availableWorks = Object.keys(libraryIndex[selectedAuthor]);
  const availablePieces = libraryIndex[selectedAuthor][selectedWork];

  const lineLabel = lines.length ? `${safeActiveLineIndex + 1}/${lines.length}` : '-';
  const hasScansion = lines.some(l => l.scansion);

  return (
    <main className="mt-3" onClick={focusInput}>
      <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 ${focused ? 'invisible' : ''}`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {testMode === 'passage' || testMode === 'zen' ? (
            <>
              <Select label="author" className="max-w-[22ch]" value={selectedAuthor} onChange={handleAuthorChange} options={uniqueAuthors.map(a => ({ value: a, label: a }))} />
              <span className="text-dim" aria-hidden="true">/</span>
              <Select label="work" className="max-w-[26ch]" value={selectedWork} onChange={handleWorkChange} options={availableWorks.map(w => ({ value: w, label: w }))} />
              {availablePieces.length > 1 && (
                <>
                  <span className="text-dim" aria-hidden="true">/</span>
                  <Select label="piece" className="max-w-[26ch]" value={selectedPieceId} onChange={setSelectedPieceId} options={availablePieces.map(p => ({ value: p.id, label: p.piece }))} />
                </>
              )}
              {testMode === 'passage' && (
                <span className="ml-2 flex items-center gap-1">
                  lines
                  <input
                    aria-label="first line" type="number" min="1" max={lineRange.max} value={lineRange.start}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 1;
                      setLineRange(prev => ({ ...prev, start: Math.min(val, prev.end) }));
                    }}
                    className="field w-[6ch] text-center"
                  />
                  -
                  <input
                    aria-label="last line" type="number" min="1" max={lineRange.max} value={lineRange.end}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || lineRange.max;
                      setLineRange(prev => ({ ...prev, end: Math.max(val, prev.start) }));
                    }}
                    className="field w-[6ch] text-center"
                  />
                </span>
              )}
            </>
          ) : testMode === 'time' ? (
            <>
              <span className="text-ink">{selectedAuthor} / {selectedWork}</span>
              <Select
                label="duration" value={timeLimit}
                onChange={(limit) => { setTimeLimit(limit); setTimeRemaining(limit); }}
                options={[30, 60, 120].map(s => ({ value: s, label: `${s}s` }))}
              />
              <button className="btn ml-2" onClick={loadRandomTimeAttack}>new text</button>
            </>
          ) : (
            <span className="text-ink">{selectedAuthor} / {selectedWork}</span>
          )}
        </div>

        <div className="flex flex-wrap gap-1" role="group" aria-label="mode">
          {MODES.map(([mode, label]) => (
            <button
              key={mode}
              className={`tab ${testMode === mode ? 'on' : ''}`}
              aria-pressed={testMode === mode}
              onClick={() => {
                setTestMode(mode);
                if (mode === 'time') loadRandomTimeAttack();
                else if (mode === 'daily') loadDailyChallenge();
                else resetTest();
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <input
        ref={inputRef}
        type="text"
        aria-label="type the Latin text here"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="absolute h-px w-px opacity-0"
        value={currentInput}
        onChange={(e) => {
          // phone keyboards send no usable keydown for space, and autocomplete can insert whole words
          const parts = e.target.value.split(' ');
          const last = parts.pop();
          parts.forEach(part => {
            engineDispatch({ type: 'SET_INPUT', payload: part });
            engineDispatch({ type: 'SPACE_PRESSED' });
          });
          engineDispatch({ type: 'SET_INPUT', payload: last });
        }}
        onKeyDown={handleKeyDown}
        autoFocus
      />

      <div ref={stageRef} className="mt-4">
        {isFinished ? (
          <Pane title="result">
            <div className="py-2">
              <p className="text-ink text-[1.5em] font-semibold">
                {(testMode === 'time' || testMode === 'daily') && timeRemaining <= 0 ? "time's up" : 'passage finished'}
              </p>

              {testMode === 'zen' ? (
                <p className="mt-2">press space for the next passage.</p>
              ) : (
                <>
                  <dl className="my-4 flex gap-10">
                    <div><dt>wpm</dt><dd className="text-[2.5em] leading-none text-ink">{stats.wpm}</dd></div>
                    <div><dt>accuracy</dt><dd className="text-[2.5em] leading-none text-ink">{stats.acc}%</dd></div>
                  </dl>

                  {canSaveScore && stats.wpm > 0 && (
                    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); saveScore(); }}>
                      <label htmlFor="score-name">name</label>
                      <input
                        id="score-name" className="field w-[22ch]" maxLength={20}
                        value={playerName} onChange={(e) => setPlayerName(e.target.value)}
                        disabled={scoreSaved || isSaving}
                      />
                      <button className="btn" type="submit" disabled={!playerName.trim() || scoreSaved || isSaving}>
                        {isSaving ? 'saving...' : scoreSaved ? 'saved' : 'save score'}
                      </button>
                    </form>
                  )}
                  {saveError && <p className="mt-1 text-mark" role="alert">{saveError}</p>}

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button className="btn" onClick={() => resetTest()}>restart</button>
                    {testMode === 'time' && <button className="btn" onClick={loadRandomTimeAttack}>new text</button>}
                  </div>
                </>
              )}
            </div>
          </Pane>
        ) : (
          <div
            className="relative select-none overflow-hidden"
            style={{ height: `${viewportHeightPx + 24}px`, fontSize: `${verseSize}px`, fontFamily, paddingTop: 24 }}
            lang="la"
          >
            {isFetchingAuthor && <p className="absolute inset-0 z-10 bg-paper font-mono text-sm">loading text...</p>}
            <div
              className="absolute left-0 top-6 w-full transition-transform duration-150 ease-out"
              style={{ transform: `translateY(${translateY})`, height: `${lines.length * lineHeightPx}px` }}
            >
              {visibleLines.map((lineObj, relativeIdx) => {
                const lIdx = renderStart + relativeIdx;
                const distance = lIdx - safeActiveLineIndex;
                const hidden = distance < -1 || distance > 2;

                return (
                  <div
                    key={lIdx}
                    className={`absolute left-[1ch] flex flex-nowrap items-center whitespace-nowrap ${hidden ? 'invisible' : ''}`}
                    style={{ top: `${lIdx * lineHeightPx}px`, height: `${lineHeightPx}px` }}
                  >
                    {lineObj.words.map((wObj, wIdx) => {
                      const { word, globalIdx } = wObj;
                      const isCurrentWord = globalIdx === wordIndex;
                      const isPastWord = globalIdx < wordIndex;
                      const userTypedWord = isPastWord ? typedHistory[globalIdx] : (isCurrentWord ? currentInput : '');
                      const wordScansion = lineObj.scansion?.[wIdx] || "";
                      const vowelIndices = getVowelIndices(word, wordScansion);
                      const nextWordScansion = lineObj.scansion?.[wIdx + 1] || "";
                      const doesElideForward = wordScansion.endsWith(' ') || nextWordScansion.startsWith(' ');

                      return (
                        <span
                          key={globalIdx}
                          className={`relative inline-block ${testMode === 'zen' ? 'cursor-pointer hover:bg-bar' : ''} ${wIdx !== lineObj.words.length - 1 ? 'mr-[1ch]' : ''}`}
                          onClick={testMode === 'zen' ? () => setSelectedWord(word) : undefined}
                          title={testMode === 'zen' ? "click to look up" : undefined}
                        >
                          {showScansion && doesElideForward && distance === 0 && (
                            <svg className="pointer-events-none absolute bottom-[-0.2em] right-[-0.8em] h-[0.5em] w-[1.2em] text-dim" viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden="true">
                              <path d="M 10 15 Q 50 45 90 15" fill="none" stroke="currentColor" strokeWidth="6" />
                            </svg>
                          )}
                          {word.split('').map((char, cIdx) => {
                            const expectedChar = normalizeChar(char);
                            const isTyped = isPastWord || (isCurrentWord && cIdx < userTypedWord.length);
                            const isWrong = isTyped && userTypedWord[cIdx] !== expectedChar;
                            const isCaret = isCurrentWord && cIdx === currentInput.length;

                            const tone = isWrong ? 'err'
                              : isCaret ? `cur-${cursorStyle} ${cursorStyle === 'block' ? '' : 'text-sub'}`
                              : isTyped ? 'text-ink'
                              : distance < 0 ? 'text-dim'
                              : 'text-sub';

                            const vowelSignIdx = vowelIndices.indexOf(cIdx);
                            const symbol = vowelSignIdx !== -1 ? wordScansion[vowelSignIdx] : null;
                            const isDiphthong = symbol ? isDiphthongStart(word, cIdx, vowelIndices) : false;

                            return (
                              <span key={cIdx} className={`verse-cell ${tone}`}>
                                {showScansion && distance === 0 && symbol && symbol !== ' ' && (
                                  <span className="mark-sign" style={{ left: isDiphthong ? '100%' : '50%' }} aria-hidden="true">
                                    {toAsciiMark(symbol)}
                                  </span>
                                )}
                                {char}
                              </span>
                            );
                          })}
                          {userTypedWord.length > word.length && <span className="err">{userTypedWord.slice(word.length)}</span>}
                          {isCurrentWord && currentInput.length >= word.length && (
                            // sits in the gap after the word, so the next word stays put
                            <span className={`absolute left-full top-0 cur-${cursorStyle}`} aria-hidden="true">&nbsp;</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className={`mt-4 grid gap-0 md:grid-cols-[2fr_1fr] ${focused ? 'invisible' : ''}`}>
        <Pane title="scansion map">
          <div className="overflow-hidden py-1 whitespace-pre">
            {!showScansion ? (
              <p>scansion is off.</p>
            ) : !hasScansion ? (
              <p>no scansion for this text.</p>
            ) : (
              lines.slice(safeActiveLineIndex, safeActiveLineIndex + 3).map((line, i) => (
                <div key={safeActiveLineIndex + i}>
                  <span className={i === 0 ? 'text-ink font-semibold' : 'text-dim'}>
                    {i === 0 ? '> ' : '  '}{String(lineOffset + safeActiveLineIndex + i + 1).padStart(4)}
                  </span>
                  <span className={i === 0 ? 'ml-[2ch] text-mark font-semibold' : 'ml-[2ch]'}>{linePattern(line.scansion)}</span>
                </div>
              ))
            )}
          </div>
        </Pane>
        <Pane title="run">
          <div className="py-1">
            <div>wpm <span className="text-ink font-semibold">{stats.wpm}</span>   acc <span className="text-ink font-semibold">{stats.acc}%</span></div>
            <div>line <span className="text-ink font-semibold">{lineLabel}</span>{timeRemaining !== null && <>   time <span className="text-ink font-semibold">{timeRemaining}s</span></>}</div>
            <button className="btn" aria-pressed={showScansion} onClick={() => setShowScansion(!showScansion)}>scansion: {showScansion ? 'on' : 'off'}</button>
          </div>
        </Pane>
      </div>

      <div className="status mt-2">
        {focused ? (
          <>
            <span>{stats.wpm} wpm   {stats.acc}%   line {lineLabel}{timeRemaining !== null ? `   ${timeRemaining}s` : ''}</span>
            <span>[esc] show menus</span>
          </>
        ) : (
          <>
            <span>[latintype] {selectedAuthor} / {selectedWork}</span>
            <span>[space] next word   [tab][enter] restart</span>
          </>
        )}
      </div>

      <DictionaryPopup word={selectedWord} onClose={() => setSelectedWord(null)} />
    </main>
  );
}
