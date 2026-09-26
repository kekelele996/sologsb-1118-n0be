import { createStore } from 'zustand/vanilla'
import type { SealRecord, SealUnitSummary } from '@/types'
import { db, syncAll, syncPut } from '@/hooks/usePersistentStore'
import { trenchStore } from '@/stores/trenchStore'
import { stratumStore } from '@/stores/stratumStore'
import { artifactStore } from '@/stores/artifactStore'
import { relationStore } from '@/stores/relationStore'
import { uid } from '@/utils/id'

export interface SealState {
  seals: SealRecord[]
  loaded: boolean
  hydrate: () => Promise<void>
  /** 负责人封存探方：汇总当前编目内容生成一版交接清单，并把探方置为只读 */
  seal: (trenchId: string, operator: string) => Promise<SealRecord | null>
  /** 解除封存：必须填写漏登原因，当前生效清单记录解除时间与原因 */
  unseal: (trenchId: string, reason: string) => Promise<SealRecord | null>
}

export const sealStore = createStore<SealState>((set, get) => ({
  seals: [],
  loaded: false,
  hydrate: async () => {
    const seals = await syncAll<SealRecord>(db.seals)
    seals.sort((a, b) =>
      a.trenchId === b.trenchId ? b.version - a.version : a.trenchId.localeCompare(b.trenchId)
    )
    set({ seals, loaded: true })
  },
  seal: async (trenchId, operator) => {
    const trench = trenchStore.getState().trenches.find((item) => item.id === trenchId)
    if (!trench || trench.sealed) return null

    const units = stratumStore.getState().strata.filter((item) => item.trenchId === trenchId)
    const artifacts = artifactStore.getState().artifacts
    const unitIds = units.map((item) => item.id)

    const summaries: SealUnitSummary[] = units.map((unit) => ({
      stratumId: unit.id,
      code: unit.code,
      type: unit.type,
      artifactCount: artifacts
        .filter((item) => item.stratumId === unit.id)
        .reduce((sum, item) => sum + item.count, 0)
    }))

    const relationCount = relationStore
      .getState()
      .relations.filter((item) => unitIds.includes(item.unitAId) || unitIds.includes(item.unitBId)).length

    const version =
      get()
        .seals.filter((item) => item.trenchId === trenchId)
        .reduce((max, item) => Math.max(max, item.version), 0) + 1

    const record: SealRecord = {
      id: uid('seal'),
      trenchId,
      version,
      sealedAt: new Date().toISOString(),
      operator: operator.trim(),
      unitCount: units.length,
      artifactCount: summaries.reduce((sum, item) => sum + item.artifactCount, 0),
      relationCount,
      units: summaries,
      unsealedAt: '',
      unsealReason: ''
    }

    await syncPut<SealRecord>(db.seals, record)
    await trenchStore.getState().setSealed(trenchId, true)
    await get().hydrate()
    return record
  },
  unseal: async (trenchId, reason) => {
    const trimmed = reason.trim()
    if (!trimmed) return null
    const trench = trenchStore.getState().trenches.find((item) => item.id === trenchId)
    if (!trench || !trench.sealed) return null

    const active = get()
      .seals.filter((item) => item.trenchId === trenchId && !item.unsealedAt)
      .sort((a, b) => b.version - a.version)[0]
    if (!active) return null

    const record: SealRecord = { ...active, unsealedAt: new Date().toISOString(), unsealReason: trimmed }
    await syncPut<SealRecord>(db.seals, record)
    await trenchStore.getState().setSealed(trenchId, false)
    await get().hydrate()
    return record
  }
}))
