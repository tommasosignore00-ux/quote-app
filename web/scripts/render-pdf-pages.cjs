const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

async function main() {
  const filePath = process.argv[2];
  const outputDir = process.argv[3];
  const maxPages = Number(process.argv[4] || 12);
  const desiredWidth = Number(process.argv[5] || 1600);

  if (!filePath) {
    throw new Error('Missing PDF file path');
  }

  if (!outputDir) {
    throw new Error('Missing output directory');
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const data = fs.readFileSync(filePath);
  const parser = new PDFParse({ data });

  try {
    const result = await parser.getScreenshot({
      imageDataUrl: false,
      imageBuffer: true,
      first: Number.isFinite(maxPages) && maxPages > 0 ? maxPages : 12,
      desiredWidth: Number.isFinite(desiredWidth) && desiredWidth > 0 ? desiredWidth : 1600,
    });

    const pages = [];
    for (const page of result.pages || []) {
      const pageNumber = Number(page.pageNumber || pages.length + 1);
      const fileName = `page-${String(pageNumber).padStart(3, '0')}.png`;
      const pagePath = path.join(outputDir, fileName);
      const buffer = Buffer.isBuffer(page.data) ? page.data : Buffer.from(page.data);
      fs.writeFileSync(pagePath, buffer);
      pages.push({
        pageNumber,
        path: pagePath,
        width: page.width || null,
        height: page.height || null,
      });
    }

    process.stdout.write(
      JSON.stringify({
        totalPages: result.total || pages.length,
        renderedPages: pages.length,
        pages,
      })
    );
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
