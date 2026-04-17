# Event Schema

Tracker emits JSONL events with schema version field `v`.

## v1
- `v`: schema version (`1`)
- `ts`: ISO timestamp
- `mode`: hook mode (`pre-tool-use`, `post-tool-use`, `stop`)
- `session_id`: session identifier
- `cwd`: current working directory
- `type`: `tool_start` | `tool_end` | `session_stop`
- `tool`: tool name (for tool events)
- `input_size`, `output_size`: byte-size metadata
- `input_hash`: short hash of truncated serialized input
- `ok`: boolean for `tool_end`

## Backward compatibility
- Aggregator treats missing `v` as legacy v0.

- Legacy events (without `v`) are normalized through `lib/migrate.js` (`migrateV0toV1`) during aggregation.
