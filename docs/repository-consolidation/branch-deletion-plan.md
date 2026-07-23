# 远程分支删除计划

状态：**仅计划，未获 Phase B 删除确认，不执行。**

## 必须保留

- `main`
- `feature/reference-led-visual-direction`
- Phase B 创建的 `develop`

## Retrieval-First 合并后观察

- `feature/retrieval-first-single-pipeline`：合并后建议保留 3–7 天，再单独确认删除。

## 最终拟删除清单

以下每条分支只有在归档 Tag 远端存在且 Tag 解引用 SHA 与分支 HEAD 完全一致后，才有资格进入删除确认：

- `v5-deep-creative-director`
- `v5-desktop`
- `feature/visual-translation-v1`
- `feature/brand-dna-analysis`
- `feature/brand-dna-report-v2`
- `feature/brand-dna-v3-deep-compact`
- `feature/brand-dna-v3-core-quality-fix`
- `experiment/execution-oriented-directions-v2`
- `experiment/visual-fact-first-pipeline`

## 删除前置条件

1. Retrieval-First 已通过 PR 合入 main。
2. `retrieval-first-core-beta-0.5` 已推送。
3. `develop` 已创建并指向最新 main。
4. PR #2、#3、#4、#5 已关闭。
5. Reference Translation 分支已同步 develop 且仍在保留清单。
6. 用户再次确认本文件中的最终删除清单。
