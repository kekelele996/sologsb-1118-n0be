import { createStore } from 'zustand/vanilla'
import type { SealManifest } from '@/types'
import { buildManifestSnapshot, isManifestActive } from '@/types'
import { db, syncAll, syncPut } from '@/hooks/usePersistentStore'
import { trenchStore } from '@/stores/trenchStore'
import { stratumStore } from '@/stores/stratumStore'
import { artifactStore } from '@/stores/artifactStore'
import { relationStore } from '@/stores/relationStore'
import { uid } from '@/utils/id'

export interface SealInput {
  trenchId: string
  /** 封存负责人 */
  sealedBy: string
  note?: string
}

export interface UnsealInput {
  trenchId: string
  /** 解除原因（漏登说明），必填 */
  reason: string
  /** 解除操作人 */
  unsealedBy: string
}

export interface SealState {
  manifests: SealManifest[]
  loaded: boolean
  /** trenchId → 当前仍在封存中的清单（未解除的最新版本） */
  activeByTrench: Map<string, SealManifest>
  hydrate: () => Promise<void>
  /** 封存探方：固化当前单位/出土物/关系为新一版清单 */
  seal: (input: SealInput) => Promise<SealManifest>
  /** 解除封存：必须填写漏登原因 */
  unseal: (input: UnsealInput) => Promise<void>
}

export const sealStore = createStore<SealState>((set, get) => ({
  manifests: [],
  loaded: false,
  activeByTrench: new Map(),
  hydrate: async () => {
    const manifests = await syncAll<SealManifest>(db.seals)
    manifests.sort((a, b) =>
      a.trenchId === b.trenchId ? a.version - b.version : a.trenchId.localeCompare(b.trenchId)
    )
    const activeByTrench = new Map<string, SealManifest>()
    manifests.forEach((manifest) => {
      if (isManifestActive(manifest)) activeByTrench.set(manifest.trenchId, manifest)
    })
    set({ manifests, loaded: true, activeByTrench })
  },
  seal: async ({ trenchId, sealedBy, note }) => {
    const state = get()
    if (state.activeByTrench.has(trenchId)) {
      throw new Error('该探方已处于封存状态，无需重复封存')
    }
    const trench = trenchStore.getState().trenches.find((item) => item.id === trenchId)
    if (!trench) throw new Error('探方不存在，无法封存')

    const strata = stratumStore.getState().strata.filter((item) => item.trenchId === trenchId)
    const unitIds = new Set(strata.map((item) => item.id))
    const artifacts = artifactStore
      .getState()
      .artifacts.filter((item) => unitIds.has(item.stratumId))
    const relations = relationStore
      .getState()
      .relations.filter((item) => unitIds.has(item.unitAId) || unitIds.has(item.unitBId))

    const history = state.manifests.filter((item) => item.trenchId === trenchId)
    const manifest: SealManifest = {
      id: uid('se'),
      trenchId,
      version: history.length > 0 ? Math.max(...history.map((item) => item.version)) + 1 : 1,
      sealedAt: new Date().toISOString(),
      sealedBy: sealedBy.trim(),
      note: (note ?? '').trim(),
      ...buildManifestSnapshot(strata, artifacts, relations),
      unsealedAt: null,
      unsealReason: null,
      unsealedBy: null
    }
    await syncPut<SealManifest>(db.seals, manifest)
    await get().hydrate()
    return manifest
  },
  unseal: async ({ trenchId, reason, unsealedBy }) => {
    const active = get().activeByTrench.get(trenchId)
    if (!active) throw new Error('该探方未封存，无需解除')
    if (!reason.trim()) throw new Error('解除封存必须填写漏登原因')
    await syncPut<SealManifest>(db.seals, {
      ...active,
      unsealedAt: new Date().toISOString(),
      unsealReason: reason.trim(),
      unsealedBy: unsealedBy.trim()
    })
    await get().hydrate()
  }
}))
