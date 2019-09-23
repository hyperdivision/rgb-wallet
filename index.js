const Client = require('bitcoin-core')
const { EventEmitter } = require('events')
const { getSealsFrom, getTotalAssets } = require('./lib/get-assets.js')
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

  async init () {
    const unspent = await this.client.listUnspent()
    const { assets, outpoints } = getSealsFrom(this.proofs)

    const sealedOutpoints = []
    for (const outpoint of outpoints) {
      const utxoInfo = unspent.find(utxo =>
        utxo.txid === outpoint.tx && utxo.vout === outpoint.vout)
      if (utxoInfo !== null) sealedOutpoints.push(outpoint)
    }

    this.assets = assets.filter(asset => {
      if (sealedOutpoints.find(s => s.tx === asset.tx && s.vout === asset.vout)) return true
      else return false
    })

    this.utxos = unspent.map(a => {
      const utxo = {
        txid: a.txid,
        vout: a.vout,
        address: a.address,
        amount: a.amount
      }
      return utxo
    })

    this.indexSchema()
  }

  indexSchema () {
    const self = this
    self.schemata = {}
    for (const schema of self.schemas) {
      const encodedSchema = rgb.schema.encode(schema)
      const schemaHash = Buffer.alloc(sodium.crypto_hash_sha256_BYTES)

      sodium.crypto_hash_sha256(schemaHash, encodedSchema)
      sodium.crypto_hash_sha256(schemaHash, schemaHash)

      const schemaId = bech32.encode('sm', bech32.toWords(schemaHash))
      self.schemata[schemaId] = schema
    }
    return self.schemata
  }

  async createRequest (requestedAssets) {
    const requestList = []
    const addresses = await this.generateAddresses(requestedAssets.length)
    requestedAssets.map(request => {
      const formatRequest = {}
      formatRequest.asset = request.asset
      formatRequest.amount = request.amount
      formatRequest.address = addresses.pop()
      requestList.push(formatRequest)
    })
    return requestList
  }

  async createTransferProposal (request) {
    const transferProposal = await this.transfer(request)
    return transferProposal
  }

  async createTxProposal (transferProposal) {
    const txProposal = await this.accept(transferProposal)
    return txProposal
  }

  sortProofs () {
    const proofs = this.proofs
    const proofsByUTXO = {}
    for (const proof of proofs) {
      for (const seal of proof.seals) {
        const outpoint = seal.outpoint
        proofsByUTXO[outpoint] = proof
      }
    }
    return proofsByUTXO
  }

  sortUTXOs (UTXOs) {
    const self = this
    return (UTXOs) => {
      self.utxos = UTXOs.map(a => {
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
    const promise = listUnspent(self.client)
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
      const activeVouts = UTXOs.map(item => `${item.txid}:${item.vout}`)

      const proofs = self.sortProofs(self.proofs)
      for (const outpoint of Object.keys(proofs)) {
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
  async transfer (requests) {
    const self = this
    let assets = Object.entries(requests).map(([key, value]) => {
      if (key === 'asset') return value
    })
    assets = new Set(assets)
    const changeAddresses = await self.generateAddresses(assets.size)
    const inputs = transferAsset(self, requests, changeAddresses)
    return inputs
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
    // for (let proof of Object.values(inputs.proofs)) {
    //   verify.proof(proof)
    // }
    const schemas = new Set(inputs.proofs.map((proof) => proof.schema))
    assert(schemas.size === 1, 'more than one schema present')
    inputs.schemaId = [...schemas][0]
    inputs.schema = self.schemata[inputs.schemaId]

    await self.client.getAddressInfo(inputs.request[0].address).then((info) =>
      inputs.originalPubKey = info.pubkey)
    const output = receiveAsset(inputs, self.utxos, opts)
    const rpc = output.rpc

    // focus here!!!
    console.log(rpc.inputs, rpc.outputs)
    const rawTx = await self.client.createRawTransaction(rpc.inputs, rpc.outputs)
    self.emit('accept', rawTx)

    self.client.decodeRawTransaction(rawTx).then((tx) => {
      // TODO -> deal with this pending tag
      console.log(JSON.stringify(tx, null, 2))
      console.log(tx.vout)
      output.proof.pending = true
      output.proof.txid = tx.txid
      console.log(self.proofs)
      output.proof.vout = 0
      self.proofs.push(output.proof)
    })

    return rawTx
  }

  async broadcastTx (rawTx) {
    const self = this
    console.log(rawTx)
    await (self.client.decodeRawTransaction(rawTx)).catch((err) => console.log(err))
    // .then((tx) => checkTx(tx)))

    self.client.signRawTransactionWithWallet(rawTx)
      .then((tx) => self.client.sendRawTransaction(tx.hex))
  }
}

async function listUnspent (client) {
  return await client.listUnspent()
}

module.exports = RgbWallet
