var config = require(__dirname + '/../config');
var api = require(__dirname + '/../insightapi');
var validate = require(__dirname + '/../validate');
var bitcoinUtil = require(__dirname + '/../bitcoinutil');
var paymentUtil = require(__dirname + '/../paymentutil');
var db = require(__dirname + '/../db');
var async = require('async');

// Stores initial "last block hash" if it doesnt exist returns it if it does
function getLastBlockHash(cb) {
  db.getLastKnownBlockHash(function(err, lastBlockHash) {
    if (err) {
      return cb(err, null);
    }
    if (lastBlockHash) {
      return cb(null, lastBlockHash);
    }
    else {
      api.getLastBlockHash(function (err, lastBlockHash) {
        if (err) {
          return cb(err, null);
        }
        db.insert(lastBlockHash, function(err) {
          if (err) {
            return cb(err, null);
          }
          return cb(null, lastBlockHash);
        });
      });
    }
  });
}

function processBlockHash(blockHashObj) {
  var blockHash = blockHashObj.hash;
  api.getBlock(blockHash, function(err, block) {
    if (err || !block) {
      // TODO: If there's an error, lastblock in db is probably corrupt.
      // Should we update the latest block? 
      console.log('Error: Last block may have been corrupted. Bitcoind may be out of sync with network.');
      return console.log(err);
    }
    console.log('> Block Valid: ' + validate.block(block));
    // Get List Since Block 
    bitcoinUtil.listSinceBlock(blockHash, function (err, info) {
      if (err) {
        return console.log(err);
      }
      var transactions = [];
      info.result.transactions.forEach(function(transaction) {
        if (transaction.category === 'receive') { // ignore sent tx's
          transactions.push(transaction);
        }
      });
      var lastBlockHash = info.result.lastblock;
      // If valid get transactions since last block (bitcore)
      if (validate.block(block)) {
        async.eachSeries(transactions, function(transaction, cb) {
          paymentUtil.updatePayment(transaction, function(err) {
            cb(); // We dont care if update fails just run everthing in series until completion
          });
        }, function(err) {
          if (!err) {
            if (blockHash !== lastBlockHash) {
              blockHashObj.hash = lastBlockHash; // update to latest block
              db.insert(blockHashObj); // insert updated last block into db
            }
          }
        });
      }
      else { // If invalid update all transactions in block and step back
        transactions.forEach(function(transaction) {
          paymentUtil.processReorgAndCheckDoubleSpent(transaction, block.hash);
        }); // For each should block until complete
        paymentUtil.processReorgedPayments(block.hash);
        // Update reorged transactions (set block_hash = null)
        console.log('> REORG: Recursively processing previous block: ' + block.previousblockhash);
        // Recursively check previousHash
        blockHashObj.hash = block.previousblockhash;
        processBlockHash(blockHashObj);
    }
    });
  });
}

var lastBlockJob = function() {
  // Get Last Block, create it if baron isnt aware of one.
  getLastBlockHash(function(err, lastBlockHashObj) {
    if (err) {
      return console.log(err);
    }
    else if (!lastBlockHashObj.hash) {
      return console.log('Last block object missing hash, check Baron\'s database');
    }
    console.log('===========================');
    console.log('Processing Last Block: ' + lastBlockHashObj.hash);
    console.log('===========================');
    processBlockHash(lastBlockHashObj);
  });
};

var runLastBlockJob = function () {
  setInterval(function(){
    lastBlockJob();
  }, config.lastBlockJobInterval);
};

module.exports = {
  runLastBlockJob: runLastBlockJob,
  lastBlockJob: lastBlockJob,
};