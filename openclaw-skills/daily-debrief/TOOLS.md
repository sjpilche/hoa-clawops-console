# Tools

This agent receives pre-collected operational data as its input message. No external tool calls needed — the data collector gathers everything before this agent runs.

The input will be a JSON object with these sections:
- `runs`: today's agent runs with status, cost, duration
- `leads`: HOA and CFO lead counts and new additions
- `content`: content queue status
- `trading`: portfolio positions and P&L
- `costs`: cost breakdown by agent and total
- `baseline`: yesterday's numbers for comparison
