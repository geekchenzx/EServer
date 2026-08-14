<template>
  <div>
    <ssl-form ref="formRef" :model-value="formData" :optional="false" />

    <div style="display: flex; justify-content: space-evenly">
      <a-button type="primary" @click="save">{{ t('Save') }}</a-button>
      <a-button type="primary" @click="close">{{ mt('Close', 'ws') + 'SSL' }}</a-button>
    </div>
  </div>
</template>

<script setup>
import { ref, inject, reactive, onMounted } from 'vue'
import SslForm from '@/renderer/components/WebSite/Form/SslForm.vue'
import Website from '@/main/services/website/Website'
import { message } from 'ant-design-vue'
import MessageBox from '@/renderer/utils/MessageBox'
import { mt, t } from '@/renderer/utils/i18n'

const { confName } = inject('WebsiteProvide')
const formRef = ref()
const emits = defineEmits(['editAfter'])

const initSslInfo = {
  port: 443,
  certPath: '',
  keyPath: '',
  isForceHttps: false
}

const formData = reactive({ ...initSslInfo })

onMounted(async () => {
  const sslInfo = await Website.getSslInfo(confName.value)
  Object.assign(formData, sslInfo)
  formData.port = formData.port ?? initSslInfo.port
})

const save = async () => {
  try {
    await formRef.value.validate()
  } catch (errorInfo) {
    console.log('Validate Failed:', errorInfo)
    return
  }
  try {
    await Website.setSSL(confName.value, formData)
    message.info(t('successfulOperation'))
    const sslInfo = await Website.getSslInfo(confName.value)
    Object.assign(formData, sslInfo)
  } catch (error) {
    MessageBox.error(error.message ?? error)
    return
  }

  emits('editAfter')
}

const close = async () => {
  try {
    await Website.closeSSL(confName.value)
    Object.assign(formData, initSslInfo)
    message.info(t('successfulOperation'))
  } catch (error) {
    MessageBox.error(error.message ?? error)
    return
  }

  emits('editAfter')
}
</script>
