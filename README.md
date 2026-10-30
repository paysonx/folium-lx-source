# Folium LX Source Adapter

Folia 桌面版的实验性 LX 音源适配模组，由用户确认并导入自己的脚本，不内置任何音源脚本或链接。

源码及使用说明：[mods/lxSource](mods/lxSource/README.md)。版本：0.1.1。作者：PaysonX。许可：AGPL-3.0。

## 安装

把 `mods/lxSource` 文件夹复制到 Folia 的用户模组目录，或将该文件夹压缩为 ZIP 后拖入「设置 → 模组」。启用后在命令面板搜索 LX。需要 Folia >= 0.7.22 且 < 0.8.0。

导入链接和文件前须明确确认信任脚本；脚本可通过网络向第三方服务发送歌曲信息。搜索和歌词使用你在 Folia 登录的平台账号，不把账户凭据交给脚本。

## 测试

需要 Node.js 24+。运行 `npm install`、`npm test`。浏览器检查运行 `npx playwright install chromium` 后执行 `npm run test:browser`，或设置 `LX_BROWSER_CHANNEL=msedge` 使用已安装的 Edge。

本次通过 8 项单元测试、32 项浏览器检查及 6 项协议断言。用户报告 0.1.0 桌面安装、导入、播放正常；0.1.1 新增确认流程尚未由用户在桌面端复验。

维护者已在 [收录方向咨询 #106](https://github.com/chthollyphile/folium-compound/issues/106) 中原则认可用户确认、自行导入且不内置远程脚本链接的方向。这不是正式安全审查或市场上架批准。

