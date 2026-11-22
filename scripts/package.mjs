#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const VALID_TARGETS = ['chrome', 'edge', 'firefox', 'whale'];

const INCLUDE_TOP_FILES = ['LICENSE', 'PRIVACY.md', 'README.md'];
const INCLUDE_ICONS = [
  'icons/icon-16.png',
  'icons/icon-32.png',
  'icons/icon-48.png',
  'icons/icon-128.png'
];
const INCLUDE_DATA = ['data/koreaVariants.json'];

// Precompute CRC-32 table for deterministic pure-Node PKZIP generation
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosTimeDate(date) {
  const d = date instanceof Date ? date : new Date();
  const year = Math.max(1980, d.getFullYear());
  const dosTime =
    ((d.getHours() & 0x1f) << 11) |
    ((d.getMinutes() & 0x3f) << 5) |
    ((d.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((d.getMonth() + 1) & 0x0f) << 5) |
    (d.getDate() & 0x1f);
  return { dosTime, dosDate };
}

function createZipBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const fixedDate = new Date('2026-01-01T00:00:00Z');
  const { dosTime, dosDate } = toDosTimeDate(fixedDate);

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
    const rawData = entry.data;
    const compressed = zlib.deflateRawSync(rawData, { level: 9 });
    const useDeflate = compressed.length < rawData.length;
    const method = useDeflate ? 8 : 0;
    const payload = useDeflate ? compressed : rawData;
    const crc = crc32(rawData);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(rawData.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 filename flag
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(rawData.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

function collectFilesRecursively(relDir) {
  const absDir = path.join(ROOT_DIR, relDir);
  const results = [];
  if (!fs.existsSync(absDir)) return results;

  for (const item of fs.readdirSync(absDir, { withFileTypes: true })) {
    const relPath = path.posix.join(relDir.replace(/\\/g, '/'), item.name);
    if (item.isDirectory()) {
      results.push(...collectFilesRecursively(relPath));
    } else if (item.isFile()) {
      results.push(relPath);
    }
  }
  return results;
}

export function buildTargetManifest(baseManifest, target) {
  const manifest = JSON.parse(JSON.stringify(baseManifest));

  if (target === 'firefox') {
    manifest.background = {
      scripts: [
        'src/shared/constants.js',
        'src/shared/storage.js',
        'src/background/serviceWorker.js'
      ]
    };
    manifest.browser_specific_settings = {
      gecko: {
        id: 'korea-finder@astraleud.github.io',
        strict_min_version: '109.0'
      }
    };
  }

  return manifest;
}

function gatherRuntimeEntries(manifest) {
  const filePaths = [
    ...INCLUDE_TOP_FILES,
    ...INCLUDE_ICONS,
    ...INCLUDE_DATA,
    ...collectFilesRecursively('src')
  ].sort();

  const entries = [
    {
      name: 'manifest.json',
      data: Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    }
  ];

  for (const relPath of filePaths) {
    const absPath = path.join(ROOT_DIR, relPath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Missing runtime file: ${relPath}`);
    }
    entries.push({
      name: relPath.replace(/\\/g, '/'),
      data: fs.readFileSync(absPath)
    });
  }

  return entries;
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

export function packageTargets(requestedTargets = ['all']) {
  const baseManifest = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, 'manifest.json'), 'utf8')
  );
  const version = baseManifest.version;

  const targets =
    requestedTargets.includes('all') || requestedTargets.length === 0
      ? VALID_TARGETS
      : requestedTargets;

  for (const t of targets) {
    if (!VALID_TARGETS.includes(t)) {
      throw new Error(`Unknown package target "${t}". Allowed: ${VALID_TARGETS.join(', ')}, all`);
    }
  }

  fs.mkdirSync(DIST_DIR, { recursive: true });

  const artifacts = [];
  for (const target of targets) {
    const manifest = buildTargetManifest(baseManifest, target);
    const entries = gatherRuntimeEntries(manifest);
    const zipBuffer = createZipBuffer(entries);

    const zipName = `korea-finder-v${version}-${target}.zip`;
    const zipPath = path.join(DIST_DIR, zipName);
    fs.writeFileSync(zipPath, zipBuffer);
    artifacts.push({ target, file: zipName, path: zipPath, bytes: zipBuffer.length });

    if (target === 'firefox') {
      const xpiName = `korea-finder-v${version}-firefox.xpi`;
      const xpiPath = path.join(DIST_DIR, xpiName);
      fs.writeFileSync(xpiPath, zipBuffer);
      artifacts.push({ target: 'firefox-xpi', file: xpiName, path: xpiPath, bytes: zipBuffer.length });
    }
  }

  const checksumLines = artifacts.map(
    (a) => `${sha256File(a.path)}  ${a.file}`
  );
  const checksumPath = path.join(DIST_DIR, 'SHA256SUMS.txt');
  fs.writeFileSync(checksumPath, checksumLines.join('\n') + '\n', 'utf8');

  return { version, artifacts, checksumPath };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  const args = process.argv.slice(2);
  const result = packageTargets(args);
  console.log(`Packaged Korea Finder v${result.version}:`);
  for (const a of result.artifacts) {
    console.log(`  - ${a.file} (${(a.bytes / 1024).toFixed(1)} KB)`);
  }
  console.log(`  - ${path.basename(result.checksumPath)}`);
}
