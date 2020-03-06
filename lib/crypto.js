const crypto = require('crypto')
const assert = require('nanoassert')
const bech32 = require('bech32')

module.exports = {
  doubleSha256,
  toBech32,
  shasum
}

function toBech32 (prefix, data) {
  return bech32.encode(prefix, bech32.toWords(data))
}

function doubleSha256 (data) {
  return shasum(shasum(data))
}

function shasum (data) {
  assert(Buffer.isBuffer(data), 'data should be passed as a buffer')
  return crypto.createHash('sha256').update(data).digest()
}
