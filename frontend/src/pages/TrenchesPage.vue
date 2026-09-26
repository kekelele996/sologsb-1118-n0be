<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Trench } from '@/types'
import { TRENCH_SIZES, findTrenchConflict, trenchKey } from '@/types'
import TrenchTag from '@/components/common/TrenchTag.vue'
import SealManifestDrawer from '@/components/common/SealManifestDrawer.vue'
import { useStore } from '@/hooks/usePersistentStore'
import { trenchStore } from '@/stores/trenchStore'
import { stratumStore } from '@/stores/stratumStore'
import { artifactStore } from '@/stores/artifactStore'
import { relationStore } from '@/stores/relationStore'
import { sealStore } from '@/stores/sealStore'
import { formatDateTime } from '@/utils/datetime'
import { uid } from '@/utils/id'

const trenchState = useStore(trenchStore)
const stratumState = useStore(stratumStore)
const artifactState = useStore(artifactStore)
const relationState = useStore(relationStore)
const sealState = useStore(sealStore)

const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const filterArea = ref('')

const sealDialogVisible = ref(false)
const unsealDialogVisible = ref(false)
const activeTrenchId = ref<string | null>(null)
const manifestTrench = ref<Trench | null>(null)

const sealForm = reactive({
  sealedBy: '',
  note: ''
})
const unsealForm = reactive({
  reason: '',
  unsealedBy: ''
})

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
  backfilled: false
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

/** 该探方当前封存中的清单（未解除） */
function activeManifestOf(trenchId: string) {
  return sealState.activeByTrench.get(trenchId) ?? null
}

/** 该探方最近一次封存版本（含已解除的历史版本） */
function latestManifestOf(trenchId: string) {
  const list = sealState.manifests.filter((item) => item.trenchId === trenchId)
  return list.length > 0 ? list.reduce((latest, item) => (item.version > latest.version ? item : latest)) : null
}

function isSealed(trenchId: string): boolean {
  return Boolean(activeManifestOf(trenchId))
}

/** 发掘进度状态 */
function progressOf(trench: Trench): { label: string; type: 'success' | 'warning' | 'info' } {
  if (isSealed(trench.id)) return { label: '封存交接中', type: 'warning' }
  if (trench.backfilled) return { label: '已回填', type: 'info' }
  if (unitsOf(trench.id) === 0) return { label: '待发掘', type: 'warning' }
  if (trench.endDate) return { label: '发掘完成', type: 'success' }
  return { label: '发掘中', type: 'success' }
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
}

function openCreate(): void {
  resetForm()
  dialogVisible.value = true
}

function openEdit(trench: Trench): void {
  if (isSealed(trench.id)) {
    ElMessage.warning('该探方已封存交接，基础信息只读；如有漏登请先解除封存')
    return
  }
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
    backfilled: trench.backfilled
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
    backfilled: form.backfilled
  }
  try {
    await trenchStore.getState().save(row)
  } catch (error) {
    ElMessage.error((error as Error).message)
    return
  }
  ElMessage.success(`探方 ${trenchKey(row)} 已保存`)
  dialogVisible.value = false
}

async function remove(trench: Trench): Promise<void> {
  const units = unitsOf(trench.id)
  if (units > 0) {
    ElMessage.error(`${trenchKey(trench)} 下仍有 ${units} 个地层单位，请先清理下级记录`)
    return
  }
  await ElMessageBox.confirm(`确认删除探方「${trenchKey(trench)}」？`, '删除确认', { type: 'warning' })
  try {
    await trenchStore.getState().remove(trench.id)
  } catch (error) {
    ElMessage.error((error as Error).message)
    return
  }
  ElMessage.success('探方已删除')
}

async function toggleBackfilled(trench: Trench): Promise<void> {
  try {
    await trenchStore.getState().setBackfilled(trench.id, !trench.backfilled)
  } catch (error) {
    ElMessage.error((error as Error).message)
  }
}

function openSeal(trench: Trench): void {
  activeTrenchId.value = trench.id
  const previous = latestManifestOf(trench.id)
  sealForm.sealedBy = trench.leader || previous?.sealedBy || ''
  sealForm.note = ''
  sealDialogVisible.value = true
}

async function submitSeal(): Promise<void> {
  if (!activeTrenchId.value) return
  if (!sealForm.sealedBy.trim()) {
    ElMessage.warning('请填写封存负责人')
    return
  }
  const trench = trenchState.trenches.find((item) => item.id === activeTrenchId.value)
  if (!trench) return
  try {
    await ElMessageBox.confirm(
      `确认封存「${trenchKey(trench)}」？封存后该探方的地层单位、出土物与层位关系将只读，并固化新一版交接清单。`,
      '封存交接确认',
      { type: 'warning', confirmButtonText: '确认封存' }
    )
    const manifest = await sealStore.getState().seal({
      trenchId: trench.id,
      sealedBy: sealForm.sealedBy,
      note: sealForm.note
    })
    ElMessage.success(
      `已封存：${manifest.unitCount} 个单位、${manifest.artifactCount} 件出土物、${manifest.relationCount} 条关系（第 ${manifest.version} 版清单）`
    )
    sealDialogVisible.value = false
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error((error as Error).message)
  }
}

function openUnseal(trench: Trench): void {
  activeTrenchId.value = trench.id
  unsealForm.reason = ''
  unsealForm.unsealedBy = trench.leader || activeManifestOf(trench.id)?.sealedBy || ''
  unsealDialogVisible.value = true
}

async function submitUnseal(): Promise<void> {
  if (!activeTrenchId.value) return
  if (!unsealForm.reason.trim()) {
    ElMessage.warning('发现漏登需补录时，必须填写解除原因（漏登说明）')
    return
  }
  if (!unsealForm.unsealedBy.trim()) {
    ElMessage.warning('请填写解除操作人')
    return
  }
  const trench = trenchState.trenches.find((item) => item.id === activeTrenchId.value)
  try {
    await sealStore.getState().unseal({
      trenchId: activeTrenchId.value,
      reason: unsealForm.reason,
      unsealedBy: unsealForm.unsealedBy
    })
    ElMessage.success(`「${trench ? trenchKey(trench) : ''}」已解除封存，可补录修改；修改后请重新封存生成新版本清单`)
    unsealDialogVisible.value = false
  } catch (error) {
    ElMessage.error((error as Error).message)
  }
}

function openManifest(trench: Trench): void {
  manifestTrench.value = trench
  manifestDrawerVisible.value = true
}

/** 抽屉显式与 trench 选择联动（v-model 适配） */
const manifestDrawerVisible = computed({
  get: () => manifestTrench.value !== null,
  set: (value: boolean) => {
    if (!value) manifestTrench.value = null
  }
})
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">探方清单</h2>
        <p class="page-sub">
          按「发掘区-探方号」校验唯一性；卡片展示地层单位数、出土物件数、层位关系数与发掘进度。负责人封存后探方编目只读，交接清单记录封存时间与各单位件数。
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
      <el-tag type="warning" effect="plain">封存中 {{ sealState.activeByTrench.size }} 个</el-tag>
    </div>

    <div class="card-grid">
      <el-card v-for="trench in visible" :key="trench.id" shadow="hover" class="trench-card" :class="{ sealed: isSealed(trench.id) }">
        <div class="card-top">
          <TrenchTag :trench="trench" />
          <el-tag :type="progressOf(trench).type" size="small" effect="plain">{{ progressOf(trench).label }}</el-tag>
        </div>

        <el-alert
          v-if="activeManifestOf(trench.id)"
          class="seal-banner"
          type="warning"
          :closable="false"
          show-icon
        >
          <template #title>
            第 {{ activeManifestOf(trench.id)?.version }} 版封存中 · {{ formatDateTime(activeManifestOf(trench.id)?.sealedAt ?? '') }} ·
            负责人 {{ activeManifestOf(trench.id)?.sealedBy || '—' }}
          </template>
          <template #default>
            <span>编目记录只读；解除需登记漏登原因</span>
          </template>
        </el-alert>

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
          <el-descriptions-item label="负责人">{{ trench.leader || '—' }}</el-descriptions-item>
          <el-descriptions-item label="四壁方向备注">{{ trench.wallNote || '—' }}</el-descriptions-item>
        </el-descriptions>
        <div class="card-actions">
          <template v-if="isSealed(trench.id)">
            <el-button size="small" type="primary" plain @click="openManifest(trench)">交接清单（{{ latestManifestOf(trench.id)?.version }} 版）</el-button>
            <el-button size="small" type="warning" @click="openUnseal(trench)">解除封存（漏登补录）</el-button>
          </template>
          <template v-else>
            <el-button size="small" @click="openEdit(trench)">编辑</el-button>
            <el-button size="small" type="primary" @click="openSeal(trench)">封存交接</el-button>
            <el-button size="small" @click="toggleBackfilled(trench)">
              {{ trench.backfilled ? '取消回填标记' : '标记已回填' }}
            </el-button>
            <el-button size="small" type="danger" plain @click="remove(trench)">删除</el-button>
            <el-button
              v-if="latestManifestOf(trench.id)"
              size="small"
              link
              @click="openManifest(trench)"
            >历史清单（{{ latestManifestOf(trench.id)?.version }} 版）</el-button>
          </template>
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

    <el-dialog v-model="sealDialogVisible" title="封存交接" width="520px">
      <el-alert
        v-if="activeTrenchId && latestManifestOf(activeTrenchId)"
        class="alert"
        type="info"
        :closable="false"
        show-icon
        :title="`该探方此前已封存过 ${latestManifestOf(activeTrenchId)?.version} 版（已解除），本次封存将生成第 ${(latestManifestOf(activeTrenchId)?.version ?? 0) + 1} 版清单`"
      />
      <el-alert
        class="alert"
        type="warning"
        :closable="false"
        show-icon
        title="封存后，该探方下的地层单位、出土物、层位关系即刻只读"
        description="清单将记录封存时间、负责人，以及封存时刻各单位数与出土物件数；发现漏登须先填写原因解除封存，修改后重新封存会留下新版清单，可与上一版对照。"
      />
      <el-form label-width="110px">
        <el-form-item label="封存负责人" required>
          <el-input v-model="sealForm.sealedBy" placeholder="交接封存的负责人" />
        </el-form-item>
        <el-form-item label="封存备注">
          <el-input v-model="sealForm.note" type="textarea" :rows="2" placeholder="如 换班交接，四壁剖面已拍照" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="sealDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitSeal">确认封存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="unsealDialogVisible" title="解除封存（漏登补录）" width="520px">
      <el-alert
        class="alert"
        type="warning"
        :closable="false"
        show-icon
        title="解除后可补录/修改编目，修改完成须重新封存"
        description="本次解除原因会记录在当前版本清单中；重新封存后生成新版本，两版可在交接清单中对照。"
      />
      <el-form label-width="110px">
        <el-form-item label="漏登/解除原因" required>
          <el-input
            v-model="unsealForm.reason"
            type="textarea"
            :rows="3"
            placeholder="必须填写，如：H12 底部漏登 1 件陶罐，补录出土坐标与照片号"
          />
        </el-form-item>
        <el-form-item label="解除操作人" required>
          <el-input v-model="unsealForm.unsealedBy" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="unsealDialogVisible = false">取消</el-button>
        <el-button type="warning" @click="submitUnseal">确认解除封存</el-button>
      </template>
    </el-dialog>

    <SealManifestDrawer v-model="manifestDrawerVisible" :trench="manifestTrench" />
  </div>
</template>

<style scoped>
.trench-card {
  border-radius: 12px;
}
.trench-card.sealed {
  border-color: #e0b35a;
  box-shadow: 0 0 0 1px #e0b35a33;
}
.seal-banner {
  margin-bottom: 10px;
}
.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
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
.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.alert {
  margin-bottom: 12px;
}
</style>
