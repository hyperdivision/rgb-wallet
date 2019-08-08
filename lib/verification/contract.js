var header = require('./header.js')

module.exports = {
  verify: verify,
  validate: validate
}

function verify (contract) {
  // 1. Checking commitment transaction publishing the contract
  // need to make tx_provider
  // let issueTX = tx_provider(contract.header.issuance_utxo.txid)

  // 1.1. Checking commitment transaction script to be corresponding to the actual RGB
  // contract
  let vout = contract.header.issuance_utxo.vout
  // ISSUE -> cast as usize necessary in JS? 32bit pointer?
  // let vout_u = vout as usize

  if (issueTX.output[vout].script_pubkey !== contract.get_script()) {
    throw new Error('RGB-contract script does not correspond to transaction script.')
  }

  // 2. Checking header consistency
  header.verify(contract)

  // 3. Checkin body consistency
  body.verify(contract)

  return true
}

function validate (contract, proof) {
  if (header.validate(contract, proof)) return true
  // body.validate(contract, proof)
  return false
}