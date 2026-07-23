const fs = require('fs');
const { PDFParse } = require('pdf-parse');

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error('Missing PDF file path');
  }

  const data = fs.readFileSync(filePath);
  const parser = new PDFParse({ data });

  try {
    const result = await parser.getText();
    process.stdout.write(JSON.stringify({ text: result.text || '' }));
  } finally {
    await parser.destroy();
  }
}

main().catch((error) => {
  process.stderr.write(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    })
  );
  process.exit(1);
});
