import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Pane } from './ascii';

const TABS = [['daily', 'daily'], ['passage', 'passage'], ['time30', '30s'], ['time60', '60s'], ['time120', '120s']];

export default function Leaderboard() {
  const [scores, setScores] = useState({ passage: [], time30: [], time60: [], time120: [], daily: [] });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [activeTab, setActiveTab] = useState('passage');
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

  useEffect(() => {
    const fetchScores = async () => {
      const scoresRef = collection(db, "scores");

      const categories = [
        { key: 'passage', mode: 'passage', duration: null },
        { key: 'time30', mode: 'time', duration: 30 },
        { key: 'time60', mode: 'time', duration: 60 },
        { key: 'time120', mode: 'time', duration: 120 }
      ];

      const results = {};

      // use promise.all to fetch all categories in parallel
      await Promise.all(categories.map(async (cat) => {
        try {
          let q;
          if (cat.mode === 'passage') {
            q = query(scoresRef, where("mode", "==", "passage"), orderBy("wpm", "desc"), limit(50));
          } else {
            q = query(scoresRef, where("mode", "==", "time"), where("duration", "==", cat.duration), orderBy("wpm", "desc"), limit(50));
          }
          const querySnapshot = await getDocs(q);
          results[cat.key] = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (e) {
          console.error(`Error fetching category ${cat.key}:`, e);
          results[cat.key] = [];
          setFailed(true);
        }
      }));

      const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
      try {
        const dailyRef = collection(db, 'daily_leaderboards', dateStr, 'scores');
        const dailyQ = query(dailyRef, orderBy('score', 'desc'), limit(50));
        const dailySnap = await getDocs(dailyQ);
        results['daily'] = dailySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (e) {
        console.error("Error fetching daily leaderboard:", e);
        results['daily'] = [];
        setFailed(true);
      }

      setScores(results);
      setLoading(false);
    };

    fetchScores();
  }, []);

  const renderTable = (rawData) => {
    if (!rawData || rawData.length === 0) return <p className="py-3">no scores yet for this mode.</p>;

    // Collapse to best score per unique player
    const bestScoresMap = {};
    rawData.forEach(score => {
      const nameKey = (score.name || "Anonymous").toLowerCase();
      if (!bestScoresMap[nameKey] || score.wpm > bestScoresMap[nameKey].wpm) {
        bestScoresMap[nameKey] = score;
      }
    });
    const data = Object.values(bestScoresMap).sort((a, b) => b.wpm - a.wpm);
    const isDaily = activeTab === 'daily';

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-dim [&>th]:border-b [&>th]:border-dashed [&>th]:border-dim [&>th]:font-normal">
              <th scope="col" className="w-[5ch]">#</th>
              <th scope="col">name</th>
              {isDaily && <th scope="col" className="w-[8ch] text-right">score</th>}
              <th scope="col" className="w-[6ch] text-right">wpm</th>
              <th scope="col" className="w-[6ch] text-right">acc</th>
              {!isDaily && <th scope="col" className="hidden w-[12ch] text-right sm:table-cell">date</th>}
            </tr>
          </thead>
          <tbody>
            {data.map((score, index) => (
              <tr key={score.id} className="hover:bg-bar">
                <td className={index < 3 ? 'text-mark font-semibold' : 'text-dim'}>{index + 1}</td>
                <td className="max-w-[30ch] truncate text-ink">
                  {score.name || "Anonymous"}
                  {score.passage && <span className="ml-2 text-dim">{score.passage}</span>}
                </td>
                {isDaily && <td className="text-right font-semibold text-ink">{score.score}</td>}
                <td className="text-right font-semibold text-ink">{score.wpm}</td>
                <td className="text-right">{score.acc}%</td>
                {!isDaily && <td className="hidden text-right text-dim sm:table-cell">{new Date(score.date).toLocaleDateString('en-CA')}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <main className="mt-4">
      <Pane title="scores">
        <div className="flex flex-wrap items-center justify-between gap-x-4 py-1">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="score type">
            {TABS.map(([key, label]) => (
              <button key={key} role="tab" aria-selected={activeTab === key} className={`tab ${activeTab === key ? 'on' : ''}`} onClick={() => setActiveTab(key)}>{label}</button>
            ))}
          </div>
          {activeTab === 'daily' && dailyCountdown && <span className="text-dim">next daily in {dailyCountdown}</span>}
        </div>
        {failed && <p className="text-mark">some scores could not be loaded. check your connection and reload.</p>}
        {loading ? <p className="py-3">loading scores...</p> : renderTable(scores[activeTab])}
      </Pane>
      <p className="mt-2 text-dim">names are not verified. scores are on the honour system.</p>
    </main>
  );
}
