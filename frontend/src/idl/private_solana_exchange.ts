/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/private_solana_exchange.json`.
 */
export type PrivateSolanaExchange = {
  "address": "7DtBhe3Fi46dy6Gp1Mj7FbW9oZD3xzRs2RKXurtmL3VP",
  "metadata": {
    "name": "privateSolanaExchange",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Arcium & Anchor"
  },
  "instructions": [
    {
      "name": "cancelUnshield",
      "docs": [
        "Unfreeze an account whose move to wallet stopped before step 2."
      ],
      "discriminator": [
        133,
        146,
        253,
        2,
        169,
        131,
        117,
        66
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "eta",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "commitBalanceCallback",
      "discriminator": [
        16,
        118,
        11,
        34,
        73,
        111,
        199,
        74
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "eta",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "commitBalanceOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "createOrderBook",
      "docs": [
        "Open a private TOKEN/USDC order book. Token creator only."
      ],
      "discriminator": [
        153,
        114,
        9,
        51,
        100,
        68,
        240,
        197
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenInfo",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  107,
                  101,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "token_info.mint",
                "account": "tokenInfo"
              }
            ]
          }
        },
        {
          "name": "book",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  111,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "token_info.mint",
                "account": "tokenInfo"
              }
            ]
          }
        },
        {
          "name": "views",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  111,
                  107,
                  95,
                  118,
                  105,
                  101,
                  119,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "book"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "createPool",
      "docs": [
        "Create a token/USDC pool and its LP token. Creator only."
      ],
      "discriminator": [
        233,
        146,
        209,
        142,
        207,
        104,
        64,
        188
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "tokenInfo",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  107,
                  101,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "token_info.mint",
                "account": "tokenInfo"
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "token_info.mint",
                "account": "tokenInfo"
              }
            ]
          }
        },
        {
          "name": "lpMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  112,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ]
          }
        },
        {
          "name": "lpInfo",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  107,
                  101,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "lpMint"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "feeBps",
          "type": "u16"
        },
        {
          "name": "tokenSymbol",
          "type": "string"
        },
        {
          "name": "tokenUri",
          "type": "string"
        }
      ]
    },
    {
      "name": "createToken",
      "docs": [
        "Create a token: real SPL mint with metadata, SPL supply 0."
      ],
      "discriminator": [
        84,
        52,
        204,
        228,
        24,
        140,
        234,
        75
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenInfo",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  107,
                  101,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "symbol",
          "type": "string"
        },
        {
          "name": "uri",
          "type": "string"
        },
        {
          "name": "maxSupply",
          "type": "u64"
        }
      ]
    },
    {
      "name": "creditBalanceCallback",
      "discriminator": [
        100,
        187,
        110,
        118,
        160,
        188,
        196,
        23
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "eta",
          "writable": true
        },
        {
          "name": "tokenInfo",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "creditBalanceOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "debitBalanceCallback",
      "discriminator": [
        165,
        230,
        154,
        5,
        231,
        198,
        3,
        232
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "eta",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "debitBalanceOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "finishUnshield",
      "docs": [
        "Move to wallet, step 3: Arcium subtracts the amount and unfreezes the account."
      ],
      "discriminator": [
        225,
        21,
        120,
        254,
        61,
        66,
        78,
        11
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "eta",
          "writable": true
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initCommitBalanceCompDef",
      "docs": [
        "One-time setup: register the `commit_balance` MPC circuit."
      ],
      "discriminator": [
        20,
        231,
        181,
        87,
        81,
        239,
        215,
        34
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "circuitUrl",
          "type": {
            "option": "string"
          }
        }
      ]
    },
    {
      "name": "initConfig",
      "docs": [
        "One-time setup: config + fake USDC mint."
      ],
      "discriminator": [
        23,
        235,
        115,
        232,
        168,
        96,
        1,
        231
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "usdcMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  100,
                  99,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "usdcInfo",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  107,
                  101,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "usdcUri",
          "type": "string"
        }
      ]
    },
    {
      "name": "initCreditBalanceCompDef",
      "docs": [
        "One-time setup: register the `credit_balance` MPC circuit."
      ],
      "discriminator": [
        187,
        87,
        101,
        72,
        82,
        26,
        5,
        1
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "circuitUrl",
          "type": {
            "option": "string"
          }
        }
      ]
    },
    {
      "name": "initDebitBalanceCompDef",
      "docs": [
        "One-time setup: register the `debit_balance` MPC circuit."
      ],
      "discriminator": [
        0,
        137,
        207,
        201,
        147,
        190,
        43,
        48
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "circuitUrl",
          "type": {
            "option": "string"
          }
        }
      ]
    },
    {
      "name": "initPlaceOrderCompDef",
      "docs": [
        "One-time setup: register the `place_order` MPC circuit."
      ],
      "discriminator": [
        245,
        242,
        169,
        71,
        130,
        168,
        97,
        247
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "circuitUrl",
          "type": {
            "option": "string"
          }
        }
      ]
    },
    {
      "name": "initSeedPoolCompDef",
      "docs": [
        "One-time setup: register the `seed_pool` MPC circuit."
      ],
      "discriminator": [
        81,
        96,
        238,
        162,
        251,
        230,
        135,
        90
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "circuitUrl",
          "type": {
            "option": "string"
          }
        }
      ]
    },
    {
      "name": "initSettleOrderCompDef",
      "docs": [
        "One-time setup: register the `settle_order` MPC circuit."
      ],
      "discriminator": [
        67,
        15,
        39,
        176,
        55,
        232,
        221,
        106
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "circuitUrl",
          "type": {
            "option": "string"
          }
        }
      ]
    },
    {
      "name": "initSwapCompDef",
      "docs": [
        "One-time setup: register the `swap` MPC circuit."
      ],
      "discriminator": [
        193,
        180,
        211,
        206,
        171,
        241,
        40,
        211
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount",
          "writable": true
        },
        {
          "name": "compDefAccount",
          "writable": true
        },
        {
          "name": "addressLookupTable",
          "writable": true
        },
        {
          "name": "lutProgram",
          "address": "AddressLookupTab1e1111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "circuitUrl",
          "type": {
            "option": "string"
          }
        }
      ]
    },
    {
      "name": "mintPrivate",
      "docs": [
        "Mint fake USDC (anyone) or your own token (creator) into your encrypted account."
      ],
      "discriminator": [
        198,
        236,
        76,
        182,
        80,
        98,
        60,
        78
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "userAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              }
            ]
          }
        },
        {
          "name": "tokenInfo",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  107,
                  101,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "token_info.mint",
                "account": "tokenInfo"
              }
            ]
          }
        },
        {
          "name": "eta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "account",
                "path": "token_info.mint",
                "account": "tokenInfo"
              }
            ]
          }
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "openAccount",
      "docs": [
        "Open an empty encrypted account for a token (needed before a first swap)."
      ],
      "discriminator": [
        101,
        152,
        91,
        243,
        176,
        36,
        189,
        101
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "userAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "tokenInfo",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  107,
                  101,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "token_info.mint",
                "account": "tokenInfo"
              }
            ]
          }
        },
        {
          "name": "eta",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "token_info.mint",
                "account": "tokenInfo"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "placeOrder",
      "docs": [
        "Place a limit order; side, price and size are encrypted in the browser."
      ],
      "discriminator": [
        51,
        194,
        155,
        175,
        109,
        130,
        96,
        106
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config"
        },
        {
          "name": "book",
          "writable": true
        },
        {
          "name": "usdcEta",
          "docs": [
            "Must exist (see `open_account`)."
          ],
          "writable": true
        },
        {
          "name": "tokenEta",
          "docs": [
            "Must exist (see `open_account`)."
          ],
          "writable": true
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        },
        {
          "name": "orderCt",
          "type": {
            "array": [
              {
                "array": [
                  "u8",
                  32
                ]
              },
              3
            ]
          }
        },
        {
          "name": "orderNonce",
          "type": "u128"
        }
      ]
    },
    {
      "name": "placeOrderCallback",
      "discriminator": [
        246,
        190,
        154,
        146,
        44,
        11,
        105,
        44
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "book",
          "writable": true
        },
        {
          "name": "views",
          "writable": true
        },
        {
          "name": "usdcEta",
          "writable": true
        },
        {
          "name": "tokenEta",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "placeOrderOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "prepareUnshield",
      "docs": [
        "Move to wallet, step 1: Arcium fingerprints the balance and freezes the account."
      ],
      "discriminator": [
        244,
        49,
        9,
        137,
        30,
        171,
        201,
        253
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "eta",
          "writable": true
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        }
      ]
    },
    {
      "name": "registerUser",
      "docs": [
        "Store the caller's x25519 encryption key."
      ],
      "discriminator": [
        2,
        241,
        150,
        223,
        99,
        214,
        116,
        97
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "userAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "encPubkey",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "seedPool",
      "docs": [
        "Add the creator's initial liquidity privately (encrypted amounts)."
      ],
      "discriminator": [
        111,
        214,
        148,
        46,
        108,
        2,
        217,
        18
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config"
        },
        {
          "name": "pool",
          "docs": [
            "Creator + status checked in the handler (stack limit)."
          ],
          "writable": true
        },
        {
          "name": "tokenInfo",
          "docs": [
            "Checked in the handler (stack limit)."
          ]
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "tokenEta",
          "docs": [
            "Ownership checked in the handler (stack limit)."
          ],
          "writable": true
        },
        {
          "name": "usdcEta",
          "docs": [
            "Ownership checked in the handler (stack limit)."
          ],
          "writable": true
        },
        {
          "name": "lpEta",
          "docs": [
            "Must exist (see `open_account`).",
            "Ownership checked in the handler (stack limit)."
          ],
          "writable": true
        },
        {
          "name": "lpInfo"
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        },
        {
          "name": "depositCt",
          "type": {
            "array": [
              {
                "array": [
                  "u8",
                  32
                ]
              },
              2
            ]
          }
        },
        {
          "name": "depositNonce",
          "type": "u128"
        }
      ]
    },
    {
      "name": "seedPoolCallback",
      "discriminator": [
        26,
        109,
        141,
        178,
        48,
        132,
        33,
        28
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "tokenEta",
          "writable": true
        },
        {
          "name": "usdcEta",
          "writable": true
        },
        {
          "name": "lpEta",
          "writable": true
        },
        {
          "name": "lpInfo",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "seedPoolOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "settleOrder",
      "docs": [
        "Collect an order's fills into your balances; `cancel` also refunds the rest."
      ],
      "discriminator": [
        80,
        74,
        204,
        34,
        12,
        183,
        66,
        66
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config"
        },
        {
          "name": "book",
          "writable": true
        },
        {
          "name": "usdcEta",
          "writable": true
        },
        {
          "name": "tokenEta",
          "writable": true
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        },
        {
          "name": "slot",
          "type": "u8"
        },
        {
          "name": "cancel",
          "type": "bool"
        }
      ]
    },
    {
      "name": "settleOrderCallback",
      "discriminator": [
        35,
        33,
        29,
        174,
        37,
        122,
        99,
        241
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "book",
          "writable": true
        },
        {
          "name": "views",
          "writable": true
        },
        {
          "name": "usdcEta",
          "writable": true
        },
        {
          "name": "tokenEta",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "settleOrderOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "swap",
      "docs": [
        "Buy or sell privately (encrypted amount + slippage limit)."
      ],
      "discriminator": [
        248,
        198,
        158,
        145,
        225,
        117,
        135,
        200
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config"
        },
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "tokenInfo"
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "usdcEta",
          "docs": [
            "Must exist (see `open_account`)."
          ],
          "writable": true
        },
        {
          "name": "tokenEta",
          "docs": [
            "Must exist (see `open_account`)."
          ],
          "writable": true
        },
        {
          "name": "signPdaAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  65,
                  114,
                  99,
                  105,
                  117,
                  109,
                  83,
                  105,
                  103,
                  110,
                  101,
                  114,
                  65,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "mempoolAccount",
          "writable": true
        },
        {
          "name": "executingPool",
          "writable": true
        },
        {
          "name": "computationAccount",
          "writable": true
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "clusterAccount",
          "writable": true
        },
        {
          "name": "poolAccount",
          "writable": true,
          "address": "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC"
        },
        {
          "name": "clockAccount",
          "writable": true,
          "address": "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        }
      ],
      "args": [
        {
          "name": "computationOffset",
          "type": "u64"
        },
        {
          "name": "isBuy",
          "type": "bool"
        },
        {
          "name": "orderCt",
          "type": {
            "array": [
              {
                "array": [
                  "u8",
                  32
                ]
              },
              3
            ]
          }
        },
        {
          "name": "orderNonce",
          "type": "u128"
        }
      ]
    },
    {
      "name": "swapCallback",
      "discriminator": [
        103,
        125,
        93,
        121,
        54,
        18,
        238,
        141
      ],
      "accounts": [
        {
          "name": "arciumProgram",
          "address": "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ"
        },
        {
          "name": "compDefAccount"
        },
        {
          "name": "mxeAccount"
        },
        {
          "name": "computationAccount"
        },
        {
          "name": "clusterAccount"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "usdcEta",
          "writable": true
        },
        {
          "name": "tokenEta",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "output",
          "type": {
            "defined": {
              "name": "signedComputationOutputs",
              "generics": [
                {
                  "kind": "type",
                  "type": {
                    "defined": {
                      "name": "swapOutput"
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "unshield",
      "docs": [
        "Move to wallet, step 2: verify the ZK proof and mint real SPL tokens."
      ],
      "discriminator": [
        21,
        228,
        55,
        24,
        194,
        10,
        21,
        22
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "eta",
          "writable": true
        },
        {
          "name": "tokenInfo",
          "writable": true
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "destination",
          "docs": [
            "Any token account of the owner for this mint (clients use the ATA)."
          ],
          "writable": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "proof",
          "type": {
            "defined": {
              "name": "groth16Proof"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "arciumSignerAccount",
      "discriminator": [
        214,
        157,
        122,
        114,
        117,
        44,
        214,
        74
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "encryptedTokenAccount",
      "discriminator": [
        238,
        123,
        84,
        113,
        137,
        77,
        62,
        75
      ]
    },
    {
      "name": "orderBook",
      "discriminator": [
        55,
        230,
        125,
        218,
        149,
        39,
        65,
        248
      ]
    },
    {
      "name": "orderViews",
      "discriminator": [
        138,
        145,
        73,
        65,
        66,
        53,
        38,
        167
      ]
    },
    {
      "name": "pool",
      "discriminator": [
        241,
        154,
        109,
        4,
        17,
        177,
        109,
        188
      ]
    },
    {
      "name": "tokenInfo",
      "discriminator": [
        109,
        162,
        52,
        125,
        77,
        166,
        37,
        202
      ]
    },
    {
      "name": "userAccount",
      "discriminator": [
        211,
        33,
        136,
        16,
        186,
        110,
        242,
        127
      ]
    }
  ],
  "events": [
    {
      "name": "balanceCredited",
      "discriminator": [
        185,
        150,
        102,
        39,
        104,
        82,
        104,
        22
      ]
    },
    {
      "name": "creditFailed",
      "discriminator": [
        103,
        132,
        177,
        226,
        253,
        254,
        190,
        60
      ]
    },
    {
      "name": "mintQueued",
      "discriminator": [
        81,
        147,
        74,
        75,
        164,
        56,
        214,
        78
      ]
    },
    {
      "name": "orderPlaced",
      "discriminator": [
        96,
        130,
        204,
        234,
        169,
        219,
        216,
        227
      ]
    },
    {
      "name": "orderRejected",
      "discriminator": [
        151,
        145,
        92,
        106,
        161,
        17,
        195,
        208
      ]
    },
    {
      "name": "orderSettled",
      "discriminator": [
        32,
        21,
        123,
        33,
        68,
        59,
        136,
        131
      ]
    },
    {
      "name": "poolCreated",
      "discriminator": [
        202,
        44,
        41,
        88,
        104,
        220,
        157,
        82
      ]
    },
    {
      "name": "poolUpdated",
      "discriminator": [
        218,
        43,
        210,
        231,
        127,
        214,
        72,
        245
      ]
    },
    {
      "name": "tokenCreated",
      "discriminator": [
        236,
        19,
        41,
        255,
        130,
        78,
        147,
        172
      ]
    },
    {
      "name": "unshieldDebited",
      "discriminator": [
        112,
        111,
        163,
        242,
        238,
        71,
        197,
        169
      ]
    },
    {
      "name": "unshieldReady",
      "discriminator": [
        74,
        246,
        93,
        146,
        227,
        53,
        156,
        88
      ]
    },
    {
      "name": "unshielded",
      "discriminator": [
        141,
        41,
        20,
        125,
        56,
        78,
        86,
        205
      ]
    },
    {
      "name": "userRegistered",
      "discriminator": [
        21,
        42,
        216,
        163,
        99,
        51,
        200,
        222
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "abortedComputation",
      "msg": "The computation was aborted"
    },
    {
      "code": 6001,
      "name": "notAdmin",
      "msg": "Only the exchange admin can do this"
    },
    {
      "code": 6002,
      "name": "invalidEncryptionKey",
      "msg": "Encryption public key must not be empty"
    },
    {
      "code": 6003,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6004,
      "name": "amountTooLarge",
      "msg": "Amount is above the per-call limit"
    },
    {
      "code": 6005,
      "name": "accountBusy",
      "msg": "Account is busy with another private operation, try again in a few seconds"
    },
    {
      "code": 6006,
      "name": "notTokenCreator",
      "msg": "Only the token creator can mint this token"
    },
    {
      "code": 6007,
      "name": "maxSupplyExceeded",
      "msg": "Minting would exceed the token's max supply"
    },
    {
      "code": 6008,
      "name": "invalidMetadata",
      "msg": "Name, symbol or URI is empty or too long"
    },
    {
      "code": 6009,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6010,
      "name": "encryptionKeyMismatch",
      "msg": "MPC result is encrypted to the wrong key"
    },
    {
      "code": 6011,
      "name": "invalidFee",
      "msg": "Pool fee must be between 0.10% and 10%"
    },
    {
      "code": 6012,
      "name": "cannotPoolUsdc",
      "msg": "USDC cannot have its own pool"
    },
    {
      "code": 6013,
      "name": "notPoolCreator",
      "msg": "Only the token creator can create or seed its pool"
    },
    {
      "code": 6014,
      "name": "poolAlreadySeeded",
      "msg": "This pool already has liquidity"
    },
    {
      "code": 6015,
      "name": "poolNotActive",
      "msg": "This pool is not open for trading yet"
    },
    {
      "code": 6016,
      "name": "noBalance",
      "msg": "You have no balance of this token yet"
    },
    {
      "code": 6017,
      "name": "invalidMint",
      "msg": "Not a valid token mint"
    },
    {
      "code": 6018,
      "name": "wrongAccount",
      "msg": "Account does not belong to this user or token"
    },
    {
      "code": 6019,
      "name": "accountFrozen",
      "msg": "A move to your wallet is in progress on this account; finish or cancel it first"
    },
    {
      "code": 6020,
      "name": "wrongUnshieldStep",
      "msg": "This step of the move to your wallet is not available right now"
    },
    {
      "code": 6021,
      "name": "invalidProof",
      "msg": "The zero-knowledge proof is not valid"
    },
    {
      "code": 6022,
      "name": "invalidMarket",
      "msg": "USDC is the quote currency; it cannot have its own order book"
    },
    {
      "code": 6023,
      "name": "bookFull",
      "msg": "The order book is full; try again when an order is cancelled"
    },
    {
      "code": 6024,
      "name": "tooManyOrders",
      "msg": "You already have the maximum number of open orders in this book"
    },
    {
      "code": 6025,
      "name": "notOrderOwner",
      "msg": "This order belongs to someone else"
    }
  ],
  "types": [
    {
      "name": "activation",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "activationEpoch",
            "type": {
              "defined": {
                "name": "epoch"
              }
            }
          },
          {
            "name": "deactivationEpoch",
            "type": {
              "defined": {
                "name": "epoch"
              }
            }
          }
        ]
      }
    },
    {
      "name": "arciumSignerAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "bn254g2blsPublicKey",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "array": [
              "u8",
              64
            ]
          }
        ]
      }
    },
    {
      "name": "balanceCredited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "circuitSource",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "local",
            "fields": [
              {
                "defined": {
                  "name": "localCircuitSource"
                }
              }
            ]
          },
          {
            "name": "onChain",
            "fields": [
              {
                "defined": {
                  "name": "onChainCircuitSource"
                }
              }
            ]
          },
          {
            "name": "offChain",
            "fields": [
              {
                "defined": {
                  "name": "offChainCircuitSource"
                }
              }
            ]
          }
        ]
      }
    },
    {
      "name": "clockAccount",
      "docs": [
        "An account storing the current network epoch"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "startEpoch",
            "type": {
              "defined": {
                "name": "epoch"
              }
            }
          },
          {
            "name": "currentEpoch",
            "type": {
              "defined": {
                "name": "epoch"
              }
            }
          },
          {
            "name": "startEpochTimestamp",
            "type": {
              "defined": {
                "name": "timestamp"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "cluster",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tdInfo",
            "type": {
              "option": {
                "defined": {
                  "name": "nodeMetadata"
                }
              }
            }
          },
          {
            "name": "authority",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "clusterSize",
            "type": "u16"
          },
          {
            "name": "activation",
            "type": {
              "defined": {
                "name": "activation"
              }
            }
          },
          {
            "name": "maxCapacity",
            "type": "u64"
          },
          {
            "name": "cuPrice",
            "type": "u64"
          },
          {
            "name": "cuPriceProposals",
            "type": {
              "array": [
                "u64",
                32
              ]
            }
          },
          {
            "name": "lastUpdatedEpoch",
            "type": {
              "defined": {
                "name": "epoch"
              }
            }
          },
          {
            "name": "nodes",
            "type": {
              "vec": {
                "defined": {
                  "name": "nodeRef"
                }
              }
            }
          },
          {
            "name": "pendingNodes",
            "type": {
              "vec": "u32"
            }
          },
          {
            "name": "blsPublicKey",
            "type": {
              "defined": {
                "name": "setUnset",
                "generics": [
                  {
                    "kind": "type",
                    "type": {
                      "defined": {
                        "name": "bn254g2blsPublicKey"
                      }
                    }
                  }
                ]
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "currentEpochTotalRewards",
            "type": "u64"
          },
          {
            "name": "rewardsEpoch",
            "type": {
              "defined": {
                "name": "epoch"
              }
            }
          },
          {
            "name": "leaderSelector",
            "type": {
              "defined": {
                "name": "leaderSelector"
              }
            }
          }
        ]
      }
    },
    {
      "name": "commitBalanceOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "commitBalanceOutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "commitBalanceOutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "1"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "computationDefinitionAccount",
      "docs": [
        "An account representing a [ComputationDefinition] in a MXE."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "deactivationSlot",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "cuAmount",
            "type": "u64"
          },
          {
            "name": "definition",
            "type": {
              "defined": {
                "name": "computationDefinitionMeta"
              }
            }
          },
          {
            "name": "circuitSource",
            "type": {
              "defined": {
                "name": "circuitSource"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "padding",
            "type": {
              "array": [
                "u8",
                24
              ]
            }
          }
        ]
      }
    },
    {
      "name": "computationDefinitionMeta",
      "docs": [
        "A computation definition for execution in a MXE."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "circuitLen",
            "type": "u32"
          },
          {
            "name": "signature",
            "type": {
              "defined": {
                "name": "computationSignature"
              }
            }
          }
        ]
      }
    },
    {
      "name": "computationSignature",
      "docs": [
        "The signature of a computation defined in a [ComputationDefinition]."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "parameters",
            "type": {
              "vec": {
                "defined": {
                  "name": "parameter"
                }
              }
            }
          },
          {
            "name": "outputs",
            "type": {
              "vec": {
                "defined": {
                  "name": "output"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "config",
      "docs": [
        "Global exchange settings. PDA(\"config\")."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "type": "pubkey"
          },
          {
            "name": "tokenCount",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "mintAuthorityBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "creditBalanceOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "1"
                  }
                ]
              }
            }
          }
        ]
      }
    },
    {
      "name": "creditFailed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "debitBalanceOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "1"
                  }
                ]
              }
            }
          }
        ]
      }
    },
    {
      "name": "encryptedTokenAccount",
      "docs": [
        "Encrypted Token Account: one per (owner, mint). PDA(\"eta\", owner, mint).",
        "",
        "The balance is a Rescue ciphertext readable by the owner (with their x25519 key)",
        "and by the Arcium MPC cluster. Only MPC callbacks ever write it."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "balanceCt",
            "docs": [
              "Encrypted u64 balance. Kept as the first field so its byte offset stays fixed."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "nonce",
            "docs": [
              "Nonce `balance_ct` was encrypted with. New on every update."
            ],
            "type": "u128"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "encPubkey",
            "docs": [
              "x25519 key the balance is encrypted to."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "isInitialized",
            "docs": [
              "False until the first MPC write; until then the balance is zero."
            ],
            "type": "bool"
          },
          {
            "name": "pendingComputation",
            "docs": [
              "Computation account of the in-flight MPC job, default when idle."
            ],
            "type": "pubkey"
          },
          {
            "name": "pendingSinceSlot",
            "type": "u64"
          },
          {
            "name": "pendingAmount",
            "docs": [
              "Public amount the in-flight job adds to the supply on success."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "unshieldState",
            "type": "u8"
          },
          {
            "name": "unshieldCommitment",
            "docs": [
              "SHA3-256(balance ‖ salt), published by Arcium. The ZK proof opens it."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "unshieldSaltCt",
            "docs": [
              "The salt, encrypted to the owner."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "unshieldSaltNonce",
            "type": "u128"
          },
          {
            "name": "unshieldAmount",
            "docs": [
              "Amount already minted to the wallet and waiting to be debited."
            ],
            "type": "u64"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                39
              ]
            }
          }
        ]
      }
    },
    {
      "name": "epoch",
      "docs": [
        "The network epoch"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          "u64"
        ]
      }
    },
    {
      "name": "feePool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "groth16Proof",
      "docs": [
        "A Groth16 proof in the syscalls' (EIP-197) encoding: big-endian field",
        "elements, G2 as x.c1 ‖ x.c0 ‖ y.c1 ‖ y.c0."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "a",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          },
          {
            "name": "b",
            "type": {
              "array": [
                "u8",
                128
              ]
            }
          },
          {
            "name": "c",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "leaderChoice",
      "docs": [
        "The computation chosen by a node to be executed when the node is leader."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "offset",
            "type": "u64"
          },
          {
            "name": "slotIdx",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "leaderInfo",
      "docs": [
        "The information about a node."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stake",
            "type": "u64"
          },
          {
            "name": "count",
            "type": "u64"
          },
          {
            "name": "lastCounterPlusOne",
            "type": "u64"
          },
          {
            "name": "choice",
            "type": {
              "defined": {
                "name": "leaderChoice"
              }
            }
          }
        ]
      }
    },
    {
      "name": "leaderSelector",
      "docs": [
        "To select a Leader.",
        "Uses the greatest divisors method: https://en.wikipedia.org/wiki/D%27Hondt_method"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stakingEpoch",
            "type": {
              "defined": {
                "name": "epoch"
              }
            }
          },
          {
            "name": "info",
            "type": {
              "vec": {
                "defined": {
                  "name": "leaderInfo"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "localCircuitSource",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "mxeKeygen"
          },
          {
            "name": "mxeKeyRecoveryInit"
          },
          {
            "name": "mxeKeyRecoveryFinalize"
          }
        ]
      }
    },
    {
      "name": "mxeAccount",
      "docs": [
        "A MPC Execution Environment."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "padding",
            "type": "u8"
          },
          {
            "name": "cluster",
            "type": "u32"
          },
          {
            "name": "keygenOffset",
            "type": "u64"
          },
          {
            "name": "keyRecoveryInitOffset",
            "type": "u64"
          },
          {
            "name": "mxeProgramId",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "utilityPubkeys",
            "type": {
              "defined": {
                "name": "setUnset",
                "generics": [
                  {
                    "kind": "type",
                    "type": {
                      "defined": {
                        "name": "utilityPubkeys"
                      }
                    }
                  }
                ]
              }
            }
          },
          {
            "name": "lutOffsetSlot",
            "type": "u64"
          },
          {
            "name": "computationDefinitions",
            "type": {
              "vec": "u32"
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "mxeStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "currentEpochRecoveryRewards",
            "type": "u64"
          },
          {
            "name": "recoveryRewardsEpoch",
            "type": {
              "defined": {
                "name": "epoch"
              }
            }
          }
        ]
      }
    },
    {
      "name": "mxeEncryptedStruct",
      "generics": [
        {
          "kind": "const",
          "name": "len",
          "type": "usize"
        }
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nonce",
            "type": "u128"
          },
          {
            "name": "ciphertexts",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                {
                  "generic": "len"
                }
              ]
            }
          }
        ]
      }
    },
    {
      "name": "mintQueued",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "computation",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "mxeStatus",
      "docs": [
        "The status of an MXE."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "migration"
          }
        ]
      }
    },
    {
      "name": "nodeMetadata",
      "docs": [
        "location as [ISO 3166-1 alpha-2](https://www.iso.org/iso-3166-country-codes.html) country code"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "ip",
            "type": {
              "array": [
                "u8",
                4
              ]
            }
          },
          {
            "name": "peerId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "location",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "nodeRef",
      "docs": [
        "A reference to a node in the cluster.",
        "The offset is to derive the Node Account."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "offset",
            "type": "u32"
          },
          {
            "name": "padding",
            "type": {
              "array": [
                "u8",
                8
              ]
            }
          },
          {
            "name": "vote",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "offChainCircuitSource",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "source",
            "type": "string"
          },
          {
            "name": "hash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "onChainCircuitSource",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "isCompleted",
            "type": "bool"
          },
          {
            "name": "uploadAuth",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "orderBook",
      "docs": [
        "A private order book: one token against USDC. PDA(\"book\", token_mint).",
        "",
        "Every order's side, price, size and fills live in one ciphertext that only",
        "Arcium can read. Public: which slots hold an order, whose, and in what order",
        "they arrived."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bookCt",
            "docs": [
              "All slots, packed and encrypted to Arcium. First field, so its offset is fixed."
            ],
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                8
              ]
            }
          },
          {
            "name": "bookNonce",
            "type": "u128"
          },
          {
            "name": "initialized",
            "docs": [
              "False until the first order: before that the book is empty."
            ],
            "type": "bool"
          },
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "owners",
            "docs": [
              "Owner of each slot (default key = free)."
            ],
            "type": {
              "array": [
                "pubkey",
                8
              ]
            }
          },
          {
            "name": "seqs",
            "docs": [
              "Order number of each slot (0 = free). Lower = older = first in line."
            ],
            "type": {
              "array": [
                "u64",
                8
              ]
            }
          },
          {
            "name": "ordersPlaced",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "lastActivityAt",
            "type": "i64"
          },
          {
            "name": "pendingComputation",
            "type": "pubkey"
          },
          {
            "name": "pendingSinceSlot",
            "type": "u64"
          },
          {
            "name": "pendingKind",
            "type": "u8"
          },
          {
            "name": "pendingSlot",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "viewsBump",
            "type": "u8"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "orderPlaced",
      "docs": [
        "An order joined the book. Its side, price and size stay encrypted."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "book",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "slot",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "orderRejected",
      "docs": [
        "An order was refused (not enough balance, or a zero price / size)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "book",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "orderSettled",
      "docs": [
        "An owner collected their fills, or cancelled (`cancelled`) and got the rest back."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "book",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "slot",
            "type": "u8"
          },
          {
            "name": "cancelled",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "orderViews",
      "docs": [
        "Each owner's copy of their order, encrypted to them, as of their last",
        "action (place / collect). PDA(\"book_views\", book). Kept apart from the book",
        "so placing an order stays within Solana's stack limit."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "book",
            "type": "pubkey"
          },
          {
            "name": "views",
            "type": {
              "array": [
                {
                  "array": [
                    {
                      "array": [
                        "u8",
                        32
                      ]
                    },
                    1
                  ]
                },
                8
              ]
            }
          },
          {
            "name": "nonces",
            "type": {
              "array": [
                "u128",
                8
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "output",
      "docs": [
        "An output of a computation.",
        "We currently don't support encrypted outputs yet since encrypted values are passed via",
        "data objects."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "plaintextBool"
          },
          {
            "name": "plaintextU8"
          },
          {
            "name": "plaintextU16"
          },
          {
            "name": "plaintextU32"
          },
          {
            "name": "plaintextU64"
          },
          {
            "name": "plaintextU128"
          },
          {
            "name": "ciphertext"
          },
          {
            "name": "arcisX25519Pubkey"
          },
          {
            "name": "plaintextFloat"
          },
          {
            "name": "plaintextPoint"
          },
          {
            "name": "plaintextI8"
          },
          {
            "name": "plaintextI16"
          },
          {
            "name": "plaintextI32"
          },
          {
            "name": "plaintextI64"
          },
          {
            "name": "plaintextI128"
          }
        ]
      }
    },
    {
      "name": "parameter",
      "docs": [
        "A parameter of a computation.",
        "We differentiate between plaintext and encrypted parameters and data objects.",
        "Plaintext parameters are directly provided as their value.",
        "Encrypted parameters are provided as an offchain reference to the data.",
        "Data objects are provided as a reference to the data object account."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "plaintextBool"
          },
          {
            "name": "plaintextU8"
          },
          {
            "name": "plaintextU16"
          },
          {
            "name": "plaintextU32"
          },
          {
            "name": "plaintextU64"
          },
          {
            "name": "plaintextU128"
          },
          {
            "name": "ciphertext"
          },
          {
            "name": "arcisX25519Pubkey"
          },
          {
            "name": "arcisSignature"
          },
          {
            "name": "plaintextFloat"
          },
          {
            "name": "plaintextI8"
          },
          {
            "name": "plaintextI16"
          },
          {
            "name": "plaintextI32"
          },
          {
            "name": "plaintextI64"
          },
          {
            "name": "plaintextI128"
          },
          {
            "name": "plaintextPoint"
          },
          {
            "name": "unsynchronizedPlaintextBools",
            "fields": [
              "u32"
            ]
          }
        ]
      }
    },
    {
      "name": "placeOrderOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "placeOrderOutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "placeOrderOutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "1"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "1"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "8"
                  }
                ]
              }
            }
          },
          {
            "name": "field3",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "1"
                  }
                ]
              }
            }
          },
          {
            "name": "field4",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "pool",
      "docs": [
        "A token/USDC constant-product pool. PDA(\"pool\", token_mint).",
        "",
        "Reserves are encrypted to the Arcium cluster only. Price and a coarse health",
        "score are public; Arcium sets both after every seed and swap."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "reservesCt",
            "docs": [
              "Encrypted {token, usdc} reserves. First field, so its byte offset is fixed at 8."
            ],
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                2
              ]
            }
          },
          {
            "name": "reservesNonce",
            "type": "u128"
          },
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "lpMint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "price",
            "docs": [
              "USDC per whole token, scaled by 1e12."
            ],
            "type": "u128"
          },
          {
            "name": "health",
            "docs": [
              "Coarse 0–100 health score."
            ],
            "type": "u8"
          },
          {
            "name": "swapCount",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "lastTradeAt",
            "type": "i64"
          },
          {
            "name": "priceHistory",
            "docs": [
              "Ring buffer of recent public prices, oldest overwritten first."
            ],
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "pricePoint"
                  }
                },
                32
              ]
            }
          },
          {
            "name": "historyLen",
            "type": "u8"
          },
          {
            "name": "historyHead",
            "type": "u8"
          },
          {
            "name": "pendingComputation",
            "docs": [
              "Computation account of the in-flight MPC job, default when idle."
            ],
            "type": "pubkey"
          },
          {
            "name": "pendingSinceSlot",
            "type": "u64"
          },
          {
            "name": "pendingKind",
            "docs": [
              "What the in-flight job is: 0 = seed, 1 = buy, 2 = sell."
            ],
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "lpMintBump",
            "type": "u8"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "poolCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "lpMint",
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "poolUpdated",
      "docs": [
        "Emitted when a seed or swap finishes. Price and health are public; amounts are not."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "kind",
            "docs": [
              "0 = seed, 1 = buy, 2 = sell."
            ],
            "type": "u8"
          },
          {
            "name": "ok",
            "type": "bool"
          },
          {
            "name": "price",
            "type": "u128"
          },
          {
            "name": "health",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "pricePoint",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "price",
            "type": "u128"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "seedPoolOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "seedPoolOutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "seedPoolOutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "1"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "1"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "1"
                  }
                ]
              }
            }
          },
          {
            "name": "field3",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field4",
            "type": {
              "defined": {
                "name": "seedPoolOutputStruct04"
              }
            }
          }
        ]
      }
    },
    {
      "name": "seedPoolOutputStruct04",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": "bool"
          },
          {
            "name": "field1",
            "type": "f64"
          },
          {
            "name": "field2",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "setUnset",
      "docs": [
        "Utility struct to store a value that needs to be set by a certain number of participants (keys",
        "in our case). Once all participants have set the value, the value is considered set and we only",
        "store it once."
      ],
      "generics": [
        {
          "kind": "type",
          "name": "t"
        }
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "set",
            "fields": [
              {
                "generic": "t"
              }
            ]
          },
          {
            "name": "unset",
            "fields": [
              {
                "generic": "t"
              },
              {
                "vec": "bool"
              }
            ]
          }
        ]
      }
    },
    {
      "name": "settleOrderOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "settleOrderOutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "settleOrderOutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "1"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "1"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "8"
                  }
                ]
              }
            }
          },
          {
            "name": "field3",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "1"
                  }
                ]
              }
            }
          }
        ]
      }
    },
    {
      "name": "sharedEncryptedStruct",
      "generics": [
        {
          "kind": "const",
          "name": "len",
          "type": "usize"
        }
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "encryptionKey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "nonce",
            "type": "u128"
          },
          {
            "name": "ciphertexts",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                {
                  "generic": "len"
                }
              ]
            }
          }
        ]
      }
    },
    {
      "name": "signedComputationOutputs",
      "generics": [
        {
          "kind": "type",
          "name": "o"
        }
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "success",
            "fields": [
              {
                "generic": "o"
              },
              {
                "array": [
                  "u8",
                  64
                ]
              }
            ]
          },
          {
            "name": "failure"
          },
          {
            "name": "markerForIdlBuildDoNotUseThis",
            "fields": [
              {
                "generic": "o"
              }
            ]
          }
        ]
      }
    },
    {
      "name": "swapOutput",
      "docs": [
        "The output of the callback instruction. Provided as a struct with ordered fields",
        "as anchor does not support tuples and tuple structs yet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "swapOutputStruct0"
              }
            }
          }
        ]
      }
    },
    {
      "name": "swapOutputStruct0",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "1"
                  }
                ]
              }
            }
          },
          {
            "name": "field1",
            "type": {
              "defined": {
                "name": "sharedEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "1"
                  }
                ]
              }
            }
          },
          {
            "name": "field2",
            "type": {
              "defined": {
                "name": "mxeEncryptedStruct",
                "generics": [
                  {
                    "kind": "const",
                    "value": "2"
                  }
                ]
              }
            }
          },
          {
            "name": "field3",
            "type": {
              "defined": {
                "name": "swapOutputStruct03"
              }
            }
          }
        ]
      }
    },
    {
      "name": "swapOutputStruct03",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "field0",
            "type": "bool"
          },
          {
            "name": "field1",
            "type": "f64"
          },
          {
            "name": "field2",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "timestamp",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "timestamp",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "tokenCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "maxSupply",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "tokenInfo",
      "docs": [
        "Public facts about an exchange token. PDA(\"token\", mint).",
        "",
        "The real SPL mint starts with supply 0. Tokens live inside encrypted token",
        "accounts, and `exchange_supply` is their public total."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "exchangeSupply",
            "docs": [
              "Sum of all private ETA balances of this token (public)."
            ],
            "type": "u64"
          },
          {
            "name": "maxSupply",
            "docs": [
              "Cap on `exchange_supply`. `u64::MAX` for fake USDC."
            ],
            "type": "u64"
          },
          {
            "name": "isUsdc",
            "type": "bool"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "unshieldDebited",
      "docs": [
        "The encrypted balance was reduced by the unshielded amount."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "ok",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "unshieldReady",
      "docs": [
        "Arcium published a fingerprint of the balance; the owner can now prove."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "ok",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "unshielded",
      "docs": [
        "A ZK proof was accepted and `amount` real SPL tokens were minted to the wallet."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "userAccount",
      "docs": [
        "A registered user. PDA(\"user\", wallet)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "encPubkey",
            "docs": [
              "x25519 public key derived from the user's wallet signature.",
              "Every balance of this user is encrypted to it (Arcium \"Shared\" mode)."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "userRegistered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "encPubkey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "utilityPubkeys",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "x25519Pubkey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "ed25519VerifyingKey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "elgamalPubkey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "pubkeyValidityProof",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "bookSeed",
      "type": "bytes",
      "value": "[98, 111, 111, 107]"
    },
    {
      "name": "bookViewsSeed",
      "type": "bytes",
      "value": "[98, 111, 111, 107, 95, 118, 105, 101, 119, 115]"
    },
    {
      "name": "configSeed",
      "type": "bytes",
      "value": "[99, 111, 110, 102, 105, 103]"
    },
    {
      "name": "etaSeed",
      "type": "bytes",
      "value": "[101, 116, 97]"
    },
    {
      "name": "initialLpSupply",
      "docs": [
        "LP minted to the creator when a pool is seeded: 1,000,000 LP (6 decimals).",
        "Fixed on purpose — a √(token·usdc) supply would reveal the reserves."
      ],
      "type": "u64",
      "value": "1000000000000"
    },
    {
      "name": "lpMintSeed",
      "type": "bytes",
      "value": "[108, 112, 95, 109, 105, 110, 116]"
    },
    {
      "name": "maxFeeBps",
      "type": "u16",
      "value": "1000"
    },
    {
      "name": "maxMintPerCall",
      "docs": [
        "Largest single mint request: 1 billion whole tokens (6 decimals)."
      ],
      "type": "u64",
      "value": "1000000000000000"
    },
    {
      "name": "maxOrdersPerUser",
      "docs": [
        "Open orders one wallet may have in one book, so nobody can fill it alone."
      ],
      "type": "u8",
      "value": "3"
    },
    {
      "name": "mintAuthoritySeed",
      "type": "bytes",
      "value": "[109, 105, 110, 116, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121]"
    },
    {
      "name": "minFeeBps",
      "docs": [
        "Pool fee limits in basis points: 0.10% – 10%."
      ],
      "type": "u16",
      "value": "10"
    },
    {
      "name": "poolSeed",
      "type": "bytes",
      "value": "[112, 111, 111, 108]"
    },
    {
      "name": "tokenDecimals",
      "docs": [
        "Every exchange token uses 6 decimals, like USDC, to keep pool and order math simple."
      ],
      "type": "u8",
      "value": "6"
    },
    {
      "name": "tokenSeed",
      "type": "bytes",
      "value": "[116, 111, 107, 101, 110]"
    },
    {
      "name": "usdcMintSeed",
      "type": "bytes",
      "value": "[117, 115, 100, 99, 95, 109, 105, 110, 116]"
    },
    {
      "name": "userSeed",
      "type": "bytes",
      "value": "[117, 115, 101, 114]"
    }
  ]
};
