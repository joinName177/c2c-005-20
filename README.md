# c2c-005 · 声音表情包工坊

Vue 3 + TypeScript + Vite 纯前端声音创作工具。支持最长 10 秒录音/导入、裁剪、声学特征情绪匹配、Canvas 封面、IndexedDB 本地作品集和系统文件分享。

## 架构

- `src/core`：作品模型、特征归一化、情绪规则与封面预设
- `src/ports`：录音、音频、Canvas、仓储与分享接口
- `src/adapters`：MediaRecorder、Web Audio、Canvas、IndexedDB、Web Share 实现
- `src/ui`：Vue 阶段式工作流和原生 CSS

## 运行

```bash
npm install
npm run dev
npm run build
docker compose up --build
```

本地开发默认由 Vite 提供；Docker 部署访问 `http://localhost:8105`。浏览器录音在非 localhost 环境通常需要 HTTPS 和麦克风权限。

## 情绪依据与回看

情绪页分开展示"自动建议"（含置信度与各标签得分）和"最终标签"；手动指定的标签不显示自动建议的置信度。保存作品时写入完整分析快照（特征、各标签得分、置信度、解释、规则版本与分析时间，见 `docs/decisions/2026-10-07-emotion-analysis-snapshot.md`），之后可在作品集中重新打开回看当时依据或恢复自动建议；恢复不会覆盖已手写的气泡文字。规则升级后旧快照仍按原样展示并标注版本差异，不会用当前规则重算冒充过去的结论；可显式选择"按当前规则重新分析"生成新依据。早期作品缺少快照时如实提示，不编造分数。

声音只保存在本机 IndexedDB，不会上传。生成的分享链接仅承载标题、情绪和封面配置，不包含原始音频；文件分享不受此限制。情绪识别是娱乐性启发式结果，不代表身份、性格或医学判断。
