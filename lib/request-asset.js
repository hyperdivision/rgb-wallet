module.exports = proofBuilder

function requestAsset () {

}

// should be in receive asset = here for testing purposes
// constructs new transfer proof
function proofBuilder (inputs, request, utxos, opts) {
  const proof = {}
  opts = opts || {}
  proof.format = 'ordinary'
  proof.type = 'asset_transfer'

  proof.unseals = inputs.rpc.map((utxo) => {
    const outpoint = `${utxo.txid}:${utxo.vout}`
    return inputs.proofs[outpoint].seals.find((item) => item.outpoint === outpoint)
  })

  // this bit to be decided by receiver -> listUnspent => pick random
  proof.seals = []
  for (let transfer of request) {
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
  proof.ver = Object.values(inputs.proofs).sort((a, b) => a.ver - b.ver).pop().ver

  // format outputs correctly, only supports transfer to utxo structure
  if (opts.originalPK) proof.originalPK = opts.originalPK

  return proof
}
