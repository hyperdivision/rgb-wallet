const Client = require('bitcoin-core')
const { EventEmitter } = require('events')

class RgbWallet extends EventEmitter {
  constructor (name, proofs, opts) {
    super()

    this.name = name
    // this.storage = opts.storage || newDirPath()
    this.rpcInfo = opts.rpcInfo

    // this should be the only class
    // in dialogue with client
    this.proofs = proofs
    this.client = new Client(this.rpcInfo)
    this.assets = null
  }

  sortProofs (proofs) {
    const proofsByUTXO = {}
    for (let proof of proofs) {
      for (let output of proof.tx.outputs) {
        let outpoint = `${proof.tx.id}:${output}`
        proofsByUTXO[outpoint] = proof
      }
    }
    return proofsByUTXO
  }

  update () {
    const self = this
    let promise = listUnspent(self.client)
    self.emit('update', promise)
  }

  updateAssets (getUTXOs) {
    const self = this
    getUTXOs.then(getTotalAssets(self.proofs))
      .then(assets => {
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
}

async function listUnspent (client) {
  return await client.listUnspent()
}

module.exports = RgbWallet