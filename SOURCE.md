# Corresponding source / 对应源码

Package: **dsh-ai4scholar@0.7.1**

- Source tag: [v0.7.1](https://github.com/literaf/dsh-ai4scholar/tree/v0.7.1)
- Complete source archive: [download v0.7.1](https://github.com/literaf/dsh-ai4scholar/archive/refs/tags/v0.7.1.tar.gz)
- Public source repository: [literaf/dsh-ai4scholar](https://github.com/literaf/dsh-ai4scholar)

The tagged source includes the TypeScript source, package manifest, dependency lockfile, build configuration, assets, tests and release instructions used to produce this npm package. The tag and published package are immutable. Access to source does not require an AI4Scholar API key or paid subscription.

To build from the unpacked source archive, use Node.js 22.19 or later and pnpm 10:

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run typecheck
pnpm test
```

The lockfile identifies the upstream dependency versions. Runtime and bundled dependencies retain their own notices; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Native Harness page checks use the isolated runtime described in `.github/workflows/ci.yml`. Building and running the offline tests do not require a paid API request.

Distributors of modified versions must provide the Corresponding Source of their own version as required by AGPL; this upstream archive alone does not provide their modifications.

## 中文

本包 **dsh-ai4scholar@0.7.1** 的对应源码位于以上固定标签和源码压缩包中，包含构建所需的源文件、配置、依赖锁文件及资源。获取源码无需 API 密钥或付费账号。按上方命令安装锁定依赖并构建；原生 Harness 页面检查的方法见 CI 配置。

分发修改版或在适用场景中通过网络提供修改版时，需要按 AGPL 提供该修改版的对应源码，不能只链接未包含自身改动的上游版本。
