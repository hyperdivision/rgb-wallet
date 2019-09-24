const network = require('./network-utils.js')

module.exports = {
  getTotalAssets,
  getSealsFrom
}

function getTotalAssets (client, proofs) {
  return (UTXOs) => {
    return assetsBySeal(client, proofs)
      .then(filterAssets(UTXOs))
      .then((array) => {
        const assets = {}
        array.map((value) => {
          assets[value.asset] = assets[value.assets] || {
            txList: [],
            amount: 0
          }
          assets[value.asset].amount += value.amount
          assets[value.asset].txList.push(value)
        })
        return assets
      })
  }
}

function filterAssets (UTXOs) {
  return (assets) => {
    const ownedAssets = []
    for (const asset of assets) {
      if (findUTXO(UTXOs, asset) !== -1) {
        ownedAssets.push(asset)
      }
    }
    return ownedAssets
  }
}

function findUTXO (list, item) {
  return list.findIndex((utxo) => utxo.txid === item.tx && utxo.vout === item.vout)
}

// to get assets, we need to go through each proof, prune unsealed and cross reference with list unspent
// then we know the state owned by us

async function assetsBySeal (client, proofs) {
  const assets = []
  let seals = []
  for (const proof of proofs) {
    for (const seal of proof.seals) {
      if (!seal.amount) continue
      seals.push(seal.outpoint)
      assets.push({
        tx: seal.outpoint.split(':')[0],
        vout: parseInt(seal.outpoint.split(':')[1]),
        asset: seal.ticker,
        amount: seal.amount
      })
      // assets[seal.ticker][seal.outpoint] = seal.amount
    }
  }
  seals = await network.pruneUnsealed(seals, client)
  for (const asset of assets) {
    const outpoint = [asset.tx, asset.vout].join(':')
    if (seals.includes(outpoint)) continue
    const index = assets.findIndex((item) => item === asset)
    assets.splice(index, 1)
  }
  return assets
}

function getSealsFrom (proofs) {
  const assets = []
  for (const proof of proofs) {
    for (const seal of proof.seals) {
      if (!seal.amount) continue

      assets.push({
        txid: seal.txid,
        vout: seal.vout,
        asset: seal.ticker,
        amount: seal.amount
      })
      // assets[seal.ticker][seal.outpoint] = seal.amount
    }
  }

  return assets
}
