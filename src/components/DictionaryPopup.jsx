import React, { useState, useEffect } from 'react';
import { lookupWord } from '../lib/DictionaryService';
import { formatWordAnalysis } from 'whitakers-words';
import { Overlay } from './ascii';

export default function DictionaryPopup({ word, onClose }) {
  const [loading, setLoading] = useState(false);
  const [definition, setDefinition] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!word) return;

    const fetchDefinition = async () => {
      setLoading(true);
      setError('');
      try {
        // Strip macrons and punctuation for the API lookup
        const cleanWord = word.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z]/g, '').toLowerCase();

        if (!cleanWord) {
          setError('Nothing to look up.');
          setLoading(false);
          return;
        }

        const result = await lookupWord(cleanWord);

        if (result && (result.results.length > 0 || result.uniqueResults.length > 0 || result.trickResults.length > 0 || (result.addonResults && result.addonResults.length > 0))) {
           setDefinition(formatWordAnalysis(result));
        } else {
           setError('Not found in the dictionary.');
        }
      } catch (err) {
        console.error(err);
        setError('Could not load the dictionary. Check your connection and try again.');
      }
      setLoading(false);
    };

    fetchDefinition();
  }, [word]);

  if (!word) return null;

  // Clean the display word to keep macrons but remove punctuation
  const displayWord = word.replace(/[^a-zA-ZāēīōūȳĀĒĪŌŪȲ]/g, '');

  return (
    <Overlay title={`lookup: ${displayWord}`} onClose={onClose}>
      <div className="mb-2 flex justify-end">
        <button className="btn" onClick={onClose}>esc close</button>
      </div>
      {loading ? (
        <p>looking up...</p>
      ) : error ? (
        <p className="text-mark">{error}</p>
      ) : (
        <pre className="whitespace-pre-wrap text-ink">{definition}</pre>
      )}
      <p className="mt-2 text-dim">source: Whitaker's Words</p>
    </Overlay>
  );
}
