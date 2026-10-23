/**
 * Google OAuth client compiled into the app (see bundledGoogle() in electron.vite.config.mjs).
 * Empty in dev/test builds that have no credentials.
 */
// eslint-disable-next-line no-undef
export const BUNDLED_GOOGLE = typeof __CAST_GOOGLE__ === 'undefined' ? {} : __CAST_GOOGLE__
