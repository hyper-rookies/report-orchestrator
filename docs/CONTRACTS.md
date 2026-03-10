# CONTRACTS

Encoding contract: all agents must read and write Markdown, JSON, TypeScript, and text files as UTF-8 (preferably without BOM) to prevent Korean text corruption.

## SSE Events (Orchestrator -> Frontend)

The orchestrator emits the following SSE event types:

- `meta`
- `progress`
- `chunk`
- `table`
- `chart`
- `final`
- `error`

## Chart Spec Contract (`chart` event)

`chart` event payload shape:

```json
{
  "version": "v1",
  "spec": {
    "type": "bar | line | table | pie | stackedBar",
    "title": "optional",
    "data": []
  }
}
```

### `bar` and `line`

```json
{
  "type": "bar",
  "title": "optional",
  "xAxis": "dimension_column",
  "series": [
    { "metric": "sessions", "label": "Sessions" }
  ],
  "data": []
}
```

### `stackedBar`

`stackedBar` uses the same schema as `bar` and supports multiple series.

```json
{
  "type": "stackedBar",
  "title": "optional",
  "xAxis": "dimension_column",
  "series": [
    { "metric": "retained_users", "label": "Retained Users" },
    { "metric": "cohort_size", "label": "Cohort Size" }
  ],
  "data": []
}
```

### `pie`

```json
{
  "type": "pie",
  "title": "optional",
  "nameKey": "channel_group",
  "valueKey": "sessions",
  "data": []
}
```

### `table`

```json
{
  "type": "table",
  "title": "optional",
  "data": []
}
```

