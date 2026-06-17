import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

export interface SourceFile {
  id: string;
  name: string;
  count: number;
  evolvedCount?: number;
  size: number;
  modified: string;
  evolved?: boolean;
}

export interface SourceChannelGroup {
  channel: string;
  files: SourceFile[];
}

function countItems(file: string): number {
  if (extname(file) === ".jsonl") {
    const text = readFileSync(file, "utf-8");
    return text.split(/\r?\n/).filter(Boolean).length;
  }
  return 1;
}

function evolvedCompanionPath(dir: string, name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return join(dir, `${base}_evolved.jsonl`);
}

export function listSources(sourcesRoot: string): SourceChannelGroup[] {
  let channels: string[] = [];
  try { channels = readdirSync(sourcesRoot).filter(d => {
    try { return statSync(join(sourcesRoot, d)).isDirectory(); } catch { return false; }
  }); } catch { return []; }

  return channels.sort().map(channel => {
    const dir = join(sourcesRoot, channel);
    const files: SourceFile[] = [];
    let entries: string[] = [];
    try { entries = readdirSync(dir); } catch { return { channel, files }; }
    for (const name of entries.sort()) {
      if (name.includes("_evolved")) continue;
      const full = join(dir, name);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (!st.isFile()) continue;
      const evolvedPath = evolvedCompanionPath(dir, name);
      const hasEvolved = existsSync(evolvedPath);
      const srcCount = countItems(full);
      const evolvedCount = hasEvolved ? countItems(evolvedPath) : 0;
      files.push({
        id: `${channel}/${name}`,
        name,
        count: srcCount,
        evolvedCount: evolvedCount > 0 ? evolvedCount : undefined,
        size: st.size,
        modified: st.mtime.toISOString(),
        evolved: hasEvolved || undefined,
      });
    }
    return { channel, files };
  });
}
