# 多国家电力能源结构分析智能体

这是一个面向课程大作业的多国家电力能源结构分析智能体。系统使用多国家月度能源统计 CSV 数据，自动完成数据诊断、国家能源画像、多国对比、能源转型评分、异常检测、趋势预测和报告生成。

项目采用“可静态托管的前端 + 可选千问代理”的结构：前端页面可以部署到 GitHub Pages，本地或后端代理负责安全调用千问/Qwen。

## 项目定位

本项目不是普通图表看板，而是一个 `LLM + 工具 + 数据工作流` 的专业智能体原型：

- 启用千问代理时，LLM 负责理解用户问题、组织分析逻辑、生成解释报告。
- 浏览器内 JavaScript 工具负责数据筛选、计算指标、评分、异常检测和趋势预测。
- CSV 数据作为知识与事实来源，避免让大模型凭空编造结论。

为了适配 GitHub Pages，数据诊断、指标计算、评分、异常检测和预测都在浏览器本地完成。千问/Qwen 通过本地代理 `server.mjs` 调用，API Key 放在 `.env` 中，不会提交到 GitHub，也不会写进前端代码。

## 支持的数据格式

默认支持类似 `MES_0525.csv` 的月度能源统计表：

```csv
Country,Time,Balance,Product,Value,Unit
Germany,May-25,Net Electricity Production,Wind,9289.1,GWh
Germany,May-25,Net Electricity Production,Solar,9870.2,GWh
```

字段要求：

- `Country`：国家或区域名称
- `Time`：月份，格式如 `Jan-24`
- `Balance`：能源平衡项，例如 `Net Electricity Production`
- `Product`：能源品种，例如 `Wind`、`Solar`、`Natural Gas`
- `Value`：数值
- `Unit`：单位，通常为 `GWh`

## 核心功能

- 数据质量诊断：覆盖国家数、时间范围、能源品种数、有效记录比例。
- 国家能源画像：展示某国月度发电结构、可再生能源占比、风光占比。
- 多国对比：通过复选框选择多个国家，比较指定时间范围内的可再生能源占比变化。
- 能源转型评分：综合可再生能源占比、风光增长、化石能源下降和结构多样性。
- 异常检测：基于 12 个月滚动均值和标准差识别异常月份。
- 趋势预测：使用季节朴素模型和近年趋势修正预测未来 12 个月。
- 智能体报告：本地工具先生成结构化结果，千问可基于这些结果生成最终结论。
- 千问问答：支持“比较德国和美国的能源转型成果”等常见分析问题，由千问基于结构化指标生成回答。
- Markdown 渲染：千问返回的标题、加粗和列表会在页面中渲染为正常格式。
- 选项卡工作台：在单个页面视口内切换国家画像、多国对比、评分、异常和预测视图。

## 本地运行

直接用浏览器打开 `index.html` 后，可以上传完整 CSV 进行分析。

如果只使用本地数据分析功能，可以在项目目录运行静态服务器：

```bash
python3 -m http.server 8000
```

然后访问：

```text
http://localhost:8000
```

## 启用千问/Qwen

建议使用 Node.js 18 或更高版本，因为 `server.mjs` 使用 Node 原生 `fetch`。

1. 复制环境变量模板：

```bash
cp .env.example .env
```

2. 打开 `.env`，填入你的阿里云百炼/DashScope API Key：

```text
DASHSCOPE_API_KEY=你的 API Key
QWEN_MODEL=qwen3.7-plus
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
PORT=8000
```

3. 启动带千问代理的本地服务：

```bash
node server.mjs
```

4. 访问：

```text
http://localhost:8000
```

页面左侧“千问模型”显示已连接后，点击“生成综合报告”即可调用千问生成整体报告；输入问题后点击“回答上方问题”即可生成针对性回答。

## 评分规则

质量评分用于衡量上传数据是否适合当前智能体分析，满分 100：

- 有效记录比例：40%
- 是否包含风电和光伏字段：20%
- 是否包含总电量 `Electricity` 字段：20%
- 时间跨度：最多 20%，覆盖 10 年及以上得满分

能源转型评分用于横向比较国家能源结构转型表现，满分 100。该评分是相对于当前数据集和时间范围内其他国家的归一化评分：

- 期末可再生能源占比：35%
- 风电与光伏占比增长：30%
- 化石能源占比下降：20%
- 能源结构多样性：15%

页面中的评分是解释性指标，用于课程展示和横向比较，不代表官方能源政策评价。

## 部署到 GitHub Pages

1. 新建 GitHub 仓库。
2. 上传本项目所有文件。
3. 进入仓库 `Settings`。
4. 找到 `Pages`。
5. Source 选择 `Deploy from a branch`。
6. Branch 选择 `main`，目录选择 `/root`。
7. 保存后等待部署完成。

部署完成后，GitHub 会给出一个可访问的静态网页 URL。

不要手动上传 `.env` 文件。GitHub Pages 线上版本不能直接调用千问，只能运行前端分析、图表和结构化结论。

## 千问/Qwen 接入建议

GitHub Pages 只能托管静态前端，不能安全保存 API Key，也不能运行 `server.mjs` 这样的后端代理。因此：

- 上传到 GitHub 时，`.env` 会被 `.gitignore` 忽略，不会泄露密钥。
- GitHub Pages 在线页面可以继续运行本地分析、图表和结构化结论。
- 如果在线页面也要调用千问，需要把 `server.mjs` 部署到 Vercel、Netlify、阿里云函数计算等后端/Serverless 环境，再让前端请求该代理地址。
- 课程演示时，可以使用本地 `node server.mjs` 展示“工具计算 + 千问生成结论”的完整智能体流程。

## 数据说明

仓库内的 `sample-data/energy_sample.csv` 是从本地 MES 数据中抽取的小型演示样本，便于 GitHub Pages 首次加载时展示功能。正式分析时建议上传完整的 `MES_0525.csv`。
