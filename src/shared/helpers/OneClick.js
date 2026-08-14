import Settings from '@/main/Settings'
import ChildAppExtend from '@/main/services/childApp/ChildAppExtend'

export default class OneClick {
    /**
     * 根据serverList，结合OneClickServerList设置，一键操作
     * @param func {function} 启动/停止函数
     * @param serverList {array} 已安装的server列表
     * @param reverse {boolean} true=停止（Nginx -> MySQL 反向依赖序）
     * @returns {Promise<void>}
     */
    static async handle(func, serverList, reverse = false) {
        const oneClickServerList = Settings.get('OneClickServerList')
        const websitePhpFpmSwitch = oneClickServerList.includes('PHP-FPM')
        const requirePhpList = await OneClick.getNginxRequirePhpList()

        const selected = serverList.filter((item) => {
            if (oneClickServerList.includes(item.Name)) return true
            return websitePhpFpmSwitch && requirePhpList.includes(item.Name.toUpperCase()) //自动判断网站列表的PHP-FPM
        })

        const order = OneClick.sortByStartOrder(selected)
        if (reverse) {
            order.reverse()
        }
        for (const item of order) {
            await func(item)
        }
    }

    static sortByStartOrder(list) {
        //依赖顺序：MySQL -> PHP-FPM -> Nginx
        return list.slice().sort((a, b) => {
            return OneClick.startRank(a.Name) - OneClick.startRank(b.Name)
        })
    }

    static startRank(name) {
        if (name === 'Nginx') return 3
        if (/^PHP-/.test(name)) return 2
        if (/^MySQL-/.test(name)) return 1
        return 0
    }

    static async getNginxRequirePhpList() {
        const list = await ChildAppExtend.getNginxRequirePhpList()
        return list.map((item) => `PHP-${item}`)
    }
}
