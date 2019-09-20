const test = require('tape')
const ptape = require('tape-promise').default
const ptest = ptape(test)
const rgbSchema = require('./schema.js')
const Wallet = require('./index.js')

const rpcInfoNode1 = {
  port: 18443,
  username: 'node1',
  password: 'a',
  datadir: '../bitcoind',
  wallet: '1'
}

const rootProof = {
  ver: 1,
  format: 'root',
  schema: 'sm1m3pkuxxyl0rp3e6drhlhw40f8uhg0xx9qem57jq32dhxmzzfgvpsgvqvjw',
  network: 'testnet',
  root: '5700bdccfc6209a5460dc124403eed6c3f5ba58da0123b392ab0b1fa23306f27:4',
  type: 'primary_issue',
  fields: {
    title: 'Private Company Ltd Shares',
    ticker: 'PLS',
    dust_limit: 1
  },
  seals: [
    {
      type: 'assets',
      ticker: 'PLS',
      outpoint: 'e4f7881de6747d99e00d7b4db95daafddc95ea7079754d2d45d63758beaa8eab:0',
      amount: 1000000
    },
    {
      type: 'inflation',
      outpoint: '3836633ab081b3218ee59b89c3316949ed7e020b5144a70220cc2080a8b64b38:0'
    },
    {
      type: 'upgrade',
      outpoint: '53bb7537de9a8a76b044607c093fb2d7c9791a5a9ab5e95eb2c9366006248362:0'
    },
    {
      type: 'pruning',
      outpoint: 'aea48039c4db6fdc46fe767ee9a0d00896142a0e8e388098707382febc3dbb0c:0'
    }
  ],
  pubkey: '0262b06cb205c3de54717e0bc0eab2088b0edb9b63fab499f6cac87548ca205be1'
}

const opts1 = {
  rpcInfo: rpcInfoNode1
}

test('wallet API', (t) => {
  const w = new Wallet('test', [rootProof], [rgbSchema], opts1)

  t.assert(w, 'wallet is created')
  t.deepEqual(w.proofs, [rootProof], 'proofs correctly loaded')
  t.assert(w.client, 'client initialised')
  t.deepEqual(w.schemas, [rgbSchema], 'schemas correctly loaded')
  t.assert(w.sortProofs, 'sortProofs method exists')
  t.assert(w.indexSchema, 'indexSchema method exists')
  t.assert(w.sortUTXOs, 'sortUTXOs method exists')
  t.assert(w.update, 'update method exists')
  t.assert(w.updateAssets, 'updateAssets method exists')
  t.assert(w.updateProofs, 'updateProofs method exists')
  t.assert(w.transfer, 'transfer method exists')
  t.assert(w.generateAddresses, 'generateAddresses method exists')
  t.assert(w.accept, 'accept method exists')
  t.assert(w.send, 'send method exists')
  t.end()
})

ptest('initialise wallet', async t => {
  const expectedAssets = [
    {
      tx: 'e4f7881de6747d99e00d7b4db95daafddc95ea7079754d2d45d63758beaa8eab',
      vout: 0,
      asset: 'PLS',
      amount: 1000000
    }
  ]

  const w = new Wallet('test', [rootProof], [rgbSchema], opts1)

  await w.init()
  t.deepEqual(w.assets, expectedAssets, 'wallet has expected assets')
  t.true(Array.isArray(w.utxos), 'wallet.utxos is an array')
  t.true(w.utxos.length > 0, 'wallet.utxos is an array of length greater than 0')
  console.log(w.assets)
})
