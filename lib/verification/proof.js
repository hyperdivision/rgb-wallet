var assert = require('nanoassert')
var sodium = require('sodium-native')
var contract = require('./contract.js')
var contractCode = require('../../../rgb-encoding/contract.js')
var proofCode = require('../../../rgb-encoding/proof.js')
var fs = require('fs')

module.exports = {
  getIdentityHash,
  structure,
  onChain,
  inputOnChain,
  getContracts,
  getScript,
  allScripts,
  tweakKey,
  getInputAmounts,
  getOutputAmounts
}

function getIdentityHash (item) {
  var identityHash = Buffer.alloc(sodium.crypto_hash_sha256_BYTES)
  sodium.crypto_hash_sha256(identityHash, item)
  sodium.crypto_hash_sha256(identityHash, identityHash)
  return identityHash
}

///////////////////////////////////////////
///               VERIFY                ///
///////////////////////////////////////////

// 1. Check proof integrity
function structure (proof) {
  if (proof.seals.length === 0) {
    assert(proof.contract, 'non-root proofs must have upstream proofs')
    // assert(contract.verify(proof.contract), 'contract is not valid.')
  } else {
  // 2. Contract must pass verification
    assert(!proof.contract,
      'only root proofs should have associated contracts.')
  }

  // 3. Validate proof has correct structure for the given contract type
  // (i.e. metadata present/not present, original public key given for
  // pay-to-contract commitment schemes etc.)
  // This has to be done for each asset.
  for (const asset of proof.outputs) {
    var root = getContracts(proof)[asset.assetId]
    assert(contract.validate(root, proof), 'invalid contract provided')
  }

  // TODO: function to get address of the tx this proof refers to
  // 4. Matching input and output balances
  // 4.1. There should be the same number of assets in both inputs and outputs
  var inBalances = getInputAmounts(proof, proof.tx.id)
  var outBalances = getOutputAmounts(proof)
  // console.log(inBalances, outBalances)
  // assert(Object.keys(inBalances).length === Object.keys(outBalances).length,
  // 'number of assets must balance between inputs and outputs')            !!!!!!!!!!!!!!!!!!!!!!!!!!!!! UNCOMMENT and IMPROVE

  // 4.2. Comparing input and output amounts per each asset
  for (let key of Object.keys(inBalances)) {
    assert(outBalances.hasOwnProperty(key), 'all assets in must have an output')
    assert(inBalances[key] === outBalances[key], 'input and output amounts do not balance')
  }

  // 5. Reiterate for all upstream proofs
  for (const input of proof.inputs) {
    structure(input)
  }
}

function onChain (proof, tx) {
  // 6. Verify associated commitments in bitcoin transactions
  // 6.1. Check that commitment transaction has all the necessary outputs referenced
  // by the proof
  assert(proof.tx.outputs.length < tx.vout.length,
    'missing transaction output specified in proof.')
  const rootScripts = allScripts(proof)

  // 6.2. Check that each output referenced by the proof is colored with proper script
  // First check vout based outputs
  const filteredOutputs = proof.outputs.filter(output =>
    output.outpoint.type === 'address')

  for (const output of filteredOutputs) {
    const vout = output.outpoint.address
    if (tx.vout[vout].scriptPubKey.asm !== getScript(proof, output.assetId)) {
      throw new Error('cannot verify output script')
    }
  }
}
// TODO: figure out how UTXO based transactions are determined.

// TODO write proper function for reading btc Pk compressed or not.

// 6. Matching input and output balances
// 6.1. There should be the same number of assets in both inputs and outputs

function inputOnChain (proof, inputTx, commitmentTx) {
  // 7. Check commitment transactions for each of the proof inputs
  // 7.1. For non-root proofs there MUST be inputs for the transaction

  // We alreaady checked this in step 1

  // 7.2. Check commitment transactions for each of the proof inputs
  // Get rgb input txs -> get object tx (one being spent) -> iterate through object's
  // on chain inputs and match to rgb inputs -> verify each rgb input is on chain correctly
  const onChainInputs = commitmentTx.vin.map(a => a.txid)
  const txInputs = []

  for (let input of proof.inputs) {
    onChainInputs.map(inputTx => {
      if (inputTx === input.tx.identityHash) txInputs.push(inputTx)
    })
  }

  // we now have txInputs, a list of the on-chain input transactions, we need to check that
  // for each of the outputs of the input proof, the output points to one AND ONLY
  // one of the transactions in txInputs
  for (let input of proof.inputs) {
    for (let output of input.outputs) {
      switch (output.outpoint) {
        case 'UTXO' :

          break

        case 'vout' :
          const txIns = txInputs.slice()
          const correctTxIns = txIns.filter(txInput =>
            txInput.previous_output.vout === output.vout)
          assert(correctTxIns.length === 1, 'rgb input cannot be found on chain')
          break
      }
    }
  }
}

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

function getContracts (proof, contracts) {
  if (!contracts) contracts = {}
  if (proof.contract) {
    assert(!proof.inputs.length, 'root proof can have no inputs.')
    var serializedContract = contractCode.encode(proof.contract)
    var contractId = getIdentityHash(serializedContract).toString('hex')
    // find contract assigned to assetId
    if (!contracts.hasOwnProperty(contractId)) {
      contracts[contractId] = (proof.contract)
    } else if (JSON.stringify(contracts[contractId])
      !== JSON.stringify(proof.contract)) {
        throw new Error('only one contract per asset.')
    }
  } else {
    for (let input of proof.inputs) {
      // check whether upstream proofs move asset
      // use recursively to find root proof.
      getContracts(input, contracts)
    }
  }
  // TODO: handle reissuance case.
  return contracts
}

function getScript (proof, assetId) {
  let contracts = getContracts(proof)
  let commitmentScheme = contracts[assetId].commitment_scheme
  let script = String()
  let contractHash = getIdentityHash(proofCode.encode(proof))

  switch (commitmentScheme) {
    // OP_RETURN
    case 0x01 :
      script += 'OP_RETURN '
      script += contractHash.toString('hex')
      break

    // pay-to-contract
    case 0x02 :
      script += 'OP_DUP '
      script += 'OP_HASH160 '
      let originalKey = proof.originalPK
      let tweakedKey = tweakKey(originalKey, contractHash)
      // should be base58 encoded
      script += tweakedKey.toString('hex') + ' '
      script += 'OP_EQUALVERIFY '
      script += 'OP_CHECKSIG'
      break
  }
  return script
}

function allScripts (proof) {
  let scripts = getInputAmounts(proof)
  for (let key of Object.keys(scripts)) {
    scripts[key] = getScript(proof, key)
  }
  return scripts
}

function tweakKey (publicKey, tweak) {
  if (!Buffer.isBuffer(publicKey)) publicKey = Buffer.from(publicKey, 'base58') // need to get bitcoin key encoding
  if (!Buffer.isBuffer(tweak)) tweak = Buffer.from(tweak)
  const source = [
    publicKey,
    Buffer.from("RGB"),
    tweak
  ]
  var input = Buffer.concat(source)
  var tweakedKey = getIdentityHash(input)

  return tweakedKey
}

function getInputAmounts (proof, address) {
  // if (!Buffer.isBuffer(assetid)) assetId = Buffer.from(assetid, 'hex')
  var assetAmounts = {}
  if (proof.contract) {
    var assetId = getIdentityHash(contractCode.encode(proof.contract)).toString('hex')
    assert(!proof.inputs.lengths, 'root proofs cannot have upstream proofs')
    assert(!assetAmounts.hasOwnProperty(assetId), 'asset cannot have multiple roots')
    assetAmounts[assetId] = proof.contract.total_supply
    return assetAmounts
  } else {
    for (let input of proof.inputs) {
      assetAmounts = getOutputAmounts(input, assetAmounts, address)
    }
  }
  return assetAmounts
}

function getOutputAmounts (proof, assetAmounts, address) {
  if (!assetAmounts) assetAmounts = {}
  for (let output of proof.outputs) {
    if (!address || output.outpoint.address === address) {
      if (assetAmounts.hasOwnProperty(output.assetId)) {
        assetAmounts[output.assetId] += output.amount
      } else {
        assetAmounts[output.assetId] = output.amount
      }
    }
  }
  return assetAmounts
}
