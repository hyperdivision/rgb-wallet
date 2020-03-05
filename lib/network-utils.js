module.exports = {
  findSpendingTx,
  pruneUnsealed
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

// given set of seals, determine which remain sealed.
async function pruneUnsealed (seals, client) {
  const sealed = []
  for (const seal of seals) {
    let [txid, vout] = seal.split(':')
    vout = parseInt(vout)
    await client.getTxOut(txid, vout).then((result) => result !== null).then((result) => {
      if (result) {
        sealed.push(seal)
      }
    })
  }
  return sealed
}
