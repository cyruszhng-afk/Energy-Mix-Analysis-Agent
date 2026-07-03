const state = {
  rawRows: [],
  rows: [],
  filteredRows: [],
  countries: [],
  products: [],
  years: [],
  charts: {},
  lastAnalysis: null,
  qwenAvailable: false,
  qwenProxyAvailable: false,
  qwenProxyConfigured: false,
  qwenModel: "qwen3.7-plus",
};

const QWEN_DEFAULT_MODEL = "qwen3.7-plus";
const QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

const PRODUCT_GROUPS = {
  renewable: ["Hydro", "Wind", "Solar", "Geothermal", "Combustible Renewables", "Other Renewables"],
  windSolar: ["Wind", "Solar"],
  fossil: [
    "Coal, Peat and Manufactured Gases",
    "Oil and Petroleum Products",
    "Natural Gas",
    "Total Combustible Fuels",
    "Other Combustible Non-Renewables",
  ],
  structure: [
    "Coal, Peat and Manufactured Gases",
    "Natural Gas",
    "Oil and Petroleum Products",
    "Nuclear",
    "Hydro",
    "Wind",
    "Solar",
    "Geothermal",
    "Combustible Renewables",
    "Other Renewables",
  ],
};

const CHART_COLORS = {
  "Coal, Peat and Manufactured Gases": "#555b6e",
  "Natural Gas": "#4f7cac",
  "Oil and Petroleum Products": "#9a6b4f",
  Nuclear: "#8f5aa8",
  Hydro: "#2f80b7",
  Wind: "#2a9d8f",
  Solar: "#e9a227",
  Geothermal: "#bf5f42",
  "Combustible Renewables": "#7aa95c",
  "Other Renewables": "#6a994e",
  Electricity: "#263238",
  "Total Renewables (Hydro, Geo, Solar, Wind, Other)": "#1f8f62",
};

const DEFAULT_COMPARE = ["Germany", "United States", "People's Republic of China", "Japan", "Australia"];

const COUNTRY_ALIASES = {
  德国: "Germany",
  美国: "United States",
  中国: "People's Republic of China",
  日本: "Japan",
  澳大利亚: "Australia",
  丹麦: "Denmark",
  英国: "United Kingdom",
  法国: "France",
  加拿大: "Canada",
  西班牙: "Spain",
  意大利: "Italy",
  韩国: "Korea",
  印度: "India",
  巴西: "Brazil",
  Germany: "Germany",
  "United States": "United States",
  USA: "United States",
  US: "United States",
  China: "People's Republic of China",
  Japan: "Japan",
  Australia: "Australia",
  Denmark: "Denmark",
  "United Kingdom": "United Kingdom",
  UK: "United Kingdom",
  France: "France",
};

const els = {
  fileInput: document.querySelector("#fileInput"),
  loadSampleBtn: document.querySelector("#loadSampleBtn"),
  runAnalysisBtn: document.querySelector("#runAnalysisBtn"),
  qwenQuestionBtn: document.querySelector("#qwenQuestionBtn"),
  qwenReportBtn: document.querySelector("#qwenReportBtn"),
  copyReportBtn: document.querySelector("#copyReportBtn"),
  countrySelect: document.querySelector("#countrySelect"),
  compareChecklist: document.querySelector("#compareChecklist"),
  startYearSelect: document.querySelector("#startYearSelect"),
  endYearSelect: document.querySelector("#endYearSelect"),
  productSelect: document.querySelector("#productSelect"),
  questionInput: document.querySelector("#questionInput"),
  qwenApiKeyInput: document.querySelector("#qwenApiKeyInput"),
  qwenModelInput: document.querySelector("#qwenModelInput"),
  dataStatus: document.querySelector("#dataStatus"),
  metricCountries: document.querySelector("#metricCountries"),
  metricRange: document.querySelector("#metricRange"),
  metricProducts: document.querySelector("#metricProducts"),
  metricQuality: document.querySelector("#metricQuality"),
  profileSubtitle: document.querySelector("#profileSubtitle"),
  compareSubtitle: document.querySelector("#compareSubtitle"),
  anomalySubtitle: document.querySelector("#anomalySubtitle"),
  profileInsights: document.querySelector("#profileInsights"),
  forecastInsights: document.querySelector("#forecastInsights"),
  compareTable: document.querySelector("#compareTable"),
  scoreTable: document.querySelector("#scoreTable"),
  anomalyTable: document.querySelector("#anomalyTable"),
  agentReport: document.querySelector("#agentReport"),
  qwenStatus: document.querySelector("#qwenStatus"),
};

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  setEmptyTables();
  checkQwenStatus();
});

function bindEvents() {
  els.fileInput.addEventListener("change", handleFileUpload);
  els.loadSampleBtn.addEventListener("click", loadSampleData);
  els.runAnalysisBtn.addEventListener("click", runAgentAnalysis);
  els.qwenQuestionBtn.addEventListener("click", askQwenQuestion);
  els.qwenReportBtn.addEventListener("click", () => generateQwenReport());
  els.copyReportBtn.addEventListener("click", () => copyText(els.agentReport.innerText));
  els.qwenApiKeyInput.addEventListener("input", refreshQwenState);
  els.qwenModelInput.addEventListener("input", refreshQwenState);

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => activateTab(tab.dataset.tab));
  });
}

function handleFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  parseCsv(file, file.name);
}

async function loadSampleData() {
  try {
    const response = await fetch("sample-data/energy_sample.csv");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    parseCsv(text, "energy_sample.csv");
  } catch (error) {
    els.dataStatus.textContent =
      "示例数据需要通过本地服务器或 GitHub Pages 加载。你也可以直接上传 MES_0525.csv。";
  }
}

function parseCsv(input, sourceName) {
  els.dataStatus.textContent = `正在读取 ${sourceName}...`;
  if (input instanceof File) {
    const reader = new FileReader();
    reader.onload = () => parseCsvText(String(reader.result ?? ""), sourceName);
    reader.onerror = () => {
      els.dataStatus.textContent = "文件读取失败，请重新选择 CSV。";
    };
    reader.readAsText(input);
    return;
  }
  parseCsvText(String(input), sourceName);
}

function parseCsvText(text, sourceName) {
  const parsed = parseCsvRows(text);
  const normalized = normalizeRows(parsed);
  if (!normalized.length) {
    els.dataStatus.textContent = "未识别到有效数据，请检查 CSV 字段。";
    return;
  }
  state.rawRows = parsed;
  state.rows = normalized;
  afterDataLoaded(sourceName);
}

function parseCsvRows(text) {
  const rows = [];
  let cell = "";
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map(clean);
  return rows.slice(1).map((values) =>
    headers.reduce((acc, header, index) => {
      acc[header] = values[index] ?? "";
      return acc;
    }, {}),
  );
}

function normalizeRows(rows) {
  return rows
    .map((row) => {
      const country = clean(row.Country);
      const time = clean(row.Time);
      const balance = clean(row.Balance);
      const product = clean(row.Product);
      const value = Number.parseFloat(clean(row.Value));
      const unit = clean(row.Unit);
      const date = parseMonth(time);
      if (!country || !time || !balance || !product || !Number.isFinite(value) || !date) return null;
      return {
        country,
        time,
        balance,
        product,
        value,
        unit,
        date,
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        monthKey: formatMonth(date),
      };
    })
    .filter(Boolean);
}

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function parseMonth(value) {
  const match = String(value).trim().match(/^([A-Za-z]{3})-(\d{2})$/);
  if (!match) return null;
  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const month = monthNames.indexOf(match[1].toLowerCase());
  if (month < 0) return null;
  const yy = Number(match[2]);
  const year = yy >= 70 ? 1900 + yy : 2000 + yy;
  return new Date(Date.UTC(year, month, 1));
}

function formatMonth(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function afterDataLoaded(sourceName) {
  state.countries = unique(state.rows.map((row) => row.country)).sort();
  state.products = unique(state.rows.map((row) => row.product)).sort();
  state.years = unique(state.rows.map((row) => row.year)).sort((a, b) => a - b);

  populateSelects();
  const profile = dataQualityProfile();
  els.dataStatus.innerHTML = [
    `<strong>${sourceName}</strong> 已加载。`,
    `有效记录 ${formatNumber(state.rows.length)} 行，覆盖 ${state.countries.length} 个国家/区域，${state.years[0]}-${state.years[state.years.length - 1]}。`,
    `识别到 ${state.products.length} 类能源品种。`,
  ].join("<br>");
  els.metricCountries.textContent = String(state.countries.length);
  els.metricRange.textContent = `${state.years[0]}-${state.years[state.years.length - 1]}`;
  els.metricProducts.textContent = String(state.products.length);
  els.metricQuality.textContent = `${profile.score}/100`;
  els.runAnalysisBtn.disabled = false;
  runAgentAnalysis();
}

function populateSelects() {
  const defaultCountry = pickCountry(["Germany", "United States", "People's Republic of China", state.countries[0]]);
  fillSelect(els.countrySelect, state.countries, defaultCountry);

  els.compareChecklist.innerHTML = "";
  state.countries.forEach((country) => {
    const id = `compare-${country.replace(/[^a-z0-9]+/gi, "-")}`;
    const label = document.createElement("label");
    label.className = "check-row";
    label.innerHTML = `
      <input type="checkbox" value="${escapeHtml(country)}" ${DEFAULT_COMPARE.includes(country) ? "checked" : ""} />
      <span>${escapeHtml(country)}</span>
    `;
    label.querySelector("input").addEventListener("change", () => {
      if (state.rows.length) runAgentAnalysis();
    });
    label.querySelector("input").id = id;
    els.compareChecklist.appendChild(label);
  });
  if (!getSelectedCompareCountries().length) {
    [...els.compareChecklist.querySelectorAll("input")].slice(0, 5).forEach((input) => {
      input.checked = true;
    });
  }

  fillSelect(els.startYearSelect, state.years, Math.max(state.years[0], state.years[state.years.length - 1] - 7));
  fillSelect(els.endYearSelect, state.years, state.years[state.years.length - 1]);
  const preferredProducts = ["Wind", "Solar", "Coal, Peat and Manufactured Gases", "Natural Gas", state.products[0]];
  fillSelect(els.productSelect, state.products, pickProduct(preferredProducts));
}

function fillSelect(select, values, selectedValue) {
  select.innerHTML = "";
  values.forEach((value) => {
    const option = new Option(value, value);
    option.selected = String(value) === String(selectedValue);
    select.add(option);
  });
}

function pickCountry(candidates) {
  return candidates.find((item) => state.countries.includes(item)) ?? state.countries[0];
}

function pickProduct(candidates) {
  return candidates.find((item) => state.products.includes(item)) ?? state.products[0];
}

function runAgentAnalysis() {
  if (!state.rows.length) return;
  const country = els.countrySelect.value;
  let startYear = Number(els.startYearSelect.value);
  let endYear = Number(els.endYearSelect.value);
  if (startYear > endYear) [startYear, endYear] = [endYear, startYear];
  const compareCountries = getSelectedCompareCountries();
  const product = els.productSelect.value;

  const context = { country, startYear, endYear, compareCountries, product };
  const profile = buildCountryProfile(context);
  const comparison = buildComparison(context);
  const scores = buildTransitionScores(context);
  const anomalies = detectAnomalies(context);
  const forecast = forecastProduct(context);

  state.lastAnalysis = { context, profile, comparison, scores, anomalies, forecast };
  renderProfile(profile, context);
  renderComparison(comparison, context);
  renderScores(scores);
  renderAnomalies(anomalies, context);
  renderForecast(forecast, context);
  renderReport(state.lastAnalysis);
  updateQwenButton();
}

function netRows() {
  return state.rows.filter((row) => row.balance === "Net Electricity Production");
}

function rowsForPeriod(rows, startYear, endYear) {
  return rows.filter((row) => row.year >= startYear && row.year <= endYear);
}

function buildCountryProfile({ country, startYear, endYear }) {
  const rows = rowsForPeriod(netRows(), startYear, endYear).filter((row) => row.country === country);
  const monthly = groupBy(rows, (row) => row.monthKey);
  const mix = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, items]) => {
      const productValues = sumByProduct(items);
      const electricity = productValues.Electricity ?? sumSelected(productValues, PRODUCT_GROUPS.structure);
      const renewables = productValues["Total Renewables (Hydro, Geo, Solar, Wind, Other)"] ?? sumSelected(productValues, PRODUCT_GROUPS.renewable);
      const fossil = sumSelected(productValues, PRODUCT_GROUPS.fossil.filter((item) => item !== "Total Combustible Fuels"));
      const windSolar = sumSelected(productValues, PRODUCT_GROUPS.windSolar);
      return {
        monthKey,
        productValues,
        electricity,
        renewableShare: safeRatio(renewables, electricity),
        windSolarShare: safeRatio(windSolar, electricity),
        fossilShare: safeRatio(fossil, electricity),
      };
    });
  const latest = mix[mix.length - 1] ?? null;
  const earliest = mix.find((item) => Number.isFinite(item.renewableShare)) ?? null;
  return { rows, mix, latest, earliest };
}

function buildComparison({ compareCountries, startYear, endYear }) {
  return compareCountries
    .map((country) => {
      const profile = buildCountryProfile({ country, startYear, endYear });
      const earliest = profile.earliest;
      const latest = profile.latest;
      if (!earliest || !latest) return null;
      return {
        country,
        startShare: earliest.renewableShare,
        endShare: latest.renewableShare,
        change: latest.renewableShare - earliest.renewableShare,
        windSolarShare: latest.windSolarShare,
        fossilShare: latest.fossilShare,
        mix: profile.mix,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.change - a.change);
}

function buildTransitionScores({ startYear, endYear }) {
  const candidates = state.countries.filter((country) => {
    const profile = buildCountryProfile({ country, startYear, endYear });
    return profile.mix.length >= 24 && profile.latest?.electricity > 0;
  });
  const raw = candidates.map((country) => {
    const profile = buildCountryProfile({ country, startYear, endYear });
    const earliest = profile.earliest;
    const latest = profile.latest;
    const renewableEnd = latest?.renewableShare ?? 0;
    const windSolarGrowth = (latest?.windSolarShare ?? 0) - (earliest?.windSolarShare ?? 0);
    const fossilDecline = (earliest?.fossilShare ?? 0) - (latest?.fossilShare ?? 0);
    const diversity = latest ? diversityScore(latest.productValues) : 0;
    return { country, renewableEnd, windSolarGrowth, fossilDecline, diversity };
  });

  const normalized = raw.map((item) => ({
    ...item,
    renewableScore: normalizeMetric(item.renewableEnd, raw.map((r) => r.renewableEnd)),
    windSolarScore: normalizeMetric(item.windSolarGrowth, raw.map((r) => r.windSolarGrowth)),
    fossilScore: normalizeMetric(item.fossilDecline, raw.map((r) => r.fossilDecline)),
    diversityScore: normalizeMetric(item.diversity, raw.map((r) => r.diversity)),
  }));

  return normalized
    .map((item) => ({
      ...item,
      score:
        item.renewableScore * 0.35 +
        item.windSolarScore * 0.3 +
        item.fossilScore * 0.2 +
        item.diversityScore * 0.15,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);
}

function detectAnomalies({ country, startYear, endYear, product }) {
  const rows = rowsForPeriod(netRows(), startYear, endYear)
    .filter((row) => row.country === country && row.product === product)
    .sort((a, b) => a.date - b.date);
  return rows
    .map((row, index) => {
      const history = rows.slice(Math.max(0, index - 12), index).map((item) => item.value);
      if (history.length < 6) return null;
      const mean = average(history);
      const std = standardDeviation(history);
      const z = std > 0 ? (row.value - mean) / std : 0;
      return { ...row, mean, z };
    })
    .filter(Boolean)
    .filter((row) => Math.abs(row.z) >= 2)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, 12);
}

function forecastProduct({ country, product }) {
  const rows = netRows()
    .filter((row) => row.country === country && row.product === product)
    .sort((a, b) => a.date - b.date);
  if (rows.length < 24) return { history: rows, forecast: [] };
  const last12 = rows.slice(-12);
  const previous12 = rows.slice(-24, -12);
  const trendDelta = average(last12.map((row) => row.value)) - average(previous12.map((row) => row.value));
  const monthlyTrend = trendDelta / 12;
  const lastDate = rows[rows.length - 1].date;
  const forecast = Array.from({ length: 12 }, (_, index) => {
    const base = last12[index % 12]?.value ?? rows[rows.length - 1].value;
    const projectedDate = new Date(Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth() + index + 1, 1));
    return {
      monthKey: formatMonth(projectedDate),
      value: Math.max(0, base + monthlyTrend * (index + 1)),
      type: "forecast",
    };
  });
  return {
    history: rows.slice(-36).map((row) => ({ monthKey: row.monthKey, value: row.value, type: "history" })),
    forecast,
    trendDelta,
  };
}

function renderProfile(profile, context) {
  els.profileSubtitle.textContent = `${context.country}，${context.startYear}-${context.endYear}`;
  const labels = profile.mix.map((item) => item.monthKey);
  const products = PRODUCT_GROUPS.structure.filter((product) =>
    profile.mix.some((item) => Number.isFinite(item.productValues[product]) && item.productValues[product] > 0),
  );
  renderChart("mixChart", {
    type: "bar",
    data: {
      labels,
      datasets: products.map((product) => ({
        label: product,
        data: profile.mix.map((item) => item.productValues[product] ?? 0),
        backgroundColor: CHART_COLORS[product] ?? "#8d99ae",
        stack: "mix",
      })),
    },
    options: chartOptions({ stacked: true, yTitle: "GWh" }),
  });

  renderChart("renewableChart", {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "可再生能源占比",
          data: profile.mix.map((item) => toPercent(item.renewableShare)),
          borderColor: "#216e5b",
          backgroundColor: "rgba(33, 110, 91, 0.12)",
          tension: 0.25,
          fill: true,
        },
        {
          label: "风光占比",
          data: profile.mix.map((item) => toPercent(item.windSolarShare)),
          borderColor: "#d28b2d",
          backgroundColor: "rgba(210, 139, 45, 0.1)",
          tension: 0.25,
        },
      ],
    },
    options: chartOptions({ yTitle: "%" }),
  });

  const latest = profile.latest;
  const earliest = profile.earliest;
  const change = latest && earliest ? latest.renewableShare - earliest.renewableShare : 0;
  els.profileInsights.innerHTML = [
    insight("最新可再生占比", formatPercent(latest?.renewableShare), "按总发电量口径计算，优先使用 Total Renewables 字段。"),
    insight("风光占比", formatPercent(latest?.windSolarShare), "风电与光伏发电量合计占总发电量的比例。"),
    insight("区间变化", signedPercent(change), "期末可再生占比较期初的变化，适合描述能源转型趋势。"),
  ].join("");
}

function renderComparison(comparison, context) {
  els.compareSubtitle.textContent = `${context.startYear}-${context.endYear}`;
  const labels = comparison.map((item) => item.country);
  renderChart("compareChart", {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "期初可再生占比",
          data: comparison.map((item) => toPercent(item.startShare)),
          backgroundColor: "#a7c7b5",
        },
        {
          label: "期末可再生占比",
          data: comparison.map((item) => toPercent(item.endShare)),
          backgroundColor: "#216e5b",
        },
      ],
    },
    options: chartOptions({ yTitle: "%" }),
  });

  els.compareTable.innerHTML =
    comparison
      .map(
        (item) => `
        <tr>
          <td>${escapeHtml(item.country)}</td>
          <td>${formatPercent(item.startShare)}</td>
          <td>${formatPercent(item.endShare)}</td>
          <td class="${item.change >= 0 ? "positive" : "negative"}">${signedPercent(item.change)}</td>
          <td>${formatPercent(item.windSolarShare)}</td>
          <td>${formatPercent(item.fossilShare)}</td>
        </tr>`,
      )
      .join("") || emptyRow(6);
}

function renderScores(scores) {
  renderChart("scoreChart", {
    type: "bar",
    data: {
      labels: scores.slice(0, 10).map((item) => item.country),
      datasets: [
        {
          label: "能源转型评分",
          data: scores.slice(0, 10).map((item) => Math.round(item.score)),
          backgroundColor: "#216e5b",
        },
      ],
    },
    options: chartOptions({ yTitle: "分" }),
  });

  els.scoreTable.innerHTML =
    scores
      .map(
        (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.country)}</td>
          <td><strong>${Math.round(item.score)}</strong></td>
          <td>${formatPercent(item.renewableEnd)}</td>
          <td>${signedPercent(item.windSolarGrowth)}</td>
          <td>${signedPercent(item.fossilDecline)}</td>
          <td>${Math.round(item.diversityScore)}</td>
        </tr>`,
      )
      .join("") || emptyRow(7);
}

function renderAnomalies(anomalies, context) {
  els.anomalySubtitle.textContent = `${context.country}，${context.product}`;
  const sorted = [...anomalies].sort((a, b) => a.date - b.date);
  renderChart("anomalyChart", {
    type: "bar",
    data: {
      labels: sorted.map((row) => row.monthKey),
      datasets: [
        {
          label: "Z 分数",
          data: sorted.map((row) => row.z.toFixed(2)),
          backgroundColor: sorted.map((row) => (row.z > 0 ? "#216e5b" : "#b94738")),
        },
      ],
    },
    options: chartOptions({ yTitle: "Z" }),
  });

  els.anomalyTable.innerHTML =
    anomalies
      .map(
        (row) => `
        <tr>
          <td>${row.monthKey}</td>
          <td>${escapeHtml(row.product)}</td>
          <td>${formatNumber(row.value)}</td>
          <td class="${row.z >= 0 ? "positive" : "negative"}">${row.z.toFixed(2)}</td>
          <td>${row.z >= 0 ? "显著高于过去 12 个月水平" : "显著低于过去 12 个月水平"}</td>
        </tr>`,
      )
      .join("") || emptyRow(5);
}

function renderForecast(forecast, context) {
  const labels = [...forecast.history, ...forecast.forecast].map((item) => item.monthKey);
  renderChart("forecastChart", {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "历史值",
          data: [...forecast.history.map((item) => item.value), ...forecast.forecast.map(() => null)],
          borderColor: "#216e5b",
          backgroundColor: "rgba(33, 110, 91, 0.12)",
          tension: 0.25,
        },
        {
          label: "预测值",
          data: [...forecast.history.map(() => null), ...forecast.forecast.map((item) => item.value)],
          borderColor: "#d28b2d",
          backgroundColor: "rgba(210, 139, 45, 0.12)",
          borderDash: [6, 4],
          tension: 0.25,
        },
      ],
    },
    options: chartOptions({ yTitle: "GWh" }),
  });

  const lastHistory = forecast.history.at(-1);
  const lastForecast = forecast.forecast.at(-1);
  const change = lastHistory && lastForecast ? safeRatio(lastForecast.value - lastHistory.value, lastHistory.value) : 0;
  els.forecastInsights.innerHTML = [
    insight("预测对象", `${context.country} - ${context.product}`, "基于月度发电量序列生成未来 12 个月趋势。"),
    insight("12 个月后变化", signedPercent(change), "该预测是演示级季节趋势模型，不替代严肃能源规划模型。"),
    insight("模型解释", "季节朴素 + 趋势修正", "使用去年同月作为基准，并叠加最近两年均值差异形成趋势项。"),
  ].join("");
}

function renderReport(analysis) {
  const { context, profile, comparison, scores, anomalies, forecast } = analysis;
  const latest = profile.latest;
  const earliest = profile.earliest;
  const topScore = scores[0];
  const topChange = comparison[0];
  const forecastChange =
    forecast.history.at(-1) && forecast.forecast.at(-1)
      ? safeRatio(forecast.forecast.at(-1).value - forecast.history.at(-1).value, forecast.history.at(-1).value)
      : 0;

  const report = [
    `分析对象：${context.country}，时间范围 ${context.startYear}-${context.endYear}。`,
    "",
    `1. 国家画像：${context.country} 最新可再生能源占比为 ${formatPercent(latest?.renewableShare)}，风光占比为 ${formatPercent(latest?.windSolarShare)}。相较期初，可再生能源占比变化 ${signedPercent((latest?.renewableShare ?? 0) - (earliest?.renewableShare ?? 0))}。`,
    `2. 多国对比：在所选国家中，${topChange?.country ?? "-"} 的可再生能源占比提升最明显，区间变化为 ${signedPercent(topChange?.change ?? 0)}。`,
    `3. 转型评分：综合评分最高的是 ${topScore?.country ?? "-"}，得分 ${Math.round(topScore?.score ?? 0)}。该评分综合考虑期末可再生能源占比、风光增长、化石能源占比下降和能源结构多样性。`,
    `4. 异常检测：${context.product} 序列中识别到 ${anomalies.length} 个显著异常月份。异常月份可作为进一步查找政策、季节、装机、统计口径变化的线索。`,
    `5. 趋势预测：按季节朴素模型与近年趋势修正，${context.product} 未来 12 个月末值相对最近历史月份约变化 ${signedPercent(forecastChange)}。`,
  ].join("\n");
  setReport(report);
}

async function askQwenQuestion() {
  if (!state.lastAnalysis) return;
  const question = els.questionInput.value.trim();
  if (!question) return;
  const requestedCountries = extractCountriesFromQuestion(question);
  if (requestedCountries.length >= 2) {
    setSelectedCompareCountries(requestedCountries);
    if (requestedCountries.includes(els.countrySelect.value) === false) {
      els.countrySelect.value = requestedCountries[0];
    }
    runAgentAnalysis();
  }

  await generateQwenReport(question);
}

function buildComparisonAnswer(question, context, items) {
  if (!items.length) {
    return "当前问题中提到的国家没有足够数据用于对比。请确认这些国家在 CSV 中存在，并且时间范围内有 Net Electricity Production 数据。";
  }
  const byChange = [...items].sort((a, b) => b.change - a.change);
  const byEndShare = [...items].sort((a, b) => b.endShare - a.endShare);
  const byWindSolar = [...items].sort((a, b) => b.windSolarShare - a.windSolarShare);
  const fossilLowest = [...items].sort((a, b) => a.fossilShare - b.fossilShare)[0];
  const winner = byChange[0];
  const rows = items
    .map(
      (item) =>
        `${item.country}：可再生占比 ${formatPercent(item.startShare)} -> ${formatPercent(item.endShare)}，变化 ${signedPercent(item.change)}，风光占比 ${formatPercent(item.windSolarShare)}，化石占比 ${formatPercent(item.fossilShare)}`,
    )
    .join("；");
  return [
    `对“${question}”的直接回答：从 ${context.startYear}-${context.endYear} 的月度电力结构数据看，能源转型成果更突出的是 ${winner.country}。`,
    `判断依据是：${winner.country} 的可再生能源占比提升幅度为 ${signedPercent(winner.change)}，在本次对比中最高；期末可再生能源占比最高的是 ${byEndShare[0].country}（${formatPercent(byEndShare[0].endShare)}）；风光占比最高的是 ${byWindSolar[0].country}（${formatPercent(byWindSolar[0].windSolarShare)}）；化石能源占比较低的是 ${fossilLowest.country}（${formatPercent(fossilLowest.fossilShare)}）。`,
    `具体数值：${rows}。`,
    "因此，如果把“成果”定义为占比提升速度，优先看提升幅度；如果定义为当前清洁化水平，则应同时看期末可再生占比、风光占比和化石占比。",
  ].join("\n");
}

function extractCountriesFromQuestion(question) {
  const found = [];
  Object.entries(COUNTRY_ALIASES).forEach(([alias, country]) => {
    const matched = /[A-Za-z]/.test(alias)
      ? question.toLowerCase().includes(alias.toLowerCase())
      : question.includes(alias);
    if (matched && state.countries.includes(country) && !found.includes(country)) {
      found.push(country);
    }
  });
  state.countries.forEach((country) => {
    if (question.toLowerCase().includes(country.toLowerCase()) && !found.includes(country)) {
      found.push(country);
    }
  });
  return found;
}

function setSelectedCompareCountries(countries) {
  [...els.compareChecklist.querySelectorAll("input")].forEach((input) => {
    input.checked = countries.includes(input.value);
  });
}

function getSelectedCompareCountries() {
  return [...els.compareChecklist.querySelectorAll("input:checked")].map((input) => input.value);
}

async function checkQwenStatus() {
  if (!els.qwenStatus) return;
  try {
    const response = await fetch("/api/qwen-health", { cache: "no-store" });
    if (!response.ok) throw new Error("Qwen proxy unavailable");
    const data = await response.json();
    state.qwenProxyAvailable = true;
    state.qwenProxyConfigured = Boolean(data.configured);
    if (data.model) {
      state.qwenModel = data.model;
      els.qwenModelInput.value = data.model;
    }
  } catch (error) {
    state.qwenProxyAvailable = false;
    state.qwenProxyConfigured = false;
  }
  refreshQwenState();
}

function refreshQwenState() {
  const connection = getQwenConnection();
  state.qwenAvailable = connection.available;
  state.qwenModel = connection.model;
  if (els.qwenStatus) els.qwenStatus.textContent = connection.status;
  updateQwenButton();
}

function getQwenConnection() {
  const apiKey = getDirectQwenApiKey();
  const model = getSelectedQwenModel();
  if (state.qwenProxyAvailable) {
    if (apiKey) {
      return {
        available: true,
        mode: "proxy-client-key",
        apiKey,
        model,
        status: `本地代理 + 页面 Key：${model}`,
      };
    }
    if (state.qwenProxyConfigured) {
      return {
        available: true,
        mode: "proxy-env",
        apiKey: "",
        model,
        status: `已连接本地代理：${model}`,
      };
    }
    return {
      available: false,
      mode: "proxy-missing-key",
      apiKey: "",
      model,
      status: "本地代理已启动，请输入页面 API Key 或配置 .env。",
    };
  }
  if (apiKey) {
    return {
      available: true,
      mode: "direct",
      apiKey,
      model,
      status: `页面 Key 已就绪：${model}`,
    };
  }
  return {
    available: false,
    mode: "none",
    apiKey: "",
    model,
    status: "未连接：启动本地代理，或输入自己的千问 API Key。",
  };
}

function getDirectQwenApiKey() {
  return els.qwenApiKeyInput.value.trim();
}

function getSelectedQwenModel() {
  return els.qwenModelInput.value.trim() || QWEN_DEFAULT_MODEL;
}

function updateQwenButton() {
  if (!els.qwenReportBtn || !els.qwenQuestionBtn) return;
  els.qwenReportBtn.disabled = !state.lastAnalysis || !state.qwenAvailable;
  els.qwenQuestionBtn.disabled = !state.lastAnalysis || !state.qwenAvailable;
}

async function generateQwenReport(question = "", localAnswer = "") {
  if (!state.lastAnalysis) return;
  const connection = getQwenConnection();
  if (!connection.available) {
    els.qwenStatus.textContent = connection.status;
    return;
  }
  els.qwenStatus.textContent = `正在调用 ${connection.model}...`;
  els.qwenReportBtn.disabled = true;
  els.qwenQuestionBtn.disabled = true;
  try {
    const data =
      connection.mode === "direct"
        ? await callQwenDirect(question, localAnswer, connection)
        : await callQwenProxy(question, localAnswer, connection);
    const heading = question ? `千问回答：${question}` : "千问生成结论";
    setReport(`# ${heading}\n\n${data.text}`);
    els.qwenStatus.textContent = `已由 ${data.model || connection.model} 生成`;
    activateTab("report");
  } catch (error) {
    const message =
      connection.mode === "direct" && error instanceof TypeError
        ? "浏览器直连失败，可能是跨域限制或网络错误；请改用本地 node server.mjs 代理。"
        : error.message || "千问调用失败";
    els.qwenStatus.textContent = `千问调用失败：${message}`;
  } finally {
    updateQwenButton();
  }
}

async function callQwenProxy(question, localAnswer, connection) {
  const response = await fetch("/api/qwen-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      localAnswer,
      model: connection.model,
      apiKey: connection.apiKey || "",
      analysisSummary: buildAnalysisSummary(state.lastAnalysis),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "千问调用失败");
  return data;
}

async function callQwenDirect(question, localAnswer, connection) {
  const response = await fetch(`${QWEN_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${connection.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: connection.model,
      messages: buildQwenMessages(question, localAnswer, buildAnalysisSummary(state.lastAnalysis)),
      temperature: 0.2,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error?.message || result?.message || `HTTP ${response.status}`);
  }
  const text = result?.choices?.[0]?.message?.content || "";
  if (!text) throw new Error("千问未返回文本内容");
  return { text, model: connection.model };
}

function buildQwenMessages(question, localAnswer, analysisSummary) {
  return [
    {
      role: "system",
      content:
        "你是多国家电力能源结构分析智能体的报告生成模块。你基于工具计算结果生成结论，不直接处理原始 CSV。",
    },
    {
      role: "user",
      content: buildQwenUserPrompt(question, localAnswer, analysisSummary),
    },
  ];
}

function buildQwenUserPrompt(question, localAnswer, analysisSummary) {
  return [
    "请基于下面的结构化能源数据分析结果，生成中文回答。",
    "要求：",
    "1. 直接回答用户问题，不要泛泛介绍。",
    "2. 只能引用给定数据，不要编造政策、新闻或外部事实。",
    "3. 说明关键指标依据，例如可再生占比、风光占比、化石占比、变化幅度、异常数量或预测趋势。",
    "4. 输出适合课程项目展示，语气专业、简洁。",
    "5. 可以使用 Markdown 的标题、加粗和列表组织内容。",
    "",
    `用户问题：${question || "请生成本次智能体分析结论。"}`,
    localAnswer ? `本地工具初步回答：${localAnswer}` : "",
    `结构化分析结果：${JSON.stringify(analysisSummary, null, 2)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildAnalysisSummary(analysis) {
  const { context, profile, comparison, scores, anomalies, forecast } = analysis;
  const latest = profile.latest;
  const earliest = profile.earliest;
  const forecastChange =
    forecast.history.at(-1) && forecast.forecast.at(-1)
      ? safeRatio(forecast.forecast.at(-1).value - forecast.history.at(-1).value, forecast.history.at(-1).value)
      : 0;
  return {
    context,
    selected_country_profile: {
      country: context.country,
      period: `${context.startYear}-${context.endYear}`,
      latest_renewable_share: formatPercent(latest?.renewableShare),
      latest_wind_solar_share: formatPercent(latest?.windSolarShare),
      latest_fossil_share: formatPercent(latest?.fossilShare),
      renewable_share_change: signedPercent((latest?.renewableShare ?? 0) - (earliest?.renewableShare ?? 0)),
    },
    comparison: comparison.slice(0, 8).map((item) => ({
      country: item.country,
      start_renewable_share: formatPercent(item.startShare),
      end_renewable_share: formatPercent(item.endShare),
      change: signedPercent(item.change),
      wind_solar_share: formatPercent(item.windSolarShare),
      fossil_share: formatPercent(item.fossilShare),
    })),
    transition_scores: scores.slice(0, 8).map((item, index) => ({
      rank: index + 1,
      country: item.country,
      score: Math.round(item.score),
      renewable_end: formatPercent(item.renewableEnd),
      wind_solar_growth: signedPercent(item.windSolarGrowth),
      fossil_decline: signedPercent(item.fossilDecline),
      diversity_score: Math.round(item.diversityScore),
    })),
    anomalies: anomalies.slice(0, 8).map((row) => ({
      month: row.monthKey,
      product: row.product,
      value_gwh: Math.round(row.value * 10) / 10,
      z_score: Math.round(row.z * 100) / 100,
      direction: row.z >= 0 ? "high" : "low",
    })),
    forecast: {
      product: context.product,
      method: "seasonal naive with recent trend adjustment",
      twelve_month_change: signedPercent(forecastChange),
    },
  };
}

function activateTab(tabId) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === tabId);
  });
  window.requestAnimationFrame(() => {
    if (state.lastAnalysis) {
      const { context, profile, comparison, scores, anomalies, forecast } = state.lastAnalysis;
      renderProfile(profile, context);
      renderComparison(comparison, context);
      renderScores(scores);
      renderAnomalies(anomalies, context);
      renderForecast(forecast, context);
    }
  });
}

function setEmptyTables() {
  els.compareTable.innerHTML = emptyRow(6);
  els.scoreTable.innerHTML = emptyRow(7);
  els.anomalyTable.innerHTML = emptyRow(5);
}

function dataQualityProfile() {
  const total = state.rawRows.length || state.rows.length;
  const valid = state.rows.length;
  const validity = total ? valid / total : 0;
  const hasWindSolar = state.products.includes("Wind") && state.products.includes("Solar");
  const hasElectricity = state.products.includes("Electricity");
  const timeCoverage = Math.min(1, state.years.length / 10);
  const score = Math.round((validity * 0.4 + Number(hasWindSolar) * 0.2 + Number(hasElectricity) * 0.2 + timeCoverage * 0.2) * 100);
  return { score };
}

function sumByProduct(rows) {
  return rows.reduce((acc, row) => {
    acc[row.product] = (acc[row.product] ?? 0) + row.value;
    return acc;
  }, {});
}

function sumSelected(values, products) {
  return products.reduce((sum, product) => sum + (values[product] ?? 0), 0);
}

function diversityScore(productValues) {
  const values = PRODUCT_GROUPS.structure
    .map((product) => productValues[product] ?? 0)
    .filter((value) => value > 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total || values.length < 2) return 0;
  const hhi = values.reduce((sum, value) => {
    const share = value / total;
    return sum + share * share;
  }, 0);
  return (1 - hhi) * 100;
}

function normalizeMetric(value, values) {
  const finite = values.filter(Number.isFinite);
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (!Number.isFinite(value) || max === min) return 50;
  return ((value - min) / (max - min)) * 100;
}

function renderChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  drawCanvasChart(canvas, config);
}

function chartOptions({ stacked = false, yTitle = "" } = {}) {
  return { stacked, yTitle };
}

function drawCanvasChart(canvas, config) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(640, Math.floor(rect.width || canvas.parentElement.clientWidth || 800));
  const height = Math.max(300, Math.floor(rect.height || 315));
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const labels = config.data.labels ?? [];
  const datasets = (config.data.datasets ?? []).filter((dataset) => dataset.data?.length);
  const options = config.options ?? {};
  const plot = { left: 62, right: 20, top: 18, bottom: 72 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;

  if (!labels.length || !datasets.length) {
    drawCenteredText(ctx, width, height, "暂无图表数据");
    return;
  }

  const allValues = [];
  if (options.stacked && config.type === "bar") {
    labels.forEach((_, index) => {
      allValues.push(
        datasets.reduce((sum, dataset) => sum + numericValue(dataset.data[index]), 0),
      );
    });
  } else {
    datasets.forEach((dataset) => dataset.data.forEach((value) => {
      const numeric = numericValue(value);
      if (Number.isFinite(numeric)) allValues.push(numeric);
    }));
  }
  let min = Math.min(0, ...allValues);
  let max = Math.max(1, ...allValues);
  if (max === min) max = min + 1;
  const padding = (max - min) * 0.08;
  max += padding;
  if (min < 0) min -= padding;

  drawAxes(ctx, { plot, plotWidth, plotHeight, min, max, yTitle: options.yTitle, labels });

  if (config.type === "line") {
    drawLineChart(ctx, { datasets, labels, plot, plotWidth, plotHeight, min, max });
  } else {
    drawBarChart(ctx, { datasets, labels, plot, plotWidth, plotHeight, min, max, stacked: options.stacked });
  }
  drawLegend(ctx, datasets, width, height);
}

function drawAxes(ctx, { plot, plotWidth, plotHeight, min, max, yTitle, labels }) {
  ctx.strokeStyle = "#dbe2dc";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plot.left, plot.top);
  ctx.lineTo(plot.left, plot.top + plotHeight);
  ctx.lineTo(plot.left + plotWidth, plot.top + plotHeight);
  ctx.stroke();

  ctx.fillStyle = "#637069";
  ctx.font = "12px Inter, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const ticks = 5;
  for (let i = 0; i <= ticks; i += 1) {
    const value = min + ((max - min) * i) / ticks;
    const y = valueToY(value, min, max, plot, plotHeight);
    ctx.strokeStyle = "#edf1ed";
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.left + plotWidth, y);
    ctx.stroke();
    ctx.fillText(formatNumber(value), plot.left - 8, y);
  }

  const labelStep = Math.max(1, Math.ceil(labels.length / 8));
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  labels.forEach((label, index) => {
    if (index % labelStep !== 0 && index !== labels.length - 1) return;
    const x = indexToX(index, labels.length, plot, plotWidth);
    ctx.fillText(label, x, plot.top + plotHeight + 10);
  });

  if (yTitle) {
    ctx.save();
    ctx.translate(16, plot.top + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText(yTitle, 0, 0);
    ctx.restore();
  }
}

function drawBarChart(ctx, { datasets, labels, plot, plotWidth, plotHeight, min, max, stacked }) {
  const slot = plotWidth / Math.max(labels.length, 1);
  const gap = Math.min(10, slot * 0.24);
  labels.forEach((_, labelIndex) => {
    let positiveBase = 0;
    const visibleDatasets = datasets.filter((dataset) => numericValue(dataset.data[labelIndex]) !== 0);
    const barGroupWidth = Math.max(4, slot - gap);
    visibleDatasets.forEach((dataset, datasetIndex) => {
      const value = numericValue(dataset.data[labelIndex]);
      if (!Number.isFinite(value)) return;
      let x;
      let barWidth;
      let y;
      let h;
      if (stacked) {
        x = plot.left + labelIndex * slot + gap / 2;
        barWidth = barGroupWidth;
        const start = positiveBase;
        const end = positiveBase + Math.max(0, value);
        y = valueToY(end, min, max, plot, plotHeight);
        h = valueToY(start, min, max, plot, plotHeight) - y;
        positiveBase = end;
      } else {
        const count = Math.max(visibleDatasets.length, 1);
        barWidth = Math.max(4, barGroupWidth / count - 2);
        x = plot.left + labelIndex * slot + gap / 2 + datasetIndex * (barWidth + 2);
        const zeroY = valueToY(0, min, max, plot, plotHeight);
        y = value >= 0 ? valueToY(value, min, max, plot, plotHeight) : zeroY;
        h = Math.abs(zeroY - valueToY(value, min, max, plot, plotHeight));
      }
      ctx.fillStyle = dataset.backgroundColor ?? dataset.borderColor ?? "#216e5b";
      ctx.fillRect(x, y, barWidth, Math.max(1, h));
    });
  });
}

function drawLineChart(ctx, { datasets, labels, plot, plotWidth, plotHeight, min, max }) {
  datasets.forEach((dataset) => {
    ctx.strokeStyle = dataset.borderColor ?? "#216e5b";
    ctx.fillStyle = dataset.borderColor ?? "#216e5b";
    ctx.lineWidth = 2;
    if (dataset.borderDash) ctx.setLineDash(dataset.borderDash);
    else ctx.setLineDash([]);
    ctx.beginPath();
    let started = false;
    dataset.data.forEach((value, index) => {
      const numeric = numericValue(value);
      if (!Number.isFinite(numeric)) {
        started = false;
        return;
      }
      const x = indexToX(index, labels.length, plot, plotWidth);
      const y = valueToY(numeric, min, max, plot, plotHeight);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

function drawLegend(ctx, datasets, width, height) {
  const items = datasets.slice(0, 8);
  ctx.font = "12px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  let x = 18;
  let y = height - 36;
  items.forEach((dataset) => {
    const labelWidth = Math.min(170, ctx.measureText(dataset.label).width + 26);
    if (x + labelWidth > width - 20) {
      x = 18;
      y += 18;
    }
    ctx.fillStyle = dataset.backgroundColor ?? dataset.borderColor ?? "#216e5b";
    ctx.fillRect(x, y - 5, 10, 10);
    ctx.fillStyle = "#637069";
    ctx.fillText(shortLabel(dataset.label), x + 16, y);
    x += labelWidth + 10;
  });
  if (datasets.length > items.length) {
    ctx.fillStyle = "#637069";
    ctx.fillText(`+${datasets.length - items.length} 项`, x + 4, y);
  }
}

function valueToY(value, min, max, plot, plotHeight) {
  return plot.top + plotHeight - ((value - min) / (max - min)) * plotHeight;
}

function indexToX(index, count, plot, plotWidth) {
  if (count <= 1) return plot.left + plotWidth / 2;
  return plot.left + (index / (count - 1)) * plotWidth;
}

function numericValue(value) {
  if (value == null || value === "") return NaN;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : NaN;
}

function drawCenteredText(ctx, width, height, text) {
  ctx.fillStyle = "#637069";
  ctx.font = "14px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2);
}

function shortLabel(label) {
  const aliases = {
    "Coal, Peat and Manufactured Gases": "Coal",
    "Oil and Petroleum Products": "Oil",
    "Combustible Renewables": "Bio renew",
    "Other Renewables": "Other renew",
    "Total Renewables (Hydro, Geo, Solar, Wind, Other)": "Renewables",
  };
  return aliases[label] ?? label;
}

function groupBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== "" && value != null))];
}

function average(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

function standardDeviation(values) {
  const avg = average(values);
  const finite = values.filter(Number.isFinite);
  if (finite.length < 2) return 0;
  const variance = finite.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (finite.length - 1);
  return Math.sqrt(variance);
}

function safeRatio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function toPercent(value) {
  return Number.isFinite(value) ? value * 100 : 0;
}

function formatPercent(value) {
  return `${toPercent(value).toFixed(1)}%`;
}

function signedPercent(value) {
  const pct = toPercent(value);
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value);
}

function insight(title, value, body) {
  return `<article class="insight"><strong>${escapeHtml(title)}：${escapeHtml(String(value))}</strong><span>${escapeHtml(body)}</span></article>`;
}

function emptyRow(cols) {
  return `<tr><td colspan="${cols}" class="empty">暂无数据</td></tr>`;
}

function setReport(text) {
  els.agentReport.innerHTML = renderMarkdown(text || "");
}

function renderMarkdown(text) {
  const lines = escapeHtml(text).split(/\r?\n/);
  const html = [];
  let paragraph = [];
  let listType = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${formatInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };
  const openList = (type) => {
    if (listType === type) return;
    closeList();
    listType = type;
    html.push(`<${type}>`);
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      closeList();
      return;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length + 2;
      html.push(`<h${level}>${formatInlineMarkdown(heading[2])}</h${level}>`);
      return;
    }
    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      openList("ul");
      html.push(`<li>${formatInlineMarkdown(unordered[1])}</li>`);
      return;
    }
    const ordered = trimmed.match(/^\d+[.、]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      openList("ol");
      html.push(`<li>${formatInlineMarkdown(ordered[1])}</li>`);
      return;
    }
    closeList();
    paragraph.push(trimmed);
  });
  flushParagraph();
  closeList();
  return html.join("");
}

function formatInlineMarkdown(text) {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function copyText(text) {
  if (!text) return;
  await navigator.clipboard.writeText(text);
}
