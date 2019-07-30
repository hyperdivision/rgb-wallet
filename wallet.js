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
    this.wallet = null
  }

  update () {
    const self = this
    return getAssets(self.proofs, self.client).then(assets => {
      self.wallet = assets
      self.emit('assets', assets)
      return assets
    })
  }
}

var proof1 = JSON.parse(fs.readFileSync('./proof/fixtures/new.proof'))

let proofs = [proof1]

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
  '2e4fea47c555bde34ea7f430bfba73295a9385842228146252d5038814666c5b': 1200,
  '6d077e4aa88cb9f5ac89b720bc03ef63af29591f3c28ceb406581cc1b0e650ea': 600  
}

wallet.on('assets', () => {
  console.log(transferAsset(wallet.wallet, amounts))
})

wallet.update()


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
function mintAsset (contract, issuanceUTXO) {
  // build contract
  let proof = {}
  // make UTXO with OP_RETURN proof.contract = contract
}

function transferAsset (assets, request) {
  // first check wallet has sufficient assets
  for (let asset of Object.keys(request)) {
    assert(assets[asset].amount >= request[asset],
      'Insufficient assets')
  }

  // sort available inputs
  const availableInputs = sortByUTXO(assets, Object.keys(request))

  // perform coin selection
  const selectedInputs = coinSelector(availableInputs, request)

  // construct transfer proof
  const 

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

    let bestChoices = Object.keys(diffs).sort((obj, compare) => {
      Object.values(diffs[compare]).reduce((a, b) => a + b, 0)
      - Object.values(diffs[obj]).reduce((a, b) => a + b, 0)
    })

    let selectedUTXO = bestChoices[0]
    
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

    return transactions
  }
}
  // make new transfer proof
  // tweak keys
  // make transfer tx

// function receiveAsset
	// index UTXO as rgb asset
	// update asset holding
	// acceptTransferProof (below)

// function acceptTransferProof
// verify integrity of proposed transfer proof


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

var assets = {}

async function getAssets (proofs, client) {
  if (!proofs.length) return {}
  const result = await client.listUnspent()
    .then(getTotalAssets(proofs))
    .then(assets => { return assets })
    .catch(console.error)
  return result
}

// console.log(assets)
// use getUnspentTransactionOUtputs RPC call
// cross reference with database of active proofs
// return total asset count together with relevant UTXO indices
