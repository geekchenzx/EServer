<template>
  <div>
    <rewrite-form v-model="content" :conf-name="confName" />

    <div style="text-align: center">
      <a-button type="primary" @click="save">{{ t('Save') }}</a-button>
    </div>
  </div>
</template>

<script setup>
import { ref, inject, onMounted } from 'vue'
import RewriteForm from '@/renderer/components/WebSite/Form/RewriteForm.vue'
import Website from '@/main/services/website/Website'
import MessageBox from '@/renderer/utils/MessageBox'
import { message } from 'ant-design-vue'
import { t } from '@/renderer/utils/i18n'

const { confName } = inject('WebsiteProvide')
const emits = defineEmits(['editAfter'])
const content = ref('')

onMounted(async () => {
  content.value = await Website.getRewrite(confName.value)
})

const save = async () => {
  try {
    await Website.saveRewrite(confName.value, content.value)
    message.info(t('successfulOperation'))
  } catch (error) {
    MessageBox.error(error.message ?? error)
  }

  emits('editAfter')
}
</script>
