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