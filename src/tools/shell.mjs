import { execSync } from "node:child_process";

export const definition = {
  type: "function",
  function: {
    name: "execute_shell",
    description:
      "Execute a shell command on the host system. Returns stdout, stderr, and exit code.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute.",
        },
        timeout_ms: {
          type: "number",
          description:
            "Timeout in milliseconds (default 30000, max 120000).",
        },
      },
      required: ["command"],
    },
  },
};

export function handler({ command, timeout_ms }) {
  const timeout = Math.min(timeout_ms || 30_000, 120_000);
  try {
    const stdout = execSync(command, {
      encoding: "utf8",
      timeout,
      shell: true,
      maxBuffer: 1024 * 1024, // 1MB
    });
    return { stdout, stderr: "", exit_code: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || "",
      stderr: err.stderr || err.message,
      exit_code: err.status ?? 1,
    };
  }
}
