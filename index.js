const assert = require('nanoassert')
const Client = require('./lib/chain.js')
const transact = require('./lib/tx.js')
const proofFromProposal = require('./lib/proof')
const keys = require('./lib/keys')
const wallet = require('./lib/wallet.js')
const crypto = require('./lib/crypto')
const rgb = require('../rgb-encoding/index.js')

/*
  TODO: 
    - chain.findSpendingTx -> make concurrent
    - have spare address list, keep refilling to 100
*/

module.exports = class {
  constructor (name, proofs, schemas, opts) {
    this.name = name
    this.proofs = proofs
    this.schemas = schemas
    this.rpcInfo = opts.rpcInfo

    this.chain = new Client(this.rpcInfo)
    this.assets = null
    this.utxos = null
    this.schemata = null
  }

  async init () {
    // on-chain utxos
    const unspent = await this.chain.client.listUnspent()
   
    // seals referenced in proofs
    const assetsBySeal = wallet.assetsFromProofs(this.proofs)

    // prune spent seals and those we do not own
    this.assets = assetsBySeal.filter(seal => 
      unspent.findIndex(matchUtxo(seal)) !== -1 && seal.txid)
    
    // store relevant utxo data
    this.utxos = unspent.map(formatUnspent)

    this.indexSchema()
    return this.assets
  }

  indexSchema () {
    this.schemata = {}
    for (const schema of this.schemas) {
      const encodedSchema = rgb.schema.encode(schema)
      const schemaHash = crypto.doubleSha256(encodedSchema)
   
      const schemaId = crypto.toBech32('sm', schemaHash)
      this.schemata[schemaId] = schema
    }

    return this.schemata
  }

  async createRequest (requestedAssets) {
    const requestList = []
    const addresses = await this.chain.generateAddresses(requestedAssets.length)
    return requestedAssets.map(formatRequest(addresses))
  }

  async createTransferProposal (request) {
    const change = await this.generateChangeOutputs(request)
    const assets = this.assets
    const sortedProofs = this.sortProofs()

    return transact.transfer(request, assets, change, sortedProofs, this.utxos)
  }

  async createTxProposal (proposal) {
    const firstAddress = proposal.request[0].address

    // for (let proof of proposal.proofs) {
    //   verify(proof)
    // }
    
    await this.chain.client.getAddressInfo(firstAddress).then(info => {
      proposal.originalPubKey = info.pubkey
    })

    const transferProof = proofFromProposal(proposal, this.utxos, this.schemata)
    transferProof.serialized = rgb.proof.encode(transferProof, proposal.schema)

    const { rpc, proof } = await transact.accept(proposal, transferProof)    
    const rawTx = await this.chain.createTx(rpc.inputs, rpc.outputs)

    this.proofs.push(proof)

    return {
      rawTx,
      proof: transferProof
    }
  }

  async approveTransfer (transferProposal) {

  }

  async broadcastTx (txProposal) {
    const tx = await this.chain.client.decodeRawTransaction(txProposal.rawTx)

    txProposal.proof.tweakIndex = txProposal.tweakIndex

    const txid = await this.chain.broadcast(txProposal.rawTx)

    txProposal.proof.fields = { title: 'PLS' }
    txProposal.proof.pending = false
    
    txProposal.proof.txid = txid
    this.proofs.push(txProposal.proof)

    return txid  
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

  update () {
    const self = this
    const seals = wallet.sealsFromProofs(this.proofs)
    const prunedSeals = this.chain.pruneUnsealed(seals)
    const assets = wallet.assetsFromSeal(seals)

    this.chain.listUnspent()
      .then(utxos => {
        self.assets = wallet.getTotalAssets(utxos, assetsInProofs)

        const activeProofs = wallet.updateProofs(utxos, self.sortProofs())
        self.proofs = Object.values(activeProofs)
        
        return self      
      })
  }

  async generateChangeOutputs (request) {
    const self = this

    let requestedAssets = request.map(req => req.asset)
    requestedAssets = new Set(requestedAssets)

    const addresses = await this.chain.generateAddresses(requestedAssets.size)

    const outputs = addresses.map(addr => {
      const output = {}
      output.address = addr
      output.assetUtxo = this.utxos[Math.floor(Math.random() * this.utxos.length)]
      return output
    })

    return outputs
  }
}

// Helper functions
function formatRequest (addresses) {
  return req => {
    const formatRequest = {
      asset: req.asset,
      amount: req.amount,
      address: addresses.pop()
    }
    return formatRequest
  }
}

function formatUnspent (utxo) {
  return {
    txid: utxo.txid,
    vout: utxo.vout,
    address: utxo.address,
    amount: utxo.amount
  }
}

function matchUtxo (item) {
  return utxo => utxo.txid === item.txid && utxo.vout === item.vout
}
