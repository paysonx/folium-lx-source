# Folium LX Source Adapter

Folia 桌面版的实验性 LX 音源适配模组，由用户确认并导入自己的脚本，不内置任何音源脚本或链接。

源码及使用说明：[mods/lxSource](mods/lxSource/README.md)。版本：0.1.1。作者：PaysonX。许可：AGPL-3.0。

## 安装

把 `mods/lxSource` 文件夹复制到 Folia 的用户模组目录，或将该文件夹压缩为 ZIP 后拖入「设置 → 模组」。启用后在命令面板搜索 LX。需要 Folia >= 0.7.22 且 < 0.8.0。

导入链接和文件前须明确确认信任脚本；脚本可通过网络向第三方服务发送歌曲信息。搜索和歌词使用你在 Folia 登录的平台账号，不把账户凭据交给脚本。

## 测试

需要 Node.js 24+。运行 `npm install`、`npm test`。浏览器检查运行 `npx playwright install chromium` 后执行 `npm run test:browser`，或设置 `LX_BROWSER_CHANNEL=msedge` 使用已安装的 Edge。

本次通过 8 项单元测试、32 项浏览器检查及 6 项协议断言。用户报告 0.1.0 桌面安装、导入、播放正常；0.1.1 新增确认流程尚未由用户在桌面端复验。

## 权限与数据

`net.fetch`：下载用户指定的脚本并代理脚本网络请求。

`filesystem.data`：保存脚本内容及启用状态。

实验接口 `omni.providers`：注册 LX 音源。

模组执行用户自行提供并明确确认信任的 LX 脚本，不内置音源脚本或链接，不自动更新脚本。已启用副本会在重启后恢复执行；脚本可能向第三方发送歌曲信息，不向脚本提供宿主账户凭据。0.1.1 网络桥接没有完整的内网地址及重定向目的地防护，脚本可能请求本机或局域网地址；维护者计划在宿主侧补充防护，不能视为已经修复。

## 发布状态

0.1.1（源码 `dff475d6005bc631b17544d1f86d08d16368d970`）已于 2026-11-01（北京时间）通过安全审查并收录「先行测试 / Beta」。[审查与签名记录](https://github.com/chthollyphile/folium-compound/issues/110#issuecomment-6557281328)：签名密钥 `folium-beta-2026-1`，市场仓库合入提交 `cb7f212a2a6c`。先行测试仅作安全审查，不保证功能完整或可用。

此签名针对市场收录的模组包，不代表源码 Git 提交已签名；GitHub 将该源码提交标记为 unsigned。自行复制源码或打包的 ZIP 不会自动获得市场签名。包内 README 也在签名范围内，本次文档修改不继承原包签名；重新分发修改后的包须按维护者流程重新审查和签名。
