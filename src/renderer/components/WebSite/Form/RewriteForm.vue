<template>
  <a-form name="rewrite" :label-col="{ span: 0 }" :wrapper-col="{ span: 24 }" autocomplete="off">
    <a-form-item label="">
      <a-select
        v-model:value="rewriteSelected"
        :options="rewriteList"
        style="width: 120px"
        @change="rewriteSelectChange"
      />
    </a-form-item>
    <a-form-item label="">
      <a-textarea v-model:value="content" :auto-size="{ minRows: 10, maxRows: 10 }" />
    </a-form-item>
  </a-form>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Website from '@/main/services/website/Website'
import { t } from '@/renderer/utils/i18n'

const props = defineProps({
  modelValue: { type: String, default: '' },
  confName: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])

const rewriteSelected = ref(0)
const rewriteList = ref([])

const content = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

onMounted(async () => {
  let list = await Website.getRewriteRuleList()
  rewriteList.value = list.map((item) => ({ value: item, label: item }))
  rewriteList.value.unshift({ label: t('Current'), value: 0 })
})

const rewriteSelectChange = async (val) => {
  if (val === 0) {
    content.value = props.confName ? await Website.getRewrite(props.confName) : ''
  } else {
    content.value = await Website.getRewriteByRule(val)
  }
}
</script>
