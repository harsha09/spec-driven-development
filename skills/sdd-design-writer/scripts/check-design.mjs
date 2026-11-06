/**
 * Check a finished design.md against the sdd-design-writer contract.
 * The bundled CLI template and this pack's skeleton are supposed to fail.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const REQUIRED_HEADINGS = [
  "Approach",
  "Components / modules",
  "Data flow",
  "Contracts",
  "Alternatives considered",
  "Edge cases",
  "Race conditions",
  "Risks and mitigations",
  "Out of scope",
  "Acceptance",
];

const PLACEHOLDER = /^(?:-|—|–|\.{3}|tbd|todo|n\/a|none|fixme)$/i;

function cells(line) {
  const parts = line.trim().split("|");
  if (parts.length && parts[0].trim() === "") parts.shift();
  if (parts.length && parts[parts.length - 1].trim() === "") parts.pop();
  return parts.map((part) => part.trim());
}

function isSeparator(line) {
  const values = cells(line);
  return values.length > 0 && values.every((value) => /^:?-{3,}:?$/.test(value));
}

function badCell(value) {
  const text = value.trim();
  if (!text) return "empty";
  if (PLACEHOLDER.test(text)) return "a placeholder";
  if (text.includes("{{")) return "an unfilled token";
  return null;
}

export function h2Sections(markdown) {
  /** @type {Map<string, string>} */
  const sections = new Map();
  /** @type {string[]} */
  const duplicates = [];
  let current = /** @type {string | null} */ (null);
  /** @type {string[]} */
  let buffer = [];
  const flush = () => {
    if (current == null) return;
    if (sections.has(current)) duplicates.push(current);
    else sections.set(current, buffer.join("\n"));
    buffer = [];
  };
  for (const line of String(markdown).replace(/\r\n/g, "\n").split("\n")) {
    const match = /^## ([^#\s].*)$/.exec(line.trim());
    if (match) {
      flush();
      current = match[1].trim();
      continue;
    }
    if (current) buffer.push(line);
  }
  flush();
  return { sections, duplicates };
}

function parseTables(body) {
  const lines = body.split("\n");
  /** @type {{ headers: string[], rows: string[][] }[]} */
  const tables = [];
  let index = 0;
  while (index < lines.length) {
    if (!lines[index].trim().startsWith("|")) {
      index += 1;
      continue;
    }
    /** @type {string[]} */
    const block = [];
    while (index < lines.length && lines[index].trim().startsWith("|")) {
      block.push(lines[index].trim());
      index += 1;
    }
    if (block.length < 2 || !isSeparator(block[1])) continue;
    const headers = cells(block[0]);
    const rows = block
      .slice(2)
      .map(cells)
      .filter((row) => row.some((cell) => cell.length > 0));
    tables.push({ headers, rows });
  }
  return tables;
}

function tableWith(tables, needed) {
  return tables.find((table) =>
    needed.every((name) => table.headers.some((header) => header.toLowerCase() === name.toLowerCase())),
  );
}

function column(table, name) {
  return table.headers.findIndex((header) => header.toLowerCase() === name.toLowerCase());
}

function numberedSteps(body) {
  /** @type {string[]} */
  const steps = [];
  let current = /** @type {string | null} */ (null);
  for (const line of body.split("\n")) {
    const match = /^(\d+)\.\s+(.+)$/.exec(line.trim());
    if (match) {
      if (current) steps.push(current);
      current = match[2].trim();
      continue;
    }
    const trimmed = line.trim();
    if (current && trimmed && !trimmed.startsWith("|") && !trimmed.startsWith("#")) {
      current = `${current} ${trimmed}`;
    }
  }
  if (current) steps.push(current);
  return steps;
}

function bullets(body) {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

function h3Blocks(body) {
  /** @type {{ title: string, body: string }[]} */
  const blocks = [];
  let title = /** @type {string | null} */ (null);
  /** @type {string[]} */
  let buffer = [];
  const flush = () => {
    if (!title) return;
    blocks.push({ title, body: buffer.join("\n").trim() });
    buffer = [];
  };
  for (const line of body.split("\n")) {
    const match = /^### (.+)$/.exec(line.trim());
    if (match) {
      flush();
      title = match[1].trim();
      continue;
    }
    if (title) buffer.push(line);
  }
  flush();
  return blocks;
}

function prose(body) {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (line.startsWith("|") || line.startsWith("#") || line.startsWith("-") || line.startsWith(">")) {
        return false;
      }
      if (/^\d+\.\s+/.test(line)) return false;
      return true;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function checkCells(errors, label, row, table, rules) {
  for (const rule of rules) {
    const value = row[column(table, rule.name)] ?? "";
    const problem = badCell(value);
    if (problem) {
      errors.push(`${label}: ${rule.name} is ${problem}.`);
      continue;
    }
    if (value.trim().length < rule.min) {
      errors.push(`${label}: ${rule.name} is shorter than ${rule.min} characters.`);
    }
  }
}

/**
 * @param {string} markdown
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function checkDesign(markdown) {
  /** @type {string[]} */
  const errors = [];
  const text = String(markdown)
    .replace(/\r\n/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "");
  const first = text.split("\n")[0]?.trim() ?? "";
  if (first !== "# Design") errors.push("The first line must be the heading # Design.");
  if (/\bTBD\b|\bTODO\b|\bFIXME\b/i.test(text)) {
    errors.push("Replace TBD, TODO, and FIXME before the design is finished.");
  }

  const { sections, duplicates } = h2Sections(text);
  for (const heading of duplicates) {
    if (REQUIRED_HEADINGS.includes(heading)) errors.push(`Heading appears twice: ${heading}.`);
  }
  for (const heading of REQUIRED_HEADINGS) {
    if (!sections.has(heading)) errors.push(`Missing section: ${heading}.`);
  }
  if (errors.some((error) => error.startsWith("Missing section"))) {
    return { ok: false, errors };
  }

  const approach = prose(sections.get("Approach") ?? "");
  if (approach.length < 400) {
    errors.push("Approach needs a paragraph of at least 400 characters that says what was chosen.");
  }
  if (!/because/i.test(approach)) {
    errors.push("Approach must say why the choice was made, using because.");
  }

  const components = tableWith(parseTables(sections.get("Components / modules") ?? ""), [
    "Component",
    "Responsibility",
  ]);
  if (!components) {
    errors.push("Components / modules needs a table with columns Component and Responsibility.");
  } else if (components.rows.length < 3) {
    errors.push("Components / modules needs at least three rows.");
  } else {
    components.rows.forEach((row, index) => {
      checkCells(errors, `Component row ${index + 1}`, row, components, [
        { name: "Component", min: 3 },
        { name: "Responsibility", min: 12 },
      ]);
    });
  }

  const steps = numberedSteps(sections.get("Data flow") ?? "");
  if (steps.length < 3) errors.push("Data flow needs at least three numbered steps.");
  steps.forEach((step, index) => {
    if (step.length < 40) errors.push(`Data flow step ${index + 1} is shorter than 40 characters.`);
  });

  const contracts = tableWith(parseTables(sections.get("Contracts") ?? ""), [
    "Operation",
    "Success",
    "Rejection",
  ]);
  if (!contracts) {
    errors.push("Contracts needs a table with columns Operation, Success, and Rejection.");
  } else if (contracts.rows.length < 3) {
    errors.push("Contracts needs at least three operations.");
  } else {
    contracts.rows.forEach((row, index) => {
      checkCells(errors, `Contract row ${index + 1}`, row, contracts, [
        { name: "Operation", min: 3 },
        { name: "Success", min: 12 },
        { name: "Rejection", min: 12 },
      ]);
    });
  }

  const alternatives = sections.get("Alternatives considered") ?? "";
  const blocks = h3Blocks(alternatives);
  if (blocks.length < 2) {
    errors.push("Alternatives considered needs at least two ### headings.");
  }
  for (const block of blocks) {
    if (block.body.length < 80) errors.push(`Alternative "${block.title}" needs a reason, at least 80 characters.`);
    if (!/because/i.test(block.body)) {
      errors.push(`Alternative "${block.title}" must say why it lost or what it costs, using because.`);
    }
  }
  const chosen = alternatives
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^Chosen:/.test(line));
  if (!chosen) errors.push("Alternatives considered needs a line that starts with Chosen:.");
  else if (!/because/i.test(chosen)) errors.push("The Chosen line must include because.");

  const edges = tableWith(parseTables(sections.get("Edge cases") ?? ""), ["Case", "Handling"]);
  if (!edges) errors.push("Edge cases needs a table with columns Case and Handling.");
  else if (edges.rows.length < 4) errors.push("Edge cases needs at least four rows.");
  else {
    edges.rows.forEach((row, index) => {
      checkCells(errors, `Edge case row ${index + 1}`, row, edges, [
        { name: "Case", min: 12 },
        { name: "Handling", min: 20 },
      ]);
    });
  }

  const races = tableWith(parseTables(sections.get("Race conditions") ?? ""), [
    "Race",
    "Parties",
    "Outcome",
  ]);
  if (!races) errors.push("Race conditions needs a table with columns Race, Parties, and Outcome.");
  else if (races.rows.length < 3) errors.push("Race conditions needs at least three rows.");
  else {
    races.rows.forEach((row, index) => {
      checkCells(errors, `Race row ${index + 1}`, row, races, [
        { name: "Race", min: 12 },
        { name: "Parties", min: 12 },
        { name: "Outcome", min: 20 },
      ]);
      const parties = row[column(races, "Parties")] ?? "";
      const outcome = row[column(races, "Outcome")] ?? "";
      if (!/ and /i.test(parties)) {
        errors.push(`Race row ${index + 1}: Parties must name both sides with the word and.`);
      }
      if (!/reject|win|once|both |conflict|unchanged|stored|exactly one|does not|visible/i.test(outcome)) {
        errors.push(`Race row ${index + 1}: Outcome must state who wins or what stays unchanged.`);
      }
    });
  }

  const risks = tableWith(parseTables(sections.get("Risks and mitigations") ?? ""), [
    "Risk",
    "Impact",
    "Mitigation",
  ]);
  if (!risks) {
    errors.push("Risks and mitigations needs a table with columns Risk, Impact, and Mitigation.");
  } else if (risks.rows.length < 3) {
    errors.push("Risks and mitigations needs at least three rows.");
  } else {
    risks.rows.forEach((row, index) => {
      checkCells(errors, `Risk row ${index + 1}`, row, risks, [
        { name: "Risk", min: 12 },
        { name: "Impact", min: 20 },
        { name: "Mitigation", min: 20 },
      ]);
      const risk = (row[column(risks, "Risk")] ?? "").trim();
      const mitigation = (row[column(risks, "Mitigation")] ?? "").trim();
      if (risk && risk === mitigation) {
        errors.push(`Risk row ${index + 1}: Mitigation repeats the risk instead of saying what limits it.`);
      }
    });
  }

  const scope = bullets(sections.get("Out of scope") ?? "").filter((item) => !badCell(item));
  if (scope.length < 3) errors.push("Out of scope needs at least three bullets.");
  scope.forEach((item, index) => {
    if (item.length < 20) errors.push(`Out of scope bullet ${index + 1} is shorter than 20 characters.`);
  });

  const acceptance = tableWith(parseTables(sections.get("Acceptance") ?? ""), ["Scenario", "Expected"]);
  if (!acceptance) errors.push("Acceptance needs a table with columns Scenario and Expected.");
  else if (acceptance.rows.length < 4) errors.push("Acceptance needs at least four rows.");
  else {
    acceptance.rows.forEach((row, index) => {
      checkCells(errors, `Acceptance row ${index + 1}`, row, acceptance, [
        { name: "Scenario", min: 12 },
        { name: "Expected", min: 20 },
      ]);
    });
  }

  return { ok: errors.length === 0, errors };
}

function main(argv) {
  const files = argv.slice(2).filter((arg) => arg !== "--");
  if (files.length === 0) {
    process.stderr.write("usage: node check-design.mjs <design.md> [more.md ...]\n");
    return 2;
  }
  let failed = 0;
  for (const file of files) {
    let markdown;
    try {
      markdown = readFileSync(file, "utf8");
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`fail ${file}\n  - ${message}\n`);
      continue;
    }
    const result = checkDesign(markdown);
    if (result.ok) {
      process.stdout.write(`ok ${file}\n`);
      continue;
    }
    failed += 1;
    process.stderr.write(`fail ${file}\n`);
    for (const error of result.errors) process.stderr.write(`  - ${error}\n`);
  }
  return failed === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv));
}
