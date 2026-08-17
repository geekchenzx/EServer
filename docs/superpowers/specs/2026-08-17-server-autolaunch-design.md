# 设置 -> 服务器 & 一键 增加开机自启

日期：2026-08-17

## 背景

现“设置 -> 服务器 & 一键”卡片中已经有“打开软件后启动服务器 (AfterOpenAppStartServer)”、“保存网站后自动启动或重启服务 (AutoStartAndRestartServer)”等开关，但没有一个让 EServer 桌面应用本身在系统开机登录后自动启动的开关。常见服务型桌面应用都提供这个能力。需求是在该卡片新增一个“开机自启”开关。

## 目标

- 在“设置 -> 服务器 & 一键 ”卡片中新增一个开关，控制 EServer 桌面应用是否在系统登录后自动启动。
- 跨平台支持 Windows、macOS、Linux。
- 开关状态持久化，UI 与系统实际状态保持一致。
- 复用现有 electron-store 与设置卡片风格，不增加新的视觉元素。

## 非目标

- 不控制 OneClickServerList 中具体服务（PHP-FPM/Nginx/MySQL 等）的自动启动。该行为已由 `AfterOpenAppStartServer` 覆盖。
- 不实现静默启动（开机自启后不弹主窗口）。如未来需要，单独迭代。
- 不改变现有 Windows Service 创建/删除流程。

## 组件设计

### 新增主进程模块

新建 `src/main/utils/AutoLaunch.js`：

- 封装 `auto-launch` 包，单例。
- 导出 `init(app)`（在 `app.on('ready')` 中调用，传入 `app` 实例与产品名 `EServer`）、`enable()`、`disable()`、`isEnabled()`。
- `init` 内部 `new AutoLaunch({ name: 'EServer', path: app.getPath('exe') })`。
- 所有方法返回 Promise；不抛出未捕获错误，将异常向上抛出由调用方处理。
- 复用 main 进程 utils 目录的现有风格（与 `SystemService.js` 类似）。

### 修改 Settings 模块

- `src/main/Settings.js` 默认值新增 `AutoLaunch: false`。
- electron-store 会自动为已存在用户补默认值。

### 新增 IPC 通道

- `src/main/ipcListen.js` 在 `functions` 中新增 `appSetAutoLaunch(event, enabled)`：
  - 调用 `AutoLaunch.enable()` 或 `AutoLaunch.disable()`。
  - 返回最新 `isEnabled()` 结果给渲染进程。
- 渲染侧通过现有 `window.electron.ipcRenderer.invoke('call', 'appSetAutoLaunch', enabled)` 调用（与 `appRestart` 等一致）。

### 启动时同步

- `src/main/index.js` 在 `app.on('ready', ...)` 现有 `createMainWindow()` 之前调用 `AutoLaunch.init(app)` 并读取 `Settings.get('AutoLaunch')` 与系统实际 `isEnabled()` 比较：
  - 若不一致，以系统实际状态为权威回写 Settings（避免第三方工具改动登录项后 UI 与系统长期不一致）。
- 该调用放在 `serviceArg` 判断之后，确保 `--service=start/stop` 走系统服务路径时不会被启动逻辑打扰。

### 修改设置卡片 UI

`src/renderer/components/Settings/Server.vue`：

- 在 `OneClickServerList` 那一行（第一行）之后、Windows Service 那一行之前，插入新一行：
  ```
  <div class="settings-card-row flex-vertical-center">
    <a-switch v-model:checked="store.settings.AutoLaunch" class="settings-switch"
              @change="changeAutoLaunch" />
    <span>{{ t('autoLaunchText') }}</span>
  </div>
  ```
- 新增 `changeAutoLaunch` 方法：调用 `store.setSettings('AutoLaunch', async (originVal) => { await window.electron.ipcRenderer.invoke('call', 'appSetAutoLaunch', store.settings.AutoLaunch) })`。
- 国际化 key `autoLaunchText`：`zh.js`“开机自启”；`en.js`“Auto launch on system startup”；`fr.js`“Lancement automatique au démarrage du système”。
- 不新增依赖图标。开关的样式与现有 `AutoStartAndRestartServer`、`AfterOpenAppStartServer` 视觉一致。

## 数据流

1. 用户切换开关 → 渲染端 `changeAutoLaunch` → `store.setSettings('AutoLaunch', beforeFunc)`。
2. `beforeFunc` 通过 IPC 调用 main 进程 `AutoLaunch.enable()/disable()`，并把最新系统状态返回。
3. `store.setSettings` 拿到返回值后写入 store（成功）或回滚到 `originVal`（失败）。
4. main 进程 `app.on('ready')` 时再次核对系统状态与设置，必要时回写设置。

## 错误处理

- `auto-launch` 在 Linux 上不支持部分桌面环境（如无 X、无 systemd）以及某些权限被拒；
  - 调用失败时 `MessageBox.error(t('failedOperation') + ': ' + error.message)`，开关回滚到原值。
  - `isEnabled()` 返回 false 而非抛错时，按“未启用”处理。
- macOS 上 `auto-launch` 首次启用需要应用被签名或用户授权；开发模式下若 `getPath('exe')` 指向 electron 启动脚本而非 .app，启用可能无效。开发模式下 UI 仍可切换，但日志中提示“开发模式下可能不生效”。

## 验证

- `npm run lint` 通过。
- 手动验证：
  - Windows：开启后 `reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 看到 EServer 条目；关闭后条目消失。
  - macOS：开启后 `ls ~/Library/LaunchAgents` 出现 `com.EServer.plist`；关闭后消失。
  - Linux（GNOME）：开启后 `~/.config/autostart/EServer.desktop` 出现；关闭后消失。
- 验证第三方工具改动登录项后再次启动 EServer，设置项被回写为系统实际状态。
- 开发模式下（`npm run dev`）开关可切换但系统状态可能不变化，符合预期。

## 涉及文件

- 新增：`src/main/utils/AutoLaunch.js`
- 修改：`package.json`（新增 `auto-launch` 依赖）
- 修改：`src/main/Settings.js`（新增默认 `AutoLaunch: false`）
- 修改：`src/main/ipcListen.js`（新增 `appSetAutoLaunch`）
- 修改：`src/main/index.js`（启动时同步登录项）
- 修改：`src/renderer/components/Settings/Server.vue`（新增开关 UI）
- 修改：`src/shared/i18n/zh.js`、`src/shared/i18n/en.js`、`src/shared/i18n/fr.js`（新增 `autoLaunchText`）
