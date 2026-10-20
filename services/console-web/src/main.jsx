import React from 'react'
import ReactDOM from 'react-dom/client'
import { App as AntApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import 'antd/dist/reset.css'
import './index.css'
import App from './App'
import SharePage from './SharePage'

dayjs.locale('zh-cn')

// /s/<id> = 客户分享页；其他 = 控制台
const shareId = /^\/s\/([A-Za-z0-9]+)/.exec(location.pathname)?.[1] ?? null

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{ token: { colorPrimary: '#2f6feb', borderRadius: 7 } }}
    >
      <AntApp>
        {shareId ? <SharePage id={shareId} /> : <App />}
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
)
