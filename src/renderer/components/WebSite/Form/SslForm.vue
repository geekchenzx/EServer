<template>
  <a-form ref="formRef" :model="formData" name="ssl" autocomplete="off" :label-col="{ span: labelColSpan }" :wrapper-col="{ span: wrapperColSpan }">
    <a-form-item :label="t('Port')" name="port" :rules="[{ required: true, type: 'number', min: 1, max: 65535 }]">
      <a-input-number v-model:value="formData.port" min="1" max="65535" />
    </a-form-item>

    <a-form-item :label="mt('Certificate')" name="certPath" :rules="certRules">
      <input-open-file-dialog v-model:value="formData.certPath" :to-forward-slash="true" />
    </a-form-item>

    <a-form-item label="Key" name="keyPath" :rules="keyRules">
      <input-open-file-dialog v-model:value="formData.keyPath" :to-forward-slash="true" />
    </a-form-item>

    <a-form-item :label="mt('Force', 'ws') + 'Https'" name="isForceHttps">
      <a-switch v-model:checked="formData.isForceHttps" />
    </a-form-item>
  </a-form>
</template>

<script setup>
import { ref, computed } from 'vue'
import InputOpenFileDialog from '@/renderer/components/Input/InputOpenFileDialog.vue'
import { mt, t } from '@/renderer/utils/i18n'
import { useMainStore } from '@/renderer/store'

const props = defineProps({
  modelValue: { type: Object, required: true },
  optional: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const store = useMainStore()
const formRef = ref()
const labelColSpan = store.settings.Language === 'zh' ? 6 : 10
const wrapperColSpan = store.settings.Language === 'zh' ? 18 : 14

const formData = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const certRules = [
  {
    validator: async (_rule, value) => {
      if (props.optional && !value && !formData.value.keyPath) return Promise.resolve()
      if (!value) return Promise.reject(t('cannotBeEmpty'))
      return Promise.resolve()
    }
  }
]

const keyRules = [
  {
    validator: async (_rule, value) => {
      if (props.optional && !formData.value.certPath && !value) return Promise.resolve()
      if (!value) return Promise.reject(t('cannotBeEmpty'))
      return Promise.resolve()
    }
  }
]

defineExpose({
  validate: () => formRef.value.validate()
})
</script>
