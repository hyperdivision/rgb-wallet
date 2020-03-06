const assert = require('nanoassert')

module.exports = coinSelector

function coinSelector (availableInputs, assetRequest, selectedInputs) {
  // subtract UTXO asset amounts from requested amounts and
  // choose UTXO which yields least outstanding balance
  if (!selectedInputs) selectedInputs = []
  if (Object.keys(assetRequest).length === 0) return selectedInputs
  const diffs = {}

  for (const [utxo, assets] of Object.entries(availableInputs)) {
    for (const asset of assets) {
      if (!Object.keys(assetRequest).includes(asset.asset)) continue

      if (!diffs[utxo]) diffs[utxo] = { ...assetRequest }
      const diff = assetRequest[asset.asset] - asset.amount
      diffs[utxo][asset.asset] = diff < 0 ? 0 : diff
    }
  }

  let selectedUTXO = null

  try {
    // filter for all inputs which satisfy remaining request
    const sufficientInputs = Object.keys(diffs).filter((key) =>
      Object.values(diffs[key]).reduce((a, b) => a + b, 0) === 0)

    if (!sufficientInputs.length) throw new Error()

    // sort possible inputs by number of assets bound to UTXO
    sufficientInputs.sort((a, b) =>
      availableInputs[b].length - availableInputs[a].length)

    // select the UTXO with the least assets bound to it
    selectedUTXO = sufficientInputs.pop()
  } catch {
    // select the UTXO which leaves least remaining requests
    const bestChoices = Object.keys(diffs).sort((obj, compare) => {
      Object.values(diffs[compare]).reduce((a, b) => a + b, 0) -
        Object.values(diffs[obj]).reduce((a, b) => a + b, 0)
    })
    selectedUTXO = bestChoices[0]
  }

  assert(selectedUTXO, 'coin selection failed')

  selectedInputs.push(selectedUTXO)
  delete availableInputs[selectedUTXO]
  assetRequest = diffs[selectedUTXO]

  if (Object.keys(assetRequest).length !== 0) {
    for (const [key, value] of Object.entries(assetRequest)) {
      if (value === 0) delete assetRequest[key]
    }
  }

  return coinSelector(availableInputs, assetRequest, selectedInputs)
}
