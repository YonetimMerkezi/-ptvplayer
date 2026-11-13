import { fold } from './util.js';

const parts = (value) => String(value || '').split(/[,|/;]+/).map((x) => fold(x)).filter((x) => x.length > 1);
const overlap = (a, b) => { const set = new Set(a); return b.filter((x) => set.has(x)).length; };

export function recommendMovies(current, info, candidates, { limit = 12, excludeIds = [] } = {}) {
  const blocked = new Set([current && current.id, ...excludeIds].filter(Boolean));
  const genres = parts(info && info.genre);
  const cast = parts(info && info.cast);
  const director = parts(info && info.director);
  const group = fold(current && current.group);
  return (Array.isArray(candidates) ? candidates : [])
    .filter((item) => item && item.kind === 'movie' && !blocked.has(item.id))
    .map((item) => {
      const name = fold(item.name);
      const tags = parts(item.genre || item.plot);
      const score = overlap(genres, tags) * 5 + (group && fold(item.group) === group ? 3 : 0) + (director.some((x) => name.includes(x)) ? 4 : 0) + cast.filter((x) => name.includes(x)).length * 2 + (Number(item.rating) > 0 ? Math.min(2, Number(item.rating) / 5) : 0);
      return { item, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || fold(a.item.name).localeCompare(fold(b.item.name)))
    .slice(0, Math.max(0, limit))
    .map((row) => row.item);
}