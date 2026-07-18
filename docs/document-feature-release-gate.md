# 文档功能发布检查门

任何涉及 PDF、DOCX、Markdown、TXT 解析、Visual Translation 结构化分析、Checkpoint 或报告生成的修改，在提交和生成客户端前必须运行：

```powershell
npm run verify:document-flows
```

检查门覆盖 Visual Translation V1 Schema、三方向差异、Checkpoint Resume、局部报告、Desktop 文档解析和 TypeScript 契约。检查只使用本地 Fixture 与模拟模型，不读取 API Key，也不调用外部模型。检查失败时不得生成或交付新版 `.exe`。

如果修改涉及 Prompt、真实 Provider 请求结构、Schema 校验、重试、Checkpoint 或报告生成，Portable EXE 交付前还必须使用用户授权的真实 API Profile 与代表性文档完成一次端到端 Smoke Test。仅启动客户端、类型检查或 Mock 通过不能替代真实测试。真实测试必须到达最终报告，并记录模型、调用次数、耗时、报告路径与视觉内容占比；记录不得包含 API Key。
