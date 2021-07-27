---
id: dashboards
title: Dashboards
---

![Dashboard example](assets/dashboard.jpg)

<center>_Dashboards usually show several at-a-glance summary metrics._</center>

**Example dashboard.yaml**

```yaml
version: 1
header:
  tab: Summary
  title: MATSim Summary Dashboard
  description: "Examples of various chart types"

layout:
  row1:
    - title: "Mode Share - Final"
      description: "From modestats.txt summary"
      type: "pie"
      width: 1
      props:
        dataset: "*modestats.txt"
        useLastRow: true
        ignoreColumns: ["Iteration"]

    - title: "Example Bar Plot"
      description: "Distance over Iteration"
      type: "bar"
      width: 2
      props:
        usedCol: [distance_m_mean, directDistance_m_mean]
        legendName: [Distance (mean), Direct Distance (mean)]
        skipFirstRow: true
        dataset: "*drt_customer_stats_drt_short.csv"
        x: "iteration"
        yAxisName: "Distanz"
        xAxisName: "Iteration"

  secondRow:
    - title: "Example Line Plot"
      description: "Distance over Iteration"
      type: "line"
      width: 1
      props:
        usedCol: [distance_m_mean, directDistance_m_mean]
        legendName: [Distance (mean), Direct Distance (mean)]
        skipFirstRow: false
        dataset: "*drt_customer_stats_drt.csv"
        x: "iteration"
        yAxisName: "Distanz"
        xAxisName: "Iteration"
```

**Dashboards** allow you to build multiple views that help analyze your outputs.

More to come!
