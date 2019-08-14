const assert = require('assert')
const fs = require('fs')
const sodium = require('sodium-native')
const secp256k1 = require('secp256k1')
const crypto = require('crypto')
const base58 = require('bs58')

module.exports = transferAsset

async function transferAsset (wallet, request) {
  const client = wallet.client
  const assets = wallet.assets
  const assetRequest = sortRequest(request)

  // 0. first check wallet has sufficient assets
  for (let asset of Object.keys(assetRequest)) {
    assert(assets[asset].amount >= assetRequest[asset],
      'Insufficient assets')
  }

  // 1. sort available inputs
  const availableInputs = sortByUTXO(assets, Object.keys(assetRequest))

  // 2. perform coin selection
  const selectedInputs = coinSelector(availableInputs, assetRequest)

  // 3. construct transfer proof
  const transferProof = proofBuilder(selectedInputs, request) //, { originalPK: '03fc1a4d87dccc570d3da7d7c98fa5c79a468d9584db339b4b347d41f121bc53a3' })
  console.log(transferProof.tx.id)

  // 4. build transaction to be signed
  const rawTx = await (txBuilder(selectedInputs, request, transferProof)
    .then((tx) => client.signRawTransactionWithWallet(tx)))

  //  5. add transacaction id to transfer proof
  client.decodeRawTransaction(rawTx.hex).then((tx) => {
    transferProof.tx.id = tx.txid
  }).then(() => console.log(transferProof.tx.id))
  
  // TODO 6. async verification

  // 7. sign and send transaction
  client.signRawTransactionWithWallet(rawTx)
    .then(() => client.sendRawTransaction(rawTx))

  // subtract UTXO asset amounts from requested amounts and
  // choose UTXO which yields least outstanding balance
  function coinSelector (availableInputs, assetRequest, selectedInputs) {
    if (!selectedInputs) selectedInputs = []
    if (Object.keys(assetRequest).length === 0) return selectedInputs
    let diffs = {}

    for (let [utxo, assets] of Object.entries(availableInputs)) {
      for (let asset of assets) {
        if (!Object.keys(assetRequest).includes(asset.asset)) continue

        if (!diffs[utxo]) diffs[utxo] = { ...assetRequest }
        let diff = assetRequest[asset.asset] - asset.amount
        diffs[utxo][asset.asset] = diff < 0 ? 0 : diff
      }
    }

    let selectedUTXO = null

    try {
      // filter for all inputs which satisfy remaining request
      let sufficientInputs = Object.keys(diffs).filter((key) =>
        Object.values(diffs[key]).reduce((a, b) => a + b, 0) === 0)

      if (!sufficientInputs.length) throw new Error()

      // sort possible inputs by number of assets bound to UTXO
      sufficientInputs.sort((a, b) =>
        availableInputs[b].length - availableInputs[a].length)

      // select the UTXO with the least assets bound to it
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
    delete availableInputs[selectedUTXO]
    assetRequest = diffs[selectedUTXO]

    if (Object.keys(assetRequest).length !== 0) {
      for (let [key, value] of Object.entries(assetRequest)) {
        if (value === 0) delete assetRequest[key]
      }
    }
    
    return coinSelector(availableInputs, assetRequest, selectedInputs)
  }

  // constructs new transfer proof
  function proofBuilder (inputs, request, opts) {
    const proof = {}
    opts = opts || {}

    proof.inputs = []
    for (let input of inputs) {
      proof.inputs.push(wallet.sortProofs()[input])
    }

    // tx field not committed to, only added after commitment in tx
    proof.tx = {
      outputs: []
    }

    // format outputs correctly, only supports vout structure
    proof.outputs = request.map((item) => {
      const output = {}
      output.assetId = Object.keys(item)[1]
      output.amount = item[output.assetId]
      output.outpoint = {
        type: 'address',
        address: request.indexOf(item) + 1
      }
      proof.tx.outputs.push(output.outpoint.address)
      return output
    })

    if (opts.metadata) proof.metadata = opts.metadata
    if (opts.originalPK) proof.originalPK = opts.originalPK

    return proof
  }

  // make transfer tx
  async function txBuilder (selectedInputs, request, proof) {
    // first format inputs for createRawTransaction rpc
    const inputs = []
    let btcAmount = 0

    let rpcInputs = []
    for (let input of selectedInputs) {
      let [txid, vout] = input.split(':')
      vout = parseInt(vout)

      const formattedInput = {
        txid: txid,
        vout: vout
      }

      inputs.push(formattedInput)

      const inputUTXO = wallet.utxos.filter(utxo =>
        utxo.txid === txid && utxo.vout === vout)

      assert(inputUTXO.length === 1, 'invalid input, UTXO either not present or not unique')
      btcAmount += inputUTXO[0].amount
      rpcInputs.push({
        "txid": txid,
        "vout": vout
      })
    }

    // next construct outputs
    const rpcOutputs = []
    for (let address of request.map(req => req.address)) {
      const output = {}
      if (!output[address]) output[address] = 0
      output[address] += btcAmount / Object.keys(request).length
      rpcOutputs.push(output)
    }
    // console.log(rpcOutputs)

    // remove fees from change output, arbitrarily chosen to be the 0th
    const fees = 0.005
    rpcOutputs[0][Object.keys(rpcOutputs[0])[0]] -= fees

    // compute SHA256 of serialized proof
    const commitement = Buffer.alloc(32)
    let proofHash = Buffer.alloc(32)
    const proofTag = Buffer.from('rgb:proof')
    // let serializedProof = proofCode.encode(proof)
    sodium.crypto_hash_sha256(proofHash, proofHash)

    // for pay-to-contract
    if (proof.originalPK) {
      PK = Buffer.from(proof.originalPK, 'hex')
      const tagHash = Buffer.alloc(32)
      sodium.crypto_hash_sha256(tagHash, proofTag)

      // format data to be committed to according to Taproot BIP
      const toHash = Buffer.concat([tagHash, tagHash, PK, proofHash])
      sodium.crypto_hash_sha256(commitement, toHash)

      // tweakedKey = originalKey + (commitmentHash * G)
      const tweakedPK = secp256k1.publicKeyTweakAdd(PK, commitement)
      const tweakedAddress = generateBTCAddress(tweakedPK, 'regtest')

      // get corresponding output and replace with the tweaked address
      const commitmentAddress = generateBTCAddress(PK, 'regtest')
      for (let output of rpcOutputs) {
        const address = Object.keys(output)[0]
        if (address !== commitmentAddress) continue
        output[tweakedAddress] = output[commitmentAddress]
        delete output[address]
      }
    }
    
    // for OP_RETURN
    
    // const toHash = Buffer.concat([proofTag, proofHash])
    // sodium.crypto_hash_sha256(commitementHash, toHash)
    // rpcOutputs.push({"data": proofHash.toString('hex')})

    return await client.createRawTransaction(rpcInputs, rpcOutputs)
  }
}

// Helper functions:
// sort request to only list assets and amounts
function sortRequest (request) {
  const sortedRequest = {}
  request.map(entry => {
    const keys = Object.keys(entry)
    for (let key of keys) {
      if (key !== 'address') sortedRequest[key] = entry[key] 
    }
  })

  return sortedRequest
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
  // console.log(transactions)
  return transactions
}

function generateBTCAddress (publicKey, network) {
  assert(Buffer.isBuffer(publicKey), 'public key must be passed as raw bytes')

  const shaResult = Buffer.alloc(32)
  const ripemd160 = crypto.createHash('ripemd160')

  // first round SHA256
  sodium.crypto_hash_sha256(shaResult, publicKey)

  // compute RIPEMD160 of SHA result  
  const digest = ripemd160.update(shaResult).digest('hex')

  // prefix version byte
  switch (network) {
    case 'regtest': case 'testnet' :
      extendedDigest = '6f' + digest
      break

    case 'mainnet' :
      extendedDigest = '00' + digest
      break
  }

  // perform SHA256d of extended digest
  sodium.crypto_hash_sha256(shaResult, Buffer.from(extendedDigest, 'hex'))
  sodium.crypto_hash_sha256(shaResult, shaResult)

  // append first 4 bytes of SHAd result as checksum
  extendedDigest += shaResult.toString('hex').slice(0, 8)

  // base58 encode result
  const address = base58.encode(Buffer.from(extendedDigest, 'hex'))

  return address
}
