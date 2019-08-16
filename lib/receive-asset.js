const buildTx = require('./tx-builder.js')
const proofCode = require('../../rgb-encoding/proof.js')

module.exports = receiveAsset

 function receiveAsset (input, opts) {
  opts = opts || {}

  const transferProof = proofBuilder(input.proofs, input.request, opts) //, { originalPK: '03fc1a4d87dccc570d3da7d7c98fa5c79a468d9584db339b4b347d41f121bc53a3' })

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
function proofBuilder (inputs, request, opts) {
  const proof = {}

  proof.inputs = inputs

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