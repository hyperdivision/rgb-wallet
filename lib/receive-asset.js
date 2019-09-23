const buildTx = require('./tx-builder.js')
const rgb = require('../../rgb-encoding/index.js')

module.exports = receiveAsset

// this doesn't make snese in terms of PK for commitment, need to pick one first then proceed.
function receiveAsset (inputs, utxos, opts) {
  opts = opts || {}

  const transferProof = proofBuilder(inputs, utxos, opts) //, { originalPK: '03fc1a4d87dccc570d3da7d7c98fa5c79a468d9584db339b4b347d41f121bc53a3' })

  // need to specify commitment hash, ie. only specific fields are encoded.
  const serializedProof = rgb.proof.encode(transferProof, inputs.schema)
  const outputs = buildTx.getRpcOutputs(inputs.request, inputs.btcAmount)
  const rpcInfo = {
    inputs: inputs.rpc
  }
  transferProof.originalPK = inputs.originalPubKey
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
function proofBuilder (inputs, utxos, opts) {
  const proof = {}
  opts = opts || {}
  proof.network = 'testnet'
  proof.schema = inputs.schemaId
  proof.format = 'ordinary'
  proof.type = 'asset_transfer'

  proof.unseals = []
  inputs.rpc.map((utxo) => {
    const outpoint = `${utxo.tx}:${utxo.vout}`
    const chosen = inputs.proofs.filter((item) => item.txid === utxo.txid && item.vout === utxo.vout)
    chosen.forEach(inputProof => {
      proof.unseals.push(inputProof.seals.find(item => item.outpoint === outpoint))
    })
  })

  // this bit to be decided by receiver -> listUnspent => pick random
  proof.seals = []
  for (let transfer of inputs.request) {
    const transferTo = utxos.pop()
    const outpoint = `${transferTo.txid}:${transferTo.vout}`
    proof.seals.push({
      type: 'assets',
      outpoint: outpoint,
      ticker: Object.keys(transfer)[1],
      amount: Object.values(transfer)[1]
    })
  }

  // need to figure out proof.ver -> how to inherit from previous proofs
  proof.ver = inputs.proofs.sort((a, b) => a.ver - b.ver).pop().ver

  // format outputs correctly, only supports transfer to utxo structure
  if (opts.originalPK) proof.originalPK = opts.originalPK

  return proof
}
