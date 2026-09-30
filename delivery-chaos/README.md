# 外卖大乱送 · Delivery Chaos

一个 2–4 人联机的摩托外卖小游戏：骑车去餐厅取餐，再送到顾客家门口。货物会晃、会洒、会飞——开得越猛，越好笑，小费越少。

- 单人练习 / 最多 4 人联机合作（全队共享一个小费池）
- 三种食物：**汤**（会洒）、**披萨塔**（会倒）、**冰淇淋**（会融化、会掉球）
- 四种顾客要求：别按喇叭（狗在睡觉）、轻拿轻放（别翻车）、送后门、加急
- 一局 4 分钟，结束后看星级和个人奖项（洒汤王、翻车王、喇叭狂魔……）

---

## 一、怎么玩（给玩家，Windows）

### 1. 安装 Node.js（只需要做一次）

1. 打开 <https://nodejs.org/>，下载 **Node.js 22 LTS**（绿色按钮，Windows Installer `.msi`），一路点“下一步”安装。
2. 安装好后按 `Win + R`，输入 `cmd` 回车，输入下面的命令检查（应该显示 `v22.x.x`）：

   ```
   node -v
   ```

还需要 **Git**（用来下载游戏）：<https://git-scm.com/download/win>，同样一路“下一步”。
（不想装 Git 也可以：在 GitHub 页面点 **Code → Download ZIP**，解压到 `D:\Bank`，然后跳到第 3 步。）

### 2. 下载游戏

在 `cmd`（命令提示符）里依次输入：

```
git clone https://github.com/dominicchan20070508-oss/Bank.git D:\Bank
cd D:\Bank\delivery-chaos
```

### 3. 安装并启动

```
npm install
npm run build
npm start
```

- `npm install` 和 `npm run build` 只需要第一次（以后更新了游戏再做一次）。
- 看到 **“外卖大乱送 Delivery Chaos 已启动”** 就成功了。**这个黑窗口不要关**——关了游戏就停了。

### 4. 打开游戏

浏览器（推荐 Chrome / Edge）打开 <http://localhost:8080>，输入名字：

- **单人练习**：自己玩。
- **创建房间**：拿到 4 个字母的房间码，点“**复制邀请链接**”发给朋友，人齐了房主点“**开始游戏**”。
- **加入房间**：输入朋友给你的房间码。

> 第一次进游戏请先点一下页面，浏览器才允许播放声音。

### 5. 和同一个 Wi‑Fi / 局域网里的朋友一起玩

1. 启动 `npm start` 后，黑窗口里会打印类似这样的地址：

   ```
   同一 Wi-Fi 的朋友打开 / friends on your LAN:
                               http://192.168.1.23:8080
   ```

2. 第一次启动时 Windows 防火墙会弹窗问“是否允许 Node.js 访问网络”：**勾选“专用网络”，点“允许访问”**。（如果没弹窗或者点错了，朋友打不开，就到“Windows 安全中心 → 防火墙和网络保护 → 允许应用通过防火墙”里给 Node.js 勾上“专用”。）
3. 朋友在自己的电脑浏览器里（需要键盘，手机暂不支持）打开上面那个地址（**不要用 localhost**），输入房间码，或者直接打开你发的邀请链接。

### 6. 和异地的朋友通过互联网一起玩

最简单的办法是用 Cloudflare 的临时隧道，不用注册、不用改路由器。**保持游戏窗口（`npm start`）开着**，再开一个新的 `cmd` 窗口：

```
cd D:\Bank\delivery-chaos
npx cloudflared tunnel --url http://localhost:8080
```

等几秒，窗口里会出现一个 `https://xxxx-xxxx.trycloudflare.com` 的网址——把它发给朋友，大家都打开这个网址（房主在这个网址上创建房间，再发邀请链接）。

注意：

- **房主的电脑必须一直开机、两个黑窗口都不能关**，游戏就跑在房主电脑上。
- 每次重新运行隧道，网址都会变。
- 第一次运行 `npx` 会问是否安装 `cloudflared`，输入 `y` 回车。
- 也可以换成别的隧道工具（比如 `npx localtunnel --port 8080`），原理一样：把 8080 端口暴露出去。

### 7. 常见问题

| 问题 | 怎么办 |
|---|---|
| 端口 8080 被占用 | 换个端口：`set PORT=9000 && npm start`（PowerShell：`$env:PORT=9000; npm start`），然后打开 `http://localhost:9000` |
| 朋友打不开局域网地址 | 检查防火墙（见上面第 5 步）、确认在同一个 Wi‑Fi、不要用访客网络（访客网络通常互相隔离） |
| 页面是空白 / 提示不支持 WebGL | 换 Chrome/Edge，并更新显卡驱动；开着“硬件加速” |
| 画面卡 | 关掉其他占显卡的程序；游戏在帧率持续偏低时会自动降低渲染分辨率 |
| 提示“房间正在游戏中，请等下一局” | 这局已经开始了，等房主点“再来一局”后再用房间码加入 |
| 更新游戏 | 在 `D:\Bank` 里 `git pull`，再到 `delivery-chaos` 里 `npm install`、`npm run build`、`npm start` |

---

## 二、操作

| 按键 | 作用 |
|---|---|
| `W` / `↑` | 油门 |
| `S` / `↓` | 刹车 / 倒车 |
| `A` `D` / `←` `→` | 转向 |
| `空格` | 手刹（甩尾；甩得太狠时松手会“高边翻车”） |
| `H` | 喇叭 |
| `R` | 扶正（冷却 3 秒） |

## 三、规则简介

屏幕上亮起光柱的**餐厅**有待取订单：骑进圆圈并**停下（速度 < 4 m/s）约半秒**就会自动取餐，每人同一时间只能拿一单，先到先得。取餐后跟着屏幕边缘的箭头去**顾客家门口**（白色光柱），同样停下就交货。小费取决于**货物完整度 × 送达速度 × 特殊要求**：汤洒得越多、披萨掉得越多、冰淇淋化得越多，小费越少；送后门的单走错门不能交；有“狗在睡觉”的单别在顾客附近按喇叭；有“奶奶午睡”的单中途不能翻车。全队小费累加，一局 4 分钟，按人数 **110 / 200 / 290 × 人数** 计 1/2/3 星，结束后还有个人奖项。

贴士：低速时车会明显晃，停车时脚会撑地；猛转、急刹、跳台落地、撞减速带都会让货物遭殃——看得见的晃动就是你失误的提示。

---

## 四、给开发者

```
npm install
npm run dev        # Vite(5173) + 游戏服务器(8080)，浏览器打开 http://localhost:5173
npm test           # vitest：地图 / 计分 / 房间规则 / 货物 / 平衡 / 摩托 / 服务器联机集成测试
npm run typecheck  # tsc --noEmit
npm run build && npm start   # 单端口(PORT，默认 8080)同时托管网页和 WebSocket
```

**项目结构**

```
src/shared/   纯 TS，前后端共用：constants(所有可调参数) rng map orders scoring protocol validate rules(GameRoom)
src/sim/      纯逻辑：balance(倾斜/平衡模型) cargo(三种货物模型)
src/client/   three.js + cannon-es 客户端：game(主循环) world bike cargoView debris camera audio minimap …
  net/        transport.ts 接口；localTransport(单机，浏览器里跑 GameRoom)；wsTransport(联机，含时钟同步)
  ui/         HUD / 菜单 / 大厅 / 结算（简体中文）
server/       Node + ws：static.ts(托管 dist) rooms.ts(房间表/会话) app.ts(HTTP+WS) index.ts(入口，打印局域网地址)
tests/        vitest
qa/           Playwright 验收脚本（需要先 npm run build && npm start）
```

- **所有数值调参都在 `src/shared/constants.ts`**（摩托手感、倾斜模型、货物参数、小费、星级、地图数量、相机、视觉夸张系数……）。
- 单机和联机走同一条代码路径：单机 = 浏览器里的 `LocalTransport` 跑同一个 `GameRoom`。
- 服务器权威：订单池、谁拿了哪单、计时、小费、统计、结算；客户端权威：自己摩托的位置/姿态/货物完整度。
- 测试钩子：URL 参数 `?solo &seed=1 &autostart &debug &nosfx &duration=60 &noshadow &shadows`，联机 `?create&name=小明`、`?room=ABCD&name=小红`；页面里的 `window.__game.getState()` / `window.__game.debug.*`（`setInput` `teleport` `forceCrash` `giveOrder` `location` `map` `targetFor` …）。
- 联机调试开关：`DC_DEBUG=1 npm start`（Windows PowerShell：`$env:DC_DEBUG=1; npm start`）才会允许 `debugGive` 和房主自定义 `?duration=` / `?seed=`；正式玩**不要**开。
- 验收脚本：`node qa/pm-solo.mjs http://localhost:8080 qa`、`node qa/pm-multi.mjs http://localhost:8080 qa`（服务器要用 `DC_DEBUG=1` 启动）。
