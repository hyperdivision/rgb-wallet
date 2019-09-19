const network = require('./network-utils.js')

module.exports = getTotalAssets

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
//     for (let asset of assets) {
//       console.log(UTXOs.findIndex((utxo) => utxo.txid === asset.tx && utxo.vout === asset.vout))
//     }



//     const TxIDs = UTXOs.map(item => `${item.txid}:${item.vout}`)

//     // for each proof, check if txid is in list from btc-rpc
//     // for (let proof of proofs) {
//     //   const proofAssets = getAssetsByUTXO(proof)

//     //   for (let seal of proof.seals) {
//     //     if (!TxIDs.includes(seal.outpoint)) continue
//     //     const amounts = Object.values(proofAssets).reduce(arrayConcat, [])
//     //     if (seal.type !== 'assets') continue
//     //     let assetId = seal.ticker

//     //     assets[assetId] = assets[assetId] || { txList: [] }
//     //     assets[assetId].txList.push({
//     //       tx: seal.outpoint.split(':')[0],
//     //       vout: seal.outpoint.split(':')[1],
//     //       amount: proofAssets[seal.outpoint]
//     //     })    
//     //   }
//     // }

//     for (let assetId of Object.keys(assets)) {
//       assets[assetId].amount = assets[assetId].txList.reduce(
//         (acc, entry) => acc + entry.amount, 0)
//     }
//     return assets
  

//   // helper functions
//   function arrayConcat (sum, next) {
//     return sum.concat(next)
//   }

//   function getAssetsByUTXO (proof, assets) {
//     if (!assets) assets = {}

//     for (let seal of proof.seals) {
//       if (seal.type !== 'assets') continue
//       if (!assets[seal.outpoint]) assets[seal.outpoint] = {}

//       assets[seal.outpoint] = seal.amount
//     }
//     return assets
//   }
// }

function filterAssets (UTXOs) {
  return (assets) => {
    const ownedAssets = []
    for (let asset of assets) {
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
  for (let proof of proofs) {
    for (let seal of proof.seals) {
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
  for (let asset of assets) {
    const outpoint = [asset.tx, asset.vout].join(':')
    if (seals.includes(outpoint)) continue
    const index = assets.findIndex((item) => item === asset)
    assets.splice(index, 1)
  }
  return assets
}

