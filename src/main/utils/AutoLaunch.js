import AutoLaunch from 'auto-launch'
import { isDev, isWindows } from '@/main/utils/utils'
import Command from '@/main/utils/Command'
import { PowerShell } from '@/main/helpers/constant'

// Windows 下用计划任务承载开机自启（任务名与 Windows 服务 EServerService 区分开）
const TASK_NAME = 'EServer'

export default class AppAutoLaunch {
    static #_instance = null
    static #_exePath = ''

    /**
     * 初始化。需在 app.on('ready') 之后调用，确保 app.getPath('exe') 可用。
     * @param {Electron.App} app
     */
    static init(app) {
        if (AppAutoLaunch.#_instance) {
            return AppAutoLaunch.#_instance
        }
        AppAutoLaunch.#_exePath = app.getPath('exe')
        AppAutoLaunch.#_instance = new AutoLaunch({
            name: 'EServer',
            path: AppAutoLaunch.#_exePath,
            // 启动时不隐藏主窗口
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
        if (isWindows) {
            await AppAutoLaunch.#enableWindows()
            return
        }
        const instance = AppAutoLaunch.getInstance()
        const enabled = await instance.isEnabled()
        if (!enabled) {
            await instance.enable()
        }
    }

    static async disable() {
        if (isWindows) {
            await AppAutoLaunch.#disableWindows()
            return
        }
        const instance = AppAutoLaunch.getInstance()
        const enabled = await instance.isEnabled()
        if (enabled) {
            await instance.disable()
        }
    }

    static async isEnabled() {
        if (isWindows) {
            return await AppAutoLaunch.#isWindowsEnabled()
        }
        const instance = AppAutoLaunch.getInstance()
        return await instance.isEnabled()
    }

    /**
     * PowerShell 单引号字符串转义：' -> ''
     * @param {string} str
     */
    static #escapePS(str) {
        return String(str).replace(/'/g, "''")
    }

    /**
     * 注册登录时启动的计划任务。
     *
     * 不能用注册表 Run 项：exe 清单要求管理员权限（requireAdministrator），
     * 而登录项由 Explorer 以普通权限拉起，提权请求拿不到交互确认，进程根本不会被创建。
     * 计划任务在登录时以最高权限运行，不需要 UAC 交互。
     */
    static async #enableWindows() {
        if (isDev) {
            console.info('[AutoLaunch] 开发模式下不注册开机自启任务')
            return
        }
        const exePath = AppAutoLaunch.#escapePS(AppAutoLaunch.#_exePath)
        const taskName = AppAutoLaunch.#escapePS(TASK_NAME)
        const commandStr = [
            `$action = New-ScheduledTaskAction -Execute '${exePath}'`,
            `$trigger = New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)`,
            `$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Highest`,
            `$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)`,
            `Register-ScheduledTask -TaskName '${taskName}' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force -ErrorAction Stop | Out-Null`
        ].join('; ')
        await Command.exec(commandStr, { shell: PowerShell })
        // 清掉旧机制（注册表 Run 项）留下的条目，避免登录时拉起失败
        await AppAutoLaunch.#removeLegacyRunEntry()
    }

    static async #disableWindows() {
        if (isDev) {
            return
        }
        const taskName = AppAutoLaunch.#escapePS(TASK_NAME)
        // 任务不存在时 Unregister-ScheduledTask 会以非零码退出，这里显式吞掉错误并保证退出码为 0
        const commandStr =
            `Unregister-ScheduledTask -TaskName '${taskName}' -Confirm:$false -ErrorAction SilentlyContinue; ` +
            `if (-not (Get-ScheduledTask -TaskName '${taskName}' -ErrorAction SilentlyContinue)) { exit 0 }`
        await Command.exec(commandStr, { shell: PowerShell })
        await AppAutoLaunch.#removeLegacyRunEntry()
    }

    static async #isWindowsEnabled() {
        if (isDev) {
            return false
        }
        const taskName = AppAutoLaunch.#escapePS(TASK_NAME)
        const commandStr = `if (Get-ScheduledTask -TaskName '${taskName}' -ErrorAction SilentlyContinue) { 'EXISTS' } else { 'MISSING' }`
        const stdout = await Command.exec(commandStr, { shell: PowerShell })
        return stdout.includes('EXISTS')
    }

    /**
     * 删除旧机制写入的 HKCU Run 条目。auto-launch 在 Windows 上就是写这个位置。
     */
    static async #removeLegacyRunEntry() {
        try {
            await AppAutoLaunch.getInstance().disable()
        } catch {
            // 条目不存在等情况忽略
        }
    }
}
