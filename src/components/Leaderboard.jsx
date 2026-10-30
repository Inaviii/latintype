import React, { useState, useEffect } from 'react';
import { Pane } from './ascii';
import { loadScores, clearScores } from '../lib/scores';

const TABS = [
  ['passage', 'passage', s => s.mode === 'passage'],
  ['daily', 'daily', s => s.mode === 'daily'],
  ['time30', '30s', s => s.mode === 'time' && s.duration === 30],
  ['time60', '60s', s => s.mode === 'time' && s.duration === 60],
  ['time120', '120s', s => s.mode === 'time' && s.duration === 120],
];

export default function Leaderboard() {
  const [scores, setScores] = useState(loadScores);
  const [activeTab, setActiveTab] = useState('passage');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [dailyCountdown, setDailyCountdown] = useState('');

  useEffect(() => {
    if (activeTab !== 'daily') return;

    const updateCountdown = () => {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: false
      });
      const parts = formatter.formatToParts(now);

      const h = parseInt(parts.find(p => p.type === 'hour').value, 10);
      const m = parseInt(parts.find(p => p.type === 'minute').value, 10);
      const s = parseInt(parts.find(p => p.type === 'second').value, 10);

      const currentSeconds = (h === 24 ? 0 : h) * 3600 + m * 60 + s;
      const diffSeconds = 86400 - currentSeconds;

      if (diffSeconds <= 0) {
        setDailyCountdown('00:00:00');
        return;
      }

      const remH = Math.floor(diffSeconds / 3600);
      const remM = Math.floor((diffSeconds % 3600) / 60);
      const remS = diffSeconds % 60;

      setDailyCountdown(`${remH.toString().padStart(2, '0')}:${remM.toString().padStart(2, '0')}:${remS.toString().padStart(2, '0')}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const isDaily = activeTab === 'daily';
  const matches = TABS.find(([key]) => key === activeTab)[2];
  const rows = scores
    .filter(matches)
    .sort((a, b) => (isDaily ? b.score - a.score : b.wpm - a.wpm))
    .slice(0, 50);

  return (
    <main className="mt-4">
      <Pane title="your scores">
        <div className="flex flex-wrap items-center justify-between gap-x-4 py-1">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="score type">
            {TABS.map(([key, label]) => (
              <button key={key} role="tab" aria-selected={activeTab === key} className={`tab ${activeTab === key ? 'on' : ''}`} onClick={() => setActiveTab(key)}>{label}</button>
            ))}
          </div>
          {isDaily && dailyCountdown && <span className="text-dim">next daily in {dailyCountdown}</span>}
        </div>

        {rows.length === 0 ? (
          <p className="py-3">no scores yet for this mode. finish a run and it will appear here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-dim [&>th]:border-b [&>th]:border-dashed [&>th]:border-dim [&>th]:font-normal">
                  <th scope="col" className="w-[5ch]">#</th>
                  {isDaily && <th scope="col" className="w-[8ch] text-right">score</th>}
                  <th scope="col" className="w-[6ch] text-right">wpm</th>
                  <th scope="col" className="w-[6ch] text-right">acc</th>
                  <th scope="col" className="pl-[3ch]">text</th>
                  <th scope="col" className="hidden w-[12ch] text-right sm:table-cell">date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((score, index) => (
                  <tr key={score.date} className="hover:bg-bar">
                    <td className={index < 3 ? 'text-mark font-semibold' : 'text-dim'}>{index + 1}</td>
                    {isDaily && <td className="text-right font-semibold text-ink">{score.score}</td>}
                    <td className="text-right font-semibold text-ink">{score.wpm}</td>
                    <td className="text-right">{score.acc}%</td>
                    <td className="max-w-[40ch] truncate pl-[3ch]">{score.text}</td>
                    <td className="hidden text-right text-dim sm:table-cell">{new Date(score.date).toLocaleDateString('en-CA')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Pane>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-dim">saved in this browser only. clearing site data removes them.</p>
        {scores.length > 0 && (confirmingClear ? (
          <span className="flex items-center gap-2">
            delete all {scores.length} scores?
            <button className="btn" onClick={() => { clearScores(); setScores([]); setConfirmingClear(false); }}>yes, delete</button>
            <button className="btn" onClick={() => setConfirmingClear(false)}>no</button>
          </span>
        ) : (
          <button className="btn" onClick={() => setConfirmingClear(true)}>clear scores</button>
        ))}
      </div>
    </main>
  );
}
