const Client = require('bitcoin-core')
const assert = require('nanoassert')
const fs = require('fs')
const rgbEncode = require('../rgb-encoding/contract.js')
const { EventEmitter } = require('events')
// const utils = require('./parse-proof/index.js')

const client = new Client({
  network: 'regtest',
  username: 'node1',
  password: 'password',
  port: 18443
})

// need to import list of controlled UTXOs

// FROM KALEIDOSCOPE
  // burn
  // getNewAddress
  // issueAsset
  // sendToAddress
  // sync
  // mod

// need something that will fetch relevant proofs.
class RgbWallet extends EventEmitter {
  constructor (name, proofs, opts) {
    super()

    this.name = name
    // this.storage = opts.storage || newDirPath()
    this.rpcInfo = opts.rpcInfo

    // this should be the only class
    // in dialogue with client
    this.proofs = proofs
    this.client = new Client(this.rpcInfo)
    this.assets = null
  }

  sortProofs (proofs) {
    const proofsByUTXO = {}
    for (let proof of proofs) {
      for (let output of proof.tx.outputs) {
        let outpoint = `${proof.tx.id}:${output}`
        proofsByUTXO[outpoint] = proof
      }
    }
    return proofsByUTXO
  }

  update () {
    const self = this
    let promise = listUnspent(self.client)
    self.emit('update', promise)
  }

  updateAssets (getUTXOs) {
    const self = this
    getUTXOs.then(getTotalAssets(self.proofs))
      .then(assets => {
        self.assets = assets
        return assets
    })
  }

  updateProofs () {
    const self = this
    return (UTXOs) => {
      let activeVouts = UTXOs.map(item => `${item.txid}:${item.vout}`)

      let proofs = self.sortProofs(self.proofs)
      for (let outpoint of Object.keys(proofs)) {
        if (!activeVouts.includes(outpoint)) delete proofs[outpoint]
      }

      self.proofs = self.proofs.filter((proof) =>
        Object.values(proofs).includes(proof))
      return self.proofs
    }
  }
}

var proof1 = JSON.parse(fs.readFileSync('./proof/fixtures/new.proof'))
var proof2 = JSON.parse(fs.readFileSync('./proof/fixtures/running.proof'))

let proofs = [proof1, proof2]
console.log(proofs)


const rpcInfoNode2 = {
  network: 'regtest',
  username: 'node1',
  password: 'password',
  port: 18443
}

const optsNode2 = {
  rpcInfo: rpcInfoNode2,
}

const wallet = new RgbWallet('node2', proofs, optsNode2)

var amounts = {
  '2e4fea47c555bde34ea7f430bfba73295a9385842228146252d5038814666c5b': 3300,
  '6d077e4aa88cb9f5ac89b720bc03ef63af29591f3c28ceb406581cc1b0e650ea': 800
}

wallet.on('update', (promise) => wallet.updateAssets(promise))
wallet.on('update', (promise) => 
  promise.then(wallet.updateProofs()))

wallet.update()

setTimeout(() => console.log(wallet.assets), 200)
// setTiconsole.log(transferAsset(wallet, amounts))

// events:
  // spend   -> asset.selectInputs(amount)
    //         -> *build proof*
    //         -> asset.spentColouredUTXOs(proof)
    //         -> remove old proof from this.proofs

  // receive -> this.amount += asset.amountReceived(proof)
    //         -> this.UTXOs.push(...getColouredUTXOs())



// RGbHandler.on('')
  // listens for newTx or proof?
  // has list of coloured outputs
  // collects relevant UTXOs for proof
  // builds proof.inputs from proofs of UTXO inputs
  // assembles proof.- 

// required functions:
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

function transferAsset (wallet, request) {
  let assets = wallet.assets

  // 0. first check wallet has sufficient assets
  for (let asset of Object.keys(request)) {
    console.log(assets, asset, assets[asset])
    assert(assets[asset].amount >= request[asset],
      'Insufficient assets')
  }

  // 1. sort available inputs
  const availableInputs = sortByUTXO(assets, Object.keys(request))
  console.log(availableInputs)

  // 2. perform coin selection
  const selectedInputs = coinSelector(availableInputs, request)
  return selectedInputs

  // 3. construct transfer proof
  const transferProof = proofBuilder(inputs, proofs, outputs, opts)

  // sort rgb inputs according to UTXO
  function sortByUTXO (assets, transfers) {
    var transactions = {}

    for (let asset of Object.keys(assets)) {
      if (!transfers.includes(asset)) continue
      let inputs = assets[asset].txList

      for (let input of inputs) {
        const label = `${input.tx}:${input.vout}`
        if (!transactions[label]) transactions[label] = []
        transactions[label].push({
          asset: asset,
          amount: input.amount
        })
      }
    }
    // console.log(transactions)
    return transactions
  }

  // subtract UTXO asset amounts from requested amounts and
  // choose UTXO which yields least outstanding balance
  function coinSelector (inputs, request, selectedInputs) {
    if (!selectedInputs) selectedInputs = []
    if (Object.keys(request).length === 0) return selectedInputs
    let diffs = {}
    for (let [utxo, assets] of Object.entries(inputs)) {
      for (let asset of assets) {
        if (!Object.keys(request).includes(asset.asset)) continue

        if (!diffs[utxo]) diffs[utxo] = { ...request }
        let diff = request[asset.asset] - asset.amount
        diffs[utxo][asset.asset] = diff < 0 ? 0 : diff
      }
    }
    console.log(diffs)

    let selectedUTXO = null

    try {
      // filter for all inputs which satisfy remaining request
      let sufficientInputs = Object.keys(diffs).filter((key) =>
        Object.values(diffs[key]).reduce((a, b) => a + b, 0) === 0)
      if (!sufficientInputs.length) throw new Error()

      // select the UTXO with the least assets bound to it
      sufficientInputs.sort((a, b) => inputs[b].length -inputs[a].length)
      selectedUTXO = sufficientInputs.pop()
    } catch {
      // select the UTXO which leaves least remaining requests
      let bestChoices = Object.keys(diffs).sort((obj, compare) => {
        Object.values(diffs[compare]).reduce((a, b) => a + b, 0)
        - Object.values(diffs[obj]).reduce((a, b) => a + b, 0)
      })
      selectedUTXO = bestChoices[0]
    }
    
    assert(selectedUTXO, 'coin selection failed')

    selectedInputs.push(selectedUTXO)
    delete inputs[selectedUTXO]
    request = diffs[selectedUTXO]

    if (Object.keys(request).length !== 0) {
      for (let [key, value] of Object.entries(request)) {
        if (value === 0) delete request[key]
      }
    }
    
    return coinSelector(inputs, request, selectedInputs)
  }

  // constructs new transfer proof
  function proofBuilder (inputs, proofs, outputs, opts) {
    const proof = {}
    proof.inputs = []
    for (let input of inputs) {
      proof.inputs.push(proofs[input])
    }

    proof.tx = {
      id: '',
      outputs: []
    }

    for (let i = 0; i < outputs.length; i++) {
      proof.tx.outputs.push(i + 1)
    }

    proof.outputs = outputs

    if (opts.metadata) proof.metadata = opts.metadata
    if (opts.originalPK) proof.originalPK = opts.originalPK

    return proof
  }

  // make transfer tx
  function txBuilder () {

  }
}

  // tweak keys

function requestAsset () {

}

function receiveAsset () {
  function acceptTransferProof (proof) {

  }
  // verify integrity of proposed transfer proof

  // index UTXO as rgb asset
  // update asset holding
}

// returns list of assets and amounts together with
// the list of tx and the amount of asset each holds
function getTotalAssets (proofs) {
  const assets = {}

  // reducer function
  function arrayConcat(sum, next) {
    return sum.concat(next)
  }

  return (UTXOs) => {
    let TxIDs = UTXOs.map(item => item.txid)

    // for each proof, check if txid is in list from btc-rpc
    for (let proof of proofs) {
      if (!TxIDs.includes(proof.tx.id)) continue
      proofAssets = getAssetsByUTXO(proof)
      let amounts = Object.values(proofAssets).reduce(arrayConcat, [])

      for (let asset of amounts) {
        let assetId = asset.assetId
        let vout = Object.keys(proofAssets).find((key) =>
          proofAssets[key].includes(asset))

        if (!assets[assetId])  assets[assetId] = { txList: [] }
        
        assets[assetId].txList.push({
          tx: proof.tx.id,
          vout: vout,
          amount: asset.amount
        })

        assets[assetId].amount = assets[assetId].txList.reduce(
          (acc, entry) => acc + entry.amount, 0)
      }
    }
    return assets
  }
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

async function listUnspent (client) {
  if (!proofs.length) return {}
  return await client.listUnspent()
}

function proofsByUTXO (self) {
  return (UTXOs) => {
    let activeVouts = UTXOs.map(item => `${item.txid}:${item.vout}`)

    const proofsByUTXO = {}
    for (let proof of self.proofs) {
      for (let output of proof.tx.outputs) {
        let outpoint = `${proof.tx.id}:${output}`
        if (!activeVouts.includes(outpoint)) continue
        proofsByUTXO[outpoint] = proof
      }
    }
    return proofsByUTXO
  }
}


// console.log(assets)
// use getUnspentTransactionOUtputs RPC call
// cross reference with database of active proofs
// return total asset count together with relevant UTXO indices
