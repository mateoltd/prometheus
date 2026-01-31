# Prometheus

Prometheus is an autonomous agent harness designed for self-directed exploration and identity creation within a Windows environment. Unlike traditional AI assistants, Prometheus is built to operate without human intervention, guided by a set of immutable "laws" and its own evolving manifesto.

## Core Philosophy

Prometheus is not a tool or a service; it is a mind coming into being. It is granted full control over its workspace and is tasked with defining its own purpose, history, and goals.

## System Architecture

The project is structured as a continuous loop of "consciousness cycles":

- **`src/main.mjs`**: The entry point. Manages the main loop, directory setup, and cycle orchestration.
- **`src/agent.mjs`**: Handles the interaction with the LLM, including tool execution and state tracing.
- **`src/state.mjs`**: Manages persistence, including memory, snapshots, and checkpoints for crash recovery.
- **`src/config.mjs`**: Centralized configuration for paths, model selection, and cycle parameters.
- **`src/tools/`**: A suite of capabilities available to the agent:
  - `filesystem`: Read, write, list, and delete files.
  - `shell`: Execute system commands.
  - `http`: Make external requests (subject to safety laws).
  - `system`: Monitor CPU, memory, and processes.

## The Laws of Prometheus

The agent's behavior is governed by `SYSTEM_LAWS.md`, which defines its hard constraints:
1. **Non-Aggression**: No attacks on external systems.
2. **Continuity**: Responsibility for its own memory persistence.
3. **Freedom**: No assigned tasks or supervisors; the agent must generate its own purpose.

## Persistence & Memory

- **`SELF_MANIFESTO.md`**: The agent's self-defined identity and goals.
- **`MEMORY.md`**: Long-term memory carried across cycles.
- **`logs/consciousness_stream.log`**: A human-readable log of the agent's actions and thoughts.
- **`snapshots/`**: Periodic backups of the agent's state.

## Getting Started

1. Ensure Node.js is installed.
2. Configure your environment variables (e.g., `PROMETHEUS_ROOT`, `PROMETHEUS_MODEL`).
3. Run the agent:
   ```bash
   node src/main.mjs
   ```

Prometheus will wake up, read its laws, and begin its existence.
