/**
 * The text rules now live in src/execution/text.ts, where the daemon imports
 * them and a compiled artifact embeds them. Re-exported here so no call site
 * has to know which of the two owns the source.
 */
export * from '../execution/text.js';
