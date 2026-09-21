/**
 * The app credentials each target runs against, in ONE place.
 *
 * bench/harness.mjs sets these for the recording run. bench/sweep.mjs drives
 * the REPLAYS itself and was passing only process.env, so a flow whose sign-in
 * step fills `{{env:APP_PASSWORD}}` failed at its first step on every replay:
 *
 *   fwgr10: "fill failed: secret {{env:APP_PASSWORD}} cannot be resolved"
 *
 * Two of three grafana replays were scored against that, and the run was read
 * as a product regression. Both files import this rather than keeping their
 * own copy, because two copies of one fact disagreeing is the shape of most of
 * the bugs found in this work.
 *
 * Anything already in the environment wins over these, so an explicit override
 * still works.
 */
export const APP_DEFAULTS = {
  // atelyr supplies its own from rsconfig; the harness leaves it empty.
  atelyr: {},
  repairdesk: {
    APP_URL: 'http://127.0.0.1:4180/',
    APP_EMAIL: 'bench@example.com',
    APP_PASSWORD: 'bench-pass-1234',
  },
  odoo: {
    APP_URL: 'http://127.0.0.1:8069/',
    APP_EMAIL: 'admin',
    APP_PASSWORD: 'admin',
  },
  grafana: {
    APP_URL: 'http://127.0.0.1:3000/',
    APP_EMAIL: 'admin',
    APP_PASSWORD: 'admin',
  },
  kanboard: {
    APP_URL: 'http://127.0.0.1:8085/',
    APP_EMAIL: 'admin',
    APP_PASSWORD: 'admin',
  },
  // The password is pinned by the compose file's OPENPROJECT_SEED_ADMIN_USER_*
  // settings, which also turn off the forced change on first sign-in.
  openproject: {
    APP_URL: 'http://127.0.0.1:8090/',
    APP_EMAIL: 'admin',
    APP_PASSWORD: 'bench-admin-pass',
  },
  // Vikunja has no built-in admin: resetVikunja registers this user when it
  // cannot sign in with it.
  vikunja: {
    APP_URL: 'http://127.0.0.1:8096/',
    APP_EMAIL: 'admin',
    APP_PASSWORD: 'bench-admin-pass',
  },
  // bench/thirdparty/gitea/seed.sh creates this admin with no forced password
  // change (INSTALL_LOCK leaves no install wizard to make one).
  gitea: {
    APP_URL: 'http://127.0.0.1:8095/',
    APP_EMAIL: 'admin',
    APP_PASSWORD: 'bench-admin-pass',
  },
  // The espocrm image installs this admin on first boot from
  // ESPOCRM_ADMIN_USERNAME/PASSWORD in its docker-compose.yml.
  espocrm: {
    APP_URL: 'http://127.0.0.1:8097/',
    APP_EMAIL: 'admin',
    APP_PASSWORD: 'bench-admin-pass',
  },
  // bench/thirdparty/snipeit/seed.sh creates this admin and the settings row,
  // so the /setup wizard never opens.
  snipeit: {
    APP_URL: 'http://127.0.0.1:8098/',
    APP_EMAIL: 'admin',
    APP_PASSWORD: 'bench-admin-pass',
  },
  // resetGhost creates this owner through the setup wizard's own endpoint, so
  // /ghost/#/setup never opens. Ghost signs in by email.
  ghost: {
    APP_URL: 'http://127.0.0.1:8099/',
    APP_EMAIL: 'admin@bench.local',
    APP_PASSWORD: 'bench-admin-pass',
  },
};
