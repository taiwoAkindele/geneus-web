import { FoundationsScreen } from '@/pages';

/**
 * App root. Phase 1 (design-system foundation): renders the Foundations
 * showcase so the tokens + shared primitives are visible in one place. The
 * router and real screens (RegisterPatientScreen et al., already under
 * `@/pages`) come in a later phase.
 */
export default function App() {
  return <FoundationsScreen />;
}
