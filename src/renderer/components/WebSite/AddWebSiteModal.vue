<template>
  <a-modal
    :title="mt('Add', 'ws', 'Website')"
    :ok-text="t('Submit')"
    :cancel-text="t('Cancel')"
    @ok="addWebClick"
    v-model:open="visible"
    centered
    :maskClosable="false"
    :confirm-loading="submitting"
    class="left-tabs-modal"
  >
    <div class="modal-content">
      <a-tabs tabPosition="left" v-model:activeKey="activeKey" class="tabs">
        <a-tab-pane key="basicSetting" :tab="t('Basic')">
          <a-form ref="formRef" :model="formData" name="basic" autocomplete="off" :label-col="{ span: labelColSpan }" :wrapper-col="{ span: wrapperColSpan }">
            <a-form-item :label="t('DomainName') + ''" name="serverName" :rules="[{ required: true, message: t('cannotBeEmpty') }]">
              <a-input v-model:value="formData.serverName" @change="serverNameChange" spellcheck="false" />
            </a-form-item>

            <a-form-item :label="t('Port')" name="port" :rules="[{ required: true, type: 'number', min: 1, max: 65535 }]">
              <a-input-number v-model:value="formData.port" min="1" max="65535" />
            </a-form-item>

            <a-form-item :label="t('RootPath')" name="rootPath" :rules="rootPathRules">
              <input-open-dir-dialog v-model:value="formData.rootPath" :toForwardSlash="true"></input-open-dir-dialog>
            </a-form-item>

            <a-form-item :label="'PHP' + mt('ws', 'Version')" name="phpVersion">
              <a-select style="width: 180px;" v-model:value="formData.phpVersion" :options="phpOpts"/>
              <a-tooltip title="Open the nginx php config directory">
                <span class='icon-wrapper' @click='openWebPhpConfigDir'><FolderOpenFilled class='icon' /></span>
              </a-tooltip>

            </a-form-item>

            <a-form-item :label="mt('Sync', 'ws') + 'hosts'" name="syncHosts">
              <a-switch v-model:checked="formData.syncHosts" />
            </a-form-item>
          </a-form>
        </a-tab-pane>

        <a-tab-pane key="rewriteSetting" :tab="t('UrlRewrite')">
          <rewrite-form v-model="rewriteContent" />
        </a-tab-pane>

        <a-tab-pane key="sslSetting" tab="SSL">
          <ssl-form ref="sslFormRef" :model-value="sslData" :optional="true" />
        </a-tab-pane>
      </a-tabs>
    </div>
  </a-modal>
</template>

<script setup>
import { ref, reactive, inject } from 'vue'
import InputOpenDirDialog from '@/renderer/components/Input/InputOpenDirDialog.vue'
import RewriteForm from '@/renderer/components/WebSite/Form/RewriteForm.vue'
import SslForm from '@/renderer/components/WebSite/Form/SslForm.vue'
import path from 'path'
import Website from '@/main/services/website/Website'
import MessageBox from '@/renderer/utils/MessageBox'
import ChildAppExtend from '@/main/services/childApp/ChildAppExtend'
import Hosts from '@/main/utils/Hosts'
import Settings from '@/main/Settings'
import { mt, t } from '@/renderer/utils/i18n'
import { useMainStore } from '@/renderer/store'
import ServerService from '@/renderer/services/ServerService'
import { FolderOpenFilled } from '@ant-design/icons-vue'
import Opener from '@/renderer/utils/Opener'
import GetDataPath from '@/shared/helpers/GetDataPath'
import WebsiteService from '@/renderer/services/WebsiteService'
const { search, addModalVisible: visible } = inject('WebsiteProvide')

const wwwPath = Settings.get('WebsiteDir')?.replaceSlash()
const formRef = ref()
const sslFormRef = ref()
const submitting = ref(false)
const activeKey = ref('basicSetting')
const store = useMainStore()
const phpOpts = WebsiteService.getPhpOptions()
const formData = reactive({
  serverName: '',
  port: 80,
  rootPath: wwwPath,
  phpVersion: '',
  syncHosts: true
})
const rewriteContent = ref('')
const sslData = reactive({
  port: 443,
  certPath: '',
  keyPath: '',
  isForceHttps: false
})

const labelColSpan = store.settings.Language === 'zh' ? 6 : 8
const wrapperColSpan = store.settings.Language === 'zh' ? 18 : 16

const serverNameChange = () => {
  formData.serverName = formData.serverName?.trim().replaceAll(/[^-a-zA-Z0-9.]/g, '')
  formData.rootPath = path.join(wwwPath, formData.serverName).replaceSlash()
}

const addWebClick = async () => {
  let values
  try {
    values = await formRef.value.validate()
  } catch (errorInfo) {
    console.log('Validate Failed:', errorInfo)
    return
  }
  try {
    await sslFormRef.value.validate()
  } catch (errorInfo) {
    console.log('Validate Failed:', errorInfo)
    return
  }
  submitting.value = true
  try {
    await addWeb(values)
    search()
  } catch (errorInfo) {
    console.log('Add Website Failed:', errorInfo)
  } finally {
    submitting.value = false
  }
}

const addWeb = async (websiteInfo) => {
  const { serverName, phpVersion, syncHosts } = websiteInfo
  let confName = ''
  try {
    if (websiteInfo.phpVersion) await WebsiteService.checkCustomPhpConf(formData.phpVersion, phpOpts)
    await Website.add(websiteInfo)
    confName = Website.getConfName(serverName, websiteInfo.port)
    if (rewriteContent.value) {
      await Website.saveRewrite(confName, rewriteContent.value)
    }
    if (sslData.certPath || sslData.keyPath) {
      await Website.setSSL(confName, sslData)
    }
  } catch (error) {
    if (confName) {
      try {
        await Website.delete(confName)
      } catch (rollbackError) {
        MessageBox.error(rollbackError.message ?? rollbackError, t('Error adding website!'))
      }
    }
    MessageBox.error(error.message ?? error, t('Error adding website!'))
    return
  }
  visible.value = false
  formRef.value.resetFields()
  rewriteContent.value = ''
  Object.assign(sslData, { port: 443, certPath: '', keyPath: '', isForceHttps: false })
  if (syncHosts) {
    try {
      await Hosts.add(serverName)
    } catch (error) {
      MessageBox.error(error.message ?? error, t('errorOccurredDuring', [mt('sync', 'ws') + 'hosts']))
    }
  }

  if (Settings.get('AutoStartAndRestartServer') && ServerService.isRunning('Nginx')) {
    ServerService.restart('Nginx')
    if (phpVersion) {
      const option = phpOpts.find(item => item.value === phpVersion)
      const phpName = option.isCustom ? option.label : ChildAppExtend.getPhpName(phpVersion)
      ServerService.restart(phpName)
    }
  }
}

const rootPathRules = [
  {
    required: true,
    validator: async (_rule, value) => {
      if (value.includes(' ')) {
        return Promise.reject(t('pathCannotContainSpaces'))
      }
      return Promise.resolve()
    }
  }
]

const openWebPhpConfigDir = () => Opener.openDirectory(GetDataPath.getNginxPhpConfDir())
</script>

<style scoped>
.modal-content {
  height: 380px;

  .tabs {
    height: 100%;
  }
}
</style>
