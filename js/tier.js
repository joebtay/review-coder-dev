// Corpus tier filter. A review that sets `corpus` in review.json loads only the units and documents
// whose tier is listed there. Anything without a listed tier is left out, so a missing field fails closed.
//   "corpus": { "field": "use_tier", "include": ["Paper corpus"] }

export function tierRule(review) {
  const c = review && review.corpus;
  return c && c.field && Array.isArray(c.include) ? { field: c.field, include: new Set(c.include) } : null;
}

export function inCorpus(item, rule) {
  return !rule || rule.include.has(item?.[rule.field]);
}

export function corpusUnits(units, review) {
  const rule = tierRule(review);
  return rule ? (units || []).filter((u) => inCorpus(u, rule)) : units || [];
}

export function corpusDocs(docs, review) {
  const rule = tierRule(review);
  return rule ? (docs || []).filter((d) => inCorpus(d, rule)) : docs || [];
}
