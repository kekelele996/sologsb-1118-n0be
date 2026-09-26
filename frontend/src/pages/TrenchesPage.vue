<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { SealRecord, Trench } from '@/types'
import { TRENCH_SIZES, diffSealRecords, findTrenchConflict, trenchKey } from '@/types'
import TrenchTag from '@/components/common/TrenchTag.vue'
import { useStore } from '@/hooks/usePersistentStore'
import { trenchStore } from '@/stores/trenchStore'
import { stratumStore } from '@/stores/stratumStore'
import { artifactStore } from '@/stores/artifactStore'
import { relationStore } from '@/stores/relationStore'
import { sealStore } from '@/stores/sealStore'
import { uid } from '@/utils/id'

const trenchState = useStore(trenchStore)
const stratumState = useStore(stratumStore)
const artifactState = useStore(artifactStore)
const relationState = useStore(relationStore)
const sealState = useStore(sealStore)

const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const filterArea = ref('')

const form = reactive({
  code: '',
  area: '',
  size: '5×5 米' as Trench['size'],
  basePoint: '',
  openLayer: '第①层',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  leader: '',
  wallNote: '',
  backfilled: false,
  sealed: false
})

const areas = computed(() => Array.from(new Set(trenchState.trenches.map((item) => item.area))))
const visible = computed(() =>
  filterArea.value ? trenchState.trenches.filter((item) => item.area === filterArea.value) : trenchState.trenches
)

watch(
  () => trenchState.trenches.length,
  () => {
    if (!form.area && trenchState.trenches.length > 0) {
      form.area = trenchState.trenches[0].area
    }
  },
  { immediate: true }
)

/** 单位数与出土物件数 */
function unitsOf(trenchId: string): number {
  return stratumState.strata.filter((item) => item.trenchId === trenchId).length
}

function artifactsOf(trenchId: string): number {
  const unitIds = stratumState.strata.filter((item) => item.trenchId === trenchId).map((item) => item.id)
  return artifactState.artifacts.filter((item) => unitIds.includes(item.stratumId)).reduce((sum, item) => sum + item.count, 0)
}

function relationsOf(trenchId: string): number {
  const unitIds = stratumState.strata.filter((item) => item.trenchId === trenchId).map((item) => item.id)
  return relationState.relations.filter((item) => unitIds.includes(item.unitAId) || unitIds.includes(item.unitBId)).length
}

/** 发掘进度状态 */
function progressOf(trench: Trench): { label: string; type: 'success' | 'warning' | 'info' } {
  if (trench.sealed) return { label: '已封存', type: 'info' }
  if (trench.backfilled) return { label: '已回填', type: 'info' }
  if (unitsOf(trench.id) === 0) return { label: '待发掘', type: 'warning' }
  if (trench.endDate) return { label: '发掘完成', type: 'success' }
  return { label: '发掘中', type: 'success' }
}

/** 该探方的封存清单版本（按版本号倒序） */
function sealsOf(trenchId: string): SealRecord[] {
  return sealState.seals.filter((item) => item.trenchId === trenchId)
}

/** 当前生效的封存清单 */
function activeSealOf(trenchId: string): SealRecord | null {
  return sealsOf(trenchId).find((item) => !item.unsealedAt) ?? null
}

function fmtTime(iso: string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('zh-CN', { hour12: false })
}

function deltaText(delta: number, unit: string): string {
  if (delta > 0) return `+${delta} ${unit}`
  if (delta < 0) return `${delta} ${unit}`
  return `持平（0 ${unit}）`
}

/* —— 交接封存 —— */
const sealDialogVisible = ref(false)
const sealTarget = ref<Trench | null>(null)
const sealOperator = ref('')

function openSeal(trench: Trench): void {
  sealTarget.value = trench
  sealOperator.value = trench.leader
  sealDialogVisible.value = true
}

async function confirmSeal(): Promise<void> {
  if (!sealTarget.value) return
  if (!sealOperator.value.trim()) {
    ElMessage.warning('请填写操作人（负责人）')
    return
  }
  const record = await sealStore.getState().seal(sealTarget.value.id, sealOperator.value)
  if (!record) {
    ElMessage.error('封存失败：探方不存在或已处于封存状态')
    return
  }
  ElMessage.success(
    `已封存并生成第 ${record.version} 版交接清单（${record.unitCount} 个单位 / ${record.artifactCount} 件出土物 / ${record.relationCount} 条关系）`
  )
  sealDialogVisible.value = false
}

/* —— 解除封存（必须填写漏登原因） —— */
const unsealDialogVisible = ref(false)
const unsealTarget = ref<Trench | null>(null)
const unsealReason = ref('')

function openUnseal(trench: Trench): void {
  unsealTarget.value = trench
  unsealReason.value = ''
  unsealDialogVisible.value = true
}

async function confirmUnseal(): Promise<void> {
  if (!unsealTarget.value) return
  if (!unsealReason.value.trim()) {
    ElMessage.warning('请填写解除原因（漏登说明），原因会记入封存清单')
    return
  }
  const record = await sealStore.getState().unseal(unsealTarget.value.id, unsealReason.value)
  if (!record) {
    ElMessage.error('解除失败：探方未处于封存状态')
    return
  }
  ElMessage.success(`已解除封存（第 ${record.version} 版清单已记录解除原因），补登后可重新封存`)
  unsealDialogVisible.value = false
}

/* —— 封存清单版本查看与对照 —— */
const manifestDialogVisible = ref(false)
const manifestTrench = ref<Trench | null>(null)
const activeVersion = ref(0)

function openManifest(trench: Trench): void {
  manifestTrench.value = trench
  activeVersion.value = sealsOf(trench.id)[0]?.version ?? 0
  manifestDialogVisible.value = true
}

const activeSeal = computed<SealRecord | null>(() =>
  manifestTrench.value
    ? sealsOf(manifestTrench.value.id).find((item) => item.version === activeVersion.value) ?? null
    : null
)
const prevSeal = computed<SealRecord | null>(() =>
  manifestTrench.value && activeSeal.value
    ? sealsOf(manifestTrench.value.id).find((item) => item.version === activeSeal.value!.version - 1) ?? null
    : null
)
const manifestDiff = computed(() =>
  activeSeal.value && prevSeal.value ? diffSealRecords(prevSeal.value, activeSeal.value) : null
)

/** 高亮当前查看的清单版本行 */
function sealRowClass({ row }: { row: SealRecord }): string {
  return row.version === activeVersion.value ? 'active-seal-row' : ''
}

function resetForm(): void {
  editingId.value = null
  form.code = ''
  form.area = trenchState.trenches[0]?.area ?? ''
  form.size = '5×5 米'
  form.basePoint = ''
  form.openLayer = '第①层'
  form.startDate = new Date().toISOString().slice(0, 10)
  form.endDate = ''
  form.leader = ''
  form.wallNote = ''
  form.backfilled = false
  form.sealed = false
}

function openCreate(): void {
  resetForm()
  dialogVisible.value = true
}

function openEdit(trench: Trench): void {
  editingId.value = trench.id
  Object.assign(form, {
    code: trench.code,
    area: trench.area,
    size: trench.size,
    basePoint: trench.basePoint,
    openLayer: trench.openLayer,
    startDate: trench.startDate,
    endDate: trench.endDate,
    leader: trench.leader,
    wallNote: trench.wallNote,
    backfilled: trench.backfilled,
    sealed: trench.sealed
  })
  dialogVisible.value = true
}

async function submit(): Promise<void> {
  if (!form.code.trim() || !form.area.trim()) {
    ElMessage.warning('探方号与发掘区必填')
    return
  }
  const candidate = { id: editingId.value ?? uid('tr'), area: form.area.trim(), code: form.code.trim().toUpperCase() }
  const conflict = findTrenchConflict(trenchState.trenches, candidate)
  if (conflict) {
    ElMessage.error(`「${trenchKey(candidate)}」已存在（同发掘区探方号必须唯一）`)
    return
  }
  const row: Trench = {
    id: candidate.id,
    code: candidate.code,
    area: candidate.area,
    size: form.size,
    basePoint: form.basePoint.trim(),
    openLayer: form.openLayer.trim(),
    startDate: form.startDate,
    endDate: form.endDate,
    leader: form.leader.trim(),
    wallNote: form.wallNote.trim(),
    backfilled: form.backfilled,
    sealed: form.sealed
  }
  await trenchStore.getState().save(row)
  ElMessage.success(`探方 ${trenchKey(row)} 已保存`)
  dialogVisible.value = false
}

async function remove(trench: Trench): Promise<void> {
  if (trench.sealed) {
    ElMessage.error('探方已交接封存，请先解除封存再删除')
    return
  }
  const units = unitsOf(trench.id)
  if (units > 0) {
    ElMessage.error(`${trenchKey(trench)} 下仍有 ${units} 个地层单位，请先清理下级记录`)
    return
  }
  await ElMessageBox.confirm(`确认删除探方「${trenchKey(trench)}」？`, '删除确认', { type: 'warning' })
  await trenchStore.getState().remove(trench.id)
  ElMessage.success('探方已删除')
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">探方清单</h2>
        <p class="page-sub">
          按「发掘区-探方号」校验唯一性；卡片展示地层单位数、出土物件数、层位关系数与发掘进度状态。
        </p>
      </div>
      <el-button type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon>新建探方
      </el-button>
    </div>

    <div class="toolbar">
      <el-select v-model="filterArea" placeholder="全部发掘区" clearable style="width: 180px">
        <el-option v-for="area in areas" :key="area" :label="area" :value="area" />
      </el-select>
      <el-tag effect="plain">命中 {{ visible.length }} / {{ trenchState.trenches.length }} 个探方</el-tag>
    </div>

    <div class="card-grid">
      <el-card v-for="trench in visible" :key="trench.id" shadow="hover" class="trench-card" :class="{ sealed: trench.sealed }">
        <div class="card-top">
          <TrenchTag :trench="trench" />
          <div class="card-tags">
            <el-tag v-if="trench.sealed" type="danger" size="small" effect="dark">已封存</el-tag>
            <el-tag :type="progressOf(trench).type" size="small" effect="plain">{{ progressOf(trench).label }}</el-tag>
          </div>
        </div>
        <div class="metrics">
          <div class="metric"><span>地层单位</span><b>{{ unitsOf(trench.id) }}</b></div>
          <div class="metric"><span>出土物件数</span><b>{{ artifactsOf(trench.id) }}</b></div>
          <div class="metric"><span>层位关系</span><b>{{ relationsOf(trench.id) }}</b></div>
          <div class="metric"><span>规格</span><b>{{ trench.size }}</b></div>
        </div>
        <el-descriptions :column="1" size="small" border class="desc">
          <el-descriptions-item label="基点坐标">{{ trench.basePoint || '—' }}</el-descriptions-item>
          <el-descriptions-item label="开口层位">{{ trench.openLayer || '—' }}</el-descriptions-item>
          <el-descriptions-item label="发掘日期">
            {{ trench.startDate }} ~ {{ trench.endDate || '进行中' }}
          </el-descriptions-item>
          <el-descriptions-item v-if="activeSealOf(trench.id)" label="封存时间">
            <span class="sealed-time">{{ fmtTime(activeSealOf(trench.id)!.sealedAt) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="负责人">{{ trench.leader || '—' }}</el-descriptions-item>
          <el-descriptions-item label="四壁方向备注">{{ trench.wallNote || '—' }}</el-descriptions-item>
        </el-descriptions>
        <div class="card-actions">
          <el-button size="small" @click="openEdit(trench)">编辑</el-button>
          <el-button v-if="!trench.sealed" size="small" type="warning" plain @click="openSeal(trench)">交接封存</el-button>
          <el-button v-else size="small" type="warning" @click="openUnseal(trench)">解除封存</el-button>
          <el-button v-if="sealsOf(trench.id).length > 0" size="small" plain @click="openManifest(trench)">
            封存清单<em class="ver-count">v{{ sealsOf(trench.id)[0].version }}</em>
          </el-button>
          <el-button size="small" @click="trenchStore.getState().setBackfilled(trench.id, !trench.backfilled)">
            {{ trench.backfilled ? '取消回填标记' : '标记已回填' }}
          </el-button>
          <el-button size="small" type="danger" plain @click="remove(trench)">删除</el-button>
        </div>
      </el-card>
      <el-empty v-if="visible.length === 0" description="暂无探方，先新建一个探方" />
    </div>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑探方' : '新建探方'" width="640px">
      <el-form label-width="110px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="发掘区" required>
              <el-input v-model="form.area" placeholder="如 Ⅱ区" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="探方号" required>
              <el-input v-model="form.code" placeholder="如 T0501" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="规格">
              <el-select v-model="form.size" style="width: 100%">
                <el-option v-for="item in TRENCH_SIZES" :key="item" :label="item" :value="item" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="基点坐标">
              <el-input v-model="form.basePoint" placeholder="如 N1200 / E3000" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="开口层位">
              <el-input v-model="form.openLayer" placeholder="如 第①层" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="负责人">
              <el-input v-model="form.leader" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="发掘起始">
              <el-date-picker v-model="form.startDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="发掘结束">
              <el-date-picker v-model="form.endDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="四壁备注">
          <el-input v-model="form.wallNote" type="textarea" :rows="2" placeholder="如 北壁、东壁保存较好；南壁被现代扰坑破坏" />
        </el-form-item>
        <el-form-item label="是否已回填">
          <el-switch v-model="form.backfilled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="sealDialogVisible" title="交接封存" width="540px">
      <template v-if="sealTarget">
        <el-alert
          class="seal-alert"
          type="warning"
          :closable="false"
          show-icon
          title="封存后，该探方下的地层单位、出土物、层位关系将转为只读；发现漏登须填写原因解除封存后才能补登。"
        />
        <el-descriptions :column="1" size="small" border>
          <el-descriptions-item label="探方">{{ sealTarget.area }} · {{ sealTarget.code }}</el-descriptions-item>
          <el-descriptions-item label="地层单位">{{ unitsOf(sealTarget.id) }} 个</el-descriptions-item>
          <el-descriptions-item label="出土物">{{ artifactsOf(sealTarget.id) }} 件</el-descriptions-item>
          <el-descriptions-item label="层位关系">{{ relationsOf(sealTarget.id) }} 条</el-descriptions-item>
          <el-descriptions-item label="清单版本">
            第 {{ (sealsOf(sealTarget.id)[0]?.version ?? 0) + 1 }} 版（封存时间自动记入清单）
          </el-descriptions-item>
        </el-descriptions>
        <el-form label-width="80px" class="seal-form">
          <el-form-item label="操作人" required>
            <el-input v-model="sealOperator" placeholder="一般为探方负责人" />
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="sealDialogVisible = false">取消</el-button>
        <el-button type="warning" @click="confirmSeal">确认封存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="unsealDialogVisible" title="解除封存" width="540px">
      <template v-if="unsealTarget">
        <el-descriptions v-if="activeSealOf(unsealTarget.id)" :column="1" size="small" border class="seal-alert">
          <el-descriptions-item label="生效清单">第 {{ activeSealOf(unsealTarget.id)!.version }} 版</el-descriptions-item>
          <el-descriptions-item label="封存时间">{{ fmtTime(activeSealOf(unsealTarget.id)!.sealedAt) }}</el-descriptions-item>
          <el-descriptions-item label="封存内容">
            {{ activeSealOf(unsealTarget.id)!.unitCount }} 个单位 ·
            {{ activeSealOf(unsealTarget.id)!.artifactCount }} 件出土物 ·
            {{ activeSealOf(unsealTarget.id)!.relationCount }} 条关系
          </el-descriptions-item>
        </el-descriptions>
        <el-form label-width="90px">
          <el-form-item label="解除原因" required>
            <el-input
              v-model="unsealReason"
              type="textarea"
              :rows="3"
              placeholder="如：H12 下新发现 2 件骨器漏登，需补录后重新封存"
            />
          </el-form-item>
        </el-form>
        <p class="seal-tip">解除原因会记入当前清单版本，补登完成后重新封存将生成新版清单，可与本版对照。</p>
      </template>
      <template #footer>
        <el-button @click="unsealDialogVisible = false">取消</el-button>
        <el-button type="warning" @click="confirmUnseal">确认解除</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="manifestDialogVisible"
      :title="manifestTrench ? `封存清单 · ${manifestTrench.area} · ${manifestTrench.code}` : '封存清单'"
      width="880px"
    >
      <template v-if="manifestTrench">
        <el-table
          :data="sealsOf(manifestTrench.id)"
          border
          size="small"
          row-key="id"
          :row-class-name="sealRowClass"
          @row-click="(row: SealRecord) => (activeVersion = row.version)"
        >
          <el-table-column label="版本" width="70">
            <template #default="{ row }: { row: SealRecord }">v{{ row.version }}</template>
          </el-table-column>
          <el-table-column label="封存时间" width="170">
            <template #default="{ row }: { row: SealRecord }">{{ fmtTime(row.sealedAt) }}</template>
          </el-table-column>
          <el-table-column prop="operator" label="操作人" width="90" />
          <el-table-column label="封存内容" min-width="200">
            <template #default="{ row }: { row: SealRecord }">
              {{ row.unitCount }} 个单位 · {{ row.artifactCount }} 件出土物 · {{ row.relationCount }} 条关系
            </template>
          </el-table-column>
          <el-table-column label="状态" min-width="220">
            <template #default="{ row }: { row: SealRecord }">
              <el-tag v-if="!row.unsealedAt" type="danger" size="small" effect="dark">生效中</el-tag>
              <template v-else>
                <el-tag type="info" size="small" effect="plain">已解除</el-tag>
                <span class="unseal-note">{{ fmtTime(row.unsealedAt) }} · {{ row.unsealReason }}</span>
              </template>
            </template>
          </el-table-column>
        </el-table>

        <div v-if="activeSeal" class="manifest-detail">
          <h4 class="detail-title">
            第 {{ activeSeal.version }} 版 · 单位明细（{{ activeSeal.unitCount }} 个单位 / {{ activeSeal.artifactCount }} 件）
          </h4>
          <el-table :data="activeSeal.units" border size="small" max-height="220">
            <el-table-column prop="code" label="单位号" width="120" />
            <el-table-column prop="type" label="类型" width="110" />
            <el-table-column label="出土物件数" min-width="120">
              <template #default="{ row }: { row: SealRecord['units'][number] }">{{ row.artifactCount }} 件</template>
            </el-table-column>
          </el-table>

          <div v-if="manifestDiff && prevSeal" class="diff-box">
            <h4 class="detail-title">与第 {{ prevSeal.version }} 版对照</h4>
            <p>
              地层单位 {{ deltaText(manifestDiff.unitCountDelta, '个') }}（{{ prevSeal.unitCount }} → {{ activeSeal.unitCount }}）；
              出土物 {{ deltaText(manifestDiff.artifactCountDelta, '件') }}（{{ prevSeal.artifactCount }} → {{ activeSeal.artifactCount }}）；
              层位关系 {{ deltaText(manifestDiff.relationCountDelta, '条') }}（{{ prevSeal.relationCount }} → {{ activeSeal.relationCount }}）
            </p>
            <p v-if="manifestDiff.addedUnits.length > 0">
              新增单位：{{ manifestDiff.addedUnits.map((unit) => `${unit.code}（${unit.type} · ${unit.artifactCount} 件）`).join('、') }}
            </p>
            <p v-if="manifestDiff.removedUnits.length > 0">
              移除单位：{{ manifestDiff.removedUnits.map((unit) => `${unit.code}（${unit.type} · ${unit.artifactCount} 件）`).join('、') }}
            </p>
            <p v-if="manifestDiff.changedUnits.length > 0">
              件数变化：{{ manifestDiff.changedUnits.map((item) => `${item.code} ${item.before} → ${item.after} 件`).join('；') }}
            </p>
            <p
              v-if="
                manifestDiff.addedUnits.length === 0 &&
                manifestDiff.removedUnits.length === 0 &&
                manifestDiff.changedUnits.length === 0
              "
              class="muted"
            >
              两版清单的单位与件数一致
            </p>
          </div>
          <p v-else class="muted diff-box">首个封存版本，无上一版可对照</p>
        </div>
      </template>
      <template #footer>
        <el-button @click="manifestDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.trench-card {
  border-radius: 12px;
}
.trench-card.sealed {
  border-color: #c0392b33;
  background: #fdf9f6;
}
.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.card-tags {
  display: flex;
  align-items: center;
  gap: 6px;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}
.metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f7f4ee;
  font-size: 12px;
  color: #7d7264;
}
.metric b {
  font-size: 14px;
  color: #3c2f1f;
}
.desc {
  margin-bottom: 12px;
}
.sealed-time {
  color: #c0392b;
  font-weight: 600;
}
.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.ver-count {
  font-style: normal;
  margin-left: 4px;
  font-size: 11px;
  color: #8a5a2b;
}
.seal-alert {
  margin-bottom: 12px;
}
.seal-form {
  margin-top: 14px;
}
.seal-tip {
  margin: 4px 0 0;
  font-size: 12px;
  color: #8a8073;
}
.manifest-detail {
  margin-top: 16px;
}
.detail-title {
  margin: 0 0 8px;
  font-size: 13px;
  color: #3c2f1f;
}
.diff-box {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f7f4ee;
  font-size: 12px;
  line-height: 1.9;
}
.diff-box p {
  margin: 0;
}
.unseal-note {
  margin-left: 6px;
  font-size: 11px;
  color: #8a8073;
}
.muted {
  color: #8a8073;
}
:deep(.el-table__row) {
  cursor: pointer;
}
:deep(.active-seal-row) {
  background: #f5ead3;
}
</style>
