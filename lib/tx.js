const assert = require('nanoassert')
const coinSelector = require('./coin-selection.js')
const keys = require('./keys')

module.exports = {
  transfer,
  accept,
  getRpcOutputs
}

function transfer (request, assets, changeOutputs, proofs, utxos) {
  // sort request
  const sortedRequest = sortRequest(request)

  // check wallet has sufficient assets
  for (const asset of Object.keys(sortedRequest)) {
    const assetAmount = assets.reduce((acc, value) => {
      return value.asset === asset ? acc + value.amount : acc
    }, 0)

    assert(assetAmount >= sortedRequest[asset],
      'Insufficient assets')
  }

  // sort available inputs
  const relevantAssets = assets.filter(obj => sortedRequest.hasOwnProperty(obj.asset))
  const availableInputs = sortByUTXO(relevantAssets)

  // perform coin selection
  const selectedInputs = coinSelector(availableInputs, sortedRequest)

  // gather relevant proofs for input
  const proofInputs = []
  for (const input of selectedInputs) {
    const proof = proofs[input]
    proof.txid = input.split(':')[0]
    proof.vout = parseInt(input.split(':')[1])

    proofInputs.push(proof)
  }

  // tally up amounts
  const amounts = {}
  proofInputs.map((proof) => {
    const seal = proof.seals.find(matchUtxo(proof))
    amounts[seal.ticker] = amounts[seal.ticker] || 0
    amounts[seal.ticker] += seal.amount
  })

  // add change outputs if necessary
  for (const [asset, amount] of Object.entries(amounts)) {
    let changeAmount = amount
    for (const transfer of request) {
      if (transfer.asset !== asset) continue
      changeAmount -= transfer.amount
    }

    // avoid unnecessary change output
    if (changeAmount === 0) continue

    const changeOutput = changeOutputs.pop()
    changeOutput.asset = asset
    changeOutput.amount = changeAmount
    changeOutput.change = true

    request.push(changeOutput)
  }

  let totalBtcAmount = 0
  const rpcInputs = getRpcInputs(selectedInputs, utxos)

  return {
    rpc: rpcInputs,
    proofs: proofInputs,
    request,
    btcAmount: totalBtcAmount
  }

  function getRpcInputs () {
    // first format inputs for createRawTransaction rpc
    const rpcInputs = []

    for (const input of selectedInputs) {
      let [txid, vout] = input.split(':')
      vout = parseInt(vout)

      const inputUTXO = utxos.filter(utxo =>
        utxo.txid === txid && utxo.vout === vout)

      assert(inputUTXO.length === 1, 'invalid input, UTXO either not present or not unique')
      totalBtcAmount += inputUTXO[0].amount
      rpcInputs.push({
        txid,
        vout
      })
    }

    return rpcInputs
  }
}

// receiving party: verify and build tx for sending party to publish
function accept (inputs, proof, opts) {
  const outputs = getRpcOutputs(inputs.request, inputs.btcAmount)
  
  const rpc = {}
  rpc.inputs = inputs.rpc

  proof.pubkey = inputs.originalPubKey
  let tweakIndex = null

  const PK = Buffer.from(proof.pubkey, 'hex')
  const commitmentAddress = keys.generateBTCAddress(PK, 'regtest')

  rpc.outputs = outputs.map(output => {      
    if (Object.keys(output)[0] !== commitmentAddress) return output
      
    tweakIndex = outputs.findIndex(item => item === output)
    const amount = Object.values(output)[0]
    return keys.payToContract(amount, proof.serialized, PK, 'proof', 'testnet')
  })

  proof.pending = true
  proof.tweakIndex = tweakIndex
  proof.assetIndices = []
  for (let i = 0; i < inputs.request.length; i++) {
    if (!inputs.request[i].change) proof.assetIndices.push(i)
  }
  
  return {
    rpc,
    proof
  }
}

function getRpcOutputs (request, btcAmount) {
  // next construct outputs
  const rpcOutputs = []
  for (const address of request.map(req => req.address)) {
    const output = {}
    if (!output[address]) output[address] = 0
    const amount = btcAmount / Object.keys(request).length
    output[address] += parseFloat(amount.toFixed(8))
    rpcOutputs.push(output)
  }

  // remove fees from change output, arbitrarily chosen to be the 0th
  const fees = 0.005
  rpcOutputs[0][Object.keys(rpcOutputs[0])[0]] -= fees
  return rpcOutputs
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
function sortByUTXO (assets) {
  var transactions = {}

  for (const ownedAsset of assets) {
    const label = `${ownedAsset.txid}:${ownedAsset.vout}`
    if (!transactions[label]) transactions[label] = []
    transactions[label].push({
      asset: ownedAsset.asset,
      amount: ownedAsset.amount
    })
  }

  return transactions
}

function matchUtxo (item) {
  return utxo => utxo.txid === item.txid && utxo.vout === item.vout
}
