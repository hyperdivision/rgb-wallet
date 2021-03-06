const assert = require('assert')
const secp256k1 = require('secp256k1')
const crypto = require('crypto')
const base58 = require('bs58')
const sodium = require('sodium-native')

module.exports = {
  tweakAddress,
  generateBTCAddress,
  payToContract
}

function tweakAddress (publicKey, data, tag, network) {
  assert(Buffer.isBuffer(publicKey), 'Public key must be given as buffer')
  if (tag === 'contract'  || tag === 'proof') {
    // TODO -> should this be BTC consensus encoded?
    tag = Buffer.from('rgb:' + tag)
  } else {
    throw new Error('Tag must be either contract or proof')
  }

  //set up buffers for hash
  const commitement = Buffer.alloc(32)
  let dataHash = Buffer.alloc(32)
  const tagHash = Buffer.alloc(32)

  sodium.crypto_hash_sha256(dataHash, data)
  sodium.crypto_hash_sha256(tagHash, tag)

  // format data to be committed to according to Taproot BIP
  const toHash = Buffer.concat([tagHash, tagHash, publicKey, dataHash])
  sodium.crypto_hash_sha256(commitement, toHash)

  // tweakedKey = originalKey + (commitmentHash * G)
  const tweakedPK = secp256k1.publicKeyTweakAdd(publicKey, commitement)
  const tweakedAddress = generateBTCAddress(tweakedPK, network)

  return tweakedAddress
}

function generateBTCAddress (publicKey, network) {
  if (typeof publicKey === 'string', publicKey = Buffer.from(publicKey, 'hex'))
  assert(Buffer.isBuffer(publicKey), 'public key must be passed as raw bytes or a hex string')
  assert(publicKey.byteLength === 33, 'public key must be 32 bytes')

  const shaResult = Buffer.alloc(32)
  const ripemd160 = crypto.createHash('ripemd160')

  // first round SHA256
  sodium.crypto_hash_sha256(shaResult, publicKey)

  // compute RIPEMD160 of SHA result
  const digest = ripemd160.update(shaResult).digest('hex')
  let extendedDigest = ''

  // prefix version byte
  switch (network) {
    case 'regtest': case 'testnet' :
      extendedDigest = '6f' + digest
      break

    case 'mainnet' :
      extendedDigest = '00' + digest
      break
  }

  // perform SHA256d of extended digest
  sodium.crypto_hash_sha256(shaResult, Buffer.from(extendedDigest, 'hex'))
  sodium.crypto_hash_sha256(shaResult, shaResult)

  // append first 4 bytes of SHAd result as checksum
  extendedDigest += shaResult.toString('hex').slice(0, 8)

  // base58 encode result
  const address = base58.encode(Buffer.from(extendedDigest, 'hex'))
  return address
}


function payToContract (amount, commitment, PK, tag, network) {
  // find output and replace with the tweaked output
  const tweakedOutput = {}
  const tweakedAddress = tweakAddress(PK, commitment, tag, network)
  tweakedOutput[tweakedAddress] = parseFloat(amount.toFixed(8))

  return tweakedOutput
}
