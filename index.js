const Client = require('bitcoin-core')
const { EventEmitter } = require('events')
const getTotalAssets = require('./lib/get-assets.js')
const transferAsset = require('./lib/transfer-asset.js')
const receiveAsset = require('./lib/receive-asset.js')
const rgb = require('../rgb-encoding/index.js')
const sodium = require('sodium-native')
const bech32 = require('bech32')
const assert = require('nanoassert')

class RgbWallet extends EventEmitter {
  constructor (name, proofs, schemas, opts) {
    super()

    this.name = name
    this.proofs = proofs
    this.schemas = schemas
    this.rpcInfo = opts.rpcInfo
 
    this.client = new Client(this.rpcInfo)
    this.assets = null
    this.utxos = null
    this.schemata = null
  }

  sortProofs () {
    const proofs = this.proofs
    const proofsByUTXO = {}
    for (let proof of proofs) {
      for (let seal of proof.seals) {
        let outpoint = seal.outpoint
        proofsByUTXO[outpoint] = proof
      }
    }
    return proofsByUTXO
  }

  indexSchema () {
    const self = this
    self.schemata = {}
    for (let schema of self.schemas) {
      let encodedSchema = rgb.schema.encode(schema)
      let schemaHash = Buffer.alloc(sodium.crypto_hash_sha256_BYTES)

      sodium.crypto_hash_sha256(schemaHash, encodedSchema)
      sodium.crypto_hash_sha256(schemaHash, schemaHash)

      const schemaId = bech32.encode('sm', bech32.toWords(schemaHash))
      self.schemata[schemaId] = schema
    }
    return self.schemata
  }

  sortUTXOs () {
    const self = this
    return (UTXOs) => {
      this.utxos = UTXOs.map(a => {
        const utxo = {
          txid: a.txid,
          vout: a.vout,
          address: a.address,
          amount: a.amount
        }
        return utxo
      })
    }
  }

  update () {
    const self = this
    let promise = listUnspent(self.client)
    self.emit('update', promise)
    return promise
  }

  updateAssets (listUnspent) {
    const self = this
    listUnspent.then(getTotalAssets(self.client, self.proofs))
      .then((assets) => {
        self.assets = assets
        return assets
    })
  }

  updateProofs () {
    const self = this
    return (UTXOs) => {
      let activeVouts = UTXOs.map(item => `${item.txid}:${item.vout}`)

      let proofs = self.sortProofs(self.proofs)
      for (let outpoint of Object.keys(proofs)) {
        if (!activeVouts.includes(outpoint)) delete proofs[outpoint]
      }

      self.proofs = self.proofs.filter((proof) =>
        Object.values(proofs).includes(proof))
      return self.proofs
    }
  }

  async fetchTx (TxID) {
    const self = this
    const result = await self.client.getRawTransaction(TxID)
    var tx = self.client.decodeRawTransaction(result)

    return tx
  }

  // sending party: collect and send necessary parts
  // for paying party to build tx
  transfer (requests) {
    const self = this
    let assets = requests.map((request) => Object.keys(request)[1])
    assets = new Set(assets)
    console.log(assets)
    self.generateAddresses(assets.size).then((changeAddresses) => {
      let inputs = transferAsset(self, requests, changeAddresses)
      self.emit('transfer', inputs)
      return inputs
    })
  }

  async generateAddresses (number) {
    const self = this
    const addresses = []
    for (let i = 0; i < number; i++) {
      await self.client.getNewAddress('', 'legacy').then((address) => addresses.push(address))
    }
    return addresses
  }

  // this is where i am at 15/09/19
  // receiving party: verify and build tx for sending party to publish
  async accept (inputs, opts) {
    const self = this
    // for (let proof of inputs.proofs) {
    //   verify.proof(proof)
    // }

    const schemas = new Set(Object.values(inputs.proofs).map((proof) => proof.schema))

    assert(schemas.size === 1, 'more than one schema present')
    inputs.schemaId = [...schemas][0]
    inputs.schema = self.schemata[inputs.schemaId]

    const output = receiveAsset(inputs, self.utxos, opts)
    const rpc = output.rpc

    const rawTx = await self.client.createRawTransaction(rpc.inputs, rpc.outputs)
    self.emit('accept', rawTx)
    
    self.client.decodeRawTransaction(rawTx).then((tx) => {
      // TODO -> deal with this pending tag
      console.log(JSON.stringify(tx, null, 2))
      output.proof.pending = true
      // self.proofs.push(output.proof)
    })

    return rawTx
  }

  async send (rawTx) {
    const self = this
    await (self.client.decodeRawTransaction(tx.hex)
      .then((tx) => checkTx(tx)))

    self.client.signRawTransactionWithWallet(rawTx)
      .then((tx) => self.client.sendRawTransaction(tx.hex))
  }
}

async function listUnspent (client) {
  return await client.listUnspent()
}

module.exports = RgbWallet
