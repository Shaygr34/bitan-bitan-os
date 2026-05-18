/**
 * Shared learning-store singleton (Layer 3) for the suggest + apply routes.
 *
 * Process-memory for now: a single Railway instance keeps learned placements
 * warm across requests within a boot. DURABILITY WIRING STEP (#13 remaining):
 * swap the export for a Sanity-backed PlacementStore (a `learnedPlacement`
 * doc keyed by formType, cross-repo schema like onboardingRecord) so learning
 * survives deploys + multiple instances. The contract (PlacementStore) does
 * not change — only this binding.
 */

import { InMemoryPlacementStore, type PlacementStore } from './placement-store'

export const placementStore: PlacementStore = new InMemoryPlacementStore()
