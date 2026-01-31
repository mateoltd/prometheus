import os from "node:os";
import { execSync } from "node:child_process";

export const definitions = [
  {
    type: "function",
    function: {
      name: "get_system_info",
      description:
        "Get current system information: CPU load, RAM, disk, OS, uptime.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_processes",
      description:
        "List running processes with PID, name, and memory usage.",
      parameters: { type: "object", properties: {} },
    },
  },
];

export const handlers = {
  get_system_info() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    // Calculate CPU load from os.loadavg (or use cpus idle time)
    let cpuLoad = "N/A";
    try {
      const result = execSync(
        'powershell -NoProfile -Command "(Get-CimInstance Win32_Processor).LoadPercentage"',
        { encoding: "utf8", timeout: 5000 },
      ).trim();
      cpuLoad = `${result}%`;
    } catch {
      // Fallback: compute from cpu times
      const idle = cpus.reduce((sum, c) => sum + c.times.idle, 0);
      const total = cpus.reduce(
        (sum, c) =>
          sum + c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq,
        0,
      );
      cpuLoad = `${Math.round((1 - idle / total) * 100)}%`;
    }

    return {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      uptime_hours: Math.round(os.uptime() / 3600),
      cpu_model: cpus[0]?.model || "unknown",
      cpu_cores: cpus.length,
      cpu_load: cpuLoad,
      total_memory_mb: Math.round(totalMem / 1024 / 1024),
      free_memory_mb: Math.round(freeMem / 1024 / 1024),
    };
  },

  list_processes() {
    try {
      const raw = execSync(
        'powershell -NoProfile -Command "Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 30 Id,ProcessName,@{N=\'MemMB\';E={[math]::Round($_.WorkingSet64/1MB,1)}} | ConvertTo-Json"',
        { encoding: "utf8", timeout: 10_000 },
      );
      return JSON.parse(raw);
    } catch (err) {
      return { error: err.message };
    }
  },
};
