var fs = require('fs')
var proofCode = require('../../rgb-encoding/proof.js')
var sodium = require('sodium-native')
var contractCode = require('../../rgb-encoding/contract.js')
const Client = require('bitcoin-core')

const client = new Client({
  network: 'regtest',
  username: 'node',
  password: '12345678',
  port: 18443
})

var test
client.listUnspent().then((list) => test = list)


function UTXO (txid, vout) {
  return {
    'txid': txid,
    'vout': vout
  }
}

function contract (title, issuanceUTXO, totalSupply, minAmount, maxHops, commitmentScheme, ownerUTXO) {
  var contract = {
    'title': title,
    'version': 234,
    'description': 'string',
    'contract_url': 'string',
    'issuance_utxo': issuanceUTXO,
    'network': '43fe44',
    'total_supply': totalSupply,
    'min_amount': minAmount,
    'max_hops': maxHops,
    'reissuance_enabled': true,
    'reissuance_utxo': '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    'burn_address': 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    'commitment_scheme': commitmentScheme,
    'blueprint_type': 1,
    'owner_utxo': ownerUTXO
  }
  return contract
}

function outpoint (type, address) {
  return {
    'type': type,
    'address': address
  }
}

function output (assetId, amount, outpoint) {
  var output = {
    'assetId': assetId,
    'amount': amount,
    'outpoint': outpoint
  }
  return output
}

function getIdentityHash (item) {
  var identityHash = Buffer.alloc(sodium.crypto_hash_sha256_BYTES)
  sodium.crypto_hash_sha256(identityHash, item)
  sodium.crypto_hash_sha256(identityHash, identityHash)
  return identityHash
}

// TODO: function to receive and parse previous proofs
        // ie from array of proofs, figure out if this output is referenced
        // function to make array of outputs
        // function to look at onchain parts -> eg generate tx input

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

function proofBuilder (proofs, tx, outputs, metadata, originalPK) {
  var proof = {}
  proof.inputs = []
  for (let input of proofs) {
    proof.inputs.push(input)
  }
  proof.tx = tx
  proof.outputs = outputs

  if (metadata) proof.metadata = metadata
  if (originalPK) proof.originalPK = originalPK

  return proof
}

// TODO: extend to apply to case where identifier is not given
// gather input amounts for a given asset : identifier
function checkInputs (proof, identifier) {
  var inputAmounts = {}

  if (proof.inputs.length === 0) {
    checkOutputs(proof, identifier, inputAmounts)
  } else {
    for (let input of proof.inputs) {
      checkOutputs(input, identifier, inputAmounts)
    }
  }
  return inputAmounts
}

// check outputs for a given asset : identifier
function checkOutputs (proof, identifier, outputs) {
  if (!outputs) outputs = {}
  for (let output of proof.outputs) {
    let assetId = output.assetId
    if (identifier === output.outpoint.address) {
      if (!outputs[assetId]) outputs[assetId] = 0
      outputs[output.assetId] += output.amount
    }
  }
  return outputs
}

// function to generate addresses for testing purposes
function stringGen (n) {
  var result = ''
  for (let i = 0; i < 10; i++) {
    result += Math.random().toString('16').substring(2)
  }
  return result.substring(0, n)
}

// this should represent onchain tx --> check inputs against proof outputs!
function txBuilder (address, inputs, outputs) {
  var tx = {
    inputs: inputs,
    result: {
      id: address,
      outputs: []
    }
  }

  for (let i = 0; i < outputs; i++) {
    tx.result.outputs.push(i)
  }

  return tx
}

function getAssetsByUTXO (proof, assets) {
  if (!assets) assets = {}

  for (output of proof.outputs) {
    let outpoint = output.outpoint.address
    if (!assets[outpoint]) assets[outpoint] = [] 

    assets[outpoint].push({
      assetId: output.assetId,
      amount: output.amount
    })
  }

  return assets
}

function getInputsByUTXO (proof, assets) {
  if (!assets) assets = {}

  for (input of proof.inputs) {
    assets[input.tx.id] = getAssetsByUTXO(input)
  }

  return assets
}

function getOutputsByAsset (proof) {
  let assetOutputs = {}

  const UTXoAmounts = getAssetsByUTXO(proof)
  const bindTo = proof.tx.id

  for (let vout of Object.keys(UTXoAmounts)) {
    let outputs = UTXoAmounts[vout]

    for (let output of outputs) {
      const assetId = output.assetId
      if (!assetOutputs[assetId]) assetOutputs[assetId] = {
        UTXOs: [],
        amount: 0
      }

      assetOutputs[assetId].UTXOs.push({
        tx: bindTo,
        vout: vout,
        amount: output.amount
      })

      assetOutputs[assetId].amount += output.amount
    }
  }

  return assetOutputs
}

// what is needed: the current txid so that inputs may be checked
// generate list of outputs, then generate proof

var addressList = JSON.parse(fs.readFileSync('./fixtures/addresses'))
var transactions = JSON.parse(fs.readFileSync('./fixtures/transactions'))

/////////////////////////////////////
///         MINT NEW ASSETS       ///
/////////////////////////////////////

// var contract1 = contract('1', outpoint('address', 3), Math.floor(Math.random() * 10000), 10, 10, 1, addressList.pop())
// var tx = txBuilder(contract1.owner_utxo, 2, addressList)
// transactions[tx.result.id] = tx

// var outputs = []
// var supply = contract1.total_supply

// while (outputs.length < 1) {
//   var outpoint1 = outpoint("address", outputs.length + 1)
//   let outputAmount = Math.floor(Math.random() * supply)
//   if (outputs.length == 0) {
//     outputs.push(output(1, supply, outpoint1))
//   } else {
//     outputs.push(output(1, outputAmount, outpoint1))
//     supply -= outputAmount
//   }
// }

// var rootProof = rootProofBuilder(contract1, tx.result, 'hello', null, outputs)
// // console.log(checkInputs(rootProof, 1))
// var rootProofWrite = JSON.stringify(rootProof, null, 2)
// fs.writeFileSync('./root3.proof', rootProofWrite, (err) => {
//   if (err) throw err
// })

/////////////////////////////////////

try {
  var assets = JSON.parse(fs.readFileSync('./fixtures/minted.assets'))
} catch (err) {
  console.log(err)
  var assets = {}
}
// var assetId = getIdentityHash(contractCode.encode(contract1))
// assets[assetId.toString('hex')] = contract1

// fs.writeFile('./minted.assets', JSON.stringify(assets, null, 2), (err) => {
//   if (err) throw err
// })

// fs.writeFile('./addresses', JSON.stringify(addressList), (err) => {
//   if (err) throw err
// })

/////////////////////////////////////
///         TRANSFER PROOFS       ///
/////////////////////////////////////

var rootProof1 = JSON.parse(fs.readFileSync('./fixtures/root1.proof'))
var rootProof2 = JSON.parse(fs.readFileSync('./fixtures/root2.proof'))
var rootProof3 = JSON.parse(fs.readFileSync('./fixtures/root3.proof'))

var txInputs = [
  {
    txid: rootProof1.tx.id,
    output: 1
  },
  {
    txid: rootProof2.tx.id,
    output: 1
  }
]

// for (let input of proof.inputs) {
//   var asset
// }

var newOutputs = []
var assetId1 = rootProof1.outputs[0].assetId
var assetId2 = rootProof2.outputs[0].assetId

newOutputs.push(output(assetId1, checkInputs(rootProof1, 1)[assetId1] - 1000, outpoint('address', 0)))
newOutputs.push(output(assetId2, checkInputs(rootProof2, 1)[assetId2] - 1500, outpoint('address', 0)))
newOutputs.push(output(assetId1, 1000, outpoint('address', 2)))
newOutputs.push(output(assetId2, 1500, outpoint('address', 3)))

var bindTo = txBuilder(addressList.pop(), txInputs, 4)

var proof = proofBuilder([rootProof1, rootProof2], bindTo.result, newOutputs, 'hello')
proof = JSON.stringify(proof, null, 2)

fs.writeFile('./fixtures/new.proof', proof, (err) => {
  if (err) throw err
})

// idea is to check tx inputs and match them to the proof 
// outputs to see how many assets are controlled by the transaction
// issue: must record which UTXO output corresponds to proof output
// status: use getAssetUTXO with blochain explorer to find out which assets a tx has access to.
// setTimeout(() => console.log(test), 22)
// console.log(checkInputs(rootProof1, 1))
// console.log('checkInputs([rootProof1])')
proofAssets = getAssetsByUTXO(JSON.parse(proof))
let amounts = Object.values(proofAssets).reduce(arrayConcat, [])

function arrayConcat(sum, next) {
  return sum.concat(next)
}
  
for (let asset of amounts) {
  let assetId = asset.assetId
  if (!assets[assetId]) assets[assetId] = 0
  assets[assetId] += asset.amount
}
console.log(amounts)
// console.log(JSON.stringify(getOutputsByAsset(JSON.parse(proof)), null, 2))
//////////////////////////////////////

// fs.writeFile('./transactions', JSON.stringify(transactions, null, 2), (err) => {
//   if (err) throw err
// })
  
// var example = JSON.parse(fs.readFileSync('../utils/verification/example.proof').toString())
// console.log(checkOutputs(example.outputs, '49cafdbc3e9133a75b411a3a6d705dca2e9565b660123b6535babb7567c28f02'))
