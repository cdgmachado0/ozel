const { ethers, Wallet } = require("ethers");
const axios = require('axios').default;
const { L1TransactionReceipt, L1ToL2MessageStatus } = require('@arbitrum/sdk');

const {
    l1ProviderTestnet,
    l2ProviderTestnet,
    network,
    signerTestnet,
    ops,
    pokeMeOpsAddr,
    gelatoAddr,
    ETH,
    signerX,
    defaultSlippage,
    factoryABI,
    diamondABI,
    l2Provider,
    l1Provider,
    renBtcAddr,
    mimAddr,
    usdcAddr,
    fraxAddr,
    usdtAddrArb,
    wbtcAddr
} = require('./state-vars.js');

const { 
    formatEther,
    formatUnits
 } = ethers.utils;




async function checkHash() { 
    const hash = '0x20a7709fd1df71cdb6f6eb0203da1833f748ff2df5a9f1f28fd0deaada62fadf';
    const l2Wallet = new Wallet(process.env.PK, l2ProviderTestnet);

    console.log(1);
    const receipt = await l1ProviderTestnet.getTransactionReceipt(hash);
    console.log(2);
    const l1Receipt = new L1TransactionReceipt(receipt);
    console.log(3);
    const message = await l1Receipt.getL1ToL2Message(l2Wallet);
    console.log(4);
    const status = (await message.waitForStatus()).status;
    console.log(5);
    const wasRedeemed = status === L1ToL2MessageStatus.REDEEMED ? true : false;
    console.log('was2: ', wasRedeemed);

    // return [
    //     message,
    //     wasRedeemed
    // ];
}

// checkHash();



async function main3() {
    const callerAddr = await signerX.getAddress();
    console.log('caller addr: ', callerAddr);

    const userDetails = [
        callerAddr,
        usdtAddrArb, 
        defaultSlippage
    ];

    const factoryProxyAddr = '0xf616eA563Fd2A85b066f37932156a327B383a349';
    const factoryProxy = await hre.ethers.getContractAt(factoryABI, factoryProxyAddr);
    console.log('Proxy Factory: ', factoryProxy.address);

    const tx = await factoryProxy.createNewProxy(userDetails);
    const receipt = await tx.wait();

    console.log('receipt: ', receipt);
}


async function main2() {
    const callerAddr = await signerX.getAddress();
    console.log('caller addr: ', callerAddr);

    const storageBeaconAddr = '0x41dfb47e2949F783cf490D2e99E9BbB6FdAdAe1C';
    const storageBeacon = await hre.ethers.getContractAt('StorageBeacon', storageBeaconAddr);
    console.log('sBeacon: ', storageBeacon.address);

    const proxies = await storageBeacon.getProxyByUser(callerAddr);
    const taskID = await storageBeacon.getTaskID(proxies[1]);
    console.log('taskID: ', taskID);
}



async function main4() {
    const callerAddr = await signerX.getAddress();
    console.log('caller addr: ', callerAddr);

    const fakeOZL = '0xAb6E71331EB929251fFbb6d00f571DDdC4aC1D9C';
    const nodeInterfaceAddr = '0x00000000000000000000000000000000000000C8';
    const nodeInterface = await hre.ethers.getContractAt('NodeInterface', nodeInterfaceAddr);
    const userDetails = [
        callerAddr,
        usdtAddrArb, 
        defaultSlippage
    ];

    const iface = new ethers.utils.Interface(diamondABI);
    const encodedData = iface.encodeFunctionData('exchangeToUserToken', [userDetails]);

    const x = await nodeInterface.nitroGenesisBlock();
    console.log('block: ', Number(x));

    const tx = await nodeInterface.gasEstimateL1Component(fakeOZL, false, encodedData, ops);
    const receipt = await tx.wait();
    console.log('receipt: ', receipt);

    // console.log('gasEstimateForL1: ', a);
    // console.log('baseFee: ', b);
    // console.log('l1BaseFeeEstimate: ', c);

}


async function main11() {

    const l1gas = await l1ProviderTestnet.getGasPrice();
    const l2gas = await l2ProviderTestnet.getGasPrice();

    const l1gasMain = await l1Provider.getGasPrice();
    const l2GasMain = await l2Provider.getGasPrice();

    console.log('gas in arb goerli: ', formatUnits(l2gas, 'gwei'));
    console.log('gas in goerli: ', formatUnits(l1gas, 'gwei'));
    console.log('.');
    console.log('gas in mainnet: ', formatUnits(l1gasMain, 'gwei'));
    console.log('gas in arb: ', formatUnits(l2GasMain, 'gwei'));

}


async function mainf() {
    
    const bridgeAddr = '0xaf4159A80B6Cc41ED517DB1c453d1Ef5C2e4dB72';
    const abi = ['function delayedMessageCount() external view returns (uint256)'];
    const bridge = await hre.ethers.getContractAt(abi, bridgeAddr);

    const msgCount = await bridge.delayedMessageCount();
    console.log('bridge: ', Number(msgCount));

}

async function maint() {

    const gas = await l1ProviderTestnet.getGasPrice();
    console.log('gas: ', Number(gas));

}

// const abi = require('../artifacts/contracts/ethereum/StorageBeacon.sol/StorageBeacon.json').abi;

async function main() {
    const sBeaconAddr = '0x53548E9698BC27eCfEd86dbC1Bd47d827912CB75';
    const sBeacon = await hre.ethers.getContractAt(abi, sBeaconAddr);

    const tx = await sBeacon.addTokenToDatabase(renBtcAddr);
    const receipt = await tx.wait();
    console.log('receipt: ', receipt);
    // await sBeacon.addTokenToDatabase(mimAddr);
    // await sBeacon.addTokenToDatabase(usdcAddr);
    // await sBeacon.addTokenToDatabase(fraxAddr);
    // await sBeacon.addTokenToDatabase(wbtcAddr);

    const x = await sBeacon.getTokenDatabase();
    console.log('y: ', x);

}



async function main12() {
    let { abi } = require('./UI_ozBeaconABI.json');
    const proxyABI = abi;
    ({abi} = require('./UI_sBeacon.json'));
    const sBeaconABI = abi;

    const proxy1Addr = '0x0246bc2BacE3F5763Dfd505EC0D5bb73EDb566f8';
    const sBeaconAddr = '0x53548E9698BC27eCfEd86dbC1Bd47d827912CB75';

    const proxy1 = await hre.ethers.getContractAt(proxyABI, proxy1Addr);
    const sBeacon = await hre.ethers.getContractAt(sBeaconABI, sBeaconAddr);

    const [usdt] = await sBeacon.getTokenDatabase();

    const tx = await proxy1.changeUserToken(usdt);
    await tx.wait();

    const inDB = await sBeacon.queryTokenDatabase(usdt);
    console.log('is in DB (true): ', inDB);
}


main12();