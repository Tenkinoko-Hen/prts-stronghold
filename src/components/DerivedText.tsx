export function DerivedText({ text }: { text: string }) {
  const match = text.match(/^【推导】\s*/);
  return match ? <><span className="badge-derived ak-skew-tag">推导</span>{text.slice(match[0].length)}</> : text;
}
