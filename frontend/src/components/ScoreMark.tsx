import { scoreMarkClass } from "./scoreMark";

export function ScoreMark({ strokes, par }: { strokes: number; par: number }) {
  return <span className={`score-mark ${scoreMarkClass(strokes, par)}`}>{strokes}</span>;
}
