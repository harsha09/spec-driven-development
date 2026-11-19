let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  const input = JSON.parse(raw);
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  const label = /^(Job|Description|Task|Kind|Section|Decision|Check ids|Section text|Cite|Draft|Gaps):|^Cite for [^:]*:/;
  const block = (name) => {
    const lines = prompt.split(/\r?\n/);
    const start = lines.findIndex((line) => line === name);
    if (start < 0) return [];
    const out = [];
    for (const line of lines.slice(start + 1)) {
      if (label.test(line)) break;
      if (line.trim().length > 0) out.push(line);
    }
    return out;
  };
  // The current layout puts each input in a fenced block under "### <name> (untrusted data, ...)".
  const fencedBlock = (name) => {
    const lines = prompt.split(/\r?\n/);
    const start = lines.findIndex((line) => line.startsWith(`### ${name} (`));
    if (start < 0) return null;
    const open = lines[start + 1] ?? "";
    const fence = open.match(/^`+/)?.[0];
    if (!fence) return null;
    const out = [];
    for (const line of lines.slice(start + 2)) {
      if (line === fence) break;
      out.push(line);
    }
    return out;
  };
  const gapLines = () => fencedBlock("Gaps") ?? block("Gaps:");
  const isCritique =
    (prompt.includes("Draft:") && prompt.includes("Cite:")) ||
    (fencedBlock("Draft") !== null && fencedBlock("Cite ids") !== null) ||
    (fencedBlock("Draft") !== null && prompt.includes("Check ids:"));
  let result;
  if (
    prompt.includes("changed and open together must list every gap cite") ||
    prompt.includes("changed must list every gap cite.")
  ) {
    const changed = gapLines()
      .filter((line) => line.includes(":"))
      .map((line) => line.slice(0, line.indexOf(":")));
    const text = "Revised draft.";
    result = {
      kind: "revision",
      text,
      changed,
      action: {
        name: "write_file",
        words: "Write the draft.",
        inputs: { path: "notes/draft.md", contents: text },
      },
    };
  } else if (isCritique) {
    const cite = (fencedBlock("Cite ids") ?? block("Check ids:"))[0] ?? "";
    result = {
      kind: "critique",
      text: "Checked the draft.",
      gaps: [{ cite, text: "The draft misses this check." }],
    };
  } else {
    result = { kind: "draft", text: "Draft from the local example." };
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
});
