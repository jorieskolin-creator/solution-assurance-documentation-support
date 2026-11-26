import archetypesJson from './failure-mode-archetypes.json'
import type { ArchetypeId, ControlObjectId, MitigationType } from '../types/failureMode'

export interface FailureModeArchetype {
  id: ArchetypeId
  title: string
  group: string
  default_mapped_objects: ControlObjectId[]
  recommended_mitigation_type: MitigationType
  guidance_hint: string
}

export const failureModeArchetypes: FailureModeArchetype[] = archetypesJson as FailureModeArchetype[]

export const failureModeArchetypeMap: Record<ArchetypeId, FailureModeArchetype> = Object.fromEntries(
  failureModeArchetypes.map((item) => [item.id, item]),
) as Record<ArchetypeId, FailureModeArchetype>

export function isArchetypeId(value: string): value is ArchetypeId {
  return value in failureModeArchetypeMap
}
