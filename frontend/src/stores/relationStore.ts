import { createStore } from 'zustand/vanilla'
import type { Relation } from '@/types'
import { db, syncAll, syncDelete, syncPut } from '@/hooks/usePersistentStore'
import { stratumStore } from '@/stores/stratumStore'
import { assertTrenchWritable } from '@/stores/sealGuard'

/** 层位关系两端只要有一端属于封存探方，该关系即只读 */
function assertRelationWritable(unitAId: string, unitBId: string, action: string): void {
  const strata = stratumStore.getState().strata
  const unitA = strata.find((item) => item.id === unitAId)
  const unitB = strata.find((item) => item.id === unitBId)
  if (unitA) assertTrenchWritable(unitA.trenchId, action)
  if (unitB) assertTrenchWritable(unitB.trenchId, action)
}

export interface RelationState {
  relations: Relation[]
  loaded: boolean
  hydrate: () => Promise<void>
  /** 保存前由页面做环路检测，store 只负责写入 */
  save: (relation: Relation) => Promise<void>
  remove: (id: string) => Promise<void>
  removeByStratum: (stratumId: string) => Promise<void>
}

export const relationStore = createStore<RelationState>((set, get) => ({
  relations: [],
  loaded: false,
  hydrate: async () => {
    const relations = await syncAll<Relation>(db.relations)
    relations.sort((a, b) => a.id.localeCompare(b.id))
    set({ relations, loaded: true })
  },
  save: async (relation) => {
    assertRelationWritable(relation.unitAId, relation.unitBId, '编目层位关系')
    await syncPut<Relation>(db.relations, relation)
    await get().hydrate()
  },
  remove: async (id) => {
    const target = get().relations.find((item) => item.id === id)
    if (target) assertRelationWritable(target.unitAId, target.unitBId, '删除层位关系')
    await syncDelete<Relation>(db.relations, id)
    await get().hydrate()
  },
  removeByStratum: async (stratumId) => {
    const targets = get().relations.filter((item) => item.unitAId === stratumId || item.unitBId === stratumId)
    targets.forEach((item) => assertRelationWritable(item.unitAId, item.unitBId, '删除层位关系'))
    await Promise.all(targets.map((item) => syncDelete<Relation>(db.relations, item.id)))
    await get().hydrate()
  }
}))
