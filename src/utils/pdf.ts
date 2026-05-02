/**
 * PDF text extraction utility.

 *
 * Requires: pnpm add pdf-parse @types/pdf-parse
 */

/**
 * Extract plain text from a PDF file.
 *
 * @param filePath - Absolute path to the PDF file
 * @returns Extracted text content
 */
export async function extractPdfText(filePath: string): Promise<string> {
    // Dynamic import so the module is only loaded when needed
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string; numpages: number }>;
    const fs = await import('fs');

    const buffer = fs.readFileSync(filePath);
    const result = await pdfParse(buffer);
    return result.text;
}

/**
 * Extract text and metadata from a PDF file.
 */
export async function extractPdfInfo(filePath: string): Promise<{
    text: string;
    numPages: number;
    filePath: string;
}> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string; numpages: number }>;
    const fs = await import('fs');

    const buffer = fs.readFileSync(filePath);
    const result = await pdfParse(buffer);
    return {
        text: result.text,
        numPages: result.numpages,
        filePath,
    };
}
