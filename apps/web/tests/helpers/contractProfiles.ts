// Unit tests directly exercise synchronous validators outside their async UI/I/O
// workflows. Prepare the same offline registries those production workflows load.
import {prepareContractProfile} from '../../src/contracts/structural'
await Promise.all((['structural','editor','transport'] as const).map(profile=>prepareContractProfile(profile)))
