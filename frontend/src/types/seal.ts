import type { UnitType } from './stratum'

/** 封存清单中的地层单位明细 */
export interface SealUnitSummary {
  /** 地层单位 id */
  stratumId: string
  /** 单位号，如 H12、L03 */
  code: string
  /** 单位类型 */
  type: UnitType
  /** 该单位出土物总件数 */
  artifactCount: number
}

/** SealRecord 交接封存清单：每次封存生成一个版本，解除后重新封存会留下新版本 */
export interface SealRecord {
  id: string
  trenchId: string
  /** 清单版本号，同一探方内从 1 递增 */
  version: number
  /** 封存时间（ISO 字符串） */
  sealedAt: string
  /** 操作人（负责人） */
  operator: string
  /** 封存时地层单位数 */
  unitCount: number
  /** 封存时出土物总件数 */
  artifactCount: number
  /** 封存时层位关系数 */
  relationCount: number
  /** 各单位件数明细 */
  units: SealUnitSummary[]
  /** 解除封存时间，未解除为空串 */
  unsealedAt: string
  /** 解除原因（漏登说明） */
  unsealReason: string
}

/** 两版封存清单的对照结果 */
export interface SealDiff {
  /** 新版中新增的单位（旧版没有） */
  addedUnits: SealUnitSummary[]
  /** 新版中移除的单位（旧版有） */
  removedUnits: SealUnitSummary[]
  /** 两版都有但出土物件数发生变化的单位 */
  changedUnits: { code: string; before: number; after: number }[]
  /** 单位数变化（新版 − 旧版） */
  unitCountDelta: number
  /** 出土物件数变化（新版 − 旧版） */
  artifactCountDelta: number
  /** 层位关系数变化（新版 − 旧版） */
  relationCountDelta: number
}

/** 对照相邻两版封存清单，按单位号匹配单位 */
export function diffSealRecords(prev: SealRecord, next: SealRecord): SealDiff {
  const prevByCode = new Map(prev.units.map((unit) => [unit.code, unit]))
  const nextByCode = new Map(next.units.map((unit) => [unit.code, unit]))
  const addedUnits = next.units.filter((unit) => !prevByCode.has(unit.code))
  const removedUnits = prev.units.filter((unit) => !nextByCode.has(unit.code))
  const changedUnits = next.units
    .map((unit) => {
      const before = prevByCode.get(unit.code)
      return before && before.artifactCount !== unit.artifactCount
        ? { code: unit.code, before: before.artifactCount, after: unit.artifactCount }
        : null
    })
    .filter((item): item is { code: string; before: number; after: number } => item !== null)
  return {
    addedUnits,
    removedUnits,
    changedUnits,
    unitCountDelta: next.unitCount - prev.unitCount,
    artifactCountDelta: next.artifactCount - prev.artifactCount,
    relationCountDelta: next.relationCount - prev.relationCount
  }
}
