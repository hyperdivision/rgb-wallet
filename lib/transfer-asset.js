const assert = require('assert')
const fs = require('fs')
module.exports = transferAsset

function transferAsset (wallet, request) {
  let assets = wallet.assets
  let assetRequest = sortRequest(request)

  // 0. first check wallet has sufficient assets
  for (let asset of Object.keys(assetRequest)) {
    assert(assets[asset].amount >= assetRequest[asset],
      'Insufficient assets')
  }

  // 1. sort available inputs
  const availableInputs = sortByUTXO(assets, Object.keys(assetRequest))

  // 2. perform coin selection
  const selectedInputs = coinSelector(availableInputs, assetRequest)

  // 3. construct transfer proof
  const transferProof = proofBuilder(selectedInputs, request)

  // 4. build transaction to be signed
  const tx = txBuilder(selectedInputs, request)

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

  // constructs new transfer proof
  function proofBuilder (inputs, request, opts) {
    const proof = {}
    opts = opts || {}

    proof.inputs = []
    for (let input of inputs) {
      proof.inputs.push(wallet.sortProofs()[input])
    }

    // tx field not committed to, only added after commitment in tx
    proof.tx = {
      outputs: []
    }

    // format outputs correctly, only supports vout structure
    proof.outputs = request.map((item) => {
      const output = {}
      output.assetId = Object.keys(item)[1]
      output.amount = item[output.assetId]
      output.outpoint = {
        type: 'address',
        address: request.indexOf(item) + 1
      }
      proof.tx.outputs.push(output.outpoint.address)
      return output
    })

    if (opts.metadata) proof.metadata = opts.metadata
    if (opts.originalPK) proof.originalPK = opts.originalPK

    return proof
  }

  // make transfer tx
  function txBuilder (selectedInputs, request) {
    // first format inputs for createRawTransaction rpc
    const inputs = []
    let btcAmount = 0

    let rpcInputs = []
    for (let input of selectedInputs) {
      let [txid, vout] = input.split(':')
      vout = parseInt(vout)

      const formattedInput = {
        txid: txid,
        vout: vout,
      }

      inputs.push(formattedInput)

      const inputUTXO = wallet.utxos.filter(utxo =>
        utxo.txid === txid && utxo.vout === vout)

      assert(inputUTXO.length === 1, 'invalid input, UTXO either not present or not unique')
      btcAmount += inputUTXO[0].amount
      rpcInputs.push({
        "txid": txid,
        "vout": vout
      })
    }

    // next construct outputs
    const rpcOutputs = []
    for (let address of request.map(req => req.address)) {
      const output = {}
      if (!output[address]) output[address] = 0
      output[address] += btcAmount / Object.keys(request).length
      rpcOutputs.push(output)
    }
    console.log(rpcOutputs)

    // remove fees from change output, arbitrarily chosen to be the 0th
    const fees = 0.005
    rpcOutputs[0][Object.keys(rpcOutputs[0])[0]] -= fees

    let rawTx
    wallet.client.createRawTransaction(rpcInputs, rpcOutputs)
      .then(wallet.client.signRawTransactionWithWallet)
      .then((rawTx) => wallet.client.decodeRawTransaction(rawTx.hex))
      .then(console.log)
  }
}

// Helper functions:
// sort request to only list assets and amounts
function sortRequest (request) {
  const sortedRequest = {}
  request.map(entry => {
    const keys = Object.keys(entry)
    for (let key of keys) {
      if (key !== 'address') sortedRequest[key] = entry[key] 
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
  // console.log(transactions)
  return transactions
}
