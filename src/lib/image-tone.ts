import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type Tone = 'light' | 'dark';

/** Average luma (0–255) above which a cover counts as light, so the title turns black. */
const LIGHT_THRESHOLD = 150;

/**
 * Measures how bright the upper band of a local image is (where the card title
 * sits, roughly 8–45% down). That band is scaled down to 8×8 and encoded as JPEG; the first
 * luminance DC coefficient of a JPEG is the average brightness of its first
 * 8×8 block, which here is the whole image. No pixel-access library needed.
 */
/** Average brightness (0–255) of the title band of a local image, or null if unreadable. */
export async function measureLuma(uri: string): Promise<number | null> {
  try {
    const full = await ImageManipulator.manipulate(uri).renderAsync();
    const { width, height } = full;
    full.release();

    const context = ImageManipulator.manipulate(uri)
      .crop({ originX: width * 0.1, originY: height * 0.08, width: width * 0.8, height: height * 0.37 })
      .resize({ width: 8, height: 8 });
    const tiny = await context.renderAsync();
    const saved = await tiny.saveAsync({ format: SaveFormat.JPEG, compress: 1 });
    context.release();
    tiny.release();

    const file = new File(saved.uri);
    const luma = jpegAverageLuma(await file.bytes());
    file.delete();
    return luma;
  } catch {
    return null;
  }
}

export async function measureTone(uri: string): Promise<Tone> {
  const luma = await measureLuma(uri);
  return luma != null && luma >= LIGHT_THRESHOLD ? 'light' : 'dark';
}

/** Decodes only the first luminance DC value of a baseline JPEG. Returns null if unsupported. */
export function jpegAverageLuma(bytes: Uint8Array): number | null {
  const quant = new Map<number, number>(); // table id → first coefficient (DC quantizer)
  const dcTables = new Map<number, Map<string, number>>(); // table id → code → symbol
  let lumaComponent = -1;
  let lumaQuantId = -1;
  let lumaTable = -1;
  let i = 2;

  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    const start = i + 4;
    const end = i + 2 + length;

    if (marker === 0xdb) {
      for (let p = start; p < end; ) {
        const precision = bytes[p] >> 4;
        const id = bytes[p] & 0x0f;
        quant.set(id, precision ? (bytes[p + 1] << 8) | bytes[p + 2] : bytes[p + 1]);
        p += 1 + 64 * (precision ? 2 : 1);
      }
    } else if (marker === 0xc0 || marker === 0xc1) {
      // First component of a JFIF baseline image is luminance. Its quantization
      // table may be defined after this marker (Apple's encoder does), so keep the id.
      lumaComponent = bytes[start + 6];
      lumaQuantId = bytes[start + 8];
    } else if (marker === 0xc4) {
      for (let p = start; p < end; ) {
        const tableClass = bytes[p] >> 4;
        const id = bytes[p] & 0x0f;
        const counts = bytes.subarray(p + 1, p + 17);
        let symbolIndex = p + 17;
        const table = new Map<string, number>();
        let code = 0;
        for (let len = 1; len <= 16; len += 1) {
          for (let k = 0; k < counts[len - 1]; k += 1) {
            table.set(`${len}:${code}`, bytes[symbolIndex]);
            symbolIndex += 1;
            code += 1;
          }
          code <<= 1;
        }
        if (tableClass === 0) dcTables.set(id, table);
        p = symbolIndex;
      }
    } else if (marker === 0xda) {
      const count = bytes[start];
      for (let k = 0; k < count; k += 1) {
        if (bytes[start + 1 + k * 2] === lumaComponent) lumaTable = bytes[start + 2 + k * 2] >> 4;
      }
      const table = dcTables.get(lumaTable);
      const lumaQuant = quant.get(lumaQuantId);
      if (!table || !lumaQuant) return null;
      return decodeFirstDc(bytes, end, table, lumaQuant);
    } else if (marker === 0xc2) {
      return null; // progressive JPEGs are not expected from the encoder
    }
    i = end;
  }
  return null;
}

function decodeFirstDc(bytes: Uint8Array, offset: number, table: Map<string, number>, quantizer: number): number | null {
  let pos = offset;
  let bitBuffer = 0;
  let bitCount = 0;
  const readBit = () => {
    if (bitCount === 0) {
      let byte = bytes[pos++];
      if (byte === 0xff) pos += 1; // skip stuffed 0x00
      if (byte === undefined) byte = 0;
      bitBuffer = byte;
      bitCount = 8;
    }
    bitCount -= 1;
    return (bitBuffer >> bitCount) & 1;
  };

  let code = 0;
  let size: number | undefined;
  for (let len = 1; len <= 16 && size === undefined; len += 1) {
    code = (code << 1) | readBit();
    size = table.get(`${len}:${code}`);
  }
  if (size === undefined) return null;

  let diff = 0;
  for (let k = 0; k < size; k += 1) diff = (diff << 1) | readBit();
  if (size > 0 && diff < 1 << (size - 1)) diff -= (1 << size) - 1;

  // DC coefficient = 8 × (mean − 128) in JPEG's level-shifted space.
  const mean = (diff * quantizer) / 8 + 128;
  return Math.max(0, Math.min(255, mean));
}
