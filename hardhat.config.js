require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require('dotenv').config();


module.exports = {
  solidity: {
    compilers: [
      {
        version: '0.8.14',
      },
      {
        version: '0.7.6',
      }
    ]
  },
  networks: {
    hardhat: {
      // forking: {
      //   url: process.env.MAINNET,
      //   blockNumber: 15823986 //15823986 - 16669921 - 16685999
      // }
      forking: {
        url: process.env.ARBITRUM, 
        blockNumber: 65186228, //27546149 - 66186228 
      }
      // forking: {
      //   url: process.env.ARB_GOERLI,
      //   blockNumber: 9314166 //9314166 - 314166
      // }
    },
    goerli: {
      url: process.env.GOERLI,
      accounts: [process.env.PK_TESTNET]
    },
    arb_goerli: {
      url: process.env.ARB_GOERLI,
      accounts: [process.env.PK_TESTNET]
    },
    arbitrum: {
      url: process.env.ARBITRUM,
      accounts: [process.env.PK_DEPLOYER]
    },
    mainnet: {
      url: process.env.MAINNET,
      accounts: [process.env.PK_DEPLOYER]
    }
  },
  etherscan: {
    apiKey: ""
  }
};
