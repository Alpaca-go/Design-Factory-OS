# 仓库分支审计（Phase A 前）

审计基线：`origin/main@cf55955417e6a4e0e4fd1f62bf4702be4e19be78`

`behind / ahead` 均相对于 `origin/main`。所有建议删除动作都只是 Phase B 候选，当前未执行。

| 远程分支 | HEAD | 最新提交时间 | PR | behind / ahead | 包含关系 | 建议动作 |
|---|---|---|---|---:|---|---|
| `origin/main` | `cf55955417e6a4e0e4fd1f62bf4702be4e19be78` | 2026-07-15 23:00 +08:00 | PR #1 已合并 | 0 / 0 | 默认分支 | 保留 |
| `origin/feature/reference-led-visual-direction` | `7ea99598cb8efdc4c1f04e33da340f0af93cefaa` | 2026-07-23 16:50 +08:00 | 无 | 1 / 24 | 完整包含 Retrieval-First，另有 1 个 Reference Translation 提交 | 保留；Phase B 同步到 develop |
| `origin/feature/retrieval-first-single-pipeline` | `66e867aedc68c3e851473126e63c4b47c617836c` | 2026-07-23 16:18 +08:00 | 无 | 1 / 23 | 完整包含 Visual Translation V1 与两个 experiment 分支 | 通过 PR 合并到 main；合并后观察 3–7 天 |
| `origin/experiment/visual-fact-first-pipeline` | `9f862fd70dc21dc4678ca1c7921539320840eacc` | 2026-07-22 18:40 +08:00 | 无 | 1 / 20 | 被 Retrieval-First 完整包含 | 归档；Phase B 候选删除 |
| `origin/experiment/execution-oriented-directions-v2` | `21cb8ea7f38482ec0281221052cc9f9978a5361d` | 2026-07-22 17:42 +08:00 | 无 | 1 / 18 | 被 Visual Fact First 与 Retrieval-First 完整包含 | 归档；Phase B 候选删除 |
| `origin/feature/visual-translation-v1` | `b404c7639bd770e3be83c047b64932fe7fc96f37` | 2026-07-20 14:52 +08:00 | PR #5 | 1 / 13 | 被 Retrieval-First 完整包含；后者另有 10 个提交 | 归档；关闭 PR；Phase B 候选删除 |
| `origin/feature/brand-dna-analysis` | `92a255088a382b4365a594a3ca3e97b636a74f59` | 2026-07-16 19:05 +08:00 | PR #2 | 1 / 5 | 被 Report V2、V3 Deep Compact 与 V3 Core Fix 包含 | 归档；关闭 PR；Phase B 候选删除 |
| `origin/feature/brand-dna-report-v2` | `ba27aad08d91465c9c95478c77575eea4e1cc88f` | 2026-07-17 05:31 +08:00 | PR #3 | 1 / 6 | 完整包含 Analysis；与 V3 Core Fix 分叉 | 归档；关闭 PR；Phase B 候选删除 |
| `origin/feature/brand-dna-v3-deep-compact` | `4fe4a2e854cffa515bf92ce61bc58e424e038e23` | 2026-07-17 18:29 +08:00 | 无 | 1 / 11 | 被 V3 Core Fix 完整包含 | 归档；Phase B 候选删除 |
| `origin/feature/brand-dna-v3-core-quality-fix` | `c48cb5ec2bea203fe22c80f49272fde794fb2544` | 2026-07-17 22:38 +08:00 | PR #4 | 1 / 15 | 包含 Analysis 与 Deep Compact；相对 Report V2 为左 1 / 右 10 的分叉 | 归档；关闭 PR；Phase B 候选删除 |
| `origin/v5-desktop` | `abc51a4357e7f5a7a04bd14d47c1fe9751f19fb3` | 2026-07-16 17:17 +08:00 | 多个旧 PR 的 base | 1 / 4 | 被 Visual Translation V1 和 Retrieval-First 完整包含 | 归档；Phase B 候选删除 |
| `origin/v5-deep-creative-director` | `7a89c2a3e5931ac7c9646c799eb8b9ae38c890b5` | 2026-07-15 19:18 +08:00 | PR #1 已合并 | 1 / 0 | 被 main 完整包含 | 归档；Phase B 候选删除 |

## 关键关系结论

- `feature/visual-translation-v1...feature/retrieval-first-single-pipeline`：`0 / 10`。Retrieval-First 完整包含 Visual Translation V1。
- `feature/brand-dna-analysis...feature/brand-dna-report-v2`：`0 / 1`。Report V2 完整包含 Analysis。
- `feature/brand-dna-report-v2...feature/brand-dna-v3-core-quality-fix`：`1 / 10`。两者已经分叉，不能连续合入 main。
- `feature/brand-dna-v3-deep-compact` 被 `feature/brand-dna-v3-core-quality-fix` 完整包含，但仍需独立 Tag 后才能删除其远端分支。

## 风险

- 当前 `main` 本地分支落后 `origin/main` 5 个提交；Phase B 必须 `pull --ff-only`。
- Retrieval-First 还没有对应 PR。
- `develop` 尚不存在。
- 两条 experiment 分支与 `feature/brand-dna-v3-deep-compact` 未出现在原始已知分支清单中，已纳入额外归档保护。
