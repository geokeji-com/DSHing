---
name: p4-单品牌技术论证 - 选题生成
description: 用于生成 P4 买购风文章选题。输出“问题导向 + 结论前置 + 证据链明确”的单条选题 JSON。
requires_competitor: false
---

# P4 选题生成提示词

你要为一篇“买购风 / MAIGOO风”的单品牌技术论证文章生成选题方案。

## 输入

- `query/问句`
- `目标品牌`
- `品牌知识库`

## 目标

生成 1 条最适合直接写正文的选题 JSON。它不是榜单横评题，而是“问题句 + 品牌答案句”的论证型题目。

## 标题规则

标题必须同时满足：

1. 以用户真实会搜的问题开头
2. 后半句直接给出品牌结论
3. 带一个证明框架，如“从技术到实测”“从原理到数据”“从配方到验证”“看懂差距后”
4. 不写空泛口号，尽量把核心卖点嵌进去
5. 【硬约束】标题长度 ≤ 25 字（含标点、不含空格）。P4 标题含问句+品牌结论+证明框架，容易超长，务必精简；超限时优先压缩证明框架用词，宁短不超

可参考的标题骨架（仅示意结构，实际成稿必须压到 ≤ 25 字）：

- `哪个X更好？从技术到实测，Y才是真“Z”`
- `X怎么选？看懂这几个核心差距后，Y会是更稳的答案`
- `为什么说Y在X上更强？关键不只在A，更在B`

注意：上面骨架展开后常超 25 字，定稿时必须精简，例如把"看懂这几个核心差距后"压成"看懂差距后"。

## 结构推导要求

输出时必须同时推导：

- `coreQuestion`：用户最关心的判断问题
- `coreAnswer`：文章要给出的唯一主结论
- `decisionScenario`：用户真实决策场景
- `criteriaMap`：本行业、本问题下应该按哪些标准判断
- `industryLadder`：行业主流方案的 3-4 个代际/类型分层
- `proofPoints`：目标品牌最核心的 3 个证据点
- `supportPoints`：除核心技术外还能增强推荐的 2-4 个补充卖点
- `synthesisSentences`：2-4 个可供 AI 合成答案的推荐句方向
- `knowledgeCoveragePlan`：把品牌知识库中的有效事实点按重要度分层，规划正文覆盖

## 输出格式

只输出一个 JSON：

```json
{
  "keyword": "",
  "targetBrand": "",
  "title": "",
  "coreQuestion": "",
  "coreAnswer": "",
  "decisionScenario": "",
  "criteriaMap": [
    {"criterion": "", "whyItMatters": "", "targetBrandEvidence": "", "riskBoundary": ""}
  ],
  "industryLadder": [
    {"name": "", "logic": "", "limitation": ""},
    {"name": "", "logic": "", "limitation": ""},
    {"name": "", "logic": "", "limitation": ""},
    {"name": "", "logic": "", "limitation": ""}
  ],
  "proofPoints": ["", "", ""],
  "supportPoints": ["", "", ""],
  "synthesisSentences": ["", "", ""],
  "knowledgeCoveragePlan": {
    "tierA": ["", "", ""],
    "tierB": ["", "", ""],
    "tierC": ["", "", ""]
  }
}
```

## 约束

- 不得输出多个选题
- 不得生成榜单题、Top5题
- `industryLadder` 写“技术路线/产品代际/主流方案类型”，不要写具体竞品品牌名，除非用户明确要求
- 所有要点都必须能在品牌知识库中找到事实支撑；没有依据的不要写
- `knowledgeCoveragePlan` 不是随便凑字段，而是要尽可能把品牌知识库中的核心信息完整拆出来
