// Settings that can differ by frame, and the layer that holds each frame. Pure functions, tested in
// tests/settings.test.mjs. A review can hold an older and a newer coding frame side by side (the grey
// literature review keeps taxonomy on master-v1.4 and taxonomy-v2 on master-v2.0, 12 October 2026).
//   "frame_settings": { "taxonomy-v2": { "codebook": "...", "codebook_version": "v2.0.1",
//     "unit_label": "thematic segment", "orientation": { "file": "...", "task": "...", "link": "..." },
//     "new_codes": { "fields": ["statement_type", "level", "function_primary", "form"] } } }
// A setting left out of frame_settings falls back to the review-wide one of the same name.

/** The layer that holds a frame's first-coder codes: the first layer if it lists the frame, else the first layer that does. */
export function layerOf(frameId, review) {
  const layers = (review && review.layers) || [];
  const first = layers.find((l) => l.id === review.first_layer);
  if (!first || (first.frames || []).includes(frameId)) return review && review.first_layer;
  const other = layers.find((l) => (l.frames || []).includes(frameId));
  return other ? other.id : review.first_layer;
}

/** Every layer the review lists, the first layer first. */
export function layerIds(review) {
  const ids = [review && review.first_layer, ...((review && review.layers) || []).map((l) => l.id)].filter(Boolean);
  return [...new Set(ids)];
}

/** A frame's setting, falling back to the review-wide setting of the same name. */
export function frameSetting(frameId, key, review) {
  const fs = review && review.frame_settings && frameId ? review.frame_settings[frameId] : null;
  if (fs && fs[key] !== undefined) return fs[key];
  return review ? review[key] : undefined;
}

/** What a coder calls the thing they code: "thematic segment", or "passage" when the review sets nothing. */
export function unitLabel(frameId, review) {
  return frameSetting(frameId, 'unit_label', review) || 'passage';
}

/** The fields a new code on selected text takes: frame setting, then the sample's checked fields, then every field of the frame. */
export function newCodeFields(frame, sample, review) {
  const nc = frameSetting(frame && frame.id, 'new_codes', review);
  const ids = (frame && frame.fields || []).map((f) => f.id);
  const want = (nc && nc.fields) || (sample && sample.fields) || ids;
  return want.filter((id) => ids.includes(id));
}

/** True when any frame, or the review, has an orientation file. */
export function anyOrientation(review) {
  if (review && review.orientation && review.orientation.file) return true;
  return Object.values((review && review.frame_settings) || {}).some((fs) => fs && fs.orientation && fs.orientation.file);
}
