const buildTx = require('./tx-builder.js')
const proofCode = require('../../rgb-encoding/lib/proof.js')

module.exports = receiveAsset

 function receiveAsset (input, utxos, opts) {
  opts = opts || {}

  const transferProof = proofBuilder(input.rpc, input.request, utxos, opts) //, { originalPK: '03fc1a4d87dccc570d3da7d7c98fa5c79a468d9584db339b4b347d41f121bc53a3' })

  // need to specify commitment hash, ie. only specific fields are encoded.
  const serializedProof = proofCode.encode(transferProof)

  const outputs = buildTx.getRpcOutputs(input.request, input.btcAmount)
  const rpcInfo = {
    inputs: input.rpc
  }

  transferProof.originalPK = '03fc1a4d87dccc570d3da7d7c98fa5c79a468d9584db339b4b347d41f121bc53a3'
  if (transferProof.originalPK) {
    let PK = Buffer.from(transferProof.originalPK, 'hex')
    rpcInfo.outputs = buildTx.payToContract(outputs, serializedProof, PK, 'proof')
  } else {
    // TODO op_return
    // outputs.push(OP_RETURN)
  }

  return {
    rpc: rpcInfo,
    proof: transferProof
  }
}

// constructs new transfer proof
function proofBuilder (inputs, request, utxos, opts) {
  const proof = {}

  proof.format = 'ordinary'
  proof.type = 'asset_transfer'

  proof.unseals = inputs.map((utxo) => `${utxo.txid}:${utxo.vout}`)

  // this bit to be decided by receiver -> listUnspent => pick random
  proof.seals = []
  for (let transfer of request) {
    const transferTo = utxos.pop()
    const outpoint = `${transferTo.txid}:${transferTo.vout}`
    proof.seals.push({
      type: 'assets',
      outpoint: outpoint,
      amount: Object.values(transfer)[1]
    })
  }

  // need to figure out proof.ver -> how to inherit from previous proofs
  proof.ver 

  // format outputs correctly, only supports transfer to utxo structure
  if (opts.originalPK) proof.originalPK = opts.originalPK

  return proof
}