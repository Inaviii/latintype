const KEY = 'latintype_scores';
const MAX_SCORES = 1000;

export function loadScores() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

// returns false when the browser refuses to store it, for example in private mode or when full
export function addScore(score) {
  try {
    const scores = [...loadScores(), { ...score, date: new Date().toISOString() }];
    localStorage.setItem(KEY, JSON.stringify(scores.slice(-MAX_SCORES)));
    return true;
  } catch {
    return false;
  }
}

export function clearScores() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* nothing stored, nothing to clear */ }
}
