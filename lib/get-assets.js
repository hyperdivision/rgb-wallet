module.exports = getTotalAssets

function getTotalAssets (proofs) {
  const assets = {}

  return (UTXOs) => {
    const TxIDs = UTXOs.map(item => item.txid)

    // for each proof, check if txid is in list from btc-rpc
    for (let proof of proofs) {
      if (!TxIDs.includes(proof.tx.id)) continue
      const proofAssets = getAssetsByUTXO(proof)
      const amounts = Object.values(proofAssets).reduce(arrayConcat, [])

      for (let asset of amounts) {
        const assetId = asset.assetId
        const vout = Object.keys(proofAssets).find((key) =>
          proofAssets[key].includes(asset))

        if (!assets[assetId]) assets[assetId] = { txList: [] }

        assets[assetId].txList.push({
          tx: proof.tx.id,
          vout: vout,
          amount: asset.amount
        })

        assets[assetId].amount = assets[assetId].txList.reduce(
          (acc, entry) => acc + entry.amount, 0)
      }
    }
    return assets
  }

  // helper functions
  function arrayConcat (sum, next) {
    return sum.concat(next)
  }

  function getAssetsByUTXO (proof, assets) {
    if (!assets) assets = {}

    for (let output of proof.outputs) {
      const outpoint = output.outpoint.address
      if (!assets[outpoint]) assets[outpoint] = []

      assets[outpoint].push({
        assetId: output.assetId,
        amount: output.amount
      })
    }
    return assets
  }
}
