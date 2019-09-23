const keys = require('./key-utils.js')
const assert = require('nanoassert')

const network = 'regtest'

module.exports = {
  getRpcInputs,
  getRpcOutputs,
  payToContract
}

function getRpcInputs (selectedInputs, utxos) {
  // first format inputs for createRawTransaction rpc
  let btcAmount = 0
  const rpcInputs = []

  for (let input of selectedInputs) {
    let [txid, vout] = input.split(':')
    vout = parseInt(vout)

    const formattedInput = {
      txid,
      vout
    }

    const inputUTXO = utxos.filter(utxo =>
      utxo.txid === txid && utxo.vout === vout)

    assert(inputUTXO.length === 1, 'invalid input, UTXO either not present or not unique')
    btcAmount += inputUTXO[0].amount
    rpcInputs.push({
      txid,
      vout
    })
  }

  getRpcInputs.btcAmount = btcAmount
  return rpcInputs
}

function getRpcOutputs (request, btcAmount) {
  // next construct outputs
  const rpcOutputs = []
  for (let address of request.map(req => req.address)) {
    const output = {}
    if (!output[address]) output[address] = 0
    output[address] += btcAmount / Object.keys(request).length
    rpcOutputs.push(output)
  }

  // remove fees from change output, arbitrarily chosen to be the 0th
  const fees = 0.005
  rpcOutputs[0][Object.keys(rpcOutputs[0])[0]] -= fees

  return rpcOutputs
}

function payToContract(rpcOutputs, commitment, PK, tag) {
  // determine output address from public key
  const commitmentAddress = keys.generateBTCAddress(PK, network)

  // find output and replace with the tweaked output
  rpcOutputs.map(output => {
    if (Object.keys(output)[0] === commitmentAddress) {
      const tweakedAddress = keys.tweakAddress(PK, commitment, tag, network)
      output[tweakedAddress] = output[commitmentAddress]
      delete output[commitmentAddress]
    }

    return output
  })

  return rpcOutputs
}
