\# Dashboard Pairings — visual spec (1a Ledger)



\## Color

| Hex | Role |

| --- | --- |

| #f3f2f2 | page ground |

| #605d5d | secondary text, labels, meta (neutral-700) |

| #201e1d | primary ink: text, ink rules, filled habit cell and checkbox border |

| #ec3013 | accent |

| #ae1800 | accent text at paragraph size ("overdue") |

| color-mix(#201e1d 40%, transparent) | divider |



\## Type

\- Display \& body: "Space Grotesk", system-ui, sans-serif

\- Labels \& data: "JetBrains Mono", "SF Mono", "Fira Code", ui-monospace, monospace — applies to all uppercase labels, times, dates, numerals, segmented control

\- Weights: 600 headings/emphasis, 400 body. No 700/800.

\- Numerals: `font-variant-numeric: tabular-nums`



Scale (px / line-height / tracking):

\- 56 / 1.0 / −0.03em — hero figures

\- 20 / default — hero sub-figure

\- 18 — brand

\- 15 — list item title

\- 14 — secondary title, time column, habit name

\- 12 — meta, segmented control

\- 11 / +0.10em / uppercase — labels, sync stamp



\## Borders \& spacing

\- Radius: 0 everywhere.

\- Major rules: 2px, divider color.

\- Row rules: 1px divider.

\- Checkbox / habit cell borders: 1.5px.

\- Padding: 20px 32px header; 24–28px 32px cells.

\- Row padding: 10–12px 0. Column gaps 12–16px. Habit cells: 14px sq / 4px gap.

\- Everything flush left, including button labels.



\## When red is used

\- #ec3013 as fill: current event's time and today's habit-cell border only.

\- #ae1800 as text: overdue count/date.

\- Never for body copy, headings, non-overdue tasks, or backgrounds.



