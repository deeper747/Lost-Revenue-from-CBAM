export const fmtM = n => {
  if (!n && n !== 0) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString()}`;
};

export const fmtKt = n => n ? `${(n / 1000).toFixed(1)}kt` : "—";
export const fmtT = n => n == null ? "—" : Math.round(n).toLocaleString("en-US");
export const pct = (n, d = 1) => n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(d)}%`;

export const dvLevel = v => {
  if (!v || v === 0) return 0;
  return v >= 3 ? 4 : v >= 2 ? 3 : v >= 1 ? 2 : 1;
};
