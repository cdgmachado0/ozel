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
      //   blockNumber: 16669921 //15823986
      // }
      forking: {
        url: process.env.ARBITRUM, 
        blockNumber: 27546149, //57546149      
      }
    },
    goerli: {
      url: process.env.GOERLI,
      accounts: [process.env.PK_TESTNET]
    },
    arb_goerli: {
      url: process.env.ARB_GOERLI,
      accounts: [process.env.PK]
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
    apiKey: "PKMQZ1HYE2PQSXFS5PEZNVB6F2GIUYHD9A"
  }
};
