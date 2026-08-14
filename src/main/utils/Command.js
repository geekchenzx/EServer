import { debugLog, isWindows } from '@/main/utils/utils'
import child_process from 'child_process'
import SettingsExtend from '@/main/services/SettingsExtend'
import util from 'util'
// import { PowerShell } from '@/main/utils/constant'

export default class Command {
    /**
     * 执行命令，等待进程退出返回结果（标准输出）
     * @param command
     * @param options
     * @returns {Promise<string>}
     */
    static async exec(command, options = {}) {
        debugLog('Command.exec command', command)

        if (!options.encoding) {
            options.encoding = 'utf8'
        }

        // if (options.shell === PowerShell) {
        //     command = `$OutputEncoding = [console]::InputEncoding = [console]::OutputEncoding = New-Object System.Text.UTF8Encoding;${command}`
        // }

        const exec = util.promisify(child_process.exec)
        const { stdout } = await exec(command, options)
        return stdout
    }

    /**
     * 执行命令，等待进程退出返回结果（标准输出）
     * @param command
     * @param options
     * @returns {Promise<string>}
     */
    static async sudoExec(command, options = {}) {
        if (isWindows) {
            throw new Error(`Cannot be executed on Windows!`)
        }
        debugLog('Command.sudoExec command', command)

        //密码（含换行终止符）经base64编码后通过环境变量传入，避免特殊字符破坏shell引号或被日志泄露
        const pwdB64 = Buffer.from(`${SettingsExtend.getUserPwd()}\n`, 'utf8').toString('base64')
        const inner = `printf %s "$ESERVER_SUDO_PWD" | base64 -d | sudo -S -p "" ${command}`
        command = `ESERVER_SUDO_PWD='${pwdB64}' sh -c '${inner.replaceAll(`'`, `'\\''`)}'`

        if (!options.encoding) {
            options.encoding = 'utf8'
        }

        const exec = util.promisify(child_process.exec)

        const { stdout } = await exec(command, options)
        return stdout
    }
}
