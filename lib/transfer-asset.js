const assert = require('assert')
const buildTx = require('./tx-builder.js')

module.exports = transferAsset

function transferAsset (wallet, request, changeAddress) {
  const assets = wallet.assets
  const assetRequest = sortRequest(request)

  // 0. first check wallet has sufficient assets
  for (const asset of Object.keys(assetRequest)) {
    const assetAmount = assets.reduce((acc, value) => {
      return value.asset === asset ? acc + value.amount : acc
    }, 0)
    assert(assetAmount >= assetRequest[asset],
      'Insufficient assets')
  }

  // 1. sort available inputs
  const availableInputs = sortByUTXO(assets, Object.keys(assetRequest))

  // 2. perform coin selection
  const selectedInputs = coinSelector(availableInputs, assetRequest)

  const proofInputs = []
  for (const input of selectedInputs) {
    const proof = wallet.sortProofs()[input]
    proof.txid = input.split(':')[0]
    proof.vout = parseInt(input.split(':')[1])

    proofInputs.push(proof)
  }

  const amounts = {}
  proofInputs.map((proof) => {
    const seal = proof.seals.find((seal) => seal.txid === proof.txid && seal.vout === proof.vout)
    amounts[seal.ticker] = amounts[seal.ticker] || 0
    amounts[seal.ticker] += seal.amount
  })

  for (const [asset, amount] of Object.entries(amounts)) {
    let changeAmount = amount
    for (const transfer of request) {
      if (transfer.asset !== asset) continue
      changeAmount -= transfer.amount
    }

    const changeOutput = {}
    changeOutput.address = changeAddress.pop()
    changeOutput.assetUtxo = wallet.utxos[Math.floor(Math.random() * wallet.utxos.length)]
    changeOutput.asset = asset
    changeOutput.amount = changeAmount
    changeOutput.change = true

    request.push(changeOutput)
  }

  const rpcInputs = buildTx.getRpcInputs(selectedInputs, wallet.utxos)
  const btcAmount = buildTx.getRpcInputs.btcAmount

  return {
    rpc: rpcInputs,
    proofs: proofInputs,
    request,
    btcAmount
  }

  // subtract UTXO asset amounts from requested amounts and
  // choose UTXO which yields least outstanding balance
  function coinSelector (availableInputs, assetRequest, selectedInputs) {
    if (!selectedInputs) selectedInputs = []
    if (Object.keys(assetRequest).length === 0) return selectedInputs
    const diffs = {}

    for (const [utxo, assets] of Object.entries(availableInputs)) {
      for (const asset of assets) {
        if (!Object.keys(assetRequest).includes(asset.asset)) continue

        if (!diffs[utxo]) diffs[utxo] = { ...assetRequest }
        const diff = assetRequest[asset.asset] - asset.amount
        diffs[utxo][asset.asset] = diff < 0 ? 0 : diff
      }
    }

    let selectedUTXO = null

    try {
      // filter for all inputs which satisfy remaining request
      const sufficientInputs = Object.keys(diffs).filter((key) =>
        Object.values(diffs[key]).reduce((a, b) => a + b, 0) === 0)

      if (!sufficientInputs.length) throw new Error()

      // sort possible inputs by number of assets bound to UTXO
      sufficientInputs.sort((a, b) =>
        availableInputs[b].length - availableInputs[a].length)

      // select the UTXO with the least assets bound to it
      selectedUTXO = sufficientInputs.pop()
    } catch {
      // select the UTXO which leaves least remaining requests
      const bestChoices = Object.keys(diffs).sort((obj, compare) => {
        Object.values(diffs[compare]).reduce((a, b) => a + b, 0) -
          Object.values(diffs[obj]).reduce((a, b) => a + b, 0)
      })
      selectedUTXO = bestChoices[0]
    }

    assert(selectedUTXO, 'coin selection failed')

    selectedInputs.push(selectedUTXO)
    delete availableInputs[selectedUTXO]
    assetRequest = diffs[selectedUTXO]

    if (Object.keys(assetRequest).length !== 0) {
      for (const [key, value] of Object.entries(assetRequest)) {
        if (value === 0) delete assetRequest[key]
      }
    }

    return coinSelector(availableInputs, assetRequest, selectedInputs)
  }
}

// Helper functions:
// sort request to only list assets and amounts
function sortRequest (request) {
  const sortedRequest = {}
  request.map(req => {
    sortedRequest[req.asset] = req.amount
  })
  return sortedRequest
}

// sort rgb inputs according to UTXO
function sortByUTXO (assets, transfers) {
  var transactions = {}

  for (const ownedAsset of assets) {
    if (!transfers.includes(ownedAsset.asset)) continue
    const label = `${ownedAsset.txid}:${ownedAsset.vout}`
    if (!transactions[label]) transactions[label] = []
    transactions[label].push({
      asset: ownedAsset.asset,
      amount: ownedAsset.amount
    })
  }

  return transactions
}
