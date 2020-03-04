const Client = require('bitcoin-core')
const { EventEmitter } = require('events')
const { getSealsFrom, getTotalAssets } = require('./lib/get-assets.js')
const hyperswarm = require('hyperswarm')
const transferAsset = require('./lib/transfer-asset.js')
const receiveAsset = require('./lib/receive-asset.js')
const rgb = require('../rgb-encoding/index.js')
const sodium = require('sodium-native')
const pump = require('pump')
const bech32 = require('bech32')
// const Corestore = require('corestore')
const hypercore = require('hypercore')
const assert = require('nanoassert')
const Regtest = require('bitcoin-test-util')

class RgbWallet extends EventEmitter {
  constructor (name, proofs, schemas, opts) {
    super()

    this.name = name
    this.proofs = proofs
    this.schemas = schemas
    this.rpcInfo = opts.rpcInfo

    this.client = new Client(this.rpcInfo)
    this.assets = null
    this.node = null
    this.utxos = null
    this.schemata = null
    this.storage = null
    this.feeds = {}
  }

  async init () {
    const unspent = await this.client.listUnspent()
    const assetsBySeal = getSealsFrom(this.proofs)

    const sealedOutpoints = []

    for (const seal of assetsBySeal) {
      const utxoInfo = unspent.find(utxo => {
        if (utxo.txid === seal.txid && utxo.vout === seal.vout) {
          return true
        } else return false
      })
      if (utxoInfo !== undefined && seal.txid) {
        sealedOutpoints.push(seal)
      }
    }

    this.node = new Regtest(this.client)
    await this.node.init()
  
    this.assets = assetsBySeal.filter(asset => {
      if (sealedOutpoints.find(s =>
        s.txid === asset.txid && s.vout === asset.vout)) return true
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
    // hyperstorage -> should be in separate module
    // this.storage = Corestore()

    this.indexSchema()
    return this.assets
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
        const outpoint = `${seal.txid}:${seal.vout}`
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

  // TODO async update
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

    await self.client.getAddressInfo(inputs.request[0].address).then(info => {
      inputs.originalPubKey = info.pubkey
    })

    const output = receiveAsset(inputs, self.utxos, opts)
    const rpc = output.rpc
    console.log(JSON.stringify(output, null, 2))

    // focus here!!!
    const rawTx = await self.client.createRawTransaction(rpc.inputs, rpc.outputs)

    self.client.decodeRawTransaction(rawTx).then((tx) => {
      // TODO -> deal with this pending tag
      // console.log(JSON.stringify(tx, null, 2))
      output.proof.pending = true
      output.proof.tweakIndex = output.tweakIndex
      output.proof.assetIndices = []
      for (let i = 0; i < inputs.request.length; i++) {
        if (!inputs.request[i].change) output.proof.assetIndices.push(i)
      }

      self.proofs.push(output.proof)
    })

    return {
      rawTx,
      proof: output.proof
    }
  }

  async approveTransfer (transferProposal) {

  }

  createFeed (assetName, feedKey, cb) {
    const self = this
    assert(assetName, 'asset name must be declared.')

    if (typeof feedKey === 'function') {
      cb = feedKey
      feedKey = null
    }

    const feed = hypercore(`./store/${self.name}/${assetName}`, feedKey, {
      valueEncoding: 'json'
    })

    const swarm = hyperswarm()

    feed.on('ready', () => {
      feed.assetName = assetName
      self.feeds[assetName] = feed

      swarm.join(topicGen(assetName))
      swarm.on('connection', function (socket) {
        pump(socket, feed.replicate(true, {live: true}), socket)
      })

      for (let proof of self.proofs) {
        feed.append(proof)
      }
      
      cb(feed)
    })
  }

  async sync (feed) {
    const self = this

    feed.createReadStream({ live: true })
      .on('data', function (data) {
        // console.log(data)
      })

    const swarm = hyperswarm()

    swarm.join(topicGen(feed.assetName), {
      lookup: true, 
      announce: true
    })

    swarm.on('connection', function (socket, details) {
      console.log('connection')
      pump(socket, feed.replicate(false, { live: true }), socket)
      swarm.leave(topicGen(feed.assetName))
    })
  }

  async appendToFeed (proof, cb) {
    const assetName = proof.fields.title

    const feed = this.feeds[assetName]

    feed.append(proof)
    cb(feed)
  }

  async syncFeeds () {
    for (let feed of this.feeds) {
      sync(feed)
    }
  }

  async approveTx (txProposal) {
    const tx = this.client.decodeRawTransaction(txProposal.rawTx)

    for (const seal of txProposal.proof.seals) {
      if (seal.txid) continue
      seal.txid = tx.txid
    }

    txProposal.proof.tweakedUtxo = {
      txid: tx.txid,
      vout: txProposal.tweakIndex
    }

    txProposal.proof.pending = true

    this.proofs.push(txProposal.proof)
  }

  async broadcastTx (txProposal) {
    // console.log(txProposal.rawTx)
    const tx = await this.client.decodeRawTransaction(txProposal.rawTx)
    // .then((tx) => checkTx(tx)))

    txProposal.proof.tweakIndex = txProposal.tweakIndex

    txProposal.proof.pending = true
    txProposal.proof.fields = { title: 'PLS' }

    this.proofs.push(txProposal.proof)
    // this.appendToFeed(txProposal.proof)
    // console.log(txProposal.rawTx)

    return this.client.signRawTransactionWithWallet(txProposal.rawTx)
      .then(tx => this.client.sendRawTransaction(tx.hex))
      .then(txid => {
        txProposal.proof.txid = txid
        for (const seal of txProposal.proof.seals) {
          if (seal.txid) continue
          seal.txid = txid
        }
        return txid
      })
  }
}

async function listUnspent (client) {
  return client.listUnspent()
}

function topicGen (title) {
  const topic = Buffer.alloc(sodium.crypto_hash_sha256_BYTES)
  sodium.crypto_hash_sha256(topic, Buffer.from(title))

  return topic
}

module.exports = RgbWallet
