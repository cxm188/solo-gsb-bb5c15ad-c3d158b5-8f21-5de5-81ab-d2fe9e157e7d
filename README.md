# 播客章节标注工作台（Podcast Chapter Workbench）

基于 **React + TypeScript + Web Audio API** 的网页播客章节标注工具。导入本地音频后，
在可缩放波形上通过拖拽创建、移动、调整章节区间，区间自动吸附邻近边界并阻止重叠，
支持键盘精确微调、章节搜索排序、片段实时预览，并导出带标题的 **WebVTT** 与 **JSON** 文件。

所有数据均在浏览器本地处理，音频不会上传到任何服务器。

## 一键启动（Docker）

```bash
docker compose up -d --build
```

启动后访问：

- **地址**：http://localhost:8080
- **容器内端口**：`80`（nginx）
- **宿主机映射端口**：`8080`（在 `docker-compose.yml` 的 `ports` 中修改）

停止：

```bash
docker compose down
```

> 也可不使用 Compose：
>
> ```bash
> docker build -t podcast-chapter-workbench .
> docker run -d --name podcast-workbench -p 8080:80 podcast-chapter-workbench
> ```

## 本地开发（无需 Docker）

```bash
npm install
npm run dev        # 开发服务器 http://localhost:5173
npm run build      # 类型检查 + 生产构建，输出到 dist/
npm run preview    # 本地预览生产构建 http://localhost:8080
```

## 使用说明

1. 点击 **导入音频**（或将音频文件直接拖入窗口），等待解码生成波形。
   支持浏览器可解码的格式：MP3、WAV、M4A/AAC、OGG、FLAC 等。
2. 在波形空白区域 **按住拖拽** 创建章节区间；点击空白处定位播放头。
3. 拖拽区间中部 **移动**，拖拽左右边缘 **调整长度**；靠近其它章节边界、
   音频起点 / 终点时会显示绿色吸附线并自动吸附。区间之间永远不会重叠，
   且单段最短 0.25 秒。
4. 在右侧面板编辑章节标题、开始 / 结束时间，搜索与排序章节。
5. 点击 **▶ 预览** 从章节起点播放（可勾选“循环预览”循环播放该片段）。
6. 顶栏点击 **导出 WebVTT** 或 **导出 JSON** 下载标注结果。

### 键盘快捷键（先点击选中一个区间）

| 按键 | 功能 |
| --- | --- |
| `空格` | 播放 / 暂停 |
| `←` / `→` | 整个区间左 / 右微调 0.1s |
| `↑` / `↓` | 微调起点 / 终点 0.1s |
| `Alt + 方向键` | 精确微调 0.01s |
| `Shift + 方向键` | 大步微调 1s |
| `Home` / `End` | 起点贴 0 / 终点贴音频结尾 |
| `Enter` | 预览选中章节 |
| `Delete` / `Backspace` | 删除选中章节 |
| `+` / `−` / `0` | 放大 / 缩小 / 适应全部 |
| `Esc` | 取消选中 / 停止预览 |
| `?` | 快捷键帮助 |

鼠标操作：**滚轮**以光标为锚点缩放，拖拽顶部**标尺**平移视图，区间边缘手柄拖拽调整。

键盘微调不触发吸附（用于精确定位），但仍受防重叠与最小时长约束保护。

## 导出格式

**WebVTT**（`.vtt`，可用于支持章节的播客播放器 / 视频字幕工具）：

```vtt
WEBVTT

1
00:00:00.000 --> 00:02:30.500
开场与自我介绍

2
00:02:30.500 --> 00:15:04.000
本期主题讨论
```

**JSON**（`.chapters.json`）：

```json
{
  "format": "podcast-chapters",
  "version": 1,
  "duration": 1823.45,
  "chapters": [
    { "id": "…", "title": "开场与自我介绍", "start": 0.0, "end": 150.5 }
  ]
}
```

## 技术栈与结构

- React 18 + TypeScript（严格模式）+ Vite 5
- Web Audio API（`AudioContext.decodeAudioData` 解码，提取峰值渲染波形）
- Canvas 绘制波形 / 时间标尺，DOM 覆盖层渲染可交互区间
- 吸附与防重叠为纯函数逻辑，见 `src/utils/chapters.ts`
- 生产镜像：Node 多阶段构建 → nginx 静态托管（最终镜像不含 Node 源码）

```
src/
├── App.tsx                  # 状态管理、播放控制、键盘操作、导出
├── audio/decode.ts          # Web Audio 解码与波形峰值提取
├── components/
│   ├── Transport.tsx        # 顶栏：导入、播放、进度条、导出
│   ├── WaveformView.tsx     # 波形/标尺/区间拖拽/缩放平移
│   └── ChapterList.tsx      # 章节搜索、排序、编辑、预览
└── utils/
    ├── chapters.ts          # 吸附、防重叠、微调约束（纯函数）
    ├── exporter.ts          # WebVTT / JSON 生成与下载
    ├── time.ts              # 时间格式化与解析
    └── view.ts              # 视口缩放/平移计算
```
