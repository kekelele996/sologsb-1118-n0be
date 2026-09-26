<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { SealDiff, SealManifest, Trench } from '@/types'
import { diffManifests } from '@/types'
import { formatDateTime } from '@/utils/datetime'
import { sealStore } from '@/stores/sealStore'
import { useStore } from '@/hooks/usePersistentStore'

const props = defineProps<{
  modelValue: boolean
  trench: Trench | null
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
}>()

const sealState = useStore(sealStore)

/** 当前查看的版本（清单 id），默认最新一版 */
const selectedId = ref<string | null>(null)

watch(
  () => [props.modelValue, props.trench?.id] as const,
  ([open]) => {
    if (open) selectedId.value = history.value[0]?.id ?? null
  },
  { immediate: true }
)

/** 该探方的全部封存版本，新→旧 */
const history = computed<SealManifest[]>(() =>
  sealState.manifests
    .filter((item) => item.trenchId === props.trench?.id)
    .slice()
    .sort((a, b) => b.version - a.version)
)

const selected = computed<SealManifest | null>(
  () => history.value.find((item) => item.id === selectedId.value) ?? history.value[0] ?? null
)

/** 上一版清单（version - 1） */
const prevManifest = computed<SealManifest | null>(() => {
  if (!selected.value) return null
  return history.value.find((item) => item.version === selected.value!.version - 1) ?? null
})

const diff = computed<SealDiff | null>(() =>
  selected.value && prevManifest.value ? diffManifests(prevManifest.value, selected.value) : null
)

function deltaText(delta: number, suffix = ''): string {
  if (delta === 0) return '持平'
  return `${delta > 0 ? '+' : ''}${delta}${suffix}`
}

function deltaType(delta: number): 'success' | 'danger' | 'info' {
  if (delta > 0) return 'success'
  if (delta < 0) return 'danger'
  return 'info'
}

function close(): void {
  emit('update:modelValue', false)
}
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    :title="trench ? `交接封存清单 · ${trench.area} ${trench.code}` : '交接封存清单'"
    size="640px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-empty v-if="history.length === 0" description="该探方尚未封存过，暂无交接清单" />
    <template v-else-if="selected">
      <el-alert
        :title="selected.unsealedAt ? `该版清单已解除封存（第 ${selected.version} 版为历史版本）` : `当前处于第 ${selected.version} 版封存中，编目记录只读`"
        :type="selected.unsealedAt ? 'info' : 'warning'"
        :closable="false"
        show-icon
        class="alert"
      />

      <div class="version-bar">
        <el-radio-group v-model="selectedId" size="small">
          <el-radio-button v-for="item in history" :key="item.id" :value="item.id">
            第 {{ item.version }} 版{{ item.unsealedAt ? '（已解除）' : '（封存中）' }}
          </el-radio-button>
        </el-radio-group>
      </div>

      <el-descriptions :column="1" size="small" border class="desc">
        <el-descriptions-item label="封存时间">{{ formatDateTime(selected.sealedAt) }}</el-descriptions-item>
        <el-descriptions-item label="封存负责人">{{ selected.sealedBy || '—' }}</el-descriptions-item>
        <el-descriptions-item label="封存备注">{{ selected.note || '—' }}</el-descriptions-item>
        <el-descriptions-item label="解除时间">
          {{ selected.unsealedAt ? formatDateTime(selected.unsealedAt) : '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="解除人">{{ selected.unsealedBy || '—' }}</el-descriptions-item>
        <el-descriptions-item label="漏登/解除原因">
          <span :class="{ muted: !selected.unsealReason }">{{ selected.unsealReason || '—' }}</span>
        </el-descriptions-item>
      </el-descriptions>

      <div class="summary">
        <div class="summary-item">
          <span>地层单位</span>
          <b>{{ selected.unitCount }}</b>
        </div>
        <div class="summary-item">
          <span>出土物记录</span>
          <b>{{ selected.artifactRecords }}</b>
        </div>
        <div class="summary-item">
          <span>出土物件数</span>
          <b>{{ selected.artifactCount }}</b>
        </div>
        <div class="summary-item">
          <span>层位关系</span>
          <b>{{ selected.relationCount }}</b>
        </div>
      </div>

      <el-divider content-position="left">与上一版（第 {{ Math.max(selected.version - 1, 1) }} 版）对照</el-divider>

      <el-alert
        v-if="!diff"
        type="success"
        :closable="false"
        title="这是第 1 版封存清单，无上一版可对照"
        class="alert"
      />
      <template v-else>
        <div class="delta-row">
          <el-tag size="small" effect="plain">单位数 <el-tag :type="deltaType(diff.unitDelta)" size="small" effect="dark">{{ deltaText(diff.unitDelta) }}</el-tag></el-tag>
          <el-tag size="small" effect="plain">出土物记录 <el-tag :type="deltaType(diff.artifactRecordDelta)" size="small" effect="dark">{{ deltaText(diff.artifactRecordDelta) }}</el-tag></el-tag>
          <el-tag size="small" effect="plain">出土物件数 <el-tag :type="deltaType(diff.artifactCountDelta)" size="small" effect="dark">{{ deltaText(diff.artifactCountDelta, ' 件') }}</el-tag></el-tag>
          <el-tag size="small" effect="plain">层位关系 <el-tag :type="deltaType(diff.relationDelta)" size="small" effect="dark">{{ deltaText(diff.relationDelta, ' 条') }}</el-tag></el-tag>
        </div>

        <el-table :data="diff.added" size="small" border class="diff-table">
          <template #empty>无新增单位</template>
          <el-table-column label="新增单位" min-width="110">
            <template #default="{ row }: { row: SealManifest['units'][number] }">
              <el-tag type="success" size="small" effect="dark">新增</el-tag>
              <span class="mono">{{ row.code }}</span>
            </template>
          </el-table-column>
          <el-table-column label="类型" prop="type" width="80" />
          <el-table-column label="出土物记录" prop="artifactRecords" width="90" />
          <el-table-column label="件数" prop="artifactCount" width="70" />
        </el-table>

        <el-table :data="diff.removed" size="small" border class="diff-table">
          <template #empty>无删除单位</template>
          <el-table-column label="删除单位" min-width="110">
            <template #default="{ row }: { row: SealManifest['units'][number] }">
              <el-tag type="danger" size="small" effect="dark">删除</el-tag>
              <span class="mono">{{ row.code }}</span>
            </template>
          </el-table-column>
          <el-table-column label="类型" prop="type" width="80" />
          <el-table-column label="出土物记录" prop="artifactRecords" width="90" />
          <el-table-column label="件数" prop="artifactCount" width="70" />
        </el-table>

        <el-table :data="diff.changed" size="small" border class="diff-table">
          <template #empty>无出土物变动的单位</template>
          <el-table-column label="变动单位（件数 上一版→本版）" min-width="200">
            <template #default="{ row }: { row: SealDiff['changed'][number] }">
              <el-tag type="warning" size="small" effect="dark">变动</el-tag>
              <span class="mono">{{ row.next.code }}</span>
              <span class="change-text">
                {{ row.prev.artifactRecords }} 条 / {{ row.prev.artifactCount }} 件
                → {{ row.next.artifactRecords }} 条 / {{ row.next.artifactCount }} 件
              </span>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <el-divider content-position="left">封存时各单位明细</el-divider>
      <el-table :data="selected.units" size="small" border>
        <el-table-column label="序号" type="index" width="60" />
        <el-table-column label="单位号" prop="code" width="100">
          <template #default="{ row }: { row: SealManifest['units'][number] }">
            <span class="mono">{{ row.code }}</span>
          </template>
        </el-table-column>
        <el-table-column label="类型" prop="type" width="90" />
        <el-table-column label="出土物记录（条）" prop="artifactRecords" width="130" />
        <el-table-column label="出土物件数" prop="artifactCount" width="100" />
      </el-table>
    </template>

    <template #footer>
      <el-button @click="close">关 闭</el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
.alert {
  margin-bottom: 12px;
}
.version-bar {
  margin-bottom: 12px;
}
.desc {
  margin-bottom: 12px;
}
.summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.summary-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f7f4ee;
  font-size: 12px;
  color: #7d7264;
}
.summary-item b {
  font-size: 16px;
  color: #3c2f1f;
}
.delta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.diff-table {
  margin-bottom: 8px;
}
.change-text {
  margin-left: 6px;
  font-size: 12px;
  color: #8a5a2b;
}
.muted {
  color: #a89e90;
}
</style>
