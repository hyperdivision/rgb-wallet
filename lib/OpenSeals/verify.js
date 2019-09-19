const keys = require('../key-utils.js')
const rgb = require('../../../rgb-encoding/index.js')

async function whichUTXOs (proofHistory, proof, client) {
  // strategy -> for each seal in proof
  // 1) check they are unspent
  // 2) check which proof is next by cross referencing tx.vin with sealsByProof
  // 3) repeat
  const roots = indexRootProofs(proofHistory)
  let returnProof
  let sealed
  const sealsByProof = proofHistory.map((proof) => proof.seals.map((seal) => seal.outpoint))
  for (let seal of proof.seals) {
    const txid = seal.outpoint.split(':')[0]

    const index = await (client.getRawTransaction(txid, true).then(findProof(sealsByProof)))
    if (index == undefined) continue

    returnProof = proofHistory[index]

    sealed = pruneUnsealed(sealsByProof[index], client)
  }
  return {
    returnProof,
    sealed
  }
  // we now have the next proof to look at:
  // check proof etc
  // use findSpendingTx to repeat processz
}


// MOCK FLOW:
async function checkProof (proofHistory, proof, client) {
  const roots = indexRootProofs(proofHistory)
  const tweaks = tweaksByProof(proofHistory)
  const assets = {}
  let remainingProofs = proofHistory.length
  for (let root of roots) {
    const level = 0
    const rootProof = proofHistory[root]

    const asset = rootProof.fields.ticker
    assets[asset] = assets[asset] || []

    walkProofs(rootProof.seals, level).then(() => {
      ///////////////////////////
      console.log(assets)
      ////////////////////////////
    })

    async function walkProofs (seals, level) {
      for (let seal of seals) {
        // look for tx spending this seal, this contains commitment to next proof
        const proofIndex = await findSpendingTx(client, seal.outpoint)

        // identify next proof by matching to expected commitment
        // commitment position will eventually be deterministic so we always know where to look
          .then(findTweak(tweaks))
          .catch((err) => console.log(err))

        // subsequent proof cannot be found, seal does not contribute to current state
        if (proofIndex === null) continue

        assets[asset][level] = assets[asset][level] || []
        console.log(seal.amount)
        assets[asset][level].push(seal.amount)

        const nextProof = proofHistory[proofIndex]
        remainingProofs--
        level++
   
        walkProofs(nextProof.seals, level)
      }
    }
  }

  if (remainingProofs !== 1) throw new Error('invalid structure - only one leading proof allowed')
  return assets
}

// function finds root proofs in given proof history and returns their index positions
function indexRootProofs(proofHistory) {
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
    const encodedProof = rgb.proof.encode(proof, test)
    const publicKey = Buffer.from(proof.pubkey, 'hex')
    const tweakedAddress = keys.tweakAddress(publicKey, encodedProof, 'proof', proof.network)
    return tweakedAddress
  })
}

// function to identify tweaked outout in a seal and link tx to a proof
function findTweak (tweaks) {
  return (tx) => {
    const outputAddresses = tx.vout.map((vout) => vout.scriptPubKey.addresses)
    for (let address of outputAddresses) {
      console.log(address)
      const index = tweaks.findIndex((tweak) => address.includes(tweak))
      if (index !== -1) return index
    }
    return null
  }
}


// finds the tx that spent a certain utxo
async function findSpendingTx (client, spent) {
  const find = {
    txid: spent.split(':')[0],
    vout: parseInt(spent.split(':')[1])
  }
  const blockHeight = await client.getBlockCount()

  for (let i = 1; i <= blockHeight; i++) {
    const blockHash = await client.getBlockHash(i)
    const blockInfo = await client.getBlock(blockHash)
    
    for (let txid of blockInfo.tx) {
      const tx = await client.getRawTransaction(txid, 1, blockHash)
      if (tx.vin.findIndex((vin) => vin.txid === find.txid && vin.vout === find.vout) !== -1) {
        return client.getRawTransaction(txid, true)
      }
    }
  }

  return client.getTxOut(find.txid, find.vout)
}
// 75ec15d6f097af2a5795c9e77607494d61b2e8b7b3a876e9e877244a20c1730c
module.exports = checkProof

const test = {
  name: 'RGB',
  version: '1.0.0',
  prevSchema: 0,
  fieldTypes: [
    { title: 'ver', type: 'u8' },
    { title: 'schema', type: 'sha256' },
    { title: 'ticker', type: 'str' },
    { title: 'title', type: 'str' },
    { title: 'description', type: 'str' },
    { title: 'url', type: 'str' },
    { title: 'max_supply', type: 'fvi' },
    { title: 'dust_limit', type: 'vi' },
    { title: 'signature', type: 'ecdsa'}
  ],
  sealTypes: [
    { title: 'assets', 
      type: {
        'ticker': 'str',
        'amount': 'vi'
      }
    },
    { title: 'inflation', type: 'none' },
    { title: 'upgrade', type: 'none' },
    { title: 'pruning', type: 'none' }
  ],
  proofTypes: [
    {
      name: 'primary_issue',
      fields: [
        { title: 'ticker', value: 'optional' },
        { title: 'title', value: 'optional' },
        { title: 'description', value: 'optional' },
        { title: 'url', value: 'optional' },
        { title: 'max_supply', value: 'optional' },
        { title: 'dust_limit', value: 'single' },
        { title: 'signature', value: 'optional' }
      ],
      seals: [
        { title: 'assets', value: 'many' },
        { title: 'inflation', value: 'optional' },
        { title: 'upgrade', value: 'single' },
        { title: 'pruning', value: 'single' }
      ]
    },
    { 
      name: 'secondary_issue',
      unseals: [
        { title: 'inflation', value: 'single' }
      ],
      fields: [
        { title: 'url', value: 'optional' },
        { title: 'signature', value: 'optional' }
      ],
      seals: [
        { title: 'assets', value: 'many' },
        { title: 'inflation', value: 'optional' },
        { title: 'pruning', value: 'single' }
      ]
    },
    {
      name: 'upgrade_signal',
      unseals: [
        { title: 'upgrade', value: 'single' },
      ],
      fields: [
        { title: 'ver', value: 'single' },
        { title: 'schema', value: 'optional' },
        { title: 'signature', value: 'optional' },
      ],
      seals: [
        { title: 'upgrade', value: 'single' }
      ]
    },
    {
      name: 'history_prune',
      unseals: [
        { title: 'pruning', value: 'single' }
      ],
      fields: [],
      seals: [
        { title: 'assets', value: 'many' },
        { title: 'pruning', value: 'single' }
      ]
    },
    {
      name: 'asset_transfer',
      unseals: [
        { title: 'assets', value: 'many' }
      ],
      fields: [
        { title: 'ver', value: 'optional' }
      ],
      seals: [
        { title: 'assets', value: 'any' }
      ]
    }
  ]
}


const testProof = {
  ver: 1,
  format: 'root',
  schema: 'sm1m3pkuxxyl0rp3e6drhlhw40f8uhg0xx9qem57jq32dhxmzzfgvpsgvqvjw',
  network: 'testnet',
  root: '5700bdccfc6209a5460dc124403eed6c3f5ba58da0123b392ab0b1fa23306f27:4',
  type: 'primary_issue',
  fields: {
    title: 'Private Company Ltd Shares',
    ticker: 'PLS',
    dust_limit: 1
  },
  seals: [
    {
      type: 'assets',
      outpoint: '87175857779401d041ad28d31724ed2c317f412e2bd528663403b7e3347d4de8:0',
      ticker: 'PLS',
      amount: 1000000
    },
    {
      type: 'inflation',
      outpoint: '4f5e9fc6e98b85003258e1c9f4ca061affeff966fbe15dc306fd688c5e9eaeb5:1'
    },
    {
      type: 'upgrade',
      outpoint: '8a4e0ec386f63bc8ef6630452a4f872b073a1b12525ca9bde2b0a54859157357:3'
    },
    {
      type: 'pruning',
      outpoint: 'aea48039c4db6fdc46fe767ee9a0d00896142a0e8e388098707382febc3dbb0c:2'
    }
  ],
  pubkey: '0262b06cb205c3de54717e0bc0eab2088b0edb9b63fab499f6cac87548ca205be1'
}