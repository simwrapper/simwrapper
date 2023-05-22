---
id: plotly
title: Plotly
---

![plotly example](assets/UPDATE_FILE_PATH.png)
_Plotly_

The Plotly plug in creates custom plotly plots.

## Usage

The tiles plug-in can only be included as panels in **Dashboards**. See Dashboard documentation for general tips on creating dashboard configurations.

- Each table viewer panel is defined inside a **row** in a `dashboard-*.yaml` file.
- Use panel `type: plotly` in the dashboard configuration.
- Standard title, description, and width fields define the frame.

---

### Sample dashboard.yaml config snippet

```yaml
layout:
  row1:
    - type: 'plotly'
      title: Example Title
      dataset: 'data.csv'
```

---

### Plotly properties

Plotly plug-in properties:

**prop1:** Type. Description

**prop2:** Type. Description

**prop3:** Type. Description

