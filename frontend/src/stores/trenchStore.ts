import { createStore } from 'zustand/vanilla'
import type { Trench } from '@/types'
import { db, syncAll, syncDelete, syncPut } from '@/hooks/usePersistentStore'
import { sealStore } from '@/stores/sealStore'
import { assertTrenchWritable } from '@/stores/sealGuard'

export interface TrenchState {
  trenches: Trench[]
  loaded: boolean
  hydrate: () => Promise<void>
  save: (trench: Trench) => Promise<void>
  remove: (id: string) => Promise<void>
  setBackfilled: (id: string, backfilled: boolean) => Promise<void>
}

export const trenchStore = createStore<TrenchState>((set, get) => ({
  trenches: [],
  loaded: false,
  hydrate: async () => {
    const trenches = await syncAll<Trench>(db.trenches)
    trenches.sort((a, b) => `${a.area}${a.code}`.localeCompare(`${b.area}${b.code}`, 'zh-Hans-CN'))
    set({ trenches, loaded: true })
  },
  save: async (trench) => {
    // 封存中的探方其编目档案只读，基础信息同样冻结，交接内容以封存清单为准
    assertTrenchWritable(trench.id, '修改探方信息')
    await syncPut<Trench>(db.trenches, trench)
    await get().hydrate()
  },
  remove: async (id) => {
    if (sealStore.getState().manifests.some((item) => item.trenchId === id)) {
      throw new Error('该探方存在交接封存清单，封存档案不可删除')
    }
    await syncDelete<Trench>(db.trenches, id)
    await get().hydrate()
  },
  setBackfilled: async (id, backfilled) => {
    assertTrenchWritable(id, '修改回填标记')
    const target = get().trenches.find((item) => item.id === id)
    if (!target) return
    await syncPut<Trench>(db.trenches, { ...target, backfilled })
    await get().hydrate()
  }
}))
