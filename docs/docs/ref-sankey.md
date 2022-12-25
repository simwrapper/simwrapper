---
id: sankey
title: Sankey/Alluvial diagrams
---

![Sankey banner](assets/sankey.jpg)
_Mode shifts_

Sankeys are great for showing the shift between two states; for example mode share shift from alt. A to alt. B. You see these a lot in politics after a parliamentary election, to show the change in the number of seats for each party.

## Usage

Standalone: a file named `sankey-*.yml` must be present in working folder. Each yml file matching that pattern will produce a separate Sankey diagram.

Dashboard: Each panel is defined inside a **row** in a `dashboard-*.yaml` file.

  - Use panel `type: sankey` in the dashboard configuration.


**sankey-example.yml**

```yaml
# only the csv line is required, but title and description help your viewers
type: sankey
csv: modeshares.csv
title: Sankey Demo
description: Erster Schritt!
```

## Sankey CSV File format

Header line can contain labels but is CURRENTLY IGNORED

- Column 1: 'From' category
- Column 2: 'To' category. These are not required to match the labels in column 1.
- Column 3: Value
- All other columns ignored

Example:

```
from;to;number of trips (sample size); average change [sec]

car;car;748552;4.851276865
walk;walk;236111;0.064274854
walk;car;1644;-797.9385645
pt;ride;0;0
pt;bicycle;3167;-394.8995895
bicycle;walk;2276;925.78471

ride;bicycle;0;0
```
