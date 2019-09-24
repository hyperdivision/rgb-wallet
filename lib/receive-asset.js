const buildTx = require('./tx-builder.js')
const rgb = require('../../rgb-encoding/index.js')
const keys = require('./key-utils.js')

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
  transferProof.PK = inputs.originalPubKey
  let tweakIndex = null
  if (transferProof.PK) {
    const PK = Buffer.from(transferProof.PK, 'hex')
    const commitmentAddress = keys.generateBTCAddress(PK, 'regtest')

    rpcInfo.outputs = outputs.map(output => {
      if (Object.keys(output)[0] === commitmentAddress) {
        tweakIndex = outputs.findIndex(item => item === output)
        return buildTx.payToContract(Object.values(output)[0], serializedProof, PK, 'proof')
      } else return output
    })
  } else {
    // TODO op_return
    // outputs.push(OP_RETURN)
  }

  return {
    rpc: rpcInfo,
    proof: transferProof,
    tweakIndex
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

  // this bit to be decided by receiver -> listUnspent => pick random
  proof.seals = []
  for (const transfer of inputs.request) {
    const formatSeal = {
      type: 'assets',
      ticker: transfer.asset,
      amount: transfer.amount
    }
    if (transfer.assetUtxo) {
      formatSeal.txid = transfer.assetUtxo.txid
      formatSeal.vout = transfer.assetUtxo.vout
    } else {
      const transferTo = utxos[Math.floor(Math.random() * utxos.length)]
      formatSeal.txid = transferTo.txid
      formatSeal.vout = transferTo.vout
    }

    proof.seals.push(formatSeal)
  }

  // need to figure out proof.ver -> how to inherit from previous proofs
  proof.ver = inputs.proofs.sort((a, b) => a.ver - b.ver).pop().ver

  // format outputs correctly, only supports transfer to utxo structure
  if (opts.originalPK) proof.originalPK = opts.originalPK

  return proof
}
