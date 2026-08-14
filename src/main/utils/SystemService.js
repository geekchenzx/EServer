import Command from '@/main/utils/Command'
import { isWindows } from '@/main/utils/utils'
import { PowerShell } from '@/main/helpers/constant'
import nodePath from 'path'

export default class SystemService {
    /**
     * 服务名白名单校验（字母数字 - _ . 空格），防止命令注入
     * @param name {string}
     */
    static checkName(name) {
        if (typeof name !== 'string' || !/^[-a-zA-Z0-9_. ]+$/.test(name)) {
            throw new Error(`Invalid service name: ${name}`)
        }
        return name
    }

    /**
     * PowerShell单引号字符串转义：' -> ''
     * @param str {string}
     */
    static escapePS(str) {
        return String(str).replace(/'/g, "''")
    }

    static async isRunning(name) {
        try {
            let res, commandStr

            if (isWindows) {
                name = SystemService.checkName(name)
                commandStr = `Get-Service '${SystemService.escapePS(name)}' |Where-Object {$_.Status -eq "Running"}`
                res = await Command.exec(commandStr, { shell: PowerShell })
                return !!res
                // eslint-disable-next-line no-empty
            } else {
            }
        } catch {
            return false
        }
    }

    /**
     *
     * @param name {string}
     * @param pathWithArgs {string}
     * @returns {Promise<void>}
     */
    static async create(name, pathWithArgs) {
        try {
            name = SystemService.checkName(name)
            pathWithArgs = nodePath.normalize(pathWithArgs)
            let commandStr

            if (isWindows) {
                const binPath = pathWithArgs.replaceAll('"', '')
                commandStr = `sc create "${name}" binPath="${binPath}" start=auto`
                await Command.exec(commandStr)
                // eslint-disable-next-line no-empty
            } else {
            }
            // eslint-disable-next-line no-empty
        } catch {}
    }

    static async delete(name) {
        try {
            name = SystemService.checkName(name)
            let commandStr

            if (isWindows) {
                commandStr = `sc delete "${name}"`
                await Command.exec(commandStr)
                // eslint-disable-next-line no-empty
            } else {
            }
            // eslint-disable-next-line no-empty
        } catch {}
    }

    /**
     * 判断service是否存在
     * @param name
     * @returns {Promise<boolean>}
     */
    static async exists(name) {
        try {
            let commandStr

            if (isWindows) {
                name = SystemService.checkName(name)
                commandStr = `sc query "${name}"` //sc query查询不存在的服务会报错
                await Command.exec(commandStr)
                return true
                // eslint-disable-next-line no-empty
            } else {
            }
            // eslint-disable-next-line no-empty
        } catch (e) {
            return false
        }
    }

    static async stop(name) {
        try {
            let commandStr

            if (isWindows) {
                name = SystemService.checkName(name)
                commandStr = `Stop-Service '${SystemService.escapePS(name)}'`
                await Command.exec(commandStr, { shell: PowerShell })
                // eslint-disable-next-line no-empty
            } else {
            }
            // eslint-disable-next-line no-empty
        } catch {}
    }
}
