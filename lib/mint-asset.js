module.exports = mintAsset

function mintAsset (opts) {
  // build contract
  let proof = {}

  function contract (opts) {
    return {
      'title': opts.title,
      'version': opts.version,
      'description': opts.description,
      'contract_url': opts.contractURL,
      'issuance_utxo': opts.issuanceUTXO,
      'network': opts.network,
      'total_supply': opts.totalSupply,
      'min_amount': opts.minAmount,
      'max_hops': opts.maxHops,
      'reissuance_enabled': opts.reissuanceFlag,
      'reissuance_utxo': opts.reissuanceUTXO,
      'burn_address': opts.burn_address,
      'commitment_scheme': opts.commitmentScheme,
      'blueprint_type': opts.blueprint,
      'owner_utxo': opts.ownerUTXO
    }
  }

  function rootProofBuilder (contract, tx, metadata, originalPK, outputs) {
    var proof = {}
    proof.inputs = []
    proof.contract = contract
    proof.tx = tx
    if (metadata) proof.metadata = metadata
    if (originalPK) proof.originalPK = originalPKnode
    let assetId = getIdentityHash(contractCode.encode(contract)).toString('hex')
    for (let output of outputs) output.assetId = assetId
    proof.outputs = outputs

    return proof
  }
  // make UTXO with OP_RETURN proof.contract = contract
}