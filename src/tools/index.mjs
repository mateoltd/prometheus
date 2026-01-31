import {
  definition as shellDef,
  handler as shellHandler,
} from "./shell.mjs";
import {
  definitions as fsDefs,
  handlers as fsHandlers,
} from "./filesystem.mjs";
import {
  definition as httpDef,
  handler as httpHandler,
} from "./http.mjs";
import {
  definitions as sysDefs,
  handlers as sysHandlers,
} from "./system.mjs";

// Build flat tool definitions array for the OpenAI API
export const TOOL_DEFINITIONS = [
  shellDef,
  ...fsDefs,
  httpDef,
  ...sysDefs,
];

// Build dispatch map: name -> handler
const dispatch = {
  execute_shell: shellHandler,
  read_file: fsHandlers.read_file,
  write_file: fsHandlers.write_file,
  list_directory: fsHandlers.list_directory,
  delete_path: fsHandlers.delete_path,
  http_request: httpHandler,
  get_system_info: sysHandlers.get_system_info,
  list_processes: sysHandlers.list_processes,
};

/**
 * Execute a tool call by name. Returns a JSON-serializable result.
 * Errors are caught and returned as error objects so the model can see them.
 */
export async function executeToolCall(name, args) {
  const fn = dispatch[name];
  if (!fn) {
    return { error: `Unknown tool: ${name}` };
  }
  try {
    const result = await fn(args);
    return result;
  } catch (err) {
    return { error: err.message };
  }
}
