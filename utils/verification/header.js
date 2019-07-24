function verify (contract) {
  // 1. Checking that the contract is of supported versions
  switch (contract.version) {
    case 0x0001 :
      throw new Error('outdated version.')

    case 0x0002 :
      break

    default :
      throw new Error('unsupported version.')
  }

  // 2. Checking for internal consistency
  // 2.1. We can't require minimum transaction amount to be larger than the total supply
  assert(contract.min_amount <= contract.total_supply,
    'The requirement for the minimum transaction amount exceeds total asset supply.')

  // 2.2. If we enable reissuance, we need to provide UTXO to spend the reissued tokens
  if (contract.reissuance_enabled) {
    assert(contract.reissuance_utxo, 'reissuance UTXO must be specified.')
  }
  return true
}

function validate (contract, proof) {
  switch (contract.commitment_scheme) {
    // pay-to-contract proofs MUST include original public key, the rest MUST NOT.
    case 0x1 :
      assert(!proof.originalPK, 'proof structure does not match contract.')
      break

    case 0x2 :
      assert(proof.originalPK, 'pay-to-contract proofs must include untweaked public key')
      break

    case 0x0 :
      throw new Error('unsupported commitment scheme')
  }
  return true
}