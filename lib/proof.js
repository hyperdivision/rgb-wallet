const assert = require('nanoassert')

module.exports = proofFromProposal

function proofFromProposal (proposal, utxos, schemata) {
  const schemas = new Set(proposal.proofs.map((proof) => proof.schema))
  assert(schemas.size === 1, 'more than one schema present')
  proposal.schemaId = [...schemas][0]
  proposal.schema = schemata[proposal.schemaId]

  return proofBuilder(proposal, utxos)
}

// constructs new transfer proof
function proofBuilder (inputs, utxos, opts) {
  const proof = {}
  opts = opts || {}
  proof.network = 'testnet'
  proof.schema = inputs.schemaId
  proof.ver = 1
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
