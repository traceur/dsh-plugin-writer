# dsh-plugin-writer

用当前 DSH 宿主里已经接入的模型，对同一个题目并行产出，再交给一个裁判模型做交叉评审和终稿提炼。

密钥留在宿主的模型配置里。插件只调用宿主 llm 服务，不另存 API key。

## 面板

重启 dsh web 并刷新页面后，左侧栏会出现「写作」。

1. 写题目，可选填侧重。
2. 勾选 2 到 5 个候选模型，并指定裁判。
3. 选择策略：取精去糟、共识提炼，或辩论批评。
4. 运行中可以看到三层中间过程：
   - 每个候选模型的原文和推理
   - 裁判的交叉评审、取舍清单、冲突说明
   - 综合终稿，可复制

任务保存在 ~/.dsh/dsh-writer/state.json。宿主重启时，还在跑的任务会标成中断。

## 本机挂载

当前 web profile 已经有直接挂载，id 是 multi-model-writer，包名是 dsh-plugin-writer。node_modules 里的链接也指向这个目录。不要再把本包放进 dsh.profile.bundles，否则 /api/writer 会注册两次。

运行入口是 lib/，不是 src/。src/ 是早先的草稿，不会被加载。

改完代码后重启 dsh web，再刷新页面。左侧栏会出现「写作」。

## 接口

只接受同一页面或本机请求：

- GET /api/writer/models
- GET /api/writer/runs
- POST /api/writer/runs
- GET /api/writer/runs/:id
- POST /api/writer/runs/:id/cancel
