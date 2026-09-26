import type { Artifact } from './artifact'
import type { Relation } from './relation'
import type { Stratum } from './stratum'

/** 封存清单中的单位条目（封存时刻的快照） */
export interface SealUnitEntry {
  stratumId: string
  /** 单位号，如 H12、L02 */
  code: string
  /** 单位类型（地层/灰坑/房址/沟/墓葬） */
  type: Stratum['type']
  /** 该单位出土物记录条数 */
  artifactRecords: number
  /** 该单位出土物总件数 */
  artifactCount: number
}

/** 封存清单（每次封存产生一个不可变版本） */
export interface SealManifest {
  id: string
  trenchId: string
  /** 版本号，从 1 起逐次封存递增 */
  version: number
  /** 封存时间，ISO 完整时间戳 */
  sealedAt: string
  /** 封存负责人 */
  sealedBy: string
  /** 封存时备注（可选） */
  note: string
  /** 封存时地层单位数 */
  unitCount: number
  /** 封存时出土物记录条数 */
  artifactRecords: number
  /** 封存时出土物总件数 */
  artifactCount: number
  /** 封存时层位关系条数 */
  relationCount: number
  /** 各单位明细 */
  units: SealUnitEntry[]
  /** 解除时间；仍在封存中为 null */
  unsealedAt: string | null
  /** 解除原因（漏登说明）；仍在封存中为 null */
  unsealReason: string | null
  /** 解除操作人 */
  unsealedBy: string | null
}

/** 两个版本清单之间的差异 */
export interface SealDiff {
  /** 上一版单位号列表（便于表头汇总） */
  prevVersion: number
  nextVersion: number
  added: SealUnitEntry[]
  removed: SealUnitEntry[]
  changed: { prev: SealUnitEntry; next: SealUnitEntry }[]
  /** 单位数变化 */
  unitDelta: number
  /** 出土物记录条数变化 */
  artifactRecordDelta: number
  /** 出土物总件数变化 */
  artifactCountDelta: number
  /** 层位关系条数变化 */
  relationDelta: number
}

function buildUnitIndex(entries: SealUnitEntry[]): Map<string, SealUnitEntry> {
  return new Map(entries.map((entry) => [entry.stratumId, entry]))
}

/** 以单位为粒度对比相邻两版封存清单（新增 / 删除 / 出土物变动） */
export function diffManifests(prev: SealManifest, next: SealManifest): SealDiff {
  const prevIndex = buildUnitIndex(prev.units)
  const nextIndex = buildUnitIndex(next.units)

  const added: SealUnitEntry[] = []
  const removed: SealUnitEntry[] = []
  const changed: SealDiff['changed'] = []

  next.units.forEach((entry) => {
    const old = prevIndex.get(entry.stratumId)
    if (!old) {
      added.push(entry)
    } else if (old.artifactRecords !== entry.artifactRecords || old.artifactCount !== entry.artifactCount) {
      changed.push({ prev: old, next: entry })
    }
  })
  prev.units.forEach((entry) => {
    if (!nextIndex.has(entry.stratumId)) removed.push(entry)
  })

  return {
    prevVersion: prev.version,
    nextVersion: next.version,
    added,
    removed,
    changed,
    unitDelta: next.unitCount - prev.unitCount,
    artifactRecordDelta: next.artifactRecords - prev.artifactRecords,
    artifactCountDelta: next.artifactCount - prev.artifactCount,
    relationDelta: next.relationCount - prev.relationCount
  }
}

/** 汇总一个探方封存时刻的清单内容 */
export function buildManifestSnapshot(
  strata: Stratum[],
  artifacts: Artifact[],
  relations: Relation[]
): Pick<SealManifest, 'unitCount' | 'artifactRecords' | 'artifactCount' | 'relationCount' | 'units'> {
  const unitIds = new Set(strata.map((item) => item.id))
  const units: SealUnitEntry[] = strata
    .slice()
    .sort((a, b) => (a.topDepth === b.topDepth ? a.code.localeCompare(b.code, 'zh-Hans-CN') : a.topDepth - b.topDepth))
    .map((stratum) => {
      const owned = artifacts.filter((item) => item.stratumId === stratum.id)
      return {
        stratumId: stratum.id,
        code: stratum.code,
        type: stratum.type,
        artifactRecords: owned.length,
        artifactCount: owned.reduce((sum, item) => sum + item.count, 0)
      }
    })

  return {
    unitCount: strata.length,
    artifactRecords: artifacts.length,
    artifactCount: artifacts.reduce((sum, item) => sum + item.count, 0),
    relationCount: relations.filter(
      (item) => unitIds.has(item.unitAId) || unitIds.has(item.unitBId)
    ).length,
    units
  }
}

/** 封存记录是否仍处于封存中（未解除） */
export function isManifestActive(manifest: SealManifest): boolean {
  return manifest.unsealedAt === null
}
