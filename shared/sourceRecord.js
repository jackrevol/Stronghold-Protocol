// Presentation copies retain their canonical text for legacy rules derived from Chinese descriptions.
// Enumerable symbols survive loadout object spreads, but never enter JSON or protocol payloads.
export const SOURCE_RECORD = Symbol('sourceRecord');
export const sourceRecord = (record) => record?.[SOURCE_RECORD] || record;
