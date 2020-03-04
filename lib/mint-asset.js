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
      ver: opts.version || 1,
      format: 'root',
      schema: opts.schema || 'sm1m3pkuxxyl0rp3e6drhlhw40f8uhg0xx9qem57jq32dhxmzzfgvpsgvqvjw',
      network: opts.network || 'testnet',
      root: opts.root,
      type: 'primary_issue',
      fields: {
        title: opts.title || 'foo',
        ticker: opts.ticker || 'bar',
        dust_limit: 1
      },
      seals: opts.seals,
      pubkey: opts.pubkey
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


