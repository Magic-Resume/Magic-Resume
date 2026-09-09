/** Domain-oriented store entrypoints. The aggregate facade remains available
 * from `store/useResumeStore` while feature modules migrate incrementally. */
export { useResumeDocumentStore } from './document';
export { useResumeEditorUiStore } from './editor-ui';
export { useResumePersistenceStore } from './persistence';
export { useResumeSharingStore } from './sharing';
export { useResumeSyncStore } from './sync';
export { useResumeVersionsStore } from './versions';
