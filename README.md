# Baron [![Build Status](https://travis-ci.org/slickage/baron.svg)](https://travis-ci.org/slickage/baron)

Baron is a bitcoin payment processor that makes it easy to manage bitcoin transactions. 

* Allows for invoice creation in USD or BTC
* Invoice balances created in USD are converted to BTC at time of payment
* Records BTC exchange rates when payments are made
* Keeps a history of all invoices and payments

## External Dependencies

* [node](http://nodejs.org)
* [couchdb](http://wiki.apache.org/couchdb/Installation)
* [bitcoin](https://bitcoin.org/en/download)
* [insight-api](https://github.com/bitpay/insight-api)
* [foreman](https://github.com/ddollar/foreman)
* [nodemon](https://github.com/remy/nodemon)

## Installation and Running
Clone the repository:
```sh
$ git clone https://github.com/slickage/baron.git
```

Change directories to Baron and install dependencies:
```sh
$ npm install
```
### Baron Configuration

Configurations can be changed in the config.js file in the root of Baron.
```js
var config = {
  couchdb: {
    url: process.env.DB_URL || 'http://localhost:5984',
    name: process.env.DB_NAME || 'baron'
  },
  bitcoind:  {
    host: process.env.BITCOIND_HOST || 'localhost',
    port: process.env.BITCOIND_PORT || 18332,
    user: process.env.BITCOIND_USER || 'username',
    pass: process.env.BITCOIND_PASS || 'password'
  },
  insight: {
    host: process.env.INSIGHT_HOST || 'localhost',
    port: process.env.INSIGHT_PORT || '3001',
    protocol: process.env.INSIGHT_PROTOCOL || 'http'
  },
  port: process.env.PORT || 8080,
  baronAPIKey: process.env.BARON_API_KEY || 'youshouldreallychangethis',
  chainExplorerUrl: process.env.CHAIN_EXPLORER_URL || 'http://tbtc.blockr.io/tx/info',
  updateWatchListInterval: process.env.UPDATE_WATCH_LIST_INTERVAL || 15000,
  lastBlockJobInterval: process.env.LAST_BLOCK_JOB_INTERVAL || 15000,
  webhooksJobInterval: process.env.WEBHOOKS_JOB_INTERVAL || 15000,
  paymentValidForMinutes: process.env.PAYMENT_VALID_FOR_MINUTES || 5,
  trackPaymentUntilConf: process.env.TRACK_PAYMENT_UNTIL_CONF || 100
};
```

* `couchdb` - Database connection configs
* `bitcoind` - Bitcoin client connetion configs
* `insight` - Insight connection configs
* `port` - The port that Baron should run on
* `baronAPIKey` - A secret key that is used to validate invoice creation <sup>[1]</sup>
* `chainExplorerUrl` - A link to the tx route of a chain explorer
* `updateWatchListInterval` - How often the watched payments job should run in ms
* `lastBlockJobInterval` - How often the last block job should run in ms
* `webhooksJobInterval` - How often the webhooks job should run in ms
* `paymentValidForMinutes` - How long before exchange rate refreshes for payment
* `trackPaymentUntilConf` - How long to watch payments for before no longer updating

**NOTES:** <sup>[1]</sup> The `baronAPIKey` can be generated using `node generatetoken.js stringToHash`. Properties in config.js can be overriden using a [.env](http://ddollar.github.io/foreman/#ENVIRONMENT) file and [foreman](https://github.com/ddollar/foreman).

### Bitcoin Configuration
Modify bitcoin's [bitcoin.conf](https://en.bitcoin.it/wiki/Running_Bitcoin#Bitcoin.conf_Configuration_File):
```sh
# (optional) connects bitcoin client to testnet
testnet=1

# allows json-rpc api calls from Baron
server=1

# these should match your config or .env bitcoind username and password
rpcuser=username
rpcpassword=password
```

### Running Baron

First ensure that both insight-api and bitcoin are running and that their connection properties are correctly set in Baron's config.

Running Baron with [node](http://nodejs.org)
```sh
$ node server.js
```

Running Baron with [foreman](https://github.com/ddollar/foreman) and [nodemon](https://github.com/remy/nodemon)
```sh
$ foreman start -f Procfile-dev
```

## Additional Information

### Invoices

Invoices allow a person to receive payment for goods or services in BTC. The invoice can be created in USD for a fixed price invoice or in BTC. USD invoices are converted to BTC at time of payment using the current exchange rate for BTC. 

After an invoice is created, it can be viewed by going to the /invoices/:invoiceId route. For example:
```sh
http://localhost:8080/invoices/305148c3f6b5c3944bbc92b8772b502f
```

### Invoice Data Model

Invoices have the following properties:
* `access_token` - The API key for Baron to verify that invoice creator is trusted <sup>[1]</sup>
* `currency` - Currency of the invoice, can be either USD or BTC
* `min_confirmations` - Minimum confirmations before a payment is considered paid
* `expiration` ***(optional)*** - Expiration time for invoice (unix timestamp)
* `terms` - ***(optional)*** A URL to a specific terms and conditions page for this invoice
* `line_items` - Array storing line items
  * `description` - Line item description text
  * `quantity` - Quantity of the item purchased
  * `amount` - The unit cost of the line item <sup>[2]</sup>

**NOTES:** <sup>[1]</sup> The access token is not stored with the invoice, it is just used for Baron to verify that the invoice creator is trusted. <sup>[2]</sup> Line item amounts are stored in whatever currency the invoice is set to.

An example of a new Invoice object:
```js
var newInvoice = {
    "access_token" : "youshouldreallychangethis",
    "currency" : "BTC",
    "min_confirmations" : 3,
    "expiration" : 1395827470173, // Optional
    "terms" : "http://somesite.com/terms" // Optional
    "line_items" : [
        {
            "description" : "Foo",
            "quantity" : 2,
            "amount" : 0.125
        }, 
        {
            "description" : "Bar",
            "quantity" : 1,
            "amount" : 2.5
        }
    ]
};
```
### Creating an Invoice

Invoices can be created by doing a **POST** of the newInvoice object to /invoices route. For example:
```sh
http://localhost:8080/invoices
```

***NOTE:*** The invoice's `access_token` property must match Baron's config for `baronAPIKey` to successfully create an invoice.

### Payments

Payments are created when an invoice is sent to another user and they click the 'Pay Now' button. This button takes the user to a view which has a payment address and QR Code to fufill the payment.

When the user's payment reaches the invoice's minimum confirmations, the payment is considered to be in the 'paid' status and the invoice is considered paid in full.

Payments can be viewed by going to the /pay/:invoiceId route. For example:
```sh
http://localhost:8080/pay/305148c3f6b5c3944bbc92b8772b502f
```

### Payment Data Model

Payments have the following properties:
* ```invoice_id``` - Invoice that this payment is associated with
* ```address``` - Address to send BTC to
* ```amount_paid``` - Stores the amount that was paid (Always stored in BTC)
* ```spot_rate``` - Stores the exchange rate at the time of payment
* ```status``` - The status of this payment (paid, unpaid, partial, overpaid, pending)
* ```tx_id``` - Stores the transaction ID from bitcoind
* ```ntx_id``` - Stores the normalized transaction ID from bitcoind
* ```created``` - Time the payment was created
* ```paid_timestamp``` - Time that payment became 'paid' status

**NOTE:** Payments are created and handled internally.
