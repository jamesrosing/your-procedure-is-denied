// A chart citation is a chart entry id: note-NNN. Shared by the appeal contract
// (src/schema.ts) and the gate (src/litmus.ts); kept apart from the contract so
// the gate imports no schema library and bundles small for the viewer.
export const CITATION_ID = /^note-\d{3}$/;
