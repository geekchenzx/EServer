# 添加网站支持 URL 重写与 SSL 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让“添加网站”弹窗支持一次性配置 URL 重写与 SSL，并发布 EServer 4.8.3。

**Architecture:** 抽取可复用的 `RewriteForm`/`SslForm` 表单组件，修改网站弹窗继续用它们且行为不变；添加网站弹窗改为左侧 3 Tab，提交时先 `Website.add`，再写入重写、配置 SSL，失败则删除刚创建的网站回滚。

**Tech Stack:** Vue 3（`<script setup>`）、Ant Design Vue 4、Electron（主进程服务类经 renderer 直接 import 的既有模式）、electron-builder。

## Global Constraints

- 版本号从 `4.8.2` 升级到 `4.8.3`，同步修改 `package.json` 和 `package-lock.json`。
- 不改变 Nginx 配置生成格式，只复用 `Nginx.addWebsite` 模板中已有的 `#REWRITE_START`、`#SSL_START` 区块。
- 修改网站弹窗（`EditWebSiteModal.vue`）的现有行为、校验、按钮不变。
- 添加网站失败时回滚已创建网站；回滚自身失败则保留网站并提示。
- 所有文案只用现有 `t()`/`mt()` 键，不新增 i18n 条目。
- 验证命令：`npm run lint`、`npm run build`、`npm run build:win`。
- 发布方式：推送 `v4.8.3` tag 到 `origin`，由 `.github/workflows/build.yml` 的 GitHub Actions 构建并发布 Release。

---

### Task 1: 新增可复用 RewriteForm 组件

**Files:**
- Create: `src/renderer/components/WebSite/Form/RewriteForm.vue`

**Interfaces:**
- Consumes: `Website.getRewriteRuleList()`、`Website.getRewrite(confName)`、`Website.getRewriteByRule(ruleName)`，均来自 `@/main/services/website/Website`（已存在）。
- Produces: 组件 props `modelValue: string`、`confName: string`；emits `update:modelValue`。`confName` 为空表示添加模式。

- [ ] **Step 1: 创建组件**

```vue
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
```

- [ ] **Step 2: 运行 lint**

Run: `npm run lint`
Expected: 无 ESLint error。

- [ ] **Step 3: 运行构建**

Run: `npm run build`
Expected: 构建成功，无未解析 import。

- [ ] **Step 4: 提交**

```bash
git add src/renderer/components/WebSite/Form/RewriteForm.vue
git commit -m "feat: 抽取网站URL重写表单组件"
```

---

### Task 2: 新增可复用 SslForm 组件

**Files:**
- Create: `src/renderer/components/WebSite/Form/SslForm.vue`

**Interfaces:**
- Consumes: `InputOpenFileDialog`、`useMainStore`、`t()`/`mt()`。
- Produces: 组件 props `modelValue: object`、`optional: boolean`；emits `update:modelValue`；`defineExpose({ validate })`。`optional=true` 时两者都空则跳过 SSL，填任一则两者必填。

- [ ] **Step 1: 创建组件**

```vue
<template>
  <a-form
    ref="formRef"
    :model="formData"
    name="ssl"
    autocomplete="off"
    :label-col="{ span: labelColSpan }"
    :wrapper-col="{ span: wrapperColSpan }"
  >
    <a-form-item :label="t('Port')" name="port" :rules="[{ required: true, type: 'number', min: 1, max: 65535 }]">
      <a-input-number v-model:value="formData.port" min="1" max="65535" />
    </a-form-item>

    <a-form-item :label="mt('Certificate')" name="certPath" :rules="certRules">
      <input-open-file-dialog v-model:value="formData.certPath" :toForwardSlash="true" />
    </a-form-item>

    <a-form-item label="Key" name="keyPath" :rules="keyRules">
      <input-open-file-dialog v-model:value="formData.keyPath" :toForwardSlash="true" />
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
```

- [ ] **Step 2: 运行 lint**

Run: `npm run lint`
Expected: 无 ESLint error。

- [ ] **Step 3: 运行构建**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 4: 提交**

```bash
git add src/renderer/components/WebSite/Form/SslForm.vue
git commit -m "feat: 抽取网站SSL表单组件"
```

---

### Task 3: 重构修改网站 SSL 设置组件

**Files:**
- Modify: `src/renderer/components/WebSite/EditWebSite/SslSetting.vue`（整文件替换）

**Interfaces:**
- Consumes: `SslForm`（`:model-value` 传 reactive 对象，`:optional="false"`），`Website.setSSL`、`Website.closeSSL`、`Website.getSslInfo`。
- Produces: 保持 `editAfter` 事件与现有按钮行为不变。

- [ ] **Step 1: 替换文件内容**

```vue
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
```

- [ ] **Step 2: 运行 lint**

Run: `npm run lint`
Expected: 无 ESLint error。

- [ ] **Step 3: 运行构建**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 4: 提交**

```bash
git add src/renderer/components/WebSite/EditWebSite/SslSetting.vue
git commit -m "refactor: SSL设置组件复用SslForm"
```

---

### Task 4: 重构修改网站 URL 重写设置组件

**Files:**
- Modify: `src/renderer/components/WebSite/EditWebSite/RewriteSetting.vue`（整文件替换）

**Interfaces:**
- Consumes: `RewriteForm`（`:conf-name` 传 confName，`v-model` 绑定内容），`Website.getRewrite`、`Website.saveRewrite`。
- Produces: 保持 `editAfter` 事件与保存按钮行为不变。

- [ ] **Step 1: 替换文件内容**

```vue
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
```

- [ ] **Step 2: 运行 lint**

Run: `npm run lint`
Expected: 无 ESLint error。

- [ ] **Step 3: 运行构建**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 4: 提交**

```bash
git add src/renderer/components/WebSite/EditWebSite/RewriteSetting.vue
git commit -m "refactor: URL重写设置组件复用RewriteForm"
```

---

### Task 5: Website 服务增加 getConfName

**Files:**
- Modify: `src/main/services/website/Website.js`（在 `getConfPath` 方法附近新增）

**Interfaces:**
- Consumes: `Nginx.getWebsiteConfName(serverName, port)`（已存在）。
- Produces: `Website.getConfName(serverName, port) -> string`。

- [ ] **Step 1: 新增方法**

在 `src/main/services/website/Website.js` 的 `static getConfPath(confName)` 方法上方加入：

```js
    static getConfName(serverName, port) {
        return Nginx.getWebsiteConfName(serverName, port)
    }
```

- [ ] **Step 2: 运行 lint**

Run: `npm run lint`
Expected: 无 ESLint error。

- [ ] **Step 3: 运行构建**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 4: 提交**

```bash
git add src/main/services/website/Website.js
git commit -m "feat: Website服务增加getConfName方法"
```

---

### Task 6: 添加网站弹窗改为 3 Tab 并支持重写与 SSL

**Files:**
- Modify: `src/renderer/components/WebSite/AddWebSiteModal.vue`（整文件替换）

**Interfaces:**
- Consumes: `RewriteForm`、`SslForm`、`Website.add/saveRewrite/setSSL/delete/getConfName`、既有 `Hosts`/`ServerService`/`Settings` 逻辑。
- Produces: 添加流程一次性完成；失败回滚；成功后沿用现有同步 hosts、自动重启逻辑。

- [ ] **Step 1: 替换文件内容**

```vue
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
```

- [ ] **Step 2: 运行 lint**

Run: `npm run lint`
Expected: 无 ESLint error。

- [ ] **Step 3: 运行构建**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 4: 提交**

```bash
git add src/renderer/components/WebSite/AddWebSiteModal.vue
git commit -m "feat: 添加网站支持URL重写与SSL，失败自动回滚"
```

---

### Task 7: 升级版本到 4.8.3 并验证

**Files:**
- Modify: `package.json:4`
- Modify: `package-lock.json`（`version` 两处：第 3 行和第 9 行附近）

**Interfaces:**
- Produces: `package.json` 与 `package-lock.json` 版本均为 `4.8.3`。

- [ ] **Step 1: 修改版本号**

将 `package.json` 第 4 行 `"version": "4.8.2"` 改为 `"version": "4.8.3"`。
将 `package-lock.json` 第 3 行和第 9 行附近的 `"4.8.2"` 改为 `"4.8.3"`（只改根包版本，不修改依赖版本）。

- [ ] **Step 2: 运行 lint**

Run: `npm run lint`
Expected: 无 ESLint error。

- [ ] **Step 3: 运行构建**

Run: `npm run build`
Expected: 构建成功，输出到 `out/`。

- [ ] **Step 4: 本地打包 Windows 安装包**

Run: `npm run build:win`
Expected: `dist/` 下生成 `EServer-4.8.3-setup.exe`、zip 等产物。若 arm64 zip 因环境缺少工具失败，记录原因并在最终回复中说明，不能掩盖。

- [ ] **Step 5: 提交计划文档**

```bash
git add docs/superpowers/plans/2026-08-14-website-add-rewrite-ssl.md
git commit -m "docs: 添加网站URL重写与SSL实施计划"
```

- [ ] **Step 6: 检查工作区并提交版本**

Run: `git status --short`
Expected: 仅 `package.json`、`package-lock.json` 有改动。

```bash
git add package.json package-lock.json
git commit -m "v4.8.3"
```

---

### Task 8: 发布 4.8.3

**Files:**
- 无文件改动；执行 git 发布。

**Interfaces:**
- 依赖：本地分支 `dev-v4.7.0`，远程 `origin` 为 `https://github.com/geekchenzx/EServer.git`。
- 产出：`v4.8.3` tag；GitHub Actions `.github/workflows/build.yml` 在 tag push 时自动构建并创建 Release。

- [ ] **Step 1: 确认历史与标签**

Run: `git log --oneline -8`
Expected: 最新为 `v4.8.3` 提交，其下是各 feat/refactor 提交。

- [ ] **Step 2: 打 tag**

```bash
git tag v4.8.3
```

- [ ] **Step 3: 推送分支与 tag**

```bash
git push origin dev-v4.7.0
git push origin v4.8.3
```

Expected: 推送成功；`https://github.com/geekchenzx/EServer/actions` 出现 tag push 触发的 Build/release workflow。

- [ ] **Step 4: 确认发布触发**

Run: `git ls-remote --tags origin`
Expected: 输出包含 `refs/tags/v4.8.3`。GitHub Actions 完成后 Release 自动生成（gh CLI 在本机不可用，无法本地查询 Actions 状态，最终回复中说明）。
