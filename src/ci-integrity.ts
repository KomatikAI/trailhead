export interface CiIntegrityFile {
  filename: string;
  additions?: number;
  deletions?: number;
  patch?: string;
}

export interface CiIntegrityResult {
  score: number;
  blockingPatterns: string[];
  warningSignals: string[];
}

interface AddedPatchLine {
  line: string;
  /** Parsed run value when YAML syntax is not part of the shell command. */
  suppressionCandidate?: string;
  /** The new-file predecessor can compose this physical line into a larger shell list. */
  continuedFromPrevious: boolean;
  /** A later physical line composes this suppression into a larger YAML scalar. */
  continuedToSuccessor: boolean;
  /** This added successor folds onto an existing suppression line. */
  composesPriorSuppression: boolean;
  /** This line creates or completes a physical-line split `|| true`. */
  splitSuppression: boolean;
}

const YAML_MAPPING_ENTRY =
  /^[ \t]*(?:-[ \t]+)?(?:[A-Za-z0-9_.-]+|"[^"\r\n]*"|'(?:[^']|'')*')[ \t]*:(?:[ \t]|$)/;
const YAML_DOCUMENT_BOUNDARY = /^[ \t]*(?:---|\.\.\.)[ \t]*(?:#.*)?$/;
const YAML_BLOCK_HEADER = /^([>|])((?:[+-][1-9]?|[1-9][+-]?)?)$/;
const YAML_ANCHOR_PROPERTY = /^&[^\s[\]{},]+$/;
const YAML_TAG_PROPERTY = /^!(?:<[^>\r\n]+>|[^\s]+)$/;
const SHELL_CONTINUATION = /(?:&&|\|\||\|&|\||\\)\s*$/;

interface YamlRunBlockScalar {
  style: "literal" | "folded";
  keyIndent: number;
  explicitContentIndent?: number;
}

interface YamlRunEntry {
  keyIndent: number;
  value: string;
}

interface ParsedYamlKey {
  value: string;
  end: number;
}

const YAML_DOUBLE_ESCAPES: Readonly<Record<string, string>> = {
  "0": "\0",
  a: "\x07",
  b: "\b",
  t: "\t",
  "\t": "\t",
  n: "\n",
  v: "\v",
  f: "\f",
  r: "\r",
  e: "\x1b",
  " ": " ",
  '"': '"',
  "/": "/",
  "\\": "\\",
  N: "\x85",
  _: "\xa0",
  L: "\u2028",
  P: "\u2029",
};

function parseYamlKey(text: string, start: number): ParsedYamlKey | undefined {
  if (text[start] === "'") {
    let value = "";
    for (let cursor = start + 1; cursor < text.length; cursor += 1) {
      if (text[cursor] !== "'") {
        value += text[cursor];
        continue;
      }
      if (text[cursor + 1] === "'") {
        value += "'";
        cursor += 1;
        continue;
      }
      return { value, end: cursor + 1 };
    }
    return undefined;
  }

  if (text[start] === '"') {
    let value = "";
    for (let cursor = start + 1; cursor < text.length; cursor += 1) {
      const character = text[cursor];
      if (character === '"') return { value, end: cursor + 1 };
      if (character !== "\\") {
        value += character;
        continue;
      }

      const escape = text[cursor + 1];
      if (escape === undefined) return undefined;
      const hexLength = escape === "x" ? 2 : escape === "u" ? 4 : escape === "U" ? 8 : 0;
      if (hexLength) {
        const hex = text.slice(cursor + 2, cursor + 2 + hexLength);
        if (!new RegExp(`^[0-9A-Fa-f]{${hexLength}}$`).test(hex)) return undefined;
        const codePoint = Number.parseInt(hex, 16);
        if (codePoint > 0x10ffff) return undefined;
        value += String.fromCodePoint(codePoint);
        cursor += 1 + hexLength;
        continue;
      }

      const decoded = YAML_DOUBLE_ESCAPES[escape];
      if (decoded === undefined) return undefined;
      value += decoded;
      cursor += 1;
    }
    return undefined;
  }

  let end = start;
  while (end < text.length && !/[\s:]/.test(text[end])) end += 1;
  return end === start ? undefined : { value: text.slice(start, end), end };
}

function yamlStringTagEnd(text: string, start: number): number | undefined {
  if (text[start] === "!" && /[ \t]/.test(text[start + 1] ?? "")) {
    return start + 1;
  }
  for (const tag of ["!!str", "!<tag:yaml.org,2002:str>"]) {
    if (text.startsWith(tag, start) && /[ \t]/.test(text[start + tag.length] ?? "")) {
      return start + tag.length;
    }
  }
  return undefined;
}

function yamlKeyStartAfterProperties(text: string, start: number): number | undefined {
  let cursor = start;
  let tagSeen = false;
  let anchorSeen = false;

  while (true) {
    const tagEnd = yamlStringTagEnd(text, cursor);
    if (tagEnd !== undefined) {
      if (tagSeen) return undefined;
      tagSeen = true;
      cursor = tagEnd;
    } else {
      const anchor = text.slice(cursor).match(/^&[^\s[\]{},]+(?=[ \t])/);
      if (!anchor) break;
      if (anchorSeen) return undefined;
      anchorSeen = true;
      cursor += anchor[0].length;
    }
    while (/[ \t]/.test(text[cursor] ?? "")) cursor += 1;
  }

  return cursor;
}

function yamlRunEntry(
  line: string,
  runKeyAliases?: ReadonlySet<string>,
): YamlRunEntry | undefined {
  const prefix = line.match(/^([ \t]*(?:-[ \t]+)?)/)?.[1] ?? "";
  const keyStart = yamlKeyStartAfterProperties(line, prefix.length);
  if (keyStart === undefined) return undefined;
  const parsedKey = parseYamlKey(line, keyStart);
  if (!parsedKey) return undefined;
  const keyAlias = parsedKey.value.match(/^\*([^\s[\]{},]+)$/)?.[1];
  if (parsedKey.value !== "run" && (!keyAlias || !runKeyAliases?.has(keyAlias))) {
    return undefined;
  }

  let cursor = parsedKey.end;
  while (/[ \t]/.test(line[cursor] ?? "")) cursor += 1;
  if (line[cursor] !== ":") return undefined;
  cursor += 1;
  if (cursor < line.length && !/[ \t]/.test(line[cursor])) return undefined;
  while (/[ \t]/.test(line[cursor] ?? "")) cursor += 1;

  return { keyIndent: prefix.length, value: line.slice(cursor) };
}

function decodedCompleteYamlRunValue(value: string): string | undefined {
  const trimmed = value.trimStart();
  if (trimmed[0] !== "'" && trimmed[0] !== '"') return undefined;
  const parsed = parseYamlKey(trimmed, 0);
  if (!parsed) return undefined;
  const suffix = trimmed.slice(parsed.end);
  if (suffix !== "" && !/^[ \t]+#/.test(suffix)) return undefined;
  return parsed.value;
}

function decodedYamlDoubleQuotedFragment(value: string): string {
  let decoded = "";
  for (let cursor = 0; cursor < value.length; cursor += 1) {
    const character = value[cursor];
    if (character === '"') break;
    if (character !== "\\") {
      decoded += character;
      continue;
    }

    const escape = value[cursor + 1];
    if (escape === undefined) {
      decoded += "\\";
      break;
    }
    const hexLength = escape === "x" ? 2 : escape === "u" ? 4 : escape === "U" ? 8 : 0;
    if (hexLength) {
      const hex = value.slice(cursor + 2, cursor + 2 + hexLength);
      if (new RegExp(`^[0-9A-Fa-f]{${hexLength}}$`).test(hex)) {
        const codePoint = Number.parseInt(hex, 16);
        if (codePoint <= 0x10ffff) {
          decoded += String.fromCodePoint(codePoint);
          cursor += 1 + hexLength;
          continue;
        }
      }
    }
    const simple = YAML_DOUBLE_ESCAPES[escape];
    if (simple !== undefined) {
      decoded += simple;
      cursor += 1;
      continue;
    }
    // Invalid/incomplete YAML cannot safely manufacture shell syntax.
    decoded += `\\${escape}`;
    cursor += 1;
  }
  return decoded;
}

function shellCandidateForRunEntry(runEntry: YamlRunEntry): string {
  const decoded = decodedCompleteYamlRunValue(runEntry.value);
  if (decoded !== undefined) return decoded;
  const value = runEntry.value.trimStart();
  if (value[0] === '"') return decodedYamlDoubleQuotedFragment(value.slice(1));
  return value[0] === "'" ? value.slice(1) : runEntry.value;
}

function isYamlRunKey(text: string, runKeyAliases?: ReadonlySet<string>): boolean {
  const trimmed = text.trim();
  const keyStart = yamlKeyStartAfterProperties(trimmed, 0);
  if (keyStart === undefined) return false;
  const parsedKey = parseYamlKey(trimmed, keyStart);
  if (!parsedKey) return false;
  const keyAlias = parsedKey.value.match(/^\*([^\s[\]{},]+)$/)?.[1];
  if (parsedKey.value !== "run" && (!keyAlias || !runKeyAliases?.has(keyAlias))) {
    return false;
  }
  const suffix = trimmed.slice(parsedKey.end).trimStart();
  return suffix === "" || suffix.startsWith("#");
}

/** Parse the complete YAML block-header surface accepted for a `run` value. */
function yamlRunBlockScalarValue(
  runValue: string,
  keyIndent: number,
): YamlRunBlockScalar | undefined {
  // A YAML comment after a block header requires separating whitespace.
  const value = runValue.replace(/[ \t]+#.*$/, "").trim();
  const tokens = value.split(/[ \t]+/);
  const header = tokens.pop()?.match(YAML_BLOCK_HEADER);
  if (!header) return undefined;

  let anchorSeen = false;
  let tagSeen = false;
  for (const property of tokens) {
    if (YAML_ANCHOR_PROPERTY.test(property) && !anchorSeen) {
      anchorSeen = true;
      continue;
    }
    if (YAML_TAG_PROPERTY.test(property) && !tagSeen) {
      tagSeen = true;
      continue;
    }
    return undefined;
  }

  const indentationIndicator = header[2].match(/[1-9]/)?.[0];
  return {
    style: header[1] === ">" ? "folded" : "literal",
    keyIndent,
    explicitContentIndent: indentationIndicator
      ? keyIndent + Number(indentationIndicator)
      : undefined,
  };
}

function yamlExplicitRunKeyIndent(
  line: string,
  runKeyAliases?: ReadonlySet<string>,
): number | undefined {
  const match = line.match(/^([ \t]*(?:-[ \t]+)?)\?[ \t]+(.*)$/);
  if (!match || !isYamlRunKey(match[2], runKeyAliases)) return undefined;
  return match[1].length;
}

interface ExplicitBlockRunKeyState {
  keyIndent: number;
  contentLines: string[];
}

function yamlExplicitBlockRunKey(line: string): ExplicitBlockRunKeyState | undefined {
  const match = line.match(/^([ \t]*(?:-[ \t]+)?)\?[ \t]+(.*)$/);
  if (!match || !yamlRunBlockScalarValue(match[2], match[1].length)) {
    return undefined;
  }
  return { keyIndent: match[1].length, contentLines: [] };
}

function yamlExplicitValue(
  line: string,
  expectedIndent: number,
): YamlRunEntry | undefined {
  const match = line.match(/^([ \t]*):(?:[ \t]+(.*))?$/);
  if (!match || match[1].length !== expectedIndent) return undefined;
  return { keyIndent: expectedIndent, value: match[2] ?? "" };
}

type MultilineRunStyle = "plain" | "single_quoted" | "double_quoted";

interface MultilineRunScalarState {
  style: MultilineRunStyle;
  keyIndent: number;
  previousLineKind: "text" | "blank";
  previousAddedIndex?: number;
  previousHasSuppression: boolean;
  rawQuotedValue?: string;
  addedIndexes: number[];
  physicalHasSuppression: boolean;
}

function hasYamlPlainComment(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "#" && (index === 0 || /[ \t]/.test(value[index - 1]))) {
      return true;
    }
  }
  return false;
}

function multilineRunScalar(runEntry: YamlRunEntry): MultilineRunScalarState | undefined {
  const value = runEntry.value.trimStart();
  if (!value) return undefined;

  if (value[0] === "'") {
    if (parseYamlKey(value, 0)) return undefined;
    return {
      style: "single_quoted",
      keyIndent: runEntry.keyIndent,
      previousLineKind: "text",
      previousHasSuppression: false,
      rawQuotedValue: value,
      addedIndexes: [],
      physicalHasSuppression: false,
    };
  }

  if (value[0] === '"') {
    if (parseYamlKey(value, 0)) return undefined;
    return {
      style: "double_quoted",
      keyIndent: runEntry.keyIndent,
      previousLineKind: "text",
      previousHasSuppression: false,
      rawQuotedValue: value,
      addedIndexes: [],
      physicalHasSuppression: false,
    };
  }

  if (hasYamlPlainComment(value)) return undefined;
  return {
    style: "plain",
    keyIndent: runEntry.keyIndent,
    previousLineKind: "text",
    previousHasSuppression: false,
    addedIndexes: [],
    physicalHasSuppression: false,
  };
}

function multilineShellFragment(line: string, style: MultilineRunStyle): string {
  const fragment = line.trimStart();
  if (style === "double_quoted") return decodedYamlDoubleQuotedFragment(fragment);
  if (style === "single_quoted") {
    const closing = fragment.lastIndexOf("'");
    return (closing >= 0 ? fragment.slice(0, closing) : fragment).replace(/''/g, "'");
  }
  return line;
}

function closesMultilineQuotedScalar(
  line: string,
  style: Exclude<MultilineRunStyle, "plain">,
): boolean {
  const quote = style === "single_quoted" ? "'" : '"';
  return parseYamlKey(`${quote}${line.trimStart()}`, 0) !== undefined;
}

function isYamlStructuralBoundary(line: string): boolean {
  return YAML_MAPPING_ENTRY.test(line) || YAML_DOCUMENT_BOUNDARY.test(line);
}

function shellCodeBeforeComment(line: string): string {
  let singleQuoted = false;
  let doubleQuoted = false;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && !singleQuoted) {
      escaped = true;
      continue;
    }
    if (character === "'" && !doubleQuoted) {
      singleQuoted = !singleQuoted;
      continue;
    }
    if (character === '"' && !singleQuoted) {
      doubleQuoted = !doubleQuoted;
      continue;
    }
    if (
      character === "#" &&
      !singleQuoted &&
      !doubleQuoted &&
      (index === 0 || /[\s;&|()]/.test(line[index - 1]))
    ) {
      return line.slice(0, index);
    }
  }

  return line;
}

function continuesShellCommand(line: string): boolean {
  return SHELL_CONTINUATION.test(shellCodeBeforeComment(line).trimEnd());
}

function unquotedShellSyntax(line: string): string {
  let syntax = "";
  let singleQuoted = false;
  let doubleQuoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (singleQuoted) {
      if (character === "'") singleQuoted = false;
      syntax += " ";
      continue;
    }
    if (doubleQuoted) {
      if (character === "\\" && /[$`"\\]/.test(line[index + 1] ?? "")) {
        syntax += "  ";
        index += 1;
        continue;
      }
      if (character === '"') doubleQuoted = false;
      syntax += " ";
      continue;
    }
    if (character === "\\") {
      if (index + 1 < line.length) {
        syntax += "  ";
        index += 1;
      } else {
        syntax += "\\";
      }
      continue;
    }
    if (character === "'") {
      singleQuoted = true;
      syntax += " ";
      continue;
    }
    if (character === '"') {
      doubleQuoted = true;
      syntax += " ";
      continue;
    }
    if (character === "#" && (index === 0 || /[\s;&|()]/.test(line[index - 1]))) {
      break;
    }
    syntax += character;
  }

  return syntax;
}

interface ParsedShellWord {
  value: string;
  end: number;
  closed: boolean;
}

/** Decode the static characters Bash concatenates into one command word. */
function shellWordAt(candidate: string, start: number): ParsedShellWord | undefined {
  let value = "";
  let cursor = start;
  let singleQuoted = false;
  let doubleQuoted = false;
  let consumed = false;

  while (cursor < candidate.length) {
    const character = candidate[cursor];
    if (singleQuoted) {
      consumed = true;
      if (character === "'") singleQuoted = false;
      else value += character;
      cursor += 1;
      continue;
    }
    if (doubleQuoted) {
      consumed = true;
      if (character === '"') {
        doubleQuoted = false;
        cursor += 1;
        continue;
      }
      if (character === "\\" && /[$`"\\\n]/.test(candidate[cursor + 1] ?? "")) {
        value += candidate[cursor + 1];
        cursor += 2;
        continue;
      }
      value += character;
      cursor += 1;
      continue;
    }

    if (/\s|[;&|()<>]/.test(character)) break;
    if (character === "#" && !consumed) break;
    if (character === "\\") {
      consumed = true;
      if (cursor + 1 >= candidate.length) {
        return { value, end: cursor, closed: false };
      }
      value += candidate[cursor + 1];
      cursor += 2;
      continue;
    }
    if (character === "'") {
      consumed = true;
      singleQuoted = true;
      cursor += 1;
      continue;
    }
    if (character === '"') {
      consumed = true;
      doubleQuoted = true;
      cursor += 1;
      continue;
    }
    consumed = true;
    value += character;
    cursor += 1;
  }

  return consumed
    ? { value, end: cursor, closed: !singleQuoted && !doubleQuoted }
    : undefined;
}

function unquotedOrOperatorIndexes(candidate: string): number[] {
  const indexes: number[] = [];
  let singleQuoted = false;
  let doubleQuoted = false;

  for (let index = 0; index < candidate.length; index += 1) {
    const character = candidate[index];
    if (singleQuoted) {
      if (character === "'") singleQuoted = false;
      continue;
    }
    if (doubleQuoted) {
      if (character === "\\" && /[$`"\\\n]/.test(candidate[index + 1] ?? "")) {
        index += 1;
        continue;
      }
      if (character === '"') doubleQuoted = false;
      continue;
    }
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === "'") {
      singleQuoted = true;
      continue;
    }
    if (character === '"') {
      doubleQuoted = true;
      continue;
    }
    if (character === "#" && (index === 0 || /[\s;&|()]/.test(candidate[index - 1]))) {
      break;
    }
    if (candidate.startsWith("||", index)) {
      indexes.push(index);
      index += 1;
    }
  }

  return indexes;
}

type PendingSplitOrKind = "or" | "escaped_join";

interface PendingSplitOr {
  kind: PendingSplitOrKind;
  joinedSyntax?: string;
  sourceAddedIndex?: number;
}

function trailingSplitOr(line: string): PendingSplitOr | undefined {
  const candidate = line.trimStart().trimEnd();
  let syntax = unquotedShellSyntax(candidate).trimEnd();
  const escapedNewline = syntax.endsWith("\\") && candidate.endsWith("\\");
  const joinedCandidate = escapedNewline ? candidate.slice(0, -1) : candidate;
  if (escapedNewline) syntax = syntax.slice(0, -1).trimEnd();
  if (syntax.endsWith("||")) return { kind: "or" };
  if (!escapedNewline) return undefined;

  const operators = unquotedOrOperatorIndexes(joinedCandidate);
  const operator = operators.at(-1);
  if (operator !== undefined) {
    let wordStart = operator + 2;
    while (/\s/.test(joinedCandidate[wordStart] ?? "")) wordStart += 1;
    const word = shellWordAt(joinedCandidate, wordStart);
    if (
      (!word || "true".startsWith(word.value)) &&
      (!word || word.end === joinedCandidate.length)
    ) {
      return {
        kind: "escaped_join",
        joinedSyntax: joinedCandidate.slice(operator),
      };
    }
  }

  if (syntax.endsWith("|")) {
    return { kind: "escaped_join", joinedSyntax: "|" };
  }
  return undefined;
}

interface SplitOrProgress {
  completes: boolean;
  next?: PendingSplitOr;
}

function advanceSplitOr(line: string, pending: PendingSplitOr): SplitOrProgress {
  const candidate = line.trimStart().trimEnd();
  const syntax = unquotedShellSyntax(candidate).trimEnd();
  const escapedNewline = syntax.endsWith("\\") && candidate.endsWith("\\");
  const part = escapedNewline ? candidate.slice(0, -1) : candidate;
  const joinedSyntax = `${
    pending.kind === "or" ? "|| " : (pending.joinedSyntax ?? "")
  }${part}`;

  if (!joinedSyntax.startsWith("||")) {
    return escapedNewline && "||".startsWith(joinedSyntax)
      ? {
          completes: false,
          next: { ...pending, joinedSyntax },
        }
      : { completes: false };
  }

  let wordStart = 2;
  while (/\s/.test(joinedSyntax[wordStart] ?? "")) wordStart += 1;
  const word = shellWordAt(joinedSyntax, wordStart);
  if (!word) {
    return escapedNewline
      ? { completes: false, next: { ...pending, joinedSyntax } }
      : { completes: false, next: { kind: "or" } };
  }

  const wordIsComplete =
    word.value === "true" &&
    word.closed &&
    (!escapedNewline || word.end < joinedSyntax.length);
  if (wordIsComplete) return { completes: true };
  if (
    escapedNewline &&
    "true".startsWith(word.value) &&
    word.end === joinedSyntax.length
  ) {
    return {
      completes: false,
      next: { ...pending, joinedSyntax },
    };
  }
  return { completes: false };
}

function startsWithOrSuccessor(line: string): boolean {
  return /^\|\|(?=$|\s)/.test(unquotedShellSyntax(line).trimStart());
}

interface BlockScalarState {
  style: "literal" | "folded";
  keyIndent: number;
  contentIndent?: number;
  previousLineKind: "none" | "blank" | "text" | "more_indented";
  previousAddedIndex?: number;
  previousHasSuppression: boolean;
  logicalShell: string;
  addedIndexes: number[];
  physicalHasSuppression: boolean;
}

interface YamlAliasInfo {
  runKeyAliases: Set<string>;
  suppressionValues: Map<string, string>;
}

function yamlAliasInfo(patch: string): YamlAliasInfo {
  const info: YamlAliasInfo = {
    runKeyAliases: new Set<string>(),
    suppressionValues: new Map<string, string>(),
  };

  for (const rawLine of patch.split("\n")) {
    if (
      rawLine.startsWith("-") ||
      rawLine.startsWith("@@") ||
      rawLine.startsWith("+++") ||
      rawLine.startsWith("\\ No newline")
    ) {
      continue;
    }
    const line =
      rawLine.startsWith("+") || rawLine.startsWith(" ") ? rawLine.slice(1) : rawLine;
    for (const match of line.matchAll(/&([^\s[\]{},]+)(?=[ \t]|$)/g)) {
      const name = match[1];
      const suffix = line.slice((match.index ?? 0) + match[0].length).trimStart();
      if (/^(?:run|"run"|'run')(?=$|[ \t:#])/.test(suffix)) {
        info.runKeyAliases.add(name);
      }

      const decoded = decodedCompleteYamlRunValue(suffix);
      const candidate = decoded ?? suffix.replace(/[ \t]+#.*$/, "").trim();
      if (hasSemanticOrTrue(candidate)) info.suppressionValues.set(name, candidate);
    }
  }

  return info;
}

function yamlAliasName(value: string): string | undefined {
  return value.trim().match(/^\*([^\s[\]{},]+)(?:[ \t]+#.*)?$/)?.[1];
}

/**
 * Retain new-file hunk context around additions. An allowlisted physical line
 * is not safe when the preceding added/context line composes it into a larger
 * shell command. At a non-file-start hunk boundary with no context, fail closed.
 */
function addedPatchLines(patch: string | undefined): AddedPatchLine[] {
  if (!patch) return [];

  const additions: AddedPatchLine[] = [];
  const aliases = yamlAliasInfo(patch);
  let continuationPending = false;
  // MCP callers can provide a bare/truncated patch. Until a hunk header or
  // unchanged context establishes a boundary, an exemption must fail closed.
  let ambiguousHunkBoundary = true;
  let ambiguousContextIndent: number | undefined;
  let blockScalar: BlockScalarState | undefined;
  let multilineScalar: MultilineRunScalarState | undefined;
  let explicitRunKeyIndent: number | undefined;
  let explicitBlockRunKey: ExplicitBlockRunKeyState | undefined;
  let pendingSplitOr: PendingSplitOr | undefined;
  let ambiguousPrevious:
    | { indent: number; hasSuppression: boolean; addedIndex?: number }
    | undefined;

  for (const rawLine of patch.split("\n")) {
    const hunk = rawLine.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
    if (hunk) {
      continuationPending = false;
      ambiguousHunkBoundary = Number(hunk[1]) > 1;
      ambiguousContextIndent = undefined;
      blockScalar = undefined;
      multilineScalar = undefined;
      explicitRunKeyIndent = undefined;
      explicitBlockRunKey = undefined;
      pendingSplitOr = undefined;
      ambiguousPrevious = undefined;
      continue;
    }
    if (rawLine.startsWith("+++") || rawLine.startsWith("---")) continue;
    if (rawLine.startsWith("-") || rawLine.startsWith("\\ No newline")) continue;
    if (!rawLine.startsWith("+") && !rawLine.startsWith(" ")) continue;

    const line = rawLine.slice(1);
    const isAdded = rawLine.startsWith("+");
    const trimmed = line.trim();
    const indentation = line.length - line.trimStart().length;
    const shellCode = shellCodeBeforeComment(line).trim();
    const isBlankOrComment = shellCode.length === 0;

    let lineInBlockScalar = false;
    if (blockScalar) {
      if (!trimmed) {
        lineInBlockScalar = true;
      } else {
        const minimumContentIndent =
          blockScalar.contentIndent ?? blockScalar.keyIndent + 1;
        if (indentation >= minimumContentIndent) {
          lineInBlockScalar = true;
          blockScalar.contentIndent ??= indentation;
        } else {
          blockScalar = undefined;
          continuationPending = false;
          pendingSplitOr = undefined;
        }
      }
    }

    let lineInMultilineScalar = false;
    let foldedFromMultilinePredecessor = false;
    if (!lineInBlockScalar && multilineScalar) {
      if (!trimmed) {
        lineInMultilineScalar = true;
      } else if (indentation > multilineScalar.keyIndent) {
        lineInMultilineScalar = true;
        foldedFromMultilinePredecessor = multilineScalar.previousLineKind === "text";
      } else {
        multilineScalar = undefined;
        pendingSplitOr = undefined;
      }
    }

    if (
      lineInMultilineScalar &&
      multilineScalar?.style === "plain" &&
      trimmed.startsWith("#")
    ) {
      lineInMultilineScalar = false;
      foldedFromMultilinePredecessor = false;
      multilineScalar = undefined;
      continuationPending = false;
      pendingSplitOr = undefined;
    }
    if (isBlankOrComment) foldedFromMultilinePredecessor = false;

    const foldedFromBlockPredecessor = Boolean(
      lineInBlockScalar &&
      trimmed &&
      !isBlankOrComment &&
      blockScalar?.style === "folded" &&
      blockScalar.previousLineKind === "text" &&
      indentation === blockScalar.contentIndent,
    );

    let currentRunEntry: YamlRunEntry | undefined;
    if (!lineInBlockScalar && !lineInMultilineScalar) {
      if (explicitBlockRunKey) {
        if (!trimmed) continue;
        if (indentation > explicitBlockRunKey.keyIndent) {
          explicitBlockRunKey.contentLines.push(trimmed);
          continue;
        }
        if (
          explicitBlockRunKey.contentLines.length === 1 &&
          isYamlRunKey(explicitBlockRunKey.contentLines[0], aliases.runKeyAliases)
        ) {
          currentRunEntry = yamlExplicitValue(line, explicitBlockRunKey.keyIndent);
        }
        explicitBlockRunKey = undefined;
      }

      if (explicitRunKeyIndent !== undefined) {
        if (isBlankOrComment) continue;
        currentRunEntry = yamlExplicitValue(line, explicitRunKeyIndent);
        explicitRunKeyIndent = undefined;
      }

      const explicitKeyIndent = yamlExplicitRunKeyIndent(line, aliases.runKeyAliases);
      if (!currentRunEntry && explicitKeyIndent !== undefined) {
        explicitRunKeyIndent = explicitKeyIndent;
        continuationPending = false;
        pendingSplitOr = undefined;
        if (!isAdded && explicitKeyIndent === 0) ambiguousHunkBoundary = false;
        continue;
      }

      const blockKey = yamlExplicitBlockRunKey(line);
      if (!currentRunEntry && blockKey) {
        explicitBlockRunKey = blockKey;
        continuationPending = false;
        pendingSplitOr = undefined;
        if (!isAdded && blockKey.keyIndent === 0) ambiguousHunkBoundary = false;
        continue;
      }

      currentRunEntry ??= yamlRunEntry(line, aliases.runKeyAliases);
      const scalarDeclaration = currentRunEntry
        ? yamlRunBlockScalarValue(currentRunEntry.value, currentRunEntry.keyIndent)
        : undefined;
      if (scalarDeclaration) {
        blockScalar = {
          style: scalarDeclaration.style,
          keyIndent: scalarDeclaration.keyIndent,
          contentIndent: scalarDeclaration.explicitContentIndent,
          previousLineKind: "none",
          previousHasSuppression: false,
          logicalShell: "",
          addedIndexes: [],
          physicalHasSuppression: false,
        };
        continuationPending = false;
        pendingSplitOr = undefined;
        ambiguousPrevious = undefined;
        // Only unchanged context (or the actual file start) proves that a
        // declaration is YAML rather than text inside a scalar omitted from
        // this hunk. Added lines cannot self-certify an ambiguous boundary.
        if (!isAdded) ambiguousHunkBoundary = false;
        continue;
      }

      if (isYamlStructuralBoundary(line)) {
        continuationPending = false;
        pendingSplitOr = undefined;
        // An indented mapping-looking line can still be plain text inside an
        // omitted scalar. Only a column-zero document/mapping boundary is
        // absolute evidence; otherwise indentation decides whether folding
        // could compose the current addition with context.
        if (!isAdded && indentation === 0) {
          ambiguousHunkBoundary = false;
          ambiguousPrevious = undefined;
        }
      }
    }

    const runAlias = currentRunEntry ? yamlAliasName(currentRunEntry.value) : undefined;
    const currentShellCandidate = currentRunEntry
      ? ((runAlias ? aliases.suppressionValues.get(runAlias) : undefined) ??
        shellCandidateForRunEntry(currentRunEntry))
      : lineInMultilineScalar && multilineScalar
        ? multilineShellFragment(line, multilineScalar.style)
        : line;
    const pendingAtLineStart = pendingSplitOr;
    const splitProgress =
      !isBlankOrComment && pendingAtLineStart
        ? advanceSplitOr(currentShellCandidate, pendingAtLineStart)
        : undefined;
    const splitCompletes = Boolean(
      !isBlankOrComment && pendingAtLineStart && splitProgress?.completes,
    );
    const truncatedLeadingOr = Boolean(
      isAdded &&
      ambiguousHunkBoundary &&
      !isBlankOrComment &&
      startsWithOrSuccessor(currentShellCandidate),
    );
    if (splitCompletes && pendingAtLineStart?.sourceAddedIndex !== undefined) {
      additions[pendingAtLineStart.sourceAddedIndex].splitSuppression = true;
    }

    const foldsFromAmbiguousPredecessor = Boolean(
      ambiguousHunkBoundary &&
      !isBlankOrComment &&
      ambiguousPrevious &&
      ambiguousPrevious.indent === indentation &&
      startsWithOrSuccessor(currentShellCandidate),
    );
    if (foldsFromAmbiguousPredecessor && ambiguousPrevious?.addedIndex !== undefined) {
      additions[ambiguousPrevious.addedIndex].continuedToSuccessor = true;
    }

    if (foldedFromBlockPredecessor && blockScalar?.previousAddedIndex !== undefined) {
      additions[blockScalar.previousAddedIndex].continuedToSuccessor = true;
    }
    if (
      foldedFromMultilinePredecessor &&
      multilineScalar?.previousAddedIndex !== undefined
    ) {
      additions[multilineScalar.previousAddedIndex].continuedToSuccessor = true;
    }
    const composesPriorSuppression = Boolean(
      (foldedFromBlockPredecessor && blockScalar?.previousHasSuppression) ||
      (foldedFromMultilinePredecessor && multilineScalar?.previousHasSuppression) ||
      (foldsFromAmbiguousPredecessor && ambiguousPrevious?.hasSuppression),
    );

    let currentAddedIndex: number | undefined;
    if (rawLine.startsWith("+")) {
      currentAddedIndex = additions.length;
      additions.push({
        line,
        suppressionCandidate: currentRunEntry ? currentShellCandidate : undefined,
        continuedFromPrevious:
          (ambiguousHunkBoundary &&
            (ambiguousContextIndent === undefined ||
              indentation === ambiguousContextIndent)) ||
          continuationPending ||
          foldedFromMultilinePredecessor ||
          foldedFromBlockPredecessor,
        continuedToSuccessor: false,
        composesPriorSuppression,
        splitSuppression: (splitCompletes && isAdded) || truncatedLeadingOr,
      });
    }

    const pendingAfterCurrentLine = (candidate: string): PendingSplitOr | undefined => {
      if (splitProgress?.next) {
        return {
          ...splitProgress.next,
          sourceAddedIndex: pendingAtLineStart?.sourceAddedIndex ?? currentAddedIndex,
        };
      }
      const trailing = trailingSplitOr(candidate);
      return trailing ? { ...trailing, sourceAddedIndex: currentAddedIndex } : undefined;
    };

    if (lineInBlockScalar && blockScalar) {
      if (currentAddedIndex !== undefined) {
        blockScalar.addedIndexes.push(currentAddedIndex);
      }
      blockScalar.physicalHasSuppression ||= hasSemanticOrTrue(currentShellCandidate);
      const content = line.slice(blockScalar.contentIndent ?? indentation);
      const separator = blockScalar.logicalShell
        ? blockScalar.style === "folded"
          ? " "
          : "\n"
        : "";
      blockScalar.logicalShell += `${separator}${content}`;
      if (
        !blockScalar.physicalHasSuppression &&
        hasSemanticOrTrue(blockScalar.logicalShell)
      ) {
        for (const index of blockScalar.addedIndexes) {
          additions[index].splitSuppression = true;
        }
      }
    }

    if (lineInMultilineScalar && multilineScalar?.rawQuotedValue !== undefined) {
      if (currentAddedIndex !== undefined) {
        multilineScalar.addedIndexes.push(currentAddedIndex);
      }
      multilineScalar.physicalHasSuppression ||= hasSemanticOrTrue(currentShellCandidate);
      multilineScalar.rawQuotedValue += `\n${line.trimStart()}`;
      const parsed = parseYamlKey(multilineScalar.rawQuotedValue, 0);
      if (
        parsed &&
        !multilineScalar.physicalHasSuppression &&
        hasSemanticOrTrue(parsed.value)
      ) {
        for (const index of multilineScalar.addedIndexes) {
          additions[index].splitSuppression = true;
        }
      }
    }

    if (isBlankOrComment) {
      if (
        trimmed &&
        ((lineInBlockScalar && blockScalar?.style === "folded") || lineInMultilineScalar)
      ) {
        // Folded YAML turns this into an inline shell comment, so it consumes
        // rather than separates a pending RHS. Literal block newlines do not.
        pendingSplitOr = undefined;
      }
      if (ambiguousHunkBoundary && !trimmed) ambiguousPrevious = undefined;
      if (lineInBlockScalar && blockScalar) {
        blockScalar.previousLineKind = trimmed ? "text" : "blank";
        blockScalar.previousAddedIndex =
          trimmed &&
          blockScalar.style === "folded" &&
          indentation === blockScalar.contentIndent
            ? currentAddedIndex
            : undefined;
        blockScalar.previousHasSuppression = Boolean(
          trimmed &&
          blockScalar.style === "folded" &&
          indentation === blockScalar.contentIndent &&
          hasSemanticOrTrue(line),
        );
      }
      if (lineInMultilineScalar && multilineScalar) {
        multilineScalar.previousLineKind =
          trimmed && multilineScalar.style !== "plain" ? "text" : "blank";
        multilineScalar.previousAddedIndex =
          trimmed && multilineScalar.style !== "plain" ? currentAddedIndex : undefined;
        multilineScalar.previousHasSuppression = Boolean(
          trimmed && multilineScalar.style !== "plain" && hasSemanticOrTrue(line),
        );
        if (
          multilineScalar.style !== "plain" &&
          closesMultilineQuotedScalar(line, multilineScalar.style)
        ) {
          multilineScalar = undefined;
        }
      }
      // Comments and blanks neither consume a pending shell RHS nor establish
      // that a non-file-start hunk is outside an omitted YAML scalar.
      continue;
    }

    if (lineInBlockScalar && blockScalar) {
      blockScalar.previousLineKind =
        indentation === blockScalar.contentIndent ? "text" : "more_indented";
      blockScalar.previousAddedIndex =
        blockScalar.style === "folded" && blockScalar.previousLineKind === "text"
          ? currentAddedIndex
          : undefined;
      blockScalar.previousHasSuppression =
        blockScalar.style === "folded" &&
        blockScalar.previousLineKind === "text" &&
        hasSemanticOrTrue(line);
      continuationPending = continuesShellCommand(line);
      pendingSplitOr = pendingAfterCurrentLine(line);
      continue;
    }

    if (lineInMultilineScalar && multilineScalar) {
      multilineScalar.previousLineKind = "text";
      multilineScalar.previousAddedIndex = currentAddedIndex;
      multilineScalar.previousHasSuppression = hasSemanticOrTrue(line);
      continuationPending = continuesShellCommand(line);
      pendingSplitOr = pendingAfterCurrentLine(line);
      if (
        multilineScalar.style !== "plain" &&
        closesMultilineQuotedScalar(line, multilineScalar.style)
      ) {
        multilineScalar = undefined;
      }
      continue;
    }

    if (!isAdded && ambiguousHunkBoundary && ambiguousContextIndent === undefined) {
      ambiguousContextIndent = indentation;
    }

    continuationPending = currentRunEntry
      ? continuesShellCommand(currentRunEntry.value)
      : (ambiguousHunkBoundary || !isYamlStructuralBoundary(line)) &&
        continuesShellCommand(line);
    if (currentRunEntry) {
      multilineScalar = multilineRunScalar(currentRunEntry);
      if (multilineScalar) {
        multilineScalar.previousAddedIndex = currentAddedIndex;
        multilineScalar.previousHasSuppression = hasSemanticOrTrue(currentShellCandidate);
        multilineScalar.physicalHasSuppression = multilineScalar.previousHasSuppression;
        if (currentAddedIndex !== undefined) {
          multilineScalar.addedIndexes.push(currentAddedIndex);
        }
      }
    }
    pendingSplitOr = pendingAfterCurrentLine(currentShellCandidate);
    if (ambiguousHunkBoundary) {
      ambiguousPrevious = {
        indent: indentation,
        hasSuppression: hasSemanticOrTrue(currentShellCandidate),
        addedIndex: currentAddedIndex,
      };
    }
  }

  return additions;
}

export interface OrTrueSuppressionRule {
  id: string;
  category: "cleanup" | "idempotent_ensure" | "count_fallback";
  /** One-line review rationale; this list is policy data, not scanner control flow. */
  justification: string;
  wrapper: "command" | "trap";
  commandPattern: RegExp;
}

/**
 * ADR-012 D4: reviewed command shapes whose non-zero exit does not carry the
 * workflow's test/build/deploy/verification outcome. Matching is deliberately
 * full-line and fail-closed (see `suppressedCommand`); adding a benign shape is
 * a data review, while every unlisted `|| true` remains blocking.
 */
export const OR_TRUE_SUPPRESSION_ALLOWLIST: readonly OrTrueSuppressionRule[] = [
  {
    id: "trap-cleanup",
    category: "cleanup",
    justification:
      "Best-effort EXIT/INT/TERM resource cleanup does not decide CI success.",
    wrapper: "trap",
    commandPattern: /^(?:docker\s+(?:rm|stop|kill)\b|rm\b|rmdir\b|kill\b|pkill\b)/,
  },
  {
    id: "gh-label-create-ensure",
    category: "idempotent_ensure",
    justification: "Creating an already-present GitHub label is an idempotent ensure.",
    wrapper: "command",
    commandPattern: /^gh\s+label\s+create\b/,
  },
  {
    id: "directory-ensure",
    category: "idempotent_ensure",
    justification: "Parent-directory creation is an idempotent filesystem ensure.",
    wrapper: "command",
    commandPattern: /^(?:mkdir\s+(?:-p|--parents)\b|install\s+-d\b)/,
  },
  {
    id: "count-fallback",
    category: "count_fallback",
    justification: "grep/rg count mode may return one when the valid count is zero.",
    wrapper: "command",
    commandPattern: /^(?:grep|rg)\b(?=.*\s(?:-[A-Za-z]*c[A-Za-z]*|--count)(?:\s|$))/,
  },
] as const;

interface SuppressedCommand {
  wrapper: "command" | "trap";
  command: string;
}

const TRAP_SIGNALS = "(?:EXIT|INT|TERM)(?:\\s+(?:EXIT|INT|TERM))*";

interface ShellTokenRange {
  start: number;
  end: number;
}

function unquotedOrTrueTokens(candidate: string): ShellTokenRange[] {
  const matches: ShellTokenRange[] = [];
  for (const operator of unquotedOrOperatorIndexes(candidate)) {
    let commandStart = operator + 2;
    while (/\s/.test(candidate[commandStart] ?? "")) commandStart += 1;
    const word = shellWordAt(candidate, commandStart);
    if (!word?.closed || word.value !== "true") continue;
    matches.push({ start: operator, end: word.end });
  }

  return matches;
}

function isRedirectionAmpersand(command: string, index: number): boolean {
  return command[index + 1] === ">" || /[<>]/.test(command[index - 1] ?? "");
}

function hasUnsafeShellComposition(command: string): boolean {
  if (command.includes("${{")) return true;
  let singleQuoted = false;
  let doubleQuoted = false;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (singleQuoted) {
      if (character === "'") singleQuoted = false;
      continue;
    }
    if (doubleQuoted) {
      if (character === "\\" && /[$`"\\]/.test(command[index + 1] ?? "")) {
        index += 1;
        continue;
      }
      if (character === '"') {
        doubleQuoted = false;
        continue;
      }
      if (character === "`" || (character === "$" && command[index + 1] === "(")) {
        return true;
      }
      continue;
    }

    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === "'") {
      singleQuoted = true;
      continue;
    }
    if (character === '"') {
      doubleQuoted = true;
      continue;
    }
    if (
      character === "`" ||
      (character === "$" && command[index + 1] === "(") ||
      ((character === "<" || character === ">") && command[index + 1] === "(") ||
      character === ";" ||
      character === "|" ||
      character === "(" ||
      character === ")" ||
      character === "\n" ||
      character === "\r" ||
      (character === "&" && !isRedirectionAmpersand(command, index))
    ) {
      return true;
    }
  }

  return singleQuoted || doubleQuoted;
}

function singleSuppressedCommand(
  candidate: string,
  wrapper: SuppressedCommand["wrapper"],
): SuppressedCommand | null {
  const matches = unquotedOrTrueTokens(candidate);
  if (matches.length !== 1) return null;

  const match = matches[0];
  const command = candidate.slice(0, match.start).trim();
  const suffix = candidate.slice(match.end).trim();

  // No compound command, pipeline, command/process substitution or second payload may
  // hide behind an otherwise allowlisted prefix. Redirections (including 2>&1)
  // remain valid because they do not compose another command.
  if (!command || hasUnsafeShellComposition(command)) return null;
  if (suffix && !suffix.startsWith("#")) return null;
  return { wrapper, command };
}

function normalizedShellCandidate(line: string): string {
  const runEntry = yamlRunEntry(line);
  return (
    (runEntry ? shellCandidateForRunEntry(runEntry) : undefined) ??
    line.replace(/^[ \t]*(?:-[ \t]+)?/, "")
  ).trim();
}

function trapHandler(normalized: string): string | undefined {
  for (const quote of ["'", '"'] as const) {
    const escapedQuote = quote === '"' ? '\\"' : quote;
    const trap = normalized.match(
      new RegExp(
        `^trap\\s+${escapedQuote}([^${escapedQuote}]*)${escapedQuote}\\s+${TRAP_SIGNALS}\\s*(?:#.*)?$`,
      ),
    );
    if (trap) return trap[1];
  }

  return undefined;
}

function expandStaticActionsStrings(candidate: string): string {
  return candidate.replace(
    /\$\{\{\s*'((?:[^']|'')*)'\s*\}\}/g,
    (_expression, value: string) => value.replace(/''/g, "'"),
  );
}

function hasSemanticOrTrue(line: string): boolean {
  const normalized = normalizedShellCandidate(line);
  const executable = trapHandler(normalized) ?? normalized;
  return (
    unquotedOrTrueTokens(executable).length > 0 ||
    unquotedOrTrueTokens(expandStaticActionsStrings(executable)).length > 0
  );
}

function suppressedCommand(line: string): SuppressedCommand | null {
  const normalized = normalizedShellCandidate(line);
  const handler = trapHandler(normalized);
  if (handler !== undefined) return singleSuppressedCommand(handler, "trap");

  return singleSuppressedCommand(normalized, "command");
}

export function isAllowedOrTrueSuppression(line: string): boolean {
  const candidate = suppressedCommand(line);
  if (!candidate) return false;
  return OR_TRUE_SUPPRESSION_ALLOWLIST.some(
    (rule) =>
      rule.wrapper === candidate.wrapper && rule.commandPattern.test(candidate.command),
  );
}

/** Detect newly introduced CI bypasses, never unchanged or deleted context. */
export function detectCiIntegrity(files: CiIntegrityFile[]): CiIntegrityResult {
  const blockingPatterns: string[] = [];
  const warningSignals: string[] = [];
  let score = 0;

  for (const file of files.filter((entry) =>
    entry.filename.startsWith(".github/workflows/"),
  )) {
    const addedLines = addedPatchLines(file.patch);
    const added = addedLines.map(({ line }) => line).join("\n");
    if (
      addedLines.some(
        ({
          line,
          suppressionCandidate,
          continuedFromPrevious,
          continuedToSuccessor,
          composesPriorSuppression,
          splitSuppression,
        }) =>
          splitSuppression ||
          composesPriorSuppression ||
          (hasSemanticOrTrue(suppressionCandidate ?? line) &&
            (continuedFromPrevious ||
              continuedToSuccessor ||
              !isAllowedOrTrueSuppression(suppressionCandidate ?? line))),
      )
    ) {
      blockingPatterns.push(`${file.filename}: workflow bypass pattern "|| true"`);
      score += 45;
    }
    if (/^\s*continue-on-error:\s*true\b/m.test(added)) {
      blockingPatterns.push(`${file.filename}: introduced "continue-on-error: true"`);
      score += 45;
    }
    if (/^\s*if:\s*\$\{\{\s*always\(\)\s*\}\}/m.test(added)) {
      warningSignals.push(`${file.filename}: always() condition added to workflow gate`);
      score += 20;
    }
  }

  for (const file of files.filter((entry) =>
    /\.(test|spec)\.(ts|tsx|js|jsx)$|__tests__\/|\.cy\.(ts|js)$/.test(entry.filename),
  )) {
    const additions = file.additions ?? 0;
    const deletions = file.deletions ?? 0;
    if (deletions > additions * 2 && deletions >= 10) {
      warningSignals.push(
        `${file.filename}: heavy test deletion (${deletions} deleted / ${additions} added)`,
      );
      score += 25;
    }
  }

  for (const file of files) {
    const patch = file.patch ?? "";
    if (!patch) continue;
    if (
      /^-\s*(branches|functions|lines|statements)\s*:\s*\d+/m.test(patch) &&
      /^\+\s*(branches|functions|lines|statements)\s*:\s*\d+/m.test(patch)
    ) {
      warningSignals.push(`${file.filename}: coverage threshold definition changed`);
      score += 20;
    }
  }

  return {
    score: Math.min(100, score),
    blockingPatterns,
    warningSignals,
  };
}
