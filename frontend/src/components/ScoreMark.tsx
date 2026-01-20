export function scoreMarkClass(strokes: number, par: number): string {
  const d = strokes - par;
  if (d <= -2) return "eagle";
  if (d === -1) return "birdie";
  if (d === 1) return "bogey";
  if (d >= 2) return "double-bogey";
  return "";
}

export function ScoreMark({ strokes, par }: { strokes: number; par: number }) {
  return <span className={`score-mark ${scoreMarkClass(strokes, par)}`}>{strokes}</span>;
}
