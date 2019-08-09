const assert = require('assert')
const fs = require('fs')
module.exports = transferAsset

function transferAsset (wallet, request) {
  let assets = wallet.assets

  // 0. first check wallet has sufficient assets
  for (let asset of Object.keys(request)) {
    assert(assets[asset].amount >= request[asset],
      'Insufficient assets')
  }

  // 1. sort available inputs
  const availableInputs = sortByUTXO(assets, Object.keys(request))

  // 2. perform coin selection
  const selectedInputs = coinSelector(availableInputs, request)
  return txBuilder(selectedInputs, request)

  // 3. construct transfer proof
  const transferProof = proofBuilder(inputs, proofs, outputs, opts)

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
    // console.log(transactions)
    return transactions
  }

  // subtract UTXO asset amounts from requested amounts and
  // choose UTXO which yields least outstanding balance
  function coinSelector (availableInputs, request, selectedInputs) {
    if (!selectedInputs) selectedInputs = []
    if (Object.keys(request).length === 0) return selectedInputs
    let diffs = {}
    for (let [utxo, assets] of Object.entries(availableInputs)) {
      for (let asset of assets) {
        if (!Object.keys(request).includes(asset.asset)) continue

        if (!diffs[utxo]) diffs[utxo] = { ...request }
        let diff = request[asset.asset] - asset.amount
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
    request = diffs[selectedUTXO]

    if (Object.keys(request).length !== 0) {
      for (let [key, value] of Object.entries(request)) {
        if (value === 0) delete request[key]
      }
    }
    
    return coinSelector(availableInputs, request, selectedInputs)
  }

  // constructs new transfer proof
  function proofBuilder (inputs, proofs, outputs, opts) {
    const proof = {}
    proof.inputs = []
    for (let input of inputs) {
      proof.inputs.push(proofs[input])
    }

    proof.tx = {
      id: '',
      outputs: []
    }

    for (let i = 0; i < outputs.length; i++) {
      proof.tx.outputs.push(i + 1)
    }

    proof.outputs = outputs

    if (opts.metadata) proof.metadata = opts.metadata
    if (opts.originalPK) proof.originalPK = opts.originalPK

    return proof
  }

  // make transfer tx
  function txBuilder (selectedInputs, request) {
    // first format inputs for createRawTransaction rpc
    const inputs = []
    for (let input of selectedInputs) {
      const [txid, vout] = input.split(':')
      const formattedInput = {
        txid: txid,
        vout: parseInt(vout)
      }
      inputs.push(formattedInput)
    }
    const rpcInput = "'''" + JSON.stringify(inputs) + "'''"
    return inputs

    // next construct outputs
    const outputs = {}
    for (let address of request.map(req => req.address)) {
      outputs[address] = amount
    }

    // for (let 
    wallet.client.createRawTransaction()
  }
}





















