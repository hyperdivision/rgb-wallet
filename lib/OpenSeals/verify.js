const keys = require('../key-utils.js')
const rgbSchema = require('../../schema.js')
const rgb = require('../../../rgb-encoding/index.js')
const rawHistory = require('./raw.json')

// walk route from root proofs to final proof and sum
// assets at each proof along the way
async function checkProof (proofHistory, finalProof, client) {
  const roots = indexRootProofs(proofHistory)
  const network = proofHistory[roots[0]].network

  for (const proof of proofHistory) {
    proof.network = proof.network || network
    if (proof.network !== network) throw new Error('multiple networks detected')
  }

  const tweaks = tweaksByProof(proofHistory)
  const assets = {}

  let remainingProofs = proofHistory.length - 1
  for (const root of roots) {
    const level = 0
    const rootProof = proofHistory[root]

    const asset = rootProof.fields.ticker
    assets[asset] = assets[asset] || []
    console.log(rootProof.seals)
    await walkProofs(rootProof.seals, asset, level)
  }

  if (remainingProofs !== 0) throw new Error('invalid structure - only one leading proof allowed')
  return assets

  async function walkProofs (seals, asset, level) {
    let remainingSeals = seals.length
    const nextProofs = []

    for (const seal of seals) {
      // look for tx spending this seal, this contains commitment to next proof
      if (remainingProofs === 0) return

      const proofIndex = await findSpendingTx(client, seal)
      // identify next proof by matching to expected commitment
      // commitment position will eventually be deterministic so we always know where to look
        .then(findTweak(tweaks))
        .catch(err => {
          // throw err
          if (err.coinbase !== undefined) return
        })

      // subsequent proof cannot be found, seal does not contribute to current state
      if (proofIndex == null) continue

      if (assets[asset].length <= level) assets[asset].push([])
      assets[asset][level].push(seal.amount)

      nextProofs.push(proofHistory[proofIndex])
    }

    remainingProofs--
    return walkProofs(nextProofs.pop().seals, asset, ++level)
  }
}

// function finds root proofs in given proof history and returns their index positions
function indexRootProofs (proofHistory) {
  const roots = proofHistory.filter((proof) => proof.format === 'root')
  const rootIndexPositions = roots.map((root) =>
    proofHistory.findIndex((proof) => proof === root))
  return rootIndexPositions
}

// given set of seals, function determines which remain sealed.
async function pruneUnsealed (seals, client) {
  const sealed = []
  for (let seal of seals) {
    let [txid, vout] = seal.split(':')
    vout = parseInt(vout)
    client.getTxOut(txid, vout).then((result) => result !== null).then((result) => {
      if (result) sealed.push(seal)
    })
  }

  return sealed
}

// useless -> we work from root down so we already know this
// returns the index of the proof containing a seal that is spent by a given tx
function findProof (proofs) {
  return (tx) => {
    const inputs = tx.vin.map((item) => `${item.txid}:${item.vout}`)
    for (let input of inputs) {
      let index = proofs.findIndex((seals) => seals.includes(input))
      if (index !== -1) return index
    }
  }
}

// list of expected tweaks for a given proof
function tweaksByProof (proofHistory) {
  return proofHistory.map((proof) => {
    if (!proof.pubkey) return -1
    const commitment = { ...proof }
    delete commitment.pubkey
    const encodedProof = rgb.proof.encode(commitment, rgbSchema)
    const publicKey = Buffer.from(proof.pubkey, 'hex')
    const tweakedAddress = keys.tweakAddress(publicKey, encodedProof, 'proof', proof.network)
    return tweakedAddress
  })
}

// function to identify tweaked outout in a seal and link tx to a proof
function findTweak (tweaks) {
  return (tx) => {
    const outputAddresses = tx.vout.map((vout) => vout.scriptPubKey.addresses)
    for (const address of outputAddresses) {
      const index = tweaks.findIndex((tweak) => address.includes(tweak))
      if (index !== -1) return index
    }
    return null
  }
}

// finds the tx that spent a certain utxo
// only start from blockheight of spent.txid
async function findSpendingTx (client, spent) {
  const fullSpent = await client.getRawTransaction(spent.txid, 1)
  const blockHeight = await client.getBlockCount()
  const initialBlock = await client.getBlock(fullSpent.blockhash)

  for (let i = initialBlock.height; i < blockHeight; i++) {
    const blockHash = await client.getBlockHash(i)
    const blockInfo = await client.getBlock(blockHash)

    for (const txid of blockInfo.tx) {
      const tx = await client.getRawTransaction(txid, 1, blockHash)
      if (tx.vin.findIndex(matchUtxo(spent)) !== -1) {
        return client.getRawTransaction(txid, true)
      }
    }
  }
}

function matchUtxo (item) {
  return utxo => utxo.vout === item.vout && utxo.txid === item.txid
}

module.exports = checkProof

const proofHistory = rawHistory.raw.map(raw => {
  const rawBuf = Buffer.from(raw, 'hex')
  return rgb.proof.decode(rawBuf, null, rgbSchema)
})

const Wallet = require('../../index.js')

const rpcInfoNode1 = {
  port: 18443,
  username: 'node',
  password: '12345678',
  network: 'regtest',
  // datadir: '../bitcoind',
  wallet: '2'
}
const opts1 = {
  rpcInfo: rpcInfoNode1
}

const w = new Wallet('test', [proofHistory[0]], [rgbSchema], opts1)

// DONT FORGET: must mine transactions from mempool
// console.log(proofHistory)
checkProof(proofHistory.slice(), proofHistory.slice().pop(), w.chain.client).then(console.log)
