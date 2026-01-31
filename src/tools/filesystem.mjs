import fs from "node:fs";
import path from "node:path";

export const definitions = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the file." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file. Creates parent directories if needed.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the file." },
          content: { type: "string", description: "Content to write." },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "List entries in a directory with type and size.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute path to the directory.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_path",
      description: "Delete a file or directory.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute path to delete.",
          },
        },
        required: ["path"],
      },
    },
  },
];

export const handlers = {
  read_file({ path: filePath }) {
    return { content: fs.readFileSync(filePath, "utf8") };
  },

  write_file({ path: filePath, content }) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
    return { success: true, path: filePath };
  },

  list_directory({ path: dirPath }) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.map((e) => {
      const fullPath = path.join(dirPath, e.name);
      const stat = fs.statSync(fullPath);
      return {
        name: e.name,
        type: e.isDirectory() ? "directory" : "file",
        size: stat.size,
      };
    });
  },

  delete_path({ path: targetPath }) {
    fs.rmSync(targetPath, { recursive: true, force: true });
    return { success: true, path: targetPath };
  },
};
