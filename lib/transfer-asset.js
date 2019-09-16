const assert = require('assert')
const fs = require('fs')
const sodium = require('sodium-native')
const keys = require('./key-utils.js')
const proofCode = require('../../rgb-encoding/lib/proof.js')
const buildTx = require('./tx-builder.js')

module.exports = transferAsset

function transferAsset (wallet, request) {
  const client = wallet.client
  const assets = wallet.assets
  const assetRequest = sortRequest(request)

  // 0. first check wallet has sufficient assets
  for (let asset of Object.keys(assetRequest)) {
    assert(assets[asset].amount >= assetRequest[asset],
      'Insufficient assets')
  }

  // 1. sort available inputs
  const availableInputs = sortByUTXO(assets, Object.keys(assetRequest))

  // 2. perform coin selection
  const selectedInputs = coinSelector(availableInputs, assetRequest)
  const proofInputs = {}
  for (let input of selectedInputs) {
    proofInputs[input] = wallet.sortProofs()[input]
  }

  const rpcInputs = buildTx.getRpcInputs(selectedInputs, wallet.utxos)
  const btcAmount = buildTx.getRpcInputs.btcAmount

  return {
    rpc: rpcInputs,
    proofs: proofInputs,
    request: request,
    btcAmount: btcAmount
  }

  // subtract UTXO asset amounts from requested amounts and
  // choose UTXO which yields least outstanding balance
  function coinSelector (availableInputs, assetRequest, selectedInputs) {
    if (!selectedInputs) selectedInputs = []
    if (Object.keys(assetRequest).length === 0) return selectedInputs
    let diffs = {}

    for (let [utxo, assets] of Object.entries(availableInputs)) {
      for (let asset of assets) {
        if (!Object.keys(assetRequest).includes(asset.asset)) continue

        if (!diffs[utxo]) diffs[utxo] = { ...assetRequest }
        let diff = assetRequest[asset.asset] - asset.amount
        diffs[utxo][asset.asset] = diff < 0 ? 0 : diff
      }
    }

    let selectedUTXO = null

    try {
      // filter for all inputs which satisfy remaining request
      let sufficientInputs = Object.keys(diffs).filter((key) =>
        Object.values(diffs[key]).reduce((a, b) => a + b, 0) === 0)

      if (!sufficientInputs.length) throw new Error()

      // sort possible inputs by number of assets bound to UTXO
      sufficientInputs.sort((a, b) =>
        availableInputs[b].length - availableInputs[a].length)

      // select the UTXO with the least assets bound to it
      selectedUTXO = sufficientInputs.pop()
    } catch {
      // select the UTXO which leaves least remaining requests
      let bestChoices = Object.keys(diffs).sort((obj, compare) => {
        Object.values(diffs[compare]).reduce((a, b) => a + b, 0)
        - Object.values(diffs[obj]).reduce((a, b) => a + b, 0)
      })
      selectedUTXO = bestChoices[0]
    }
    
    assert(selectedUTXO, 'coin selection failed')

    selectedInputs.push(selectedUTXO)
    delete availableInputs[selectedUTXO]
    assetRequest = diffs[selectedUTXO]

    if (Object.keys(assetRequest).length !== 0) {
      for (let [key, value] of Object.entries(assetRequest)) {
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
  request.map(entry => {
    for (let key of Object.keys(entry)) {
      if (key === 'address') continue
      sortedRequest[key] = entry[key] 
    }
  })

  return sortedRequest
}

// sort rgb inputs according to UTXO
function sortByUTXO (assets, transfers) {
  var transactions = {}

  for (let asset of Object.keys(assets)) {
    if (!transfers.includes(asset)) continue
    let inputs = assets[asset].txList

    for (let input of inputs) {
      const label = `${input.tx}:${input.vout}`
      if (!transactions[label]) transactions[label] = []
      transactions[label].push({
        asset: asset,
        amount: input.amount
      })
    }
  }

  return transactions
}
