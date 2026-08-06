// 生成 1024x1024 应用图标 PNG（蓝色底 + 白色 M），供 tauri icon 转换全平台图标
import zlib from 'zlib';
import fs from 'fs';

const W = 1024, H = 1024;
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  const row = y * (1 + W * 4);
  raw[row] = 0; // filter none
  for (let x = 0; x < W; x++) {
    const i = row + 1 + x * 4;
    const cx = x - 512, cy = y - 512;
    // 简化 M 形：中间竖条 + 两条对称斜杠
    const inM = Math.abs(cx) < 70 || (cy < 60 && Math.abs(cx - (Math.abs(cy) * 0.55)) < 38) || (cy < 60 && Math.abs(cx + (Math.abs(cy) * 0.55)) < 38);
    if (inM) { raw[i] = 255; raw[i + 1] = 255; raw[i + 2] = 255; raw[i + 3] = 255; }
    else { raw[i] = 0x18; raw[i + 1] = 0x5f; raw[i + 2] = 0xa5; raw[i + 3] = 255; }
  }
}

const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
};

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const idat = zlib.deflateSync(raw);
fs.writeFileSync('source-icon.png', Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote source-icon.png');
