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
export * from './foundations';
export * from './register-patient';
