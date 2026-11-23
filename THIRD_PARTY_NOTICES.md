# Third-party notices / 第三方声明

The AGPL license for AI4Scholar-authored code does not replace the licenses of third-party software. Commercial agreements with AI4Scholar cover only rights AI4Scholar owns. Preserve the applicable upstream notices when redistributing these components.

This inventory identifies direct runtime dependencies, the actual third-party inputs in the browser bundle, and host peer packages used for this release. It is not a complete inventory of every transitive or platform-specific dependency installed by the host. Separately installed packages carry their own licenses and notices, which remain applicable.

AI4Scholar 自有代码采用的 AGPL 不替代第三方许可；另行商业授权也仅覆盖 AI4Scholar 拥有的权利。再分发相关组件时应保留其原始声明。下表包含直接运行时依赖、实际打入浏览器包的组件及宿主 peer 组件；它不是宿主全部传递依赖或各平台原生库的完整清单，独立安装的依赖仍适用各自随包提供的许可。

| Component | Version | License | Use in this package | Notice |
| --- | --- | --- | --- | --- |
| `@deepseek-ai/cordis` | 4.0.2 | `MIT` | host peer dependency; not bundled | [LICENSE](LICENSES/third-party/deepseek-ai__cordis__LICENSE.txt) |
| `@deepseek-ai/dsh-commands` | 0.1.1-rc.2 | `MIT` | host peer dependency; not bundled | [LICENSE](LICENSES/third-party/deepseek-ai__dsh-commands__LICENSE.txt) |
| `@deepseek-ai/dsh-credentials` | 0.1.1-rc.2 | `MIT` | host peer dependency; not bundled | [LICENSE](LICENSES/third-party/deepseek-ai__dsh-credentials__LICENSE.txt) |
| `@deepseek-ai/dsh-host-webserver` | 0.1.1-rc.2 | `MIT` | host peer dependency; not bundled | [LICENSE](LICENSES/third-party/deepseek-ai__dsh-host-webserver__LICENSE.txt) |
| `@deepseek-ai/dsh-llm` | 0.1.1-rc.2 | `MIT` | host peer dependency; not bundled | [LICENSE](LICENSES/third-party/deepseek-ai__dsh-llm__LICENSE.txt) |
| `@deepseek-ai/dsh-system-prompt` | 0.1.1-rc.2 | `MIT` | host peer dependency; not bundled | [LICENSE](LICENSES/third-party/deepseek-ai__dsh-system-prompt__LICENSE.txt) |
| `@deepseek-ai/dsh-tools` | 0.1.1-rc.2 | `MIT` | host peer dependency; not bundled | [LICENSE](LICENSES/third-party/deepseek-ai__dsh-tools__LICENSE.txt) |
| `@deepseek-ai/schemastery` | 3.18.5 | `MIT` | host peer dependency; not bundled | [LICENSE](LICENSES/third-party/deepseek-ai__schemastery__LICENSE.txt) |
| `@napi-rs/canvas` | 0.1.80 | `MIT` | installed runtime dependency | [LICENSE](LICENSES/third-party/napi-rs__canvas__LICENSE.txt) |
| `pdf-parse` | 2.4.5 | `Apache-2.0` | installed runtime dependency | [LICENSE](LICENSES/third-party/pdf-parse__LICENSE.txt) |
| `react` | 18.3.1 | `MIT` | host peer dependency; not bundled | [LICENSE](LICENSES/third-party/react__LICENSE.txt) |

The DeepSeek Harness module wrapper and host-integration interfaces follow the upstream Harness integration model; applicable upstream MIT notices are retained with the host component notices above. Build-time tooling not shipped in the plugin retains its own upstream licenses.
