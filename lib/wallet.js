module.exports = {
  getTotalAssets,
  filterAssets,
  updateProofs,
  assetsFromSeals,
  assetsFromProofs
}

function getTotalAssets (utxos, assetsInProofs) {
  const assets = {}
  const ownedAssets = assetsInProofs.filter(filterAssets(utxos))
  ownedAssets.forEach((value) => {
    assets[value.asset] = assets[value.asset] || {
      txList: [],
      amount: 0
    }
    assets[value.asset].amount += value.amount
    assets[value.asset].txList.push(value)
  })

  return assets
}

function filterAssets (utxos) {
  return (assets) => {
    for (const asset of assets) {
      if (utxos.findIndex(matchUtxo(asset)) !== -1) {
        return asset
      }
    }
  }
}

function updateProofs (utxos, proofs) {
  const self = this
  const activeOutpoints = utxos.map(item => `${item.txid}:${item.vout}`)

  for (const outpoint of Object.keys(proofs)) {
    if (!activeOutpoints.includes(outpoint)) delete proofs[outpoint]
  }

  return proofs
}


function matchUtxo (item) {
  return utxo => utxo.txid === item.tx && utxo.vout === item.vout
}

function sealsFromProofs (proofs) {
  let seals = []
  for (const proof of proofs) {
    for (const seal of proof.seals) {
      if (!seal.amount) continue

      seals.push(seal)
    }
  }

  return seals
}

function assetsFromSeals (seals) {
  const assets = []
  for (const seal of seals) {
    if (!seal.amount) continue

    [txid, vout] = seal.outpoint ? 
      seal.outpoint.split(':') : [seal.txid, seal.vout]

    assets.push({
      txid,
      vout,
      asset: seal.ticker,
      amount: seal.amount
    })
  }

  return assets
}

function assetsFromProofs (proofs) {
  const seals = sealsFromProofs(proofs)
  return assetsFromSeals(seals)
}
