const keys = require('./key-utils.js')
const txBuilder = require('./tx-builder.js')
const contractCode = require('../../rgb-encoding/contract.js')

module.exports = mintAsset

async function mintAsset (wallet, opts) {
  const client = wallet.client

  const contract = buildContract(opts)
  const serializedContract = contractCode.encode(contract)

  const selectedInputs = []
  let request = [{}]
  let io
  await (client.listUnspent().then((list) =>
    selectedInputs.push(list[0].txid + ':' + list[0].vout))
    .then(() => client.getNewAddress('', 'legacy'))
    .then((address) => request[0].address = address))
  
  const info = await (client.getAddressInfo(request[0].address))

  pubkey = Buffer.from(info.pubkey, 'hex')

  io = txBuilder.payToContract(
    selectedInputs, request, serializedContract,
    wallet.utxos, pubkey, 'contract'
  )

  return io

  // build contract
  function buildContract (opts) {
    return {
      title: opts.title,
      version: opts.version,
      description: opts.description,
      contract_url: opts.contract_url,
      issuance_utxo: opts.issuance_utxo,
      network: opts.network,
      total_supply: opts.total_supply,
      min_amount: opts.min_amount,
      max_hops: opts.max_hops,
      reissuance_enabled: opts.reissuance_enabled,
      reissuance_utxo: opts.reissuance_utxo,
      burn_address: opts.burn_address,
      commitment_scheme: opts.commitment_scheme,
      blueprint_type: opts.blueprint_type,
      owner_utxo: opts.owner_utxo
    }
  }

  function rootProofBuilder (contract, tx, metadata, originalPK, outputs) {
    var proof = {}
    proof.inputs = []
    proof.contract = contract
    proof.tx = tx
    if (metadata) proof.metadata = metadata
    if (originalPK) proof.originalPK = originalPK
    let assetId = getIdentityHash(contractCode.encode(contract)).toString('hex')
    for (let output of outputs) output.assetId = assetId
    proof.outputs = outputs

    return proof
  }
}


