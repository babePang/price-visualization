<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import Papa from "papaparse";
import dayjs from "dayjs";
// 导入 Element Plus 的中文语言包
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'

// 添加语言配置
const locale = ref(zhCn)

// 状态数据
const selectedStates = ref([]);
const selectedRegions = ref([]);
const dateRange = ref([]);
const showForecast = ref(false);
const csvData = ref<any[]>([]);

// 添加统计数据的接口
interface StatisticData {
  metric: string;
  value: number;
}

// 添加统计数据的响应式引用
const statisticData = ref<StatisticData[]>([]);

// 添加预测数据的状态
const predictionData = ref<any[]>([]);

// 添加当前选中的日期状态
const selectedDate = ref<string>('');

// 计算统计数据的函数
const calculateStatistics = (data: number[]) => {
  // 排序数据用于计算中位数和百分位数
  const sortedData = [...data].sort((a, b) => a - b);
  const n = data.length;

  // 计算平均值
  const mean = data.reduce((a, b) => a + b, 0) / n;

  // 计算中位数
  const median =
    n % 2 === 0
      ? (sortedData[n / 2 - 1] + sortedData[n / 2]) / 2
      : sortedData[Math.floor(n / 2)];

  // 计算标准差
  const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  // 计算偏度
  const skewness =
    data.reduce((a, b) => a + Math.pow(b - mean, 3), 0) /
    (n * Math.pow(stdDev, 3));

  // 计算百分位数
  const percentile25 = sortedData[Math.floor(n * 0.25)];
  const percentile75 = sortedData[Math.floor(n * 0.75)];
  const percentile95 = sortedData[Math.floor(n * 0.95)];

  return [
    { metric: "平均值", value: mean },
    { metric: "中位数", value: median },
    { metric: "标准差", value: stdDev },
    { metric: "偏度", value: skewness },
    { metric: "25th 百分位数", value: percentile25 },
    { metric: "75th 百分位数", value: percentile75 },
    { metric: "95th 百分位数", value: percentile95 },
  ];
};

// 更新统计摘要
const updateStatistics = (filteredData: any[]) => {
  // 获取最新的时间点
  const dates = Object.keys(filteredData[0])
    .filter((key) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(key))
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const latestDate = dates[dates.length - 1];

  // 获取所有地区在最新时间点的价格数据
  const priceData = filteredData.map((item) => item[latestDate]);

  // 计算统计数据
  statisticData.value = calculateStatistics(priceData);
};

// 处理CSV数据的函数
const processCsvData = async () => {
  try {
    // 修改文件路径，使用 public 目录
    const response = await fetch("/test.csv");

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const csvText = await response.text();

    const result = Papa.parse(csvText, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true, // 跳过空行
    });
    console.log(result,'======result')

    if (!result.data || result.data.length === 0) {
      throw new Error("CSV 数据为空");
    }
    console.log(result, "=====result");

    csvData.value = result.data.filter((item) => item.StateName); // 过滤掉无效数据

    // 生成州选项
    const uniqueStates = [
      ...new Set(
        csvData.value.map((item: any) => item.StateName).filter(Boolean)
      ),
    ];
    stateOptions.value = uniqueStates.map((state) => ({
      label: state,
      value: state,
    }));

    // 生成地区选项
    const uniqueRegions = [
      ...new Set(
        csvData.value.map((item: any) => item.RegionName).filter(Boolean)
      ),
    ];
    regionOptions.value = uniqueRegions.map((region) => ({
      label: region,
      value: region,
    }));

    updateCharts();
  } catch (error) {
    console.error("加载CSV文件失败:", error);
  }
};

// 状态选项
const stateOptions = ref<{ label: string; value: string }[]>([]);
const regionOptions = ref<{ label: string; value: string }[]>([]);

// 图表实例
let lineChart: echarts.ECharts;
let barChart: echarts.ECharts;

onMounted(() => {
  initCharts();
  processCsvData();
  processPredictionData();
});

// 更新图表数据
const updateCharts = () => {
  if (!csvData.value.length) return;

  // 筛选符合条件的数据
  const filteredData = csvData.value.filter((item) => {
    const stateMatch =
      selectedStates.value.length === 0 ||
      selectedStates.value.includes(item.StateName);
    const regionMatch =
      selectedRegions.value.length === 0 ||
      selectedRegions.value.includes(item.RegionName);
    return stateMatch && regionMatch;
  });

  if (filteredData.length === 0) return;

  // 获取所有日期并排序
  const allDates = Object.keys(filteredData[0])
    .filter((key) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(key))
    .sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateA.getTime() - dateB.getTime();
    });

  // 根据日期范围筛选日期
  let filteredDates = allDates;
  if (dateRange.value && dateRange.value.length === 2) {
    const startDate = new Date(dateRange.value[0]);
    const endDate = new Date(dateRange.value[1]);
    filteredDates = allDates.filter((date) => {
      const [month, day, year] = date.split("/");
      const currentDate = new Date(`${year}-${month}-${day}`);
      return currentDate >= startDate && currentDate <= endDate;
    });
  } else {
    // 如果没有选择日期范围，默认显示最近24个月的数据
    filteredDates = allDates.slice(-24);
  }

  // 更新统计数据（使用筛选后的最新日期）
  const latestDate = filteredDates[filteredDates.length - 1];
  const priceData = filteredData.map((item) => Number(item[latestDate]) || 0);
  statisticData.value = calculateStatistics(priceData);

  // 准备折线图数据
  const series = filteredData.map((item) => ({
    name: item.RegionName,
    type: "line",
    data: filteredDates.map((date) => {
      const value = item[date];
      return value === undefined ? null : Number(value);
    }),
    smooth: true,
  }));
  console.log(series,'====series');
  

  // 如果开启预测，添加预测数据
  if (showForecast.value && predictionData.value.length > 0) {
    filteredData.forEach((item) => {
      const predictions = predictionData.value.filter(
        (pred) =>
          pred.StateName === item.StateName &&
          pred.RegionName === item.RegionName
      );

      if (predictions.length > 0) {
        const predictionSeries = {
          name: `${item.RegionName} (预测)`,
          type: "line",
          data: new Array(filteredDates.length).fill(null), // 历史数据部分用 null 填充
          smooth: true,
          lineStyle: {
            type: "dashed",
          },
          itemStyle: {
            opacity: 0.7,
          },
        };

        // 添加预测数据点
        predictions.forEach((pred) => {
          const date = new Date(pred.Date);
          predictionSeries.data.push(pred.PredictedPrice);
        });

        series.push(predictionSeries);

        // 添加预测区间
        series.push({
          name: `${item.RegionName} (预测区间)`,
          type: "line",
          data: new Array(filteredDates.length).fill(null),
          smooth: true,
          lineStyle: { opacity: 0 },
          areaStyle: {
            opacity: 0.1,
            color: "#95a5a6",
          },
          stack: `confidence-${item.RegionName}`,
          symbol: "none",
        });
      }
    });
  }

  // 更新折线图
  const lineOption: EChartsOption = {
    title: { text: "价格趋势预测" },
    tooltip: {
      trigger: "axis",
      formatter: function (params: any) {
        if (!params || params.length === 0) return "";
        const date = params[0].axisValue;
        let result = `${date}<br/>`;
        params.forEach((param: any) => {
          if (!param.seriesName.includes("预测区间")) {
            const value =
              param.value === null
                ? "暂无数据"
                : param.value?.toLocaleString() || "暂无数据";
            result += `${param.seriesName}: ${value}<br/>`;
          }
        });
        return result;
      },
    },
    legend: {
      data: series
        .map((s) => s.name)
        .filter((name) => !name.includes("预测区间")),
      type: "scroll",
      orient: "horizontal",
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "3%",
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: [
        ...filteredDates.map((date) => {
          // const [month, day, year] = date.split("/");
          // return `${year}-${month.padStart(2, "0")}`;
          return dayjs(date).format('YYYY-MM-DD');
        }),
        ...(showForecast.value
          ? predictionData.value
              .filter((pred) => pred.StateName === filteredData[0].StateName)
              .map((pred) => pred.Date)
          : []),
      ],
      axisLabel: {
        rotate: 45,
      },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        formatter: (value: number) => value?.toLocaleString(),
      },
    },
    series,
  };
  lineChart.setOption(lineOption, true);

  // 在折线图更新后，更新柱状图
  if (selectedDate.value) {
    updateBarChart(selectedDate.value);
  } else {
    // 默认显示最新日期的数据
    const latestDate = filteredDates[filteredDates.length - 1];
    const [month, day, year] = latestDate.split('/');
    const formattedDate = `${year}-${month.padStart(2, '0')}`;
    updateBarChart(formattedDate);
  }
};

const initCharts = () => {
  lineChart = echarts.init(document.getElementById("lineChart"));
  barChart = echarts.init(document.getElementById("barChart"));

  // 添加折线图点击事件
  lineChart.getZr().on('click', (params) => {
    const pointInGrid = lineChart.convertFromPixel({ seriesIndex: 0 }, [params.offsetX, params.offsetY]);
    if (pointInGrid) {
      const xIndex = Math.round(pointInGrid[0]);
      const xAxis = lineChart.getOption().xAxis[0];
      if (xAxis && xAxis.data && xIndex >= 0 && xIndex < xAxis.data.length) {
        const date = xAxis.data[xIndex];
        console.log('Clicked date:', date);
        selectedDate.value = date;
        updateBarChart(date);
      }
    }
  });

  window.addEventListener("resize", () => {
    lineChart.resize();
    barChart.resize();
  });
};

// 新增更新柱状图的函数
const updateBarChart = (date: string) => {
  if (!csvData.value.length) return;
  console.log(csvData.value,'=====csvData');
  
  // 筛选符合条件的数据
  const filteredData = csvData.value.filter((item) => {
    const stateMatch =
      selectedStates.value.length === 0 ||
      selectedStates.value.includes(item.StateName);
    const regionMatch =
      selectedRegions.value.length === 0 ||
      selectedRegions.value.includes(item.RegionName);
    return stateMatch && regionMatch;
  });

  if (filteredData.length === 0) return;

  // 将 YYYY-MM 格式转换回 M/DD/YYYY 格式
  const [year, month] = date.split('-');
  const monthTotalDay = dayjs().year(year).month(month).daysInMonth();
  // const originalDate = `${parseInt(month)}/${monthTotalDay}/${year}`;
  const originalDate = dayjs(date).format('M/DD/YYYY');
  
  // 获取所有地区在选中日期的价格数据
  const barData = filteredData.map(item => ({
    region: item.RegionName,
    value: Number(item[originalDate]) || 0
  })).sort((a, b) => b.value - a.value); // 按价格降序排序
  console.log(barData,'=====barData');
  
  // 更新柱状图
  const barOption: EChartsOption = {
    title: { 
      text: `${date} 各地区价格对比`,
      left: 'center'
    },
    tooltip: { 
      trigger: "axis",
      formatter: function(params: any) {
        const regionName = params[0].name;
        const value = params[0].value;
        return `${regionName}<br/>价格: ${value?.toLocaleString()}`;
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      containLabel: true
    },
    xAxis: {
      type: "category",
      data: barData.map(item => item.region),
      axisLabel: {
        rotate: 45,
        interval: 0
      }
    },
    yAxis: { 
      type: "value",
      axisLabel: {
        formatter: (value: number) => value?.toLocaleString()
      }
    },
    series: [
      {
        name: "价格",
        type: "bar",
        data: barData.map(item => item.value),
        itemStyle: {
          color: '#409EFF'
        },
        label: {
          show: true,
          position: 'top',
          formatter: (params: any) => params.value?.toLocaleString()
        }
      }
    ]
  };
  barChart.setOption(barOption, true);
};

// 修改搜索方法，重置选中的日期
const handleSearch = () => {
  selectedDate.value = ''; // 重置选中的日期
  updateCharts();
};

// 处理预测数据的函数
const processPredictionData = async () => {
  try {
    const response = await fetch("/predictions.csv");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const csvText = await response.text();
    const result = Papa.parse(csvText, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    });

    if (!result.data || result.data.length === 0) {
      throw new Error("预测数据为空");
    }

    predictionData.value = result.data;
  } catch (error) {
    console.error("加载预测数据失败:", error);
  }
};

// 监听预测开关变化
watch(showForecast, () => {
  updateCharts();
});
</script>

<template>
  <div class="container">
    <div class="filter-section">
      <!-- 筛选条件区域 -->
      <el-config-provider :locale="locale">
        <el-row :gutter="20">
          <el-col :span="6">
            <el-select
              v-model="selectedStates"
              multiple
              placeholder="选择州"
              style="width: 100%"
            >
              <el-option
                v-for="item in stateOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-col>

          <el-col :span="6">
            <el-select
              v-model="selectedRegions"
              multiple
              placeholder="选择地区"
              style="width: 100%"
            >
              <el-option
                v-for="item in regionOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-col>

          <el-col :span="8">
            <el-date-picker
              v-model="dateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              style="width: 100%"
              value-format="YYYY-MM-DD"
            />
          </el-col>

          <el-col :span="4">
            <el-button type="primary" @click="handleSearch">搜索</el-button>
          </el-col>
        </el-row>

        <el-row style="margin-top: 20px">
          <el-col :span="24">
            <el-switch v-model="showForecast" active-text="显示预测" />
          </el-col>
        </el-row>
      </el-config-provider>
    </div>

    <!-- 图表区域 -->
    <div class="charts-section">
      <div id="lineChart" class="chart"></div>
      <div class="price-info"></div>
      <div id="barChart" class="chart"></div>
      <div class="statistic-summary">
        <h3>统计摘要</h3>
        <el-table
          :data="statisticData"
          style="width: 100%"
          :border="true"
          size="small"
        >
          <el-table-column prop="metric" label="指标" width="180" />
          <el-table-column prop="value" label="数值">
            <template #default="scope">
              {{
                scope.row.value?.toLocaleString("zh-CN", {
                  maximumFractionDigits: 2,
                  minimumFractionDigits: 2,
                })
              }}
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.container {
  padding: 20px;
}

.filter-section {
  margin-bottom: 30px;
  padding: 20px;
  background-color: #f5f7fa;
  border-radius: 4px;
}

.charts-section {
  display: grid;
  grid-template-columns: 3fr 1fr;
  gap: 20px;
}

.chart {
  height: 400px;
  background-color: #fff;
  border-radius: 4px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.price-info {
  padding: 20px;
  background-color: #fff;
  border-radius: 4px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.info-item {
  margin-bottom: 15px;
  padding: 10px;
  background-color: #f5f7fa;
  border-radius: 4px;
}

.statistic-summary {
  padding: 20px;
  background-color: #fff;
  border-radius: 4px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.statistic-summary h3 {
  margin-top: 0;
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 500;
  color: #303133;
}

/* 调整表格样式 */
:deep(.el-table) {
  font-size: 14px;
}

:deep(.el-table__header) {
  background-color: #f5f7fa;
}

:deep(.el-table__row:hover) {
  background-color: #f5f7fa;
}
</style>
