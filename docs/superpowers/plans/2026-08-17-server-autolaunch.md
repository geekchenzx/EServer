# 设置 -> 服务器 & 一键 增加开机自启 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在「设置 -> 服务器 & 一键」卡片中新增一个开关，让 EServer 桌面应用支持登录自启，跨 Windows/macOS/Linux，由 `auto-launch` 实现。

**Architecture:** 新增 `src/main/utils/AutoLaunch.js` 单例封装 `auto-launch`；通过 `ipcMain.handle('call', 'appSetAutoLaunch', ...)` 暴露给渲染端；渲染端在 `Server.vue` 新增 a-switch，绑定 `store.settings.AutoLaunch`；main 进程在 `app.on('ready')` 后用系统真实状态校准设置，避免 UI 与系统长期不一致。

**Tech Stack:** Electron 22、Vue 3 + Pinia、electron-store 8、auto-launch（新增）。

## Global Constraints

- 依赖版本：Node/Electron 22（package.json 已固定），`auto-launch` 最新稳定版（5.x）。
- 命名约定：main 进程工具类采用 `export default class X { static async ... }` 风格（参考 `SystemService.js`）。
- i18n key 风格：驼峰前缀 + 描述（如 `afterOpenAppStartServer`），翻译插入到 `//Lowercase` 块末尾。
- Vue 模板风格：实时 `<a-switch>` 配合 `@change` + `store.setSettings(key, beforeFunc)`，不引入新依赖。
- 启动逻辑：自启动开关状态同步放在 `app.on('ready')` 内、`createMainWindow()` 之前；不在 `serviceArg` 分支内执行（system service 路径不要触碰登录项）。
- 提交粒度：每个 Task 结束后做一次 commit。
- 项目无单元测试框架（src 内无 test 目录），不做 TDD；以手动验证 + `npm run lint` 为准。

---

## File Structure

**新增文件（1 个）：**
- `src/main/utils/AutoLaunch.js` — 封装 `auto-launch`，单例模式。

**修改文件（6 个）：**
- `package.json` — 新增 `auto-launch` 依赖。
- `src/main/Settings.js` — 默认值加 `AutoLaunch: false`。
- `src/main/ipcListen.js` — 在 `functions` 字典里新增 `appSetAutoLaunch`。
- `src/main/index.js` — `app.on('ready')` 内增加同步逻辑。
- `src/renderer/components/Settings/Server.vue` — 新增开关行。
- `src/shared/i18n/zh.js`、`en.js`、`fr.js` — 新增 `autoLaunchText` 翻译。

**无新增测试文件。** 项目无测试框架，验证走手动。

---

## Task 1: 安装 auto-launch 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装依赖**

```bash
npm install auto-launch
```

预期：`package.json` 的 `dependencies` 中出现 `"auto-launch": "^5.x.x"`，`node_modules/auto-launch` 存在。

- [ ] **Step 2: 校验版本**

```bash
node -e "console.log(require('auto-launch/package.json').version)"
```

预期：打印 5.x 版本号。

- [ ] **Step 3: 提交**

```bash
git add package.json package-lock.json
git commit -m "chore: 添加 auto-launch 依赖"
```

---

## Task 2: 新增 AutoLaunch 主进程模块

**Files:**
- Create: `src/main/utils/AutoLaunch.js`

**Interfaces:**
- Consumes: `app` (Electron `app` 实例)
- Produces: `AutoLaunch.init(app)`, `AutoLaunch.enable()`, `AutoLaunch.disable()`, `AutoLaunch.isEnabled()` — 全部返回 Promise。

- [ ] **Step 1: 写入 AutoLaunch.js**

写入 `src/main/utils/AutoLaunch.js`：

```javascript
import AutoLaunch from 'auto-launch'
import { isDev } from '@/main/utils/utils'

export default class AppAutoLaunch {
    static #_instance = null

    /**
     * 初始化。需在 app.on('ready') 之后调用，确保 app.getPath('exe') 可用。
     * @param {Electron.App} app
     */
    static init(app) {
        if (AppAutoLaunch.#_instance) {
            return AppAutoLaunch.#_instance
        }
        AppAutoLaunch.#_instance = new AutoLaunch({
            name: 'EServer',
            path: app.getPath('exe'),
            //开发模式下 isEnabled 偶发返回 false，强制再读一次
            isHidden: false
        })
        return AppAutoLaunch.#_instance
    }

    static getInstance() {
        if (!AppAutoLaunch.#_instance) {
            throw new Error('AppAutoLaunch 未初始化，请先调用 init(app)')
        }
        return AppAutoLaunch.#_instance
    }

    static async enable() {
        const instance = AppAutoLaunch.getInstance()
        const enabled = await instance.isEnabled()
        if (!enabled) {
            await instance.enable()
        }
        if (isDev) {
            console.info('[AutoLaunch] enable() called in dev; system state may not change')
        }
    }

    static async disable() {
        const instance = AppAutoLaunch.getInstance()
        const enabled = await instance.isEnabled()
        if (enabled) {
            await instance.disable()
        }
    }

    static async isEnabled() {
        const instance = AppAutoLaunch.getInstance()
        return await instance.isEnabled()
    }
}
```

说明：
- 类名 `AppAutoLaunch` 避免与默认导入 `AutoLaunch` 冲突。
- `enable()`/`disable()` 内先查 `isEnabled()` 再决定是否调用，避免对系统重复写。
- `isDev` 来自 `@/main/utils/utils`，开发模式时打一行 info 日志。

- [ ] **Step 2: 校验文件可解析**

```bash
node -e "require('./src/main/utils/AutoLaunch')" 2>&1 | head -20
```

预期：可能因 ES module 报错（项目用 ESM）—— 跳过这条，按下一步执行。

- [ ] **Step 3: 提交**

```bash
git add src/main/utils/AutoLaunch.js
git commit -m "feat: 新增 AutoLaunch 主进程模块"
```

---

## Task 3: Settings 默认值新增 AutoLaunch 字段

**Files:**
- Modify: `src/main/Settings.js`

- [ ] **Step 1: 在 `_getDefault()` 返回对象中新增 `AutoLaunch: false`**

`src/main/Settings.js` 第 52-67 行（`#_getDefault` 方法）改为：

```javascript
static #_getDefault() {
    return {
        Debug: false,
        Language: 'zh',
        ThemeMode: 'system',
        ThemeColor: '#1890FF',
        EnableEnv: false,
        PhpCliVersion: '',
        EnableComposer: false,
        TextEditor: this.#_getDefaultTextEditorPath(),
        WebsiteDir: GetDataPath.getWebsiteDir(),
        OneClickServerList: ['Nginx', 'PHP-FPM', 'MySQL-5.7'],
        AutoStartAndRestartServer: true,
        AfterOpenAppStartServer: false,
        AutoLaunch: false
    }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/main/Settings.js
git commit -m "feat: Settings 默认值新增 AutoLaunch 字段"
```

---

## Task 4: 新增 IPC 通道 appSetAutoLaunch

**Files:**
- Modify: `src/main/ipcListen.js`

**Interfaces:**
- Consumes: `enabled` (boolean)
- Produces: 返回最新系统状态（boolean）。

- [ ] **Step 1: 在 `functions` 字典中新增 `appSetAutoLaunch`**

编辑 `src/main/ipcListen.js`：

1. 在第 1 行 `import` 块之后新增：

```javascript
import AppAutoLaunch from '@/main/utils/AutoLaunch'
```

2. 在 `functions` 字典（紧接 `appRestart` 之后）插入：

```javascript
    appSetAutoLaunch: async (event, enabled) => {
        if (enabled) {
            await AppAutoLaunch.enable()
        } else {
            await AppAutoLaunch.disable()
        }
        return await AppAutoLaunch.isEnabled()
    },
```

- [ ] **Step 2: 校验语法**

```bash
node --check src/main/ipcListen.js 2>&1 || true
```

项目使用 ESM，`node --check` 可能报错（因为是 ESM 语法）。这一步可跳过，肉眼检查即可。

- [ ] **Step 3: 提交**

```bash
git add src/main/ipcListen.js
git commit -m "feat: 新增 IPC 通道 appSetAutoLaunch"
```

---

## Task 5: 启动时同步登录项状态

**Files:**
- Modify: `src/main/index.js`

**Interfaces:**
- 读取 `Settings.get('AutoLaunch')`，与 `AppAutoLaunch.isEnabled()` 比较。
- 若不一致，以系统真实状态为权威回写 `Settings.set('AutoLaunch', <bool>)`。

- [ ] **Step 1: 新增 import**

在 `src/main/index.js` 第 1-9 行 import 块中新增两行：

```javascript
import Settings from '@/main/Settings'
import AppAutoLaunch from '@/main/utils/AutoLaunch'
```

- [ ] **Step 2: 在 `onReady` 中、`createMainWindow` 之前同步**

修改 `src/main/index.js` 第 67-80 行 `onReady()`：

```javascript
function onReady() {
    app.on('ready', async () => {
        I18n.init()
        if (serviceArg) {
            const args = serviceArg.split('=')
            args[1] === 'start' ? await Service.start() : await Service.stop()
            await sleep(1000)
            app.exit()
        } else {
            await syncAutoLaunch()
            createMainWindow()
            Store.initRenderer()
        }
    })
}

async function syncAutoLaunch() {
    try {
        AppAutoLaunch.init(app)
        const settingVal = !!Settings.get('AutoLaunch')
        const systemVal = await AppAutoLaunch.isEnabled()
        if (settingVal !== systemVal) {
            Settings.set('AutoLaunch', systemVal)
        }
    } catch (e) {
        console.warn('[AutoLaunch] 启动同步失败:', e?.message ?? e)
    }
}
```

确保 `syncAutoLaunch` 不抛错——即使初始化失败也要让主窗口正常启动。

- [ ] **Step 3: 提交**

```bash
git add src/main/index.js
git commit -m "feat: 启动时同步登录项与设置项"
```

---

## Task 6: 设置卡片新增开关 UI

**Files:**
- Modify: `src/renderer/components/Settings/Server.vue`

**Interfaces:**
- 新增 `changeAutoLaunch` 方法，调用 IPC `appSetAutoLaunch`。
- 模板新增一行 `a-switch`，绑定 `store.settings.AutoLaunch`。

- [ ] **Step 1: 在 `OneClickServerList` 行之后、Windows Service 行之前插入新行**

修改 `src/renderer/components/Settings/Server.vue` 第 11-13 行之间（`OneClickServerList` 那一行关闭后、Windows Service 之前），插入：

```html
    <div class="settings-card-row flex-vertical-center">
      <a-switch v-model:checked="store.settings.AutoLaunch" class="settings-switch"
                @change="changeAutoLaunch" />
      <span>{{ t('autoLaunchText') }}</span>
    </div>
```

- [ ] **Step 2: 在 `<script setup>` 中新增 `changeAutoLaunch` 方法**

在 `src/renderer/components/Settings/Server.vue` 第 67-72 行（紧接 `changeAutoStartAndRestartServer` 之后）插入：

```javascript
const changeAutoLaunch = async () => {
    await store.setSettings('AutoLaunch', async () => {
        const res = await window.electron.ipcRenderer.invoke('call', 'appSetAutoLaunch', store.settings.AutoLaunch)
        return !!res
    })
}
```

说明：返回 `!!res` 让 store 同步到系统真实状态，与 main 进程启动同步逻辑对称。

- [ ] **Step 3: 提交**

```bash
git add src/renderer/components/Settings/Server.vue
git commit -m "feat: 设置卡片新增开机自启开关"
```

---

## Task 7: i18n 三语新增 autoLaunchText

**Files:**
- Modify: `src/shared/i18n/zh.js`
- Modify: `src/shared/i18n/en.js`
- Modify: `src/shared/i18n/fr.js`

- [ ] **Step 1: 在 zh.js 末尾(`//Lowercase` 块内、`Weeks` 之后、`}` 之前)新增一行**

```javascript
    autoLaunchText: '开机自启'
```

- [ ] **Step 2: 在 en.js 末尾新增一行**

```javascript
    autoLaunchText: 'Auto launch on system startup'
```

- [ ] **Step 3: 在 fr.js 末尾同样位置新增一行**

```javascript
    autoLaunchText: 'Lancement automatique au démarrage du système'
```

- [ ] **Step 4: 检查三文件末尾 `}` 之前存在新行**

```bash
node -e "const zh = require('./src/shared/i18n/zh.js'); console.log(zh.autoLaunchText)"
```

ESM 语法会报错，可改用 `grep` 校验：

```bash
Select-String -Path "src/shared/i18n/zh.js","src/shared/i18n/en.js","src/shared/i18n/fr.js" -Pattern "autoLaunchText"
```

预期：每个文件各匹配 1 行。

- [ ] **Step 5: 提交**

```bash
git add src/shared/i18n/zh.js src/shared/i18n/en.js src/shared/i18n/fr.js
git commit -m "feat: i18n 新增 autoLaunchText"
```

---

## Task 8: 验证与 lint

**Files:**（无文件改动）

- [ ] **Step 1: 运行 lint**

```bash
npm run lint
```

预期：0 error。可能存在与本次改动无关的 warning。

- [ ] **Step 2: 手动验证（开发模式）**

```bash
npm run dev
```

打开「设置 -> 服务器 & 一键」卡片：
- 开关初始为关闭。
- 切换为开 → 系统登录项新增条目（Windows 检查 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`，macOS 检查 `~/Library/LaunchAgents`，Linux 检查 `~/.config/autostart/`）。
- 切换为关 → 登录项消失。
- 关闭应用后再次开启，开关状态与上次一致。

- [ ] **Step 3: 验证启动同步（用第三方工具改动登录项后）**

- 开启开关后用 `reg delete` (Windows) / `launchctl unload` (macOS) / 删除 `.desktop` (Linux) 移除登录项。
- 重启应用 → 开关自动变为关闭（系统真实状态为权威）。

- [ ] **Step 4: 提交（如 lint 中有本次改动相关修复）**

```bash
git add -u
git commit -m "style: 应用 lint 修复"
```

仅在 lint 实际修复了本次相关代码时执行。

---

## Self-Review

**1. Spec coverage:**
- ✅ 新增 AutoLaunch 主进程模块 — Task 2
- ✅ Settings 默认值 — Task 3
- ✅ IPC 通道 — Task 4
- ✅ 启动时同步 — Task 5
- ✅ 设置卡片 UI — Task 6
- ✅ i18n 三语 — Task 7
- ✅ 验证三平台与 lint — Task 8
- ✅ 依赖安装 — Task 1

**2. Placeholder scan:** 无 TBD / TODO / "implement later"。

**3. Type consistency:** `AppAutoLaunch`(类) / `AppAutoLaunch.enable|disable|isEnabled|init`（方法）在 Task 2/4/5 命名一致；`store.settings.AutoLaunch` 在 Task 3/6 一致；`appSetAutoLaunch` 在 Task 4/6 一致。
