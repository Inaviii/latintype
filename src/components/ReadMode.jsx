import React, { useState, useEffect, useRef } from 'react';
import DictionaryPopup from './DictionaryPopup';
import { lookupWord } from '../lib/DictionaryService';
import { Pane, Mark, Letter } from './ascii';
import Select from './Select';
import { useSettings } from '../contexts/SettingsContext';

const POS_BRUSHES = [['V', 'verb'], ['N', 'noun'], ['ADJ', 'adjective'], ['ADV', 'adverb'], ['PRON', 'pronoun'], ['PREP', 'prep/conj']];
const STROKE_COLORS = ['#dba184', '#8fc1c9', '#b9cf8f', '#c8a2e8', '#e0c36a', '#8f958d'];

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const normalizeChar = (char) => char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

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

export default function ReadMode() {
  const [libraryIndex, setLibraryIndex] = useState(null);
  const [activeAuthorData, setActiveAuthorData] = useState(null);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [isFetchingAuthor, setIsFetchingAuthor] = useState(false);
  const [selectedWord, setSelectedWord] = useState(null);

  // cascades
  const [selectedAuthor, setSelectedAuthor] = useState('');
  const [selectedWork, setSelectedWork] = useState('');
  const [selectedPieceId, setSelectedPieceId] = useState('');
  const [lineRange, setLineRange] = useState({ start: 1, end: 1, max: 1 });
  const [loadedPieceId, setLoadedPieceId] = useState(null);

  // content
  const [lines, setLines] = useState([]);
  const textContainerRef = useRef(null);

  // styling
  const { fontFamily, font, fontSize, showScansion, setShowScansion } = useSettings();
  // reading is a page rather than one line in focus, so it stays a little smaller than typing
  const readSize = Math.min(fontSize, 26) * (font.scale ?? 1);

  // syntax highlighting
  const [syntaxMode, setSyntaxMode] = useState(false);
  const [selectedBrush, setSelectedBrush] = useState(null);
  const [syntaxCache, setSyntaxCache] = useState({});

  // annotations
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [annotateTool, setAnnotateTool] = useState('highlighter'); // 'highlighter', 'pen', 'eraser'
  const [strokeColor, setStrokeColor] = useState(STROKE_COLORS[0]);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [exportError, setExportError] = useState('');
  const [strokeWidth, setStrokeWidth] = useState(15);
  const [isDrawing, setIsDrawing] = useState(false);

  const canvasRef = useRef(null);
  const canvasContainerRef = useRef(null);
  
  // Track strokes for uniform transparency and redraws
  const strokesRef = useRef([]);
  const currentStrokeRef = useRef(null);



  // batch fetch syntax for all visible words
  useEffect(() => {
    if (!syntaxMode || !lines.length) return;
    
    const fetchSyntax = async () => {
      const storedOverrides = JSON.parse(localStorage.getItem('latintype_syntax_overrides') || '{}');
      const newCache = { ...syntaxCache };
      let updated = false;
      
      const wordsToLookup = new Set();
      lines.forEach(line => {
        line.words.forEach(word => {
          const clean = word.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z]/g, '').toLowerCase();
          if (clean && !newCache[clean]) {
            if (storedOverrides[clean]) {
              newCache[clean] = storedOverrides[clean];
              updated = true;
            } else {
              wordsToLookup.add(clean);
            }
          }
        });
      });
      
      if (wordsToLookup.size === 0 && !updated) return;

      for (const word of wordsToLookup) {
        try {
          const res = await lookupWord(word);
          if (res && (res.results.length > 0 || res.uniqueResults.length > 0 || (res.addonResults && res.addonResults.length > 0))) {
            const allResults = [...res.results, ...res.uniqueResults, ...(res.addonResults?.[0]?.baseResults || [])];
            
            allResults.sort((a, b) => {
              const freqOrder = { 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 6, 'I': 7, 'M': 8, 'N': 9, 'X': 10 };
              const fA = freqOrder[a.de?.tran?.freq] || 99;
              const fB = freqOrder[b.de?.tran?.freq] || 99;
              if (fA !== fB) return fA - fB;
              
              const posA = a.de?.part?.pofs;
              const posB = b.de?.part?.pofs;
              if (posA === 'V' && posB !== 'V') return -1;
              if (posB === 'V' && posA !== 'V') return 1;
              return 0;
            });
            
            newCache[word] = allResults[0]?.de?.part?.pofs || 'UNKNOWN';
          } else {
            newCache[word] = 'UNKNOWN';
          }
          updated = true;
        } catch (e) {
          console.warn('Syntax lookup failed for', word);
        }
      }
      
      if (updated) {
        setSyntaxCache(newCache);
      }
    };
    
    fetchSyntax();
  }, [syntaxMode, lines]);

  const getSyntaxColor = (word) => {
    if (!syntaxMode) return '';
    const clean = word.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z]/g, '').toLowerCase();
    const pos = syntaxCache[clean];
    if (!pos || pos === 'UNKNOWN') return '';
    
    return POS_BRUSHES.some(([p]) => p === pos) || pos === 'CONJ' ? `pos-${pos}` : '';
  };

  // canvas resize observer
  useEffect(() => {
    if (!canvasContainerRef.current || !canvasRef.current) return;
    const resizeCanvas = () => {
      const container = canvasContainerRef.current;
      const canvas = canvasRef.current;
      
      if (!container || !canvas) return; // Prevent crash if unmounted
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let data = null;
      try {
        data = canvas.width > 0 && canvas.height > 0 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
      } catch (e) {
        console.warn("Canvas is too large to save image data during resize.", e);
      }
      
      canvas.width = container.scrollWidth;
      canvas.height = container.scrollHeight;
      canvas.style.width = `${container.scrollWidth}px`;
      // Restore drawing data from stroke history instead of image data to maintain high quality on resize
      redrawCanvas();
    };

    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(canvasContainerRef.current);
    return () => observer.disconnect();
  }, [lines, fontSize, showScansion, isAnnotating]); // Re-sync when layout might change

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const drawStroke = (stroke) => {
      if (!stroke.points || stroke.points.length === 0) return;
      
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = stroke.width;
      
      if (stroke.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.globalAlpha = 1.0;
      } else {
        // 'multiply' doesn't look great on dark themes, so we use standard alpha blending
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = stroke.color;
        ctx.globalAlpha = stroke.tool === 'highlighter' ? 0.4 : 1.0;
      }
      ctx.stroke();
    };

    strokesRef.current.forEach(drawStroke);
    if (currentStrokeRef.current) {
      drawStroke(currentStrokeRef.current);
    }
  };

  // drawing methods
  const startDrawing = (e) => {
    if (!isAnnotating) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    
    setIsDrawing(true);
    
    currentStrokeRef.current = {
      tool: annotateTool,
      color: strokeColor,
      width: strokeWidth,
      points: [{ x: e.clientX - rect.left, y: e.clientY - rect.top }]
    };
    
    redrawCanvas();
  };

  const draw = (e) => {
    if (!isDrawing || !isAnnotating || !currentStrokeRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    
    currentStrokeRef.current.points.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    redrawCanvas();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    
    if (currentStrokeRef.current) {
      strokesRef.current.push(currentStrokeRef.current);
      currentStrokeRef.current = null;
    }
  };

  const handleUndo = () => {
    if (strokesRef.current.length > 0) {
      strokesRef.current.pop();
      redrawCanvas();
    }
  };

  // Keyboard shortcut for Undo
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (isAnnotating) {
          e.preventDefault();
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAnnotating]);

  const exportLaTeX = () => {
    let texContent = `\\documentclass[12pt,a4paper]{article}\n`;
    texContent += `\\usepackage[utf8]{inputenc}\n`;
    texContent += `\\usepackage[T1]{fontenc}\n`;
    texContent += `\\usepackage{lmodern}\n`;
    texContent += `\\usepackage{xcolor}\n`;
    texContent += `\\usepackage[margin=1.5in]{geometry}\n`;
    texContent += `\\usepackage{setspace}\n\\onehalfspacing\n`;
    texContent += `\\definecolor{pagebg}{HTML}{${cssVar('--bg').slice(1)}}\n`;
    texContent += `\\definecolor{pagetext}{HTML}{${cssVar('--text').slice(1)}}\n`;
    texContent += `\\pagecolor{pagebg}\n`;
    texContent += `\\color{pagetext}\n\n`;

    const posToHex = {
      'V': cssVar('--pos-v'),
      'N': cssVar('--pos-n'),
      'ADJ': cssVar('--pos-adj'),
      'ADV': cssVar('--pos-adv'),
      'PRON': cssVar('--pos-pron'),
      'PREP': cssVar('--dim'),
      'CONJ': cssVar('--dim')
    };

    const usedColors = new Set();
    const cleanWordToColor = {};

    lines.forEach(line => {
      line.words.forEach(w => {
        const clean = w.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z]/g, '').toLowerCase();
        const pos = syntaxCache[clean];
        if (pos && pos !== 'UNKNOWN' && posToHex[pos]) {
          usedColors.add(posToHex[pos]);
          cleanWordToColor[clean] = posToHex[pos];
        }
      });
    });

    const colorMap = {};
    let colorIdx = 1;
    usedColors.forEach(hex => {
      const colorName = `syntaxColor${colorIdx++}`;
      colorMap[hex] = colorName;
      const cleanHex = hex.replace('#', '');
      texContent += `\\definecolor{${colorName}}{HTML}{${cleanHex}}\n`;
    });

    texContent += `\n\\title{${selectedAuthor} - ${selectedWork}}\n`;
    texContent += `\\date{}\n`;
    texContent += `\\begin{document}\n`;
    texContent += `\\maketitle\n\n`;
    texContent += `\\begin{flushleft}\n`;

    lines.forEach(line => {
      let lineTex = "";
      line.words.forEach(w => {
        const clean = w.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z]/g, '').toLowerCase();
        const pos = syntaxCache[clean];
        if (pos && pos !== 'UNKNOWN' && posToHex[pos]) {
          const cName = colorMap[posToHex[pos]];
          lineTex += `\\textcolor{${cName}}{${w}} `;
        } else {
          lineTex += `${w} `;
        }
      });
      texContent += lineTex.trim() + ` \\\\\n`;
    });

    texContent += `\\end{flushleft}\n`;
    texContent += `\n\\end{document}\n`;

    const blob = new Blob([texContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `latintype_annotated_${selectedAuthor}_${selectedWork}.tex`.replace(/\s+/g, '_');
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    const container = canvasContainerRef.current;
    if (!container) return;
    setExportError('');
    
    try {
      const html2canvasModule = await import('html2canvas-pro');
      const html2canvas = html2canvasModule.default ? html2canvasModule.default : html2canvasModule;
      
      const jsPDFModule = await import('jspdf');
      const jsPDF = jsPDFModule.jsPDF ? jsPDFModule.jsPDF : jsPDFModule.default;

      const canvas = await html2canvas(container, {
        backgroundColor: cssVar('--bg'),
        scale: 1,
        useCORS: true,
        onclone: (documentClone) => {
          const style = documentClone.createElement('style');
          style.innerHTML = `
            @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville&display=swap');
            .canvas-container {
              font-family: 'Libre Baskerville', serif !important;
              text-align: left !important;
              line-height: 1.8 !important;
              padding: 60px !important;
              max-width: none !important;
              margin: 0 !important;
            }
          `;
          documentClone.head.appendChild(style);
          const exportTarget = documentClone.querySelector('[data-export-target="true"]');
          if (exportTarget) exportTarget.classList.add('canvas-container');
        }
      });
      
      const imgData = canvas.toDataURL('image/jpeg', 0.9);
      
      const pdf = new jsPDF('p', 'pt', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      
      const ratio = pdfWidth / canvasWidth;
      const scaledHeight = canvasHeight * ratio;
      
      let heightLeft = scaledHeight;
      let position = 0;
      
      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, scaledHeight);
      heightLeft -= pdfHeight;
      
      while (heightLeft > 0) {
        position = heightLeft - scaledHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, scaledHeight);
        heightLeft -= pdfHeight;
      }
      
      pdf.save(`latintype_reading_${selectedAuthor}.pdf`);
    } catch (e) {
      console.error("PDF Export failed", e);
      setExportError('could not make the pdf. try fewer lines.');
    }
  };

  // fetch index on mount
  useEffect(() => {
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

  useEffect(() => {
    if (loadedPieceId) {
      localStorage.setItem(`read_start_${loadedPieceId}`, lineRange.start);
      localStorage.setItem(`read_end_${loadedPieceId}`, lineRange.end);
    }
  }, [lineRange.start, lineRange.end, loadedPieceId]);

  const fetchAuthorData = (authorName) => {
    setIsFetchingAuthor(true);
    const safeFilename = authorName.toLowerCase().replace(/ /g, "_") + ".json";

    fetch(`/library/${safeFilename}?nocache=${new Date().getTime()}`)
      .then(res => res.json())
      .then(data => {
        setActiveAuthorData(data);
        setIsFetchingAuthor(false);
        setIsAppLoading(false);
      });
  };

  const handleAuthorChange = (newAuthor) => {
    setSelectedAuthor(newAuthor);
    const firstWork = Object.keys(libraryIndex[newAuthor])[0];
    setSelectedWork(firstWork);
    setSelectedPieceId(libraryIndex[newAuthor][firstWork][0].id);
    fetchAuthorData(newAuthor);
  };

  const handleWorkChange = (newWork) => {
    setSelectedWork(newWork);
    setSelectedPieceId(libraryIndex[selectedAuthor][newWork][0].id);
  };

  // Build the text whenever the selection changes
  useEffect(() => {
    if (!libraryIndex || !activeAuthorData || !selectedAuthor || !selectedWork || !selectedPieceId || isFetchingAuthor) return;

    const piece = activeAuthorData.find(p => p.id === selectedPieceId);
    if (!piece) return;

    const rawLines = piece.text.split('\n');
    const rawScansion = piece.scansion || [];
    const totalLines = rawLines.length;

    if (loadedPieceId !== selectedPieceId) {
      setLoadedPieceId(selectedPieceId);
      const savedStart = parseInt(localStorage.getItem(`read_start_${selectedPieceId}`));
      const savedEnd = parseInt(localStorage.getItem(`read_end_${selectedPieceId}`));
      setLineRange({ 
        start: savedStart || 1, 
        end: savedEnd || totalLines, 
        max: totalLines 
      });
      if (textContainerRef.current) textContainerRef.current.scrollTop = 0;
      return; // wait for next render with updated lineRange
    }

    const startIdx = Math.max(0, lineRange.start - 1);
    const endIdx = Math.min(totalLines, lineRange.end);

    const activeLines = rawLines.slice(startIdx, endIdx);
    const activeScansion = rawScansion.length ? rawScansion.slice(startIdx, endIdx) : [];

    setLines(activeLines.map((lineStr, lIdx) => ({
      text: lineStr,
      words: lineStr.trim().split(' ').filter(w => w.length > 0),
      scansion: activeScansion[lIdx] || null
    })));
  }, [libraryIndex, activeAuthorData, selectedPieceId, lineRange.start, lineRange.end, isFetchingAuthor, selectedAuthor, selectedWork, loadedPieceId]);



  if (isAppLoading || !libraryIndex) {
    return <p className="py-8">loading library...</p>;
  }

  const uniqueAuthors = Object.keys(libraryIndex);
  const availableWorks = Object.keys(libraryIndex[selectedAuthor]);
  const availablePieces = libraryIndex[selectedAuthor][selectedWork];

  return (
    <main className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Select label="author" className="max-w-[22ch]" value={selectedAuthor} onChange={handleAuthorChange} options={uniqueAuthors.map(a => ({ value: a, label: a }))} />
          <span className="text-dim" aria-hidden="true">/</span>
          <Select label="work" className="max-w-[26ch]" value={selectedWork} onChange={handleWorkChange} options={availableWorks.map(w => ({ value: w, label: w }))} />
          {availablePieces.length > 1 && (
            <>
              <span className="text-dim" aria-hidden="true">/</span>
              <Select label="piece" className="max-w-[26ch]" value={selectedPieceId} onChange={setSelectedPieceId} options={availablePieces.map(p => ({ value: p.id, label: p.piece }))} />
            </>
          )}
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
        </div>

        <div className="flex flex-wrap gap-1">
          <button className={`tab ${showScansion ? 'on' : ''}`} aria-pressed={showScansion} onClick={() => setShowScansion(!showScansion)}>scansion</button>
          <button className={`tab ${syntaxMode ? 'on' : ''}`} aria-pressed={syntaxMode} onClick={() => setSyntaxMode(!syntaxMode)} title="colour words by part of speech">parts of speech</button>
          <button className={`tab ${isAnnotating ? 'on' : ''}`} aria-pressed={isAnnotating} onClick={() => setIsAnnotating(!isAnnotating)}>annotate</button>
        </div>
      </div>

      {syntaxMode && (
        <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1">
          <span className="mr-2 text-dim">paint:</span>
          {POS_BRUSHES.map(([pos, label]) => (
            <button
              key={pos}
              className={`tab pos-${pos} ${selectedBrush === pos ? 'on' : ''}`}
              aria-pressed={selectedBrush === pos}
              onClick={() => setSelectedBrush(selectedBrush === pos ? null : pos)}
            >
              {label}
            </button>
          ))}
          <span className="ml-2 text-dim">{selectedBrush ? 'click a word to paint it.' : 'pick one to correct a word.'}</span>
        </div>
      )}

      {isAnnotating && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <button className="btn" onClick={handleUndo} title="ctrl+z">undo</button>
          {['highlighter', 'pen', 'eraser'].map(tool => (
            <button key={tool} className={`tab ${annotateTool === tool ? 'on' : ''}`} aria-pressed={annotateTool === tool} onClick={() => setAnnotateTool(tool)}>{tool}</button>
          ))}
          <span className="flex items-center gap-1">
            {STROKE_COLORS.map(color => (
              <button
                key={color}
                className="h-5 w-5 cursor-pointer"
                style={{ backgroundColor: color, outline: strokeColor === color ? '2px solid var(--text)' : 'none', outlineOffset: 1 }}
                onClick={() => setStrokeColor(color)}
                aria-label={`stroke colour ${color}`}
                aria-pressed={strokeColor === color}
              />
            ))}
          </span>
          <label className="flex items-center gap-2">
            width
            <input type="range" min="2" max="40" value={strokeWidth} onChange={(e) => setStrokeWidth(parseInt(e.target.value))} className="w-24" style={{ accentColor: 'var(--mark)' }} />
          </label>
          {confirmingClear ? (
            <span className="flex items-center gap-2">
              clear all?
              <button className="btn" onClick={() => { strokesRef.current = []; redrawCanvas(); setConfirmingClear(false); }}>yes, clear</button>
              <button className="btn" onClick={() => setConfirmingClear(false)}>no</button>
            </span>
          ) : (
            <button className="btn" onClick={() => setConfirmingClear(true)}>clear</button>
          )}
          <button className="btn" onClick={exportLaTeX}>save latex</button>
          <button className="btn" onClick={exportPDF}>save pdf</button>
          {exportError && <span className="text-mark" role="alert">{exportError}</span>}
        </div>
      )}

      <div className="mt-3">
        <Pane title={`${selectedAuthor} / ${selectedWork}${availablePieces.length > 1 ? ` / ${availablePieces.find(p => p.id === selectedPieceId)?.piece ?? ''}` : ''}`}>
          {isFetchingAuthor ? (
            <p className="py-6">loading text...</p>
          ) : (
            <div ref={textContainerRef} className={`relative overflow-x-auto py-2 ${isAnnotating ? 'cursor-crosshair' : ''}`}>
              <div className="relative w-full" ref={canvasContainerRef} data-export-target="true">
                <canvas
                  ref={canvasRef}
                  className={`absolute left-0 top-0 z-20 ${isAnnotating ? 'pointer-events-auto' : 'pointer-events-none'}`}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                />

                <div className="relative z-0 text-ink" lang="la" style={{ fontSize: `${readSize / 16}rem`, fontFamily }}>
                  {lines.map((lineObj, i) => (
                    <p key={i} className={`flex items-center py-1 ${i % 5 === 4 ? 'mb-4' : ''}`}>
                      <span className="mr-4 w-[4ch] shrink-0 select-none text-right font-mono text-xs text-dim">{lineRange.start + i}</span>
                      <span className="flex flex-wrap items-center" style={{ lineHeight: '1.8' }}>
                        {lineObj.words.map((word, wIdx) => {
                          const wordScansion = lineObj.scansion ? (lineObj.scansion[wIdx] || "") : "";
                          const vowelIndices = getVowelIndices(word, wordScansion);
                          const nextWordScansion = lineObj.scansion ? (lineObj.scansion[wIdx + 1] || "") : "";
                          const doesElideForward = wordScansion.endsWith(' ') || nextWordScansion.startsWith(' ');

                          return (
                            <span
                              key={wIdx}
                              className={`relative inline-block cursor-pointer hover:bg-bar ${wIdx !== lineObj.words.length - 1 ? 'mr-[1ch]' : ''} ${getSyntaxColor(word)}`}
                              onClick={() => {
                                if (syntaxMode && selectedBrush) {
                                  const clean = word.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z]/g, '').toLowerCase();
                                  setSyntaxCache(prev => ({ ...prev, [clean]: selectedBrush }));
                                  const storedOverrides = JSON.parse(localStorage.getItem('latintype_syntax_overrides') || '{}');
                                  storedOverrides[clean] = selectedBrush;
                                  localStorage.setItem('latintype_syntax_overrides', JSON.stringify(storedOverrides));
                                } else {
                                  setSelectedWord(word);
                                }
                              }}
                              title={syntaxMode && selectedBrush ? "click to paint" : "click to look up"}
                            >
                              {showScansion && doesElideForward && (
                                <svg className="pointer-events-none absolute bottom-[-0.2em] right-[-0.8em] h-[0.5em] w-[1.2em] text-dim" viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden="true">
                                  <path d="M 10 15 Q 50 45 90 15" fill="none" stroke="currentColor" strokeWidth="6" />
                                </svg>
                              )}
                              {word.split('').map((char, cIdx) => {
                                const vowelSignIdx = vowelIndices.indexOf(cIdx);
                                const symbol = vowelSignIdx !== -1 ? wordScansion[vowelSignIdx] : null;
                                const isDiphthong = symbol ? isDiphthongStart(word, cIdx, vowelIndices) : false;

                                return (
                                  <span key={cIdx} className="verse-cell mt-3">
                                    {showScansion && symbol && symbol !== ' ' && (
                                      <span className="mark-sign" style={{ left: isDiphthong ? '100%' : '50%' }} aria-hidden="true">
                                        <Mark symbol={symbol} />
                                      </span>
                                    )}
                                    <span className="relative"><Letter char={char} font={font} /></span>
                                  </span>
                                );
                              })}
                            </span>
                          );
                        })}
                      </span>
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Pane>
      </div>

      <DictionaryPopup word={selectedWord} onClose={() => setSelectedWord(null)} />
    </main>
  );
}
