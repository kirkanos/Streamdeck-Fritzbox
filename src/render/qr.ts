import qrcode from "qrcode-generator";

// The default byte mapping only covers Latin-1; SSIDs and passwords may hold anything.
qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];

export type QrMatrix = boolean[][];

/** Modules of a QR code (error correction level M), true = dark. */
export function qrMatrix(payload: string): QrMatrix {
  const qr = qrcode(0, "M");
  qr.addData(payload, "Byte");
  qr.make();
  const count = qr.getModuleCount();
  const rows: QrMatrix = [];
  for (let row = 0; row < count; row++) {
    const cells: boolean[] = [];
    for (let col = 0; col < count; col++) {
      cells.push(qr.isDark(row, col));
    }
    rows.push(cells);
  }
  return rows;
}

export type QrBox = {
  x: number;
  y: number;
  /** Outer size including the quiet zone. */
  size: number;
  /** Quiet zone in modules (the standard asks for 4; 2 is fine for a screen at arm's length). */
  quiet?: number;
  dark?: string;
  light?: string;
};

/**
 * Draws the matrix as a white square with black module rectangles, centered
 * in the box. Adjacent dark modules of a row are merged into one rect.
 */
export function qrSvg(matrix: QrMatrix, box: QrBox): string {
  const quiet = box.quiet ?? 2;
  const count = matrix.length + quiet * 2;
  const cell = Math.floor(box.size / count);
  const drawn = cell * count;
  const ox = box.x + Math.floor((box.size - drawn) / 2);
  const oy = box.y + Math.floor((box.size - drawn) / 2);
  const dark = box.dark ?? "#000000";
  let out = `<rect x="${box.x}" y="${box.y}" width="${box.size}" height="${box.size}" rx="${Math.round(cell * 1.5)}" fill="${box.light ?? "#FFFFFF"}"/>`;
  matrix.forEach((row, r) => {
    let col = 0;
    while (col < row.length) {
      if (!row[col]) {
        col++;
        continue;
      }
      let end = col;
      while (end < row.length && row[end]) {
        end++;
      }
      out += `<rect x="${ox + (col + quiet) * cell}" y="${oy + (r + quiet) * cell}" width="${(end - col) * cell}" height="${cell}" fill="${dark}"/>`;
      col = end;
    }
  });
  return out;
}
