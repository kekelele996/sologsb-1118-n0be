import { sealStore } from '@/stores/sealStore'

/** 探方是否处于封存中（封存记录存在且未解除）。封存数据尚未载入时按未封存处理 */
export function isTrenchSealed(trenchId: string): boolean {
  const active = sealStore.getState().activeByTrench.get(trenchId)
  return Boolean(active)
}

/** 写入前守卫：封存中的探方只读，任何编目改动都要拒绝 */
export function assertTrenchWritable(trenchId: string, action: string): void {
  const active = sealStore.getState().activeByTrench.get(trenchId)
  if (active) {
    throw new Error(
      `探方已于 ${active.sealedAt.slice(0, 10)} 封存交接，封存记录只读，无法${action}；如有漏登请先在探方清单中填写原因解除封存`
    )
  }
}
