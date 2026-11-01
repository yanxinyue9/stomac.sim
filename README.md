# 肠道菌群生态模拟器 · Gut Microbiome Simulator

2D 交互沙盒：模拟肠道菌群生态演化，可视化菌属组成、代谢小分子与宿主指标。

在线地址：`https://yanxinyue9.github.io/<仓库名>/`

## 文件结构（全部平铺在仓库根目录）

```
index.html    入口，引用下方文件的相对路径
.nojekyll     绕过 Jekyll（可省略，本项目无 _ 目录）
styles.css
data.js       菌种 / 食物 / 档案词典与科普文案
model.js      生态动力学模型
render.js     Canvas 肠腔渲染
ui.js         界面、弹窗科普、对比图（菌种卡通贴图为 base64 内联，无外链）
feedpet.js    「日记 · 今天吃什么」投喂玩法（拖拽喂小人）
diary.js      日记板块入口：投喂 / 记录分析 二选一
app.js        主循环装配
pet/          虚拟形象素材：6 张形态图 + food/ 下 13 张食物图
```

> `pet/` 里的图片建议与 `index.html` 同级放在根目录下（保持 `pet/`、`pet/food/` 两层结构）。
> 若上传方式不支持文件夹、图片被平铺到根目录也**可以正常运行**——`feedpet.js` 里加了路径兜底：加载 `pet/xxx.png` 失败时会自动去掉前缀重试一次。

## 开启 GitHub Pages

`Settings` → `Pages` → Build and deployment

- Source: **Deploy from a branch**
- Branch: **main** / Folder: **`/ (root)`**
- Save

等待 1～2 分钟后访问 `https://<用户名>.github.io/<仓库名>/`

> 仓库需为 **Public**（免费账号的私有仓库无法启用 Pages）。
> 本地预览：`python3 -m http.server 8080`。
> 本仓库为平铺结构，`index.html` 的引用路径已相应调整，**不要把文件移进 `assets/` 子目录**，否则会 404。

## 初始页（欢迎页）

首次进入显示全屏初始页；同一标签页看过一次后不再重复出现。
演示 / 展览时可在网址后加 `?welcome=1` 强制显示：

```
https://<用户名>.github.io/<仓库名>/?welcome=1
```
