/**
 * Pages barrel. Every screen lives under `src/pages/<feature>/` and is
 * re-exported here. Screens are thin shells that compose an AppBar + feature
 * components (domain logic stays in `src/features/<domain>/`).
 *
 * Multi-page flows (e.g. facility-onboarding) group their step screens as
 * separate files inside one feature folder and export them from that folder's
 * index. When the router lands, route-level code splitting should lazy-import
 * the individual page file (per-screen chunks for cheap phones), not this barrel.
 */
export * from './facility-home';
export * from './facility-onboarding';
export * from './foundations';
export * from './monthly-summary';
export * from './patient-registration';
export * from './patient-search';
export * from './programme-register';
export * from './referral';
export * from './register-patient';
export * from './send-to-unit';
export * from './staff-onboarding';
export * from './sync-center';
