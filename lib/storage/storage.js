const hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const hypercore = require('hypercore')
const path = require('path')

function createFeed (assetName, feedKey, cb) {
  const self = this
  assert(assetName, 'asset name must be declared.')

  if (typeof feedKey === 'function') {
    return createFeed(assetName, null, feedKey)
  }

  const feed = hypercore(`./store/${self.name}/${assetName}`, feedKey, {
    valueEncoding: 'json'
  })

  const swarm = hyperswarm()

  feed.on('ready', () => {
    feed.assetName = assetName
    self.feeds[assetName] = feed

    swarm.join(topicGen(assetName))
    swarm.on('connection', function (socket) {
      pump(socket, feed.replicate(true, {live: true}), socket)
    })

    for (let proof of self.proofs) {
      feed.append(proof)
    }
    
    cb(feed)
  })
}

async function sync (feed) {
  const self = this

  feed.createReadStream({ live: true })
    .on('data', function (data) {
      // console.log(data)
    })

  const swarm = hyperswarm()

  swarm.join(topicGen(feed.assetName), {
    lookup: true,
    announce: true
  })

  swarm.on('connection', function (socket, details) {
    console.log('connection')
    pump(socket, feed.replicate(false, { live: true }), socket)
    swarm.leave(topicGen(feed.assetName))
  })
}

async function appendToFeed (proof, cb) {
  const assetName = proof.fields.title

  const feed = this.feeds[assetName]

  feed.append(proof)
  cb(feed)
}

async function syncFeeds () {
  for (let feed of this.feeds) {
    sync(feed)
  }
}
