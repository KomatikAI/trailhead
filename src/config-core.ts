import { RepoConfig } from "./types.js";
import type { RepoConfig as RepoConfigType } from "./types.js";

export const SUPPORTED_CONFIG_SCHEMA_VERSIONS = new Set([1, 2]);
export const CURRENT_CONFIG_SCHEMA_VERSION = 2;

export function parseYaml(input: string): unknown {
  const lines = input
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim() !== "" && !line.trim().startsWith("#"));
  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; value: unknown }> = [{ indent: -1, value: root }];

  const parseScalar = (value: string): unknown => {
    const v = value.trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      return v.slice(1, -1);
    }
    if (v === "true") return true;
    if (v === "false") return false;
    if (v === "null") return null;
    const n = Number(v);
    if (!Number.isNaN(n) && v !== "") return n;
    return v;
  };

  const findNextSignificantLine = (fromIndex: number): string | null => {
    for (let i = fromIndex + 1; i < lines.length; i += 1) {
      const candidate = lines[i];
      if (candidate.trim() !== "" && !candidate.trim().startsWith("#")) {
        return candidate;
      }
    }
    return null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const indent = line.match(/^ */)?.[0].length ?? 0;
    const trimmed = line.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const container = stack[stack.length - 1].value;

    if (trimmed.startsWith("- ")) {
      if (!Array.isArray(container)) continue;
      const itemRaw = trimmed.slice(2).trim();
      if (itemRaw === "") {
        const child: Record<string, unknown> = {};
        container.push(child);
        stack.push({ indent, value: child });
        continue;
      }

      const itemKeyMatch = itemRaw.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (itemKeyMatch) {
        const child: Record<string, unknown> = {};
        const [, itemKey, itemVal] = itemKeyMatch;
        if (itemVal === "") {
          const nextLine = findNextSignificantLine(i);
          const nextIndent = nextLine?.match(/^ */)?.[0].length ?? -1;
          const nextTrimmed = nextLine?.trim() ?? "";
          const useArray =
            nextLine !== null && nextIndent > indent && nextTrimmed.startsWith("- ");
          child[itemKey] = useArray ? [] : {};
          if (
            !useArray &&
            typeof child[itemKey] === "object" &&
            child[itemKey] !== null
          ) {
            stack.push({ indent, value: child[itemKey] });
          }
        } else {
          const trimmedVal = itemVal.trim();
          if (trimmedVal.startsWith("[") && trimmedVal.endsWith("]")) {
            const inner = trimmedVal.slice(1, -1).trim();
            child[itemKey] =
              inner === ""
                ? []
                : inner.split(",").map((item) => parseScalar(item.trim()));
          } else {
            child[itemKey] = parseScalar(itemVal);
          }
        }
        container.push(child);
        stack.push({ indent, value: child });
        continue;
      }

      container.push(parseScalar(itemRaw));
      continue;
    }

    const keyMatch = trimmed.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (
      !keyMatch ||
      typeof container !== "object" ||
      container === null ||
      Array.isArray(container)
    ) {
      continue;
    }

    const [, key, rawVal] = keyMatch;
    if (rawVal !== "") {
      const trimmedVal = rawVal.trim();
      if (trimmedVal.startsWith("[") && trimmedVal.endsWith("]")) {
        const inner = trimmedVal.slice(1, -1).trim();
        (container as Record<string, unknown>)[key] =
          inner === "" ? [] : inner.split(",").map((item) => parseScalar(item.trim()));
        continue;
      }
      (container as Record<string, unknown>)[key] = parseScalar(rawVal);
      continue;
    }

    const nextLine = findNextSignificantLine(i);
    const nextIndent = nextLine?.match(/^ */)?.[0].length ?? -1;
    const nextTrimmed = nextLine?.trim() ?? "";
    const useArray =
      nextLine !== null && nextIndent > indent && nextTrimmed.startsWith("- ");
    const child: unknown = useArray ? [] : {};
    (container as Record<string, unknown>)[key] = child;
    stack.push({ indent, value: child });
  }

  return root;
}

export function parseRepoConfigContent(content: string): RepoConfigType | null {
  const raw = parseYaml(content);
  const parsed = RepoConfig.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data;
}
