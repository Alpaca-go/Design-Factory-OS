import test from 'node:test';
import assert from 'node:assert/strict';
import { imageMetadata, parsePdf, parsePresentation, parseZip } from '../src/parsers.js';

function storedZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, value] of Object.entries(files)) {
    const filename = Buffer.from(name);
    const data = Buffer.from(value);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, filename);
    offset += local.length + filename.length + data.length;
  }
  const centralData = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralData.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralData, eocd]);
}

test('读取 PNG 尺寸', () => {
  const buffer = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(buffer);
  buffer.writeUInt32BE(640, 16);
  buffer.writeUInt32BE(480, 20);
  assert.deepEqual(imageMetadata(buffer, '.png'), { width: 640, height: 480, format: 'PNG' });
});

test('统计 PDF 页面和元数据', () => {
  const pdf = Buffer.from('%PDF-1.4 /Title (Brand Guide) /Type /Page /Type /Pages /Type /Page', 'latin1');
  const result = parsePdf(pdf);
  assert.equal(result.pages, 2);
  assert.equal(result.metadata.title, 'Brand Guide');
});

test('读取 ZIP 中央目录', () => {
  const zip = parseZip(storedZip({ '素材/logo.svg': '<svg/>', '说明.txt': 'hello' }));
  assert.deepEqual(zip.entries.map((x) => x.name), ['素材/logo.svg', '说明.txt']);
  assert.equal(zip.readEntry(zip.entries[1]).toString(), 'hello');
});

test('读取 PPTX 幻灯片、主题色和字体', () => {
  const pptx = storedZip({
    'ppt/slides/slide1.xml': '<p:sld><a:t>品牌介绍</a:t><a:srgbClr val="8B1E2D"/></p:sld>',
    'ppt/slides/slide2.xml': '<p:sld><a:t>包装方案</a:t></p:sld>',
    'ppt/theme/theme1.xml': '<a:theme><a:latin typeface="Aptos"/><a:srgbClr val="D8B36A"/></a:theme>'
  });
  const result = parsePresentation(pptx);
  assert.equal(result.slides, 2);
  assert.match(result.text, /品牌介绍/);
  assert.deepEqual(result.colors, ['#8B1E2D', '#D8B36A']);
  assert.deepEqual(result.fonts, ['Aptos']);
});
