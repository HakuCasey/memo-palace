import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(): { url: string; file: string } {
  const args = process.argv.slice(2);
  let url = 'http://localhost:5678';
  let file = path.resolve(__dirname, '../assets/pipeline/evolved/high_value.jsonl');

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      url = args[i + 1];
      i++;
    } else if (args[i] === '--file' && args[i + 1]) {
      file = args[i + 1];
      i++;
    }
  }

  return { url, file };
}

async function main() {
  const { url, file } = parseArgs();

  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }

  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim() !== '');

  const cases: object[] = [];
  for (const line of lines) {
    try {
      cases.push(JSON.parse(line));
    } catch (err) {
      console.error(`Failed to parse line: ${line.slice(0, 80)}...`);
    }
  }

  if (cases.length === 0) {
    console.log('No valid cases found in file.');
    return;
  }

  console.log(`Read ${cases.length} cases from ${file}`);

  const importUrl = `${url.replace(/\/$/, '')}/api/import`;

  try {
    const res = await fetch(importUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cases),
    });

    if (!res.ok) {
      console.error(`Import failed: ${res.status} ${res.statusText}`);
      const text = await res.text();
      console.error(text);
      process.exit(1);
    }

    const body = await res.json() as { imported: number };
    console.log(`Successfully imported ${body.imported} cases.`);
  } catch (err) {
    console.error('Failed to connect to server:', err);
    process.exit(1);
  }
}

main();
