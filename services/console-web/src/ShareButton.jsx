import { useState } from 'react'
import { App as AntApp, Button, Modal, Popconfirm, Tooltip } from 'antd'
import { CopyOutlined, LinkOutlined, ShareAltOutlined } from '@ant-design/icons'
import { api } from './api'

// 一份资料一个长期链接：还没分享 = 「分享」按钮；分享过 = 「链接」按钮，点开是链接信息 + 开放编辑 / 收回 / 关闭
export default function ShareButton({ path, title, share, dirty, onChange }) {
  const { message } = AntApp.useApp()
  const [open, setOpen] = useState(false)
  const sh = share?.share

  const link = sh && `${location.origin}/s/${sh.id}`
  const text = sh && `「${title}」\n链接：${link}\n密码：${sh.password}`

  const create = async () => {
    const r = await api.shareCreate(path)
    if (r.error) { message.error(r.error); return }
    onChange?.(r); setOpen(true)
  }
  const copy = async () => { await navigator.clipboard.writeText(text); message.success('已复制') }
  const close = async () => { await api.shareClose(sh.id); onChange?.({ share: null }); setOpen(false); message.success('链接已关闭') }
  const reopen = async () => { const r = await api.shareReopen(sh.id); if (r.error) { message.error(r.error); return } onChange?.(r) }
  const take = async () => { const r = await api.shareTake(sh.id); if (r.error) { message.error(r.error); return } onChange?.(r) }

  // 客户每一轮都从最新确认版开始：内部还有没确认的改动时不能交给客户
  if (!sh) return (
    <Tooltip title={dirty ? '先确认版本' : null}>
      <Button type="text" icon={<ShareAltOutlined />} onClick={create} disabled={dirty}>分享</Button>
    </Tooltip>
  )

  const st = share.round?.state
  const clientCan = !sh.locked && st !== 'submitted'
  return (
    <>
      <Button type="text" icon={<LinkOutlined />} onClick={() => setOpen(true)}>链接</Button>
      <Modal title="客户链接" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <pre className="share-text">{text}</pre>
        <div className="share-btns">
          <Button type="primary" icon={<CopyOutlined />} onClick={copy}>复制</Button>
          {clientCan
            ? <Popconfirm title="收回编辑权？" okText="收回" cancelText="取消" onConfirm={take}><Button>收回</Button></Popconfirm>
            : st !== 'submitted' && (
              <Tooltip title={dirty ? '先确认版本' : null}>
                <Button onClick={reopen} disabled={dirty}>开放编辑</Button>
              </Tooltip>
            )}
          <span className="round-grow" />
          <Popconfirm title="关闭这个链接？" okText="关闭" okButtonProps={{ danger: true }} cancelText="取消" onConfirm={close}>
            <Button type="text" danger>关闭链接</Button>
          </Popconfirm>
        </div>
      </Modal>
    </>
  )
}
