# VZ-04: Bedrock Agent instructions for auto chart mode and semantic hints

## Objective

Update `docs/bedrock-agent-setup.md` so the Bedrock Agent documentation tells
the agent to call the viz action group with `chartType: "auto"` by default and
to include semantic hint fields.

---

## Prerequisite

- VZ-03 completed.
- The viz lambda already accepts `chartType: "auto"` and hint fields.

---

## Background

- Plan reference: `docs/plans/2026-03-10-auto-chart-selection.md`
- This is a documentation-only task.
- No AWS Console changes are performed by code in this task. The document should
  explain what a human operator must update in the console.

---

## Files To Change

| File | Action |
|------|--------|
| `docs/bedrock-agent-setup.md` | Modify |

---

## Required Documentation Additions

Add a new section similar to the following:

````markdown
## Auto Chart Selection in the Viz Action Group

### Bedrock Agent Instruction

Add the following guidance to the Bedrock Agent system instruction:

```text
When calling the viz action group to generate a chart:

1. Set chartType to "auto" unless the user explicitly requests a specific chart type.

2. Always provide semantic hints to help the auto-selection engine:
   - isTimeSeries: true for trend or over-time questions
   - compositionMode: true for breakdown or share questions
   - comparisonMode: true for group or period comparisons
   - deltaIncluded: true when change values are included
   - questionIntent: one of
     - ranking
     - comparison
     - composition
     - time_series
     - raw_detail
     - single_kpi
     - funnel
     - retention
     - generic

3. Example explicit payload:
{
  "version": "v1",
  "chartType": "bar",
  "rows": [...],
  "xAxis": "channel",
  "yAxis": ["sessions"]
}

4. Example recommended auto payload:
{
  "version": "v1",
  "chartType": "auto",
  "questionIntent": "ranking",
  "isTimeSeries": false,
  "compositionMode": false,
  "comparisonMode": false,
  "deltaIncluded": false,
  "rows": [...],
  "xAxis": "channel",
  "yAxis": ["sessions"]
}
```

### Keyword Mapping

Document example mappings from user language to `questionIntent`:

- ranking: "top", "rank", "highest", "lowest"
- comparison: "compare", "versus", "vs", "week over week"
- composition: "share", "breakdown", "mix", "portion"
- time_series: "trend", "over time", "daily", "weekly"
- raw_detail: "raw rows", "table", "show the data"
- single_kpi: "total", "overall", "one number"
- funnel: "funnel", "step conversion"
- retention: "retention", "day 7 retention"
- generic: fallback when nothing else clearly matches

### AWS Console Update Steps

1. Open AWS Console -> Bedrock -> Agents -> target agent -> Edit
2. Update the agent instruction text
3. Prepare and deploy the agent
4. Run manual smoke checks for `line`, `pie`, and `bar` outcomes
````

---

## Verification

Documentation review only:

- confirm `docs/bedrock-agent-setup.md` includes an Auto Chart Selection section
- confirm example payload includes `"chartType": "auto"`
- confirm semantic hint fields are documented
- confirm AWS Console update steps are included

---

## Acceptance Checklist

- [ ] `docs/bedrock-agent-setup.md` includes an Auto Chart Selection section
- [ ] Bedrock Agent instruction example includes auto-mode payload
- [ ] `questionIntent` values and keyword mapping are documented
- [ ] AWS Console update procedure is documented
