import { debugLog } from '@/main/utils/utils'
import ProcessExtend from '@/main/utils/ProcessExtend'
import ChildApp from '@/main/services/childApp/ChildApp'
import { parseTemplateStrings, sleep } from '@/shared/utils/utils'
import child_process from 'child_process'
import path from 'path'
import FileUtil from '@/main/utils/FileUtil'
import GetDataPath from '@/shared/helpers/GetDataPath'
import TcpProcess from '@/main/utils/TcpProcess'

export default class ServerControl {
    /**
     * ChildAppItem
     * @param item {ChildAppItem}
     * @returns {Promise<void>}
     */
    static async start(item) {
        const itemMap = ServerControl.parseServerFields(item)
        const ctrlProcessPath = ServerControl.getControlProcessPath(itemMap)
        const workDir = item.IsCustom ? path.dirname(ctrlProcessPath) : ChildApp.getDir(item)
        if (!(await FileUtil.Exists(ctrlProcessPath))) {
            throw new Error(`${ctrlProcessPath} 文件不存在！`)
        }
        item.isRunning = true
        item.errMsg = ''
        const command = `${ctrlProcessPath} ${itemMap.StartServerArgs}`
        const options = { cwd: workDir, shell: true } //使用shell，childProcess返回的pid是shell的pid
        const childProcess = child_process.spawn(command, [], options)

        childProcess.stderr.on('data', (data) => {
            debugLog('stderr data', data?.toString())
            item.errMsg = data?.toString()
        })

        childProcess.on('error', (err) => {
            debugLog('spawn error', err?.toString())
            item.isRunning = false
            item.pid = undefined
            item.errMsg = err?.toString()
        })

        childProcess.on('close', (code) => {
            debugLog(`${path.basename(ctrlProcessPath)},exit code ${code}`)
            item.isRunning = false
        })

        debugLog('ServerControl start command:', command)
        debugLog(`${path.basename(ctrlProcessPath)},pid ${childProcess.pid}`)

        item.pid = childProcess.pid
        await ServerControl.waitForStart(item)
    }

    /**
     * 等待服务端口监听，确保服务真正启动完成后才返回
     * @param item {ChildAppItem}
     * @returns {Promise<void>}
     */
    static async waitForStart(item) {
        if (!item.ServerPort) {
            return
        }
        const timeoutSeconds = item.StartTimeoutSeconds ?? 60
        const deadline = Date.now() + timeoutSeconds * 1000
        while (Date.now() < deadline) {
            const pid = await TcpProcess.getPidByPort(item.ServerPort)
            if (pid) {
                return
            }
            if (!item.isRunning) {
                break
            }
            await sleep(500)
        }
        await ProcessExtend.kill(item.pid, true)
        item.isRunning = false
        const errMsg = item.errMsg ? `，${String(item.errMsg).trim()}` : ''
        throw new Error(`${item.Name} 启动超时，端口 ${item.ServerPort} 未打开！${errMsg}`)
    }

    /**
     *
     * @param item{ChildAppItem}
     * @returns {Promise<void>}
     */
    static async stop(item) {
        if (item.StopServerArgs) {
            const itemMap = ServerControl.parseServerFields(item)
            const ctrlProcessPath = ServerControl.getControlProcessPath(itemMap)
            const command = `${ctrlProcessPath} ${itemMap.StopServerArgs}`
            const workDir = item.IsCustom ? path.dirname(ctrlProcessPath) : ChildApp.getDir(item)
            const options = { cwd: workDir, shell: true }
            child_process.spawn(command, [], options)
        } else {
            await ProcessExtend.kill(item.pid, true)
        }
    }

    static getControlProcessPath(itemMap) {
        return itemMap.ControlProcessPath ? itemMap.ControlProcessPath : itemMap.ServerProcessPath
    }

    /**
     * 解析字段里的变量字符串
     * @param item{ChildAppItem}
     */
    static parseServerFields(item) {
        const workDir = item.IsCustom ? '' : ChildApp.getDir(item)
        const etcDir = GetDataPath.getEtcDir()
        const fields = ['ConfPath', 'ServerConfPath', 'ServerProcessPath', 'ControlProcessPath', 'StartServerArgs', 'StopServerArgs']
        const varMap = {
            WorkDir: workDir.replaceSlash(),
            EtcDir: path.join(etcDir, item.DirName ?? '').replaceSlash(),
            ServerPort: item.ServerPort
        }
        const itemMap = {}
        for (const field of fields) {
            if (Object.hasOwn(item, field)) itemMap[field] = item[field]
        }

        for (let i = 0; i < 3; i++) {
            //最多解析嵌套的层数为3层
            for (const field in itemMap) {
                itemMap[field] = parseTemplateStrings(itemMap[field], { ...itemMap, ...varMap })
            }
        }

        return itemMap
    }
}
