const test = require('tape')
const ptape = require('tape-promise').default
const ptest = ptape(test)
const rgbSchema = require('./schema.js')
const Wallet = require('./index.js')
const mint = require('./lib/mint-asset.js')

const rpcInfoNode1 = {
  port: 18446,
  username: 'lnd',
  password: 'password',
  network: 'regtest',
  // datadir: '../bitcoind',
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
      txid: '9db9396ecb4b1dbe8c6fca1f7cc9f6d945ab6dc2c14ca6d9ac8ffbf17c5babac',
      vout: 0,
      ticker: 'PLS',
      amount: 1000000
    },
    {
      type: 'inflation',
      txid: '795f71a8be38f8baee18fa27ee90262b395ca3bd9214c10ffe76133882f504fb',
      vout: 0
    },
    {
      type: 'upgrade',
      txid: 'ab7672e5cb084005a85b447c52a15d97ea8ec047e1b20dc4c3ec91e1fb0584fc',
      vout: 0
    },
    {
      type: 'pruning',
      txid: 'a9fc4d1f30550df12cf6cee0adbff2ea37e0c908afac8ccfa984afa24c8fd1f9',
      vout: 0
    }
  ],
  pubkey: '0262b06cb205c3de54717e0bc0eab2088b0edb9b63fab499f6cac87548ca205be1'
}

const opts1 = {
  rpcInfo: rpcInfoNode1
}

ptest('wallet API', async t => {
  const w = new Wallet('test', [rootProof], [rgbSchema], opts1)

  // const unspent = await w.client.listUnspent().then(utxos => utxos[Math.floor(Math.random()*utxos.length)])
  // w.proofs[0].seals[0].txid = unspent.txid
  // w.proofs[0].seals[0].vout = unspent.vout

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
  t.assert(w.broadcastTx, 'broadcastTx method exists')
})

ptest('initialise wallet', async t => {
  const expectedAssets = [
    {
      txid: '9db9396ecb4b1dbe8c6fca1f7cc9f6d945ab6dc2c14ca6d9ac8ffbf17c5babac',
      vout: 0,
      asset: 'PLS',
      amount: 1000000
    }
  ]

  const w = new Wallet('test', [rootProof], [rgbSchema], opts1)
  const address = await w.client.getNewAddress('', 'legacy')
  await w.client.generateToAddress(120, address)

  const unspent = await w.client.listUnspent().then(utxos => utxos[Math.floor(Math.random() * utxos.length)])
  w.proofs[0].seals[0].txid = unspent.txid
  w.proofs[0].seals[0].vout = unspent.vout

  await w.init()
  t.deepEqual(w.assets, expectedAssets, 'wallet has expected assets')
  t.true(Array.isArray(w.utxos), 'wallet.utxos is an array')
  t.true(w.utxos.length > 0, 'wallet.utxos is an array of length greater than 0')
})

ptest('generateAddress test', async t => {
  const w = new Wallet('test', [rootProof], [rgbSchema], opts1)

  console.log(await w.generateAddresses(1))
})

ptest('two wallets performing transactions', async t => {
  const rpcInfoNode2 = {
    port: 18446,
    network: 'regtest',
    username: 'lnd',
    password: 'password',
    // datadir: '../bitcoind',
    wallet: '2'
  }

  const opts2 = { rpcInfo: rpcInfoNode2 }

  const w1 = new Wallet('test1', [rootProof], [rgbSchema], opts1)
  const w2 = new Wallet('test2', [], [rgbSchema], opts2)

  const unspent = await w1.client.listUnspent().then(utxos => utxos[Math.floor(Math.random() * utxos.length)])
  w1.proofs[0].seals[0].txid = unspent.txid
  w1.proofs[0].seals[0].vout = unspent.vout

  await Promise.all([
    w1.init(),
    w2.init()
  ])

  const requestedAsset = [{ asset: 'PLS', amount: 750000 }]
  const requestedAsset1 = [{ asset: 'PLS', amount: 250000 }]

  const request = await w2.createRequest(requestedAsset)
  console.log(request, 'request')
  const transferProposal = await w1.createTransferProposal(request)
  console.log(transferProposal)
  // if (!(await w2.tpApprove(transferProposal))) t.fail()
  const txProposal = await w2.createTxProposal(transferProposal)

  // if (!(await w1.txApprove(txProposal))) t.fail()
  const finalTx = await w1.broadcastTx(txProposal)
  console.log(finalTx)

  await w2.init()
  console.log(w2.assets, 'assets')

  const request1 = await w1.createRequest(requestedAsset1)
  console.log(request1, 'request')

  const transferProposal1 = await w2.createTransferProposal(request1)
  console.log(transferProposal1)
  // if (!(await w2.tpApprove(transferProposal))) t.fail()3
  const txProposal1 = await w1.createTxProposal(transferProposal1)

  // if (!(await w1.txApprove(txProposal))) t.fail()
  const finalTx1 = await w2.broadcastTx(txProposal1)
  console.log(finalTx1)

  w1.init().then(() => console.log(w1.assets, 'w1'))
  w2.init().then(() => console.log(w2.assets, 'w2'))
})

ptest.skip('hypercore storage of transfer proofs', async t => {
   const rpcInfoNode2 = {
    port: 18446,
    network: 'regtest',
    username: 'lnd',
    password: 'password',
    // datadir: '../bitcoind',
    wallet: '2'
  }

  const opts2 = { rpcInfo: rpcInfoNode2 }

  const w1 = new Wallet('test1', [rootProof], [rgbSchema], opts1)
  const w2 = new Wallet('test2', [], [rgbSchema], opts2)

  const unspent = await w1.client.listUnspent().then(utxos => utxos[Math.floor(Math.random() * utxos.length)])
  w1.proofs[0].seals[0].txid = unspent.txid
  w1.proofs[0].seals[0].vout = unspent.vout

  await Promise.all([
    w1.init(),
    w2.init()
  ])
  
  const feed = w1.createFeed('PLS', function (feed) {
    console.log(w1.feeds['PLS'], feed.key.toString('hex'))
    w2.createFeed(feed.assetName, feed.key.toString('hex'), (feed) => {
      w2.sync(feed)
      feed.on('append', () => console.log('w2 appended'))
    })
  })
  
  process.stdin.on('data', function (data) {
    // console.log(dabta.toString())
    w1.appendToFeed(newProof, () => {
      setTimeout(() => w1.feeds['PLS'].head({}, console.log), 200)
    })
  })

  t.end()
})

const newProof = {
  network: 'testnet',
  schema: 'sm1m3pkuxxyl0rp3e6drhlhw40f8uhg0xx9qem57jq32dhxmzzfgvpsgvqvjw',
  fields: {
    title: 'PLS'
  },
  ver: 1,
  format: 'ordinary',
  type: 'asset_transfer',
  seals: [0, 1],
  pubkey: '02e277cd18ad85d1b8b70130df4c25fd5e6550ad175295f1c73a79fd9f02195047',
  pending: true,
  tweakIndex: undefined,
  assetIndices: [0, 1],
  txid: 'f0f02bcf7e8e80e1faa422b1fecaf9170abe68f4bd19ec65d01220e8ccde5707',
  vout: 0 
}
