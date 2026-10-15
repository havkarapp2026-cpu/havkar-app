const GF_EXP = new Array(512);
const GF_LOG = new Array(256);
let fieldReady = false;

function initField() {
  if (fieldReady) {
    return;
  }

  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = value;
    GF_LOG[value] = i;
    value <<= 1;
    if (value & 0x100) {
      value ^= 0x11d;
    }
  }

  for (let i = 255; i < 512; i += 1) {
    GF_EXP[i] = GF_EXP[i - 255];
  }

  fieldReady = true;
}

function multiply(left, right) {
  if (left === 0 || right === 0) {
    return 0;
  }

  return GF_EXP[GF_LOG[left] + GF_LOG[right]];
}

function eccFor(data, count) {
  initField();
  let generator = [1];

  for (let i = 0; i < count; i += 1) {
    const next = new Array(generator.length + 1).fill(0);
    for (let j = 0; j < generator.length; j += 1) {
      next[j] ^= generator[j];
      next[j + 1] ^= multiply(generator[j], GF_EXP[i]);
    }
    generator = next;
  }

  const output = data.concat(new Array(count).fill(0));
  for (let i = 0; i < data.length; i += 1) {
    const coefficient = output[i];
    if (coefficient === 0) {
      continue;
    }
    for (let j = 0; j < generator.length; j += 1) {
      output[i + j] ^= multiply(generator[j], coefficient);
    }
  }

  return output.slice(data.length);
}

const VERSIONS = Object.freeze([
  null,
  { ecc: 10, groups: [[1, 16]] },
  { ecc: 16, groups: [[1, 28]] },
  { ecc: 26, groups: [[1, 44]] },
  { ecc: 18, groups: [[2, 32]] },
  { ecc: 24, groups: [[2, 43]] },
  { ecc: 16, groups: [[4, 27]] },
  { ecc: 18, groups: [[4, 31]] },
  { ecc: 22, groups: [[2, 38], [2, 39]] },
  { ecc: 22, groups: [[3, 36], [2, 37]] },
  { ecc: 26, groups: [[4, 43], [1, 44]] }
]);

const ALIGNMENT = Object.freeze([
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50]
]);

function dataCodewords(version) {
  return VERSIONS[version].groups.reduce((sum, group) => sum + group[0] * group[1], 0);
}

function countBits(version) {
  return version <= 9 ? 8 : 16;
}

function bytesOf(text) {
  return Array.from(new TextEncoder().encode(String(text)));
}

function chooseVersion(payload) {
  for (let version = 1; version <= 10; version += 1) {
    const header = 4 + countBits(version);
    const capacity = dataCodewords(version) * 8;
    if (header + payload.length * 8 <= capacity) {
      return version;
    }
  }

  return 0;
}

function packBits(payload, version) {
  const bits = [];
  const push = (value, width) => {
    for (let shift = width - 1; shift >= 0; shift -= 1) {
      bits.push((value >>> shift) & 1);
    }
  };

  push(0b0100, 4);
  push(payload.length, countBits(version));
  for (const byte of payload) {
    push(byte, 8);
  }

  const capacity = dataCodewords(version) * 8;
  const terminator = Math.min(4, capacity - bits.length);
  for (let i = 0; i < terminator; i += 1) {
    bits.push(0);
  }
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      byte = (byte << 1) | bits[i + bit];
    }
    bytes.push(byte);
  }

  const pads = [0xec, 0x11];
  let pad = 0;
  while (bytes.length < dataCodewords(version)) {
    bytes.push(pads[pad]);
    pad ^= 1;
  }

  return bytes;
}

function blocksFor(bytes, version) {
  const blocks = [];
  let offset = 0;

  for (const [count, length] of VERSIONS[version].groups) {
    for (let index = 0; index < count; index += 1) {
      const data = bytes.slice(offset, offset + length);
      offset += length;
      blocks.push({ data, ecc: eccFor(data, VERSIONS[version].ecc) });
    }
  }

  const output = [];
  const longest = Math.max(...blocks.map((block) => block.data.length));
  for (let index = 0; index < longest; index += 1) {
    for (const block of blocks) {
      if (index < block.data.length) {
        output.push(block.data[index]);
      }
    }
  }
  for (let index = 0; index < VERSIONS[version].ecc; index += 1) {
    for (const block of blocks) {
      output.push(block.ecc[index]);
    }
  }

  return output;
}

function formatBits(mask) {
  let bits = mask << 10;
  for (let shift = 14; shift >= 10; shift -= 1) {
    if ((bits >>> shift) & 1) {
      bits ^= 0x537 << (shift - 10);
    }
  }
  return ((mask << 10) | (bits & 0x3ff)) ^ 0x5412;
}

function versionBits(version) {
  let bits = version << 12;
  for (let shift = 17; shift >= 12; shift -= 1) {
    if ((bits >>> shift) & 1) {
      bits ^= 0x1f25 << (shift - 12);
    }
  }
  return (version << 12) | (bits & 0xfff);
}

function emptyMatrix(size) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => ({ dark: false, fn: false })));
}

function paint(matrix, row, col, dark) {
  if (row >= 0 && col >= 0 && row < matrix.length && col < matrix.length) {
    matrix[row][col] = { dark, fn: true };
  }
}

function drawFinder(matrix, row, col) {
  for (let y = -1; y <= 7; y += 1) {
    for (let x = -1; x <= 7; x += 1) {
      const inside = x >= 0 && x <= 6 && y >= 0 && y <= 6;
      const dark = inside && (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
      paint(matrix, row + y, col + x, dark);
    }
  }
}

function drawAlignment(matrix, row, col) {
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      paint(matrix, row + y, col + x, Math.max(Math.abs(x), Math.abs(y)) !== 1);
    }
  }
}

function reserveFormat(matrix) {
  const size = matrix.length;
  for (let index = 0; index < 8; index += 1) {
    paint(matrix, 8, index + (index > 5 ? 1 : 0), false);
    paint(matrix, index + (index > 5 ? 1 : 0), 8, false);
  }
  for (let index = 0; index < 8; index += 1) {
    paint(matrix, 8, size - 1 - index, false);
    paint(matrix, size - 1 - index, 8, false);
  }
  paint(matrix, 8, 8, false);
}

function drawFormat(matrix, mask) {
  const size = matrix.length;
  const bits = formatBits(mask);
  const bit = (index) => ((bits >>> (14 - index)) & 1) === 1;
  for (let index = 0; index <= 5; index += 1) {
    paint(matrix, 8, index, bit(index));
  }
  paint(matrix, 8, 7, bit(6));
  paint(matrix, 8, 8, bit(7));
  paint(matrix, 7, 8, bit(8));
  for (let index = 9; index < 15; index += 1) {
    paint(matrix, 14 - index, 8, bit(index));
  }
  for (let index = 0; index < 8; index += 1) {
    paint(matrix, size - 1 - index, 8, bit(index));
  }
  for (let index = 8; index < 15; index += 1) {
    paint(matrix, 8, size - 15 + index, bit(index));
  }
  paint(matrix, 8, size - 8, bit(7));
  paint(matrix, size - 8, 8, true);
}

function drawVersion(matrix, version) {
  if (version < 7) {
    return;
  }
  const size = matrix.length;
  const bits = versionBits(version);
  for (let index = 0; index < 18; index += 1) {
    const dark = ((bits >>> index) & 1) === 1;
    const row = Math.floor(index / 3);
    const col = size - 11 + (index % 3);
    paint(matrix, row, col, dark);
    paint(matrix, col, row, dark);
  }
}

function functionMatrix(version) {
  const size = 17 + 4 * version;
  const matrix = emptyMatrix(size);
  drawFinder(matrix, 0, 0);
  drawFinder(matrix, 0, size - 7);
  drawFinder(matrix, size - 7, 0);

  const centers = ALIGNMENT[version];
  for (const row of centers) {
    for (const col of centers) {
      if (matrix[row][col].fn) {
        continue;
      }
      drawAlignment(matrix, row, col);
    }
  }

  for (let index = 0; index < size; index += 1) {
    if (!matrix[6][index].fn) {
      paint(matrix, 6, index, index % 2 === 0);
    }
    if (!matrix[index][6].fn) {
      paint(matrix, index, 6, index % 2 === 0);
    }
  }

  paint(matrix, size - 8, 8, true);
  reserveFormat(matrix);
  if (version >= 7) {
    for (let index = 0; index < 18; index += 1) {
      const row = Math.floor(index / 3);
      const col = size - 11 + (index % 3);
      paint(matrix, row, col, false);
      paint(matrix, col, row, false);
    }
  }

  return matrix;
}

function placeData(matrix, codewords) {
  const size = matrix.length;
  let index = 0;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right = 5;
    }
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let shift = 0; shift < 2; shift += 1) {
        const col = right - shift;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vertical : vertical;
        if (matrix[row][col].fn || index >= codewords.length * 8) {
          continue;
        }
        const byte = codewords[index >>> 3];
        matrix[row][col].dark = ((byte >>> (7 - (index & 7))) & 1) === 1;
        index += 1;
      }
    }
  }
}

function maskBit(mask, row, col) {
  switch (mask) {
    case 0: return ((row + col) & 1) === 0;
    case 1: return (row & 1) === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
}

function applyMask(matrix, mask) {
  const copy = matrix.map((row) => row.map((cell) => ({ ...cell })));
  for (let row = 0; row < copy.length; row += 1) {
    for (let col = 0; col < copy.length; col += 1) {
      if (!copy[row][col].fn && maskBit(mask, row, col)) {
        copy[row][col].dark = !copy[row][col].dark;
      }
    }
  }
  drawFormat(copy, mask);
  return copy;
}

function penalty(matrix) {
  const size = matrix.length;
  const darkAt = (row, col) => matrix[row][col].dark;
  let score = 0;

  function runs(read) {
    for (let major = 0; major < size; major += 1) {
      let color = false;
      let length = 0;
      for (let minor = 0; minor < size; minor += 1) {
        const value = read(major, minor);
        if (minor > 0 && value === color) {
          length += 1;
          if (length === 5) {
            score += 3;
          } else if (length > 5) {
            score += 1;
          }
        } else {
          color = value;
          length = 1;
        }
      }
    }
  }

  runs((row, col) => darkAt(row, col));
  runs((col, row) => darkAt(row, col));

  for (let row = 0; row < size - 1; row += 1) {
    for (let col = 0; col < size - 1; col += 1) {
      const color = darkAt(row, col);
      if (color === darkAt(row, col + 1) && color === darkAt(row + 1, col) && color === darkAt(row + 1, col + 1)) {
        score += 3;
      }
    }
  }

  function finderLike(read) {
    for (let major = 0; major < size; major += 1) {
      const bits = [];
      for (let minor = 0; minor < size; minor += 1) {
        bits.push(read(major, minor) ? 1 : 0);
      }
      const line = bits.join("");
      const patterns = ["10111010000", "00001011101"];
      for (const pattern of patterns) {
        let from = 0;
        while (from <= line.length - pattern.length) {
          const found = line.indexOf(pattern, from);
          if (found === -1) {
            break;
          }
          score += 40;
          from = found + 1;
        }
      }
    }
  }

  finderLike((row, col) => darkAt(row, col));
  finderLike((col, row) => darkAt(row, col));

  let dark = 0;
  for (const row of matrix) {
    for (const cell of row) {
      if (cell.dark) {
        dark += 1;
      }
    }
  }
  score += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  return score;
}

function qrMatrix(text, options) {
  const payload = bytesOf(text);
  if (payload.length < 1) {
    throw new Error("QR content is empty.");
  }

  const version = chooseVersion(payload);
  if (!version) {
    throw new Error("QR content is too long.");
  }

  const base = functionMatrix(version);
  placeData(base, blocksFor(packBits(payload, version), version));
  drawVersion(base, version);

  const forced = options && Number.isInteger(options.mask) ? options.mask : null;
  let best = null;
  let bestScore = Infinity;
  const first = forced === null ? 0 : forced;
  const last = forced === null ? 7 : forced;
  for (let mask = first; mask <= last; mask += 1) {
    const candidate = applyMask(base, mask);
    const score = penalty(candidate);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best.map((row) => row.map((cell) => (cell.dark ? 1 : 0)));
}

function qrSvg(text, options) {
  const matrix = qrMatrix(text);
  const cell = options && options.cell ? options.cell : 4;
  const quiet = 4;
  const size = (matrix.length + quiet * 2) * cell;
  const color = options && /^#[0-9a-fA-F]{6}$/.test(options.color) ? options.color : "#2e7d32";
  const rects = [];

  for (let row = 0; row < matrix.length; row += 1) {
    for (let col = 0; col < matrix.length; col += 1) {
      if (matrix[row][col]) {
        rects.push(
          '<rect x="' + ((col + quiet) * cell) +
          '" y="' + ((row + quiet) * cell) +
          '" width="' + cell + '" height="' + cell + '"/>'
        );
      }
    }
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + " " + size +
    '" width="' + size + '" height="' + size + '" role="img" aria-label="QR code">' +
    '<rect width="100%" height="100%" fill="#ffffff"/>' +
    '<g fill="' + color + '">' + rects.join("") + "</g></svg>";
}

export { qrMatrix, qrSvg };
