# 添加网站支持 URL 重写与 SSL

日期：2026-08-14

## 背景

当前“添加网站”弹窗只支持基础信息（域名、端口、根目录、PHP 版本、同步 hosts）。URL 重写和 SSL 只能在“修改网站”中配置。需求是在添加网站时直接配置这两项，交互与“修改网站”保持一致。

## 目标

- 添加网站弹窗改为左侧 3 个 Tab：基础信息、URL 重写、SSL，与修改网站弹窗结构一致。
- 支持一次性提交：先创建网站，再写入 URL 重写，再配置 SSL。
- 添加过程中任一环节失败时回滚已创建的网站，避免残留半成品。
- 修改网站的现有行为保持不变。

## 非目标

- 不改变 Nginx 配置格式。
- 不引入证书自动签发。
- 不重构服务层现有配置读写逻辑。

## 组件设计

### 新增表单组件

新建 `src/renderer/components/WebSite/Form/RewriteForm.vue`：

- 对外暴露 `modelValue`（重写内容字符串）和 `update:modelValue` 事件。
- 包含规则下拉（“当前的” + 规则列表）和重写内容文本域。
- 添加模式下初始内容为空；修改网站模式下由外层注入当前内容。
- 通过 `confName` 属性区分模式：添加模式传空，修改模式传站点配置名。
- 数据加载逻辑沿用现有 `RewriteSetting.vue` 的 `getRewrite`、`getRewriteRuleList`、`getRewriteByRule`。
- 选择“当前的”时：修改模式重新读取当前内容；添加模式将内容置为空。

新建 `src/renderer/components/WebSite/Form/SslForm.vue`：

- 对外暴露 `modelValue`（SSL 表单对象）和 `update:modelValue` 事件。
- 字段：端口（默认 443）、证书路径、Key 路径、强制 HTTPS 开关。
- 通过 `optional` 属性区分模式：
  - 编辑模式（optional=false）：证书路径和 Key 路径必填。
  - 添加模式（optional=true）：两者都为空则跳过 SSL；填了任一个则两者都必填。
- 数据加载与校验沿用现有 `SslSetting.vue` 的逻辑。

### 重构修改网站组件

- `EditWebSite/RewriteSetting.vue` 改为加载当前内容后交给 `RewriteForm`，只保留“保存”按钮与保存逻辑。
- `EditWebSite/SslSetting.vue` 改为加载当前 SSL 信息后交给 `SslForm`（optional=false），只保留“保存/关闭 SSL”按钮与保存逻辑。
- 修改网站的行为、校验、按钮交互保持不变。

### 调整添加网站弹窗

`AddWebSiteModal.vue`：

- 弹窗样式使用现有 `left-tabs-modal`，左侧 3 个 Tab。
- 基础信息 Tab 保留现有字段、校验与 PHP 配置目录快捷入口。
- URL 重写 Tab 使用 `RewriteForm`。
- SSL Tab 使用 `SslForm`（optional=true）。
- 点击“提交”只校验基础信息 Tab；重写和 SSL 各自内部校验。

## 提交流程

点击“提交”后依次执行：

1. `Website.add(websiteInfo)` 创建网站。
2. 若重写内容非空，`Website.saveRewrite(confName, content)` 写入重写文件。
3. 若 SSL 表单填入了证书或 Key，`Website.setSSL(confName, sslInfo)` 复制证书并写入配置。
4. 任一步失败：调用 `Website.delete(confName)` 回滚，并提示错误。
5. 全部成功：关闭弹窗、重置表单，沿用现有同步 hosts 与自动重启逻辑。

`confName` 由新增的 `Website.getConfName(serverName, port)` 返回，内部委托 `Nginx.getWebsiteConfName`。

## 错误处理

- 回滚只在添加流程失败时触发；回滚自身失败时保留网站并提示，避免静默删除失败。
- 添加弹窗的“提交”与回滚期间禁用提交按钮，防止重复操作。
- 各环节错误消息沿用现有 `MessageBox.error` 展示。

## 验证

- 运行 `npm run lint`。
- 手动验证三种添加场景：不带重写/SSL、带重写、带 SSL，检查生成配置正确。
- 验证失败回滚：制造 SSL 复制失败，确认网站配置已删除且无残留。

## 涉及文件

- 新增：`src/renderer/components/WebSite/Form/RewriteForm.vue`
- 新增：`src/renderer/components/WebSite/Form/SslForm.vue`
- 修改：`src/renderer/components/WebSite/AddWebSiteModal.vue`
- 修改：`src/renderer/components/WebSite/EditWebSite/RewriteSetting.vue`
- 修改：`src/renderer/components/WebSite/EditWebSite/SslSetting.vue`
- 修改：`src/main/services/website/Website.js`（新增 `getConfName`）
