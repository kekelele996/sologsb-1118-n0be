import { createStore } from 'zustand/vanilla'
import type { Artifact } from '@/types'
import { db, syncAll, syncDelete, syncPut } from '@/hooks/usePersistentStore'
import { stratumStore } from '@/stores/stratumStore'
import { assertTrenchWritable } from '@/stores/sealGuard'

/** 由地层单位反查所属探方并做封存只读校验 */
function assertStratumWritable(stratumId: string, action: string): void {
  const stratum = stratumStore.getState().strata.find((item) => item.id === stratumId)
  if (stratum) assertTrenchWritable(stratum.trenchId, action)
}

export interface ArtifactState {
  artifacts: Artifact[]
  loaded: boolean
  hydrate: () => Promise<void>
  save: (artifact: Artifact) => Promise<void>
  remove: (id: string) => Promise<void>
  removeByStratum: (stratumId: string) => Promise<void>
}

export const artifactStore = createStore<ArtifactState>((set, get) => ({
  artifacts: [],
  loaded: false,
  hydrate: async () => {
    const artifacts = await syncAll<Artifact>(db.artifacts)
    artifacts.sort((a, b) => a.code.localeCompare(b.code, 'zh-Hans-CN', { numeric: true }))
    set({ artifacts, loaded: true })
  },
  save: async (artifact) => {
    assertStratumWritable(artifact.stratumId, '登记出土物')
    await syncPut<Artifact>(db.artifacts, artifact)
    await get().hydrate()
  },
  remove: async (id) => {
    const target = get().artifacts.find((item) => item.id === id)
    if (target) assertStratumWritable(target.stratumId, '删除出土物')
    await syncDelete<Artifact>(db.artifacts, id)
    await get().hydrate()
  },
  removeByStratum: async (stratumId) => {
    assertStratumWritable(stratumId, '删除出土物')
    const targets = get().artifacts.filter((item) => item.stratumId === stratumId)
    await Promise.all(targets.map((item) => syncDelete<Artifact>(db.artifacts, item.id)))
    await get().hydrate()
  }
}))
