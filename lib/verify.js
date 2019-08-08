const verification = require('./verification/proof.js')

async function verify (wallet, proof) {
  // 1. verify internal structure of proof
  verification.structure(proof)

  // 2. retrieve onchain transaction to which this proof
  // is bound and verify commitments, outputs etc
  const commitmentTx = await wallet.fetchTx(proof.tx.id)
  verification.onChain(proof, commitmentTx)

  // 3. verify inputs from proof correspond to onchain txs
  let txInputs = commitmentTx.vin.map(a => a.txid)
  let result = []
  for (let input of proof.inputs) {
    txInputs = txInputs.map(inputTx => {
      if (inputTx === input.tx.id) result.push(inputTx)
    })
  }

  for (let input of proof.inputs) {
    const inputTx = await wallet.fetchTx(input.tx.id)
    verification.inputOnChain(proof, inputTx, commitmentTx)
  }
  return true
}

module.exports = verify