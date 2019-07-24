const Client = require('bitcoin-core')
const assert = require('nanoassert')
const { EventEmitter } = require('events')

const client = new Client({
  network: 'regtest',
  password: password,
  port: port
})

// want two wallets open, transacting with eachother and making proofs and verifying proofs?
async function spend() {
  let sendto = client.getNewAddress((err, address) => {
    if (err) throw err
    return address
  })
  let newtx = client.sendToAddress(sendto, amt, (err, tx) => {
    if (err) throw err
    return tx
  })
}

// rgb 
// -> send money, colour some of the outputs 
// -> rgb outputs are a subset of tx outputs

// what is needed: 
// -> make standard tx 
// -> build rgb proof based on this standard tx 
// -> modify tx to account for rgb outputs

// onchain
class RGbHandler extends EventEmitter {
  constructor (opts = {}) {
    super()

    
  }
}

class RGbAsset {
  contructor (contract) {
    super()

    this.assetId = getIdentityHash(contract)
    this.amount = 0
    this.UTXOs = {}
    this.contract = contract

    // store latest relevant ones to each asset
    // everytime they are updated -> update all assets
    // can store proofId in the UTXOs
    this.proofs = {}
  }

  // now we have this asset -> we want to add to our inventory
  // based on which UTXOs we own
  // now we have this asset -> we want to add to our inventory
  // based on which UTXOs we own
  
  spentColouredUTXOs(proof) {
    for (let input of proof.inputs) {
      for (output of input.tx.output) {
        let identifier = Buffer.concat([
          Buffer.from(input.tx.id),
          Buffer.from(output)
        ])

        identifier = getIdentityHash(identifier).toString('hex')

        delete this.UTXOs[identifier]
      }
    }

    return this.UTXOs
  }

  // when a tx is spent, the UTXOs have to be updated
  getColouredUTXOs(proofId) {
    // only for address based at the moment
    let proof = this.proofs[proofId]
    let outputs = proof.outputs.filter(output =>
      output.assetId === this.assetId)

    for (let output of outputs) {

      let identifier = Buffer.concat([
        Buffer.from(proof.tx.id),
        Buffer.from(output.outpoint.address)
      ])

      identifier = getIdentityHash(identifier).toString('hex')

      this.UTXOs[identifier] = {
        amount: output.amount,
        tx: proof.tx.id,
        vout: output.outpoint.address,
        proofId: proofId
      }
    }

    return this.UTXOs
  }

  // example controlled utxo input
  controlledUTXOs = {
    txid1: [list of vouts],
    txid2: ..
    .
    .
  }
 
  // this.amount should be updated everytime it is spent or received, make event for this
  amountReceived(proof, controlledUTXOs) {
    let assetOutputs = getOutputsByAsset(proof)[this.assetId].UTXOs
    let ownedAssets = assetOutputs
      .filter(UTXO => controlledUTXOs.hasOwnProperty(UTXO.tx))
      .filter(UTXO => controlledUTXOs[UTXO.tx].contains(UTXO.vout))

    let receivedAmount = ownedAssets.reduce((accumulator, UTXO) =>
      accumulator + UTXO.amount)

    return amount
  }

  // should extend this to pick the best for multiple inputs
  // return inputs array without filtering, then choose proof
  // which appears in most assets.
  selectInputs(amount) {
    assert(this.amount >= amount, 'insufficient assets')

    let inputs = Object.values(this.UTXOs)

    // look for UTXO, which satisfies asset amount exactly
    let exactInputs = inputs.filter(UTXO => UTXO.amount === amount)
    if (exactInputs.length) {
      return exactInputs[0]
    }

    // look for UTXOs that have enough assets and select the one
    // with the most assets
    let viableInputs = inputs.filter(UTXO => UTXO.amount > amount)
    if (viableInputs.length) {
      let maxInput = viableInputs.reduce((max, input) =>
        max = input.amount > max.amount ? input : max)
      return maxInput
    }

    // add the largest asset UTXOs until amount desired amount is reached
    inputs.sort((a, b) => a.amount - b.amount)
    let inputSum = 0
    let chosenInputs = []

    while (inputSum < amount) {
      if (inputs.length !== 0) {
        throw new Error('insufficient asset inputs')
      }

      let input = inputs.pop()
      chosenInputs.push(input)
      inputSum += input.amount
    }

    return inputs
  }

  pruneProofs() {
    let activeProofs = []
    for (let UTXO of this.UTXOs) {
      activeProofs.push(UTXO.proofId)
    }

    let toPrune = Object.keys(this.proofs).filter(proofId =>
      !activeProof.contains(proofId))

    while (toPrune.length != 0) {
      delete this.proofs[toPrune.pop()]
    }
  }
}

// need something that will fetch relevant proofs.


// events:
// spend   -> asset.selectInputs(amount)
//         -> *build proof*
//         -> asset.spentColouredUTXOs(proof)
//         -> remove old proof from this.proofs

// receive -> this.amount += asset.amountReceived(proof)
//         -> this.UTXOs.push(...getColouredUTXOs())


const  = new RGbAsset()

RGbHandler.on('')
// listens for newTx or proof?
// has list of coloured outputs
// collects relevant UTXOs for proof
// builds proof.inputs from proofs of UTXO inputs
// assembles proof.- 

// required functions:
function mintAsset
// build contract
// make UTXO with OP_RETURN

function transferAsset
// select input UTXOs
// calculate assets available for transfer
// make new transfer proof
// tweak keys
// make transfer tx

function receiveAsset
// index UTXO as rgb asset
// update asset holding

function acceptTransferProof
// verify integrity of proposed transfer proof

function getTotalAssets
// use getUnspentTransactionOUtputs RPC call
// cross reference with database of active proofs
// return total asset count together with relevant UTXO indices