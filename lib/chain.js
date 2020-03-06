const Client = require('bitcoin-core')

module.exports = class {
  constructor (rpcInfo) {
     this.client = new Client(rpcInfo)
  }

  async init () {
    const unspent = await this.chain.client.listUnspent()

  }

  // finds the tx that spent a certain utxo
  async findSpendingTx (spent) {
    const find = {
      txid: spent.split(':')[0],
      vout: parseInt(spent.split(':')[1])
    }

    const blockHeight = await this.client.getBlockCount()

    for (let i = 1; i <= blockHeight; i++) {
      const blockHash = await this.client.getBlockHash(i)
      const blockInfo = await this.client.getBlock(blockHash)

      for (let txid of blockInfo.tx) {
        const tx = await this.client.getRawTransaction(txid, 1, blockHash)
        if (tx.vin.findIndex((vin) => vin.txid === find.txid && vin.vout === find.vout) !== -1) {
          return this.client.getRawTransaction(txid, true)
        }
      }
    }

    return this.client.getTxOut(find.txid, find.vout)
  }

  // given set of seals, determine which remain sealed.
  async pruneUnsealed (seals) {
    const sealed = []
    for (let seal of seals) {
      let [txid, vout] = seal.split(':')
      vout = parseInt(vout)
      this.client.getTxOut(txid, vout).then((result) => {
        if (result !== null) sealed.push(seal)
      })
    }

    return sealed
  }

  async generateAddresses (number) {
    const self = this
    const addresses = []
    for (let i = 0; i < number; i++) {
      const address = await self.client.getNewAddress('', 'legacy')
      addresses.push(address)
    }
    return addresses
  }

  async createTx (inputs, outputs) {
    const rawTx = await this.client.createRawTransaction(inputs, outputs)
    return rawTx
  }

  async broadcast(rawTx) {
    return this.client.signRawTransactionWithWallet(rawTx)
      .then(tx => this.client.sendRawTransaction(tx.hex))
  }


  async fetchTx (TxID) {
    const result = await this.client.getRawTransaction(TxID)
    var tx = this.client.decodeRawTransaction(result)

    return tx
  }

  async listUnspent () {
    return this.client.listUnspent()
  }
}

function matchUtxo (item) {
  return utxo => utxo.txid === item.txid && utxo.vout === item.vout
}

