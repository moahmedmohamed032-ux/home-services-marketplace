// Checks that a base64 data URL really is the image type it claims (magic bytes), not just a matching prefix.
module.exports = function imageSigOk(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/s.exec(String(dataUrl));
  if (!m) return false;
  const head = Buffer.from(m[2].slice(0, 24), 'base64');
  if (m[1] === 'jpeg') return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (m[1] === 'png') return head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP';
};
