import { Modal } from 'ant-design-vue'
import { createTextVNode, createVNode } from 'vue'
import { t } from '@/renderer/utils/i18n'

const escapeHtml = (str) =>
    String(str ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')

const toLines = (str) => {
    const escaped = escapeHtml(str).split('\n')
    const nodes = []
    escaped.forEach((line, i) => {
        if (i > 0) nodes.push(createVNode('br'))
        nodes.push(createTextVNode(line))
    })
    return createVNode('div', null, nodes)
}

export default class MessageBox {
    /**
     *
     * @param message {string}
     * @param title {string}
     * @returns {Promise<boolean>}
     */
    static async info(message, title) {
        title = title ?? t('Info')
        let options = {
            title: title,
            content: toLines(message)
        }
        let result = true

        await new Promise((resolve, reject) => {
            options = Object.assign(options, {
                centered: true,
                onOk() {
                    resolve(true)
                },
                onCancel() {
                    reject(false)
                }
            })
            Modal.info(options)
        }).catch(() => (result = false))

        return result
    }

    /**
     *
     * @param message {string}
     * @param title {string}
     * @returns {Promise<boolean>}
     */
    static async error(message, title) {
        title = title ?? t('Error')
        let options = {
            title: title,
            content: toLines(message)
        }
        let result = true

        await new Promise((resolve, reject) => {
            options = Object.assign(options, {
                centered: true,
                onOk() {
                    resolve(true)
                },
                onCancel() {
                    reject(false)
                }
            })
            Modal.error(options)
        }).catch(() => (result = false))

        return result
    }

    /**
     *
     * @param message {string}
     * @param title {string}
     * @returns {Promise<boolean>}
     */
    static async warning(message, title) {
        title = title ?? t('Warning')
        let options = {
            title: title,
            content: toLines(message)
        }
        let result = true

        await new Promise((resolve, reject) => {
            options = Object.assign(options, {
                centered: true,
                onOk() {
                    resolve(true)
                },
                onCancel() {
                    reject(false)
                }
            })
            Modal.warning(options)
        }).catch(() => (result = false))

        return result
    }

    /**
     * @param options {object}
     * @returns {Promise<boolean>}
     */
    static async confirm(options = {}) {
        options.title = options.title ?? t('Confirm')
        if (typeof options.content === 'string') {
            options.content = toLines(options.content)
        }
        let result = true

        await new Promise((resolve, reject) => {
            options = Object.assign(options, {
                centered: true,
                onOk() {
                    resolve(true)
                },
                onCancel() {
                    reject(false)
                }
            })
            Modal.confirm(options)
        }).catch(() => (result = false))

        return result
    }
}
