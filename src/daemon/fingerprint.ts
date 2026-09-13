/**
 * The structural page fingerprint lives in src/execution/fingerprint.ts, so a
 * compiled `.flow.ts` can embed the same measurement the daemon takes. This
 * module keeps the daemon's import path.
 */
export { FINGERPRINT_DIMS, cosine, fingerprintPage } from '../execution/fingerprint.js';
