module.exports = getTotalAssets

function getTotalAssets (proofs) {
  const assets = {}

  return (UTXOs) => {
    const TxIDs = UTXOs.map(item => `${item.txid}:${item.vout}`)

    // for each proof, check if txid is in list from btc-rpc
    for (let proof of proofs) {
      const proofAssets = getAssetsByUTXO(proof)

      for (let seal of proof.seals) {
        if (!TxIDs.includes(seal.outpoint)) continue
        const amounts = Object.values(proofAssets).reduce(arrayConcat, [])
        if (seal.type !== 'assets') continue
        let assetId = seal.ticker

        assets[assetId] = assets[assetId] || { txList: [] }
        assets[assetId].txList.push({
          tx: seal.outpoint.split(':')[0],
          vout: seal.outpoint.split(':')[1],
          amount: proofAssets[seal.outpoint]
        })    
      }
    }

    for (let assetId of Object.keys(assets)) {
      assets[assetId].amount = assets[assetId].txList.reduce(
        (acc, entry) => acc + entry.amount, 0)
    }

    return assets
  }

  // helper functions
  function arrayConcat (sum, next) {
    return sum.concat(next)
  }

  function getAssetsByUTXO (proof, assets) {
    if (!assets) assets = {}

    for (let seal of proof.seals) {
      if (seal.type !== 'assets') continue
      if (!assets[seal.outpoint]) assets[seal.outpoint] = {}

      assets[seal.outpoint] = seal.amount
    }
    return assets
  }
}
